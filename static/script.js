const messagesEl       = document.getElementById('messages');
const inputEl          = document.getElementById('msg-input');
const sendBtnEl        = document.getElementById('send-btn');
const statusEl         = document.getElementById('chat-status');
const contactPreviewEl = document.getElementById('contact-preview');
const contactTimeEl    = document.getElementById('contact-time');
const orderBannerEl    = document.getElementById('order-banner');
const inputAreaEl      = document.getElementById('input-area');

let isBusy = false;

// ===== MARKDOWN RENDERER =====

function renderMarkdown(text) {
    // Escape HTML first
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Bold: **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic: *text* (only when not a list item at start of line)
    html = html.replace(/(?<![*\n])\*(?!\*|[ \t])(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

    // Horizontal rule: ---
    html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e0e0e0;margin:6px 0">');

    // Unordered list items: lines starting with "* " or "- "
    html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>(\n|$))+/g, '<ul style="padding-left:16px;margin:4px 0">$&</ul>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    // Clean up <br> inside lists
    html = html.replace(/<br>\s*(<\/?[uo]l)/g, '$1');
    html = html.replace(/(<\/li>)<br>/g, '$1');

    return html;
}

// ===== HELPERS =====

function now() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function scrollDown() {
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
}

function setStatus(text) {
    statusEl.textContent = text;
}

function updateContact(preview, time) {
    contactPreviewEl.textContent = preview;
    contactTimeEl.textContent    = time;
}

function setInputLock(locked) {
    isBusy = locked;
    inputAreaEl.classList.toggle('disabled', locked);
}

// ===== TYPING INDICATOR =====

function showTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'typing-wrap';
    wrap.id = 'typing';
    wrap.innerHTML = `
        <div class="typing-indicator">
            <div class="t-dot"></div>
            <div class="t-dot"></div>
            <div class="t-dot"></div>
        </div>`;
    messagesEl.appendChild(wrap);
    scrollDown();
}

function hideTyping() {
    const el = document.getElementById('typing');
    if (el) el.remove();
}

// ===== ORDER CARD =====

function tryParseOrder(text) {
    try {
        const match = text.trim().match(/\{[\s\S]*\}/);
        if (!match) return null;
        const obj = JSON.parse(match[0]);
        if (Array.isArray(obj.itens) && obj.valor_total !== undefined) return obj;
    } catch (_) {}
    return null;
}

function addOrderCard(order) {
    const time = now();
    const wrap = document.createElement('div');
    wrap.className = 'order-wrap';

    const itemsHtml = order.itens.map(item => `
        <div class="order-item">
            <span class="order-item-name">${escHtml(item.nome)}</span>
            <span class="order-item-qty">x${item.quantidade}</span>
            <span class="order-item-sub">R$ ${item.subtotal.toFixed(2)}</span>
        </div>`).join('<hr class="order-divider">');

    const isDelivery = order.tipo_pedido === 'entrega';
    const tipoIcon  = isDelivery ? '🛵' : '🏪';
    const tipoLabel = isDelivery ? 'Entrega' : 'Retirada no local';

    const enderecoHtml = order.endereco ? `
        <div class="order-info-row">
            <span class="order-info-label">${isDelivery ? '📍 Endereço' : '📍 Local'}</span>
            <span class="order-info-value">${escHtml(order.endereco)}</span>
        </div>` : '';

    const pagamentoLabel = escHtml(order.forma_pagamento || '—');

    const trocoHtml = order.troco_para ? `
        <div class="order-info-row">
            <span class="order-info-label">💵 Troco para</span>
            <span class="order-info-value">R$ ${Number(order.troco_para).toFixed(2)}</span>
        </div>` : '';

    const clienteHtml = order.cliente ? `
        <div class="order-section-title">Cliente</div>
        <div class="order-info-row">
            <span class="order-info-label">👤 Nome</span>
            <span class="order-info-value">${escHtml(order.cliente.nome || '—')}</span>
        </div>
        <div class="order-info-row">
            <span class="order-info-label">📱 Telefone</span>
            <span class="order-info-value">${escHtml(order.cliente.telefone || '—')}</span>
        </div>` : '';

    const isPix = /pix/i.test(order.forma_pagamento || '');

    wrap.innerHTML = `
        <div class="order-card">
            <div class="order-header">🎉 Pedido Confirmado!</div>
            <div class="order-items">${itemsHtml}</div>
            <div class="order-total">
                <span>Total</span>
                <span>R$ ${order.valor_total.toFixed(2)}</span>
            </div>
            <div class="order-info">
                <div class="order-section-title">Entrega</div>
                <div class="order-info-row">
                    <span class="order-info-label">${tipoIcon} Tipo</span>
                    <span class="order-info-value">${tipoLabel}</span>
                </div>
                ${enderecoHtml}
                <div class="order-section-title">Pagamento</div>
                <div class="order-info-row">
                    <span class="order-info-label">💳 Forma</span>
                    <span class="order-info-value">${pagamentoLabel}</span>
                </div>
                ${trocoHtml}
                ${isPix ? '<div class="pix-section"><div class="pix-loading">⏳ Gerando QR Code PIX...</div></div>' : ''}
                ${clienteHtml}
            </div>
            <div class="order-footer">Cadastro salvo ✓ &nbsp;·&nbsp; ${time}</div>
        </div>`;

    messagesEl.appendChild(wrap);
    scrollDown();
    updateContact(`Pedido: R$ ${order.valor_total.toFixed(2)}`, time);

    if (isPix) {
        gerarPixQrCode(wrap, order);
    }
}

// ===== PIX PAYMENT =====

async function gerarPixQrCode(wrap, order) {
    const pixSection = wrap.querySelector('.pix-section');
    if (!pixSection) return;

    try {
        const res = await fetch('/api/pagamento/pix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                valor: order.valor_total,
                descricao: `Pedido Espetaria - ${(order.cliente && order.cliente.nome) || 'Cliente'}`,
                telefone: (order.cliente && order.cliente.telefone) || '',
            })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!data.qr_code_base64) throw new Error('QR Code não retornado');

        const simulateHtml = data.is_test
            ? `<button class="pix-simulate-btn" onclick="simularAprovacaoPix(${data.payment_id}, this)">🧪 Simular aprovação (ambiente de teste)</button>`
            : '';

        pixSection.innerHTML = `
            <div class="order-section-title">💠 Pague via PIX</div>
            <div class="pix-qr-container">
                <img src="data:image/png;base64,${data.qr_code_base64}" class="pix-qr-img" alt="QR Code PIX">
                <p class="pix-instructions">Escaneie o QR Code no seu banco ou copie o código abaixo</p>
                <div class="pix-copy-row">
                    <input class="pix-copy-input" type="text" readonly value="">
                    <button class="pix-copy-btn" onclick="copiarPix(this)">Copiar</button>
                </div>
                ${simulateHtml}
                <div class="pix-status" data-payment-id="${data.payment_id}">⏳ Aguardando pagamento...</div>
            </div>`;

        pixSection.querySelector('.pix-copy-input').value = data.qr_code || '';
        iniciarPollingPix(pixSection.querySelector('.pix-status'), data.payment_id, () => {
            addMessage('✅ **Pagamento PIX confirmado!** Seu pedido já foi para a cozinha. Obrigado! 🎉', 'in');
            orderBannerEl.style.display = 'flex';
            setStatus('pedido finalizado');
        });

    } catch (e) {
        pixSection.innerHTML = `<p class="pix-error">Erro ao gerar PIX: ${escHtml(e.message)}. Aceite outro meio de pagamento.</p>`;
    }

    scrollDown();
}

async function simularAprovacaoPix(paymentId, btn) {
    btn.disabled = true;
    btn.textContent = 'Aprovando...';
    try {
        await fetch(`/api/pagamento/simular/${paymentId}`, { method: 'POST' });
    } catch (_) {
        btn.disabled = false;
        btn.textContent = '🧪 Simular aprovação (ambiente de teste)';
    }
}

function copiarPix(btn) {
    const input = btn.previousElementSibling;
    navigator.clipboard.writeText(input.value).then(() => {
        btn.textContent = 'Copiado!';
        setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
    }).catch(() => {
        input.select();
        document.execCommand('copy');
        btn.textContent = 'Copiado!';
        setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
    });
}

function iniciarPollingPix(statusEl, paymentId, onApproved) {
    let attempts = 0;
    const maxAttempts = 100;

    const interval = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(interval);
            statusEl.textContent = '⏰ Tempo expirado. Informe o comprovante ao atendente.';
            return;
        }
        try {
            const res  = await fetch(`/api/pagamento/status/${paymentId}`);
            const data = await res.json();

            if (data.status === 'approved') {
                clearInterval(interval);
                statusEl.textContent = '✅ Pagamento confirmado!';
                statusEl.classList.add('pix-status--approved');
                if (typeof onApproved === 'function') onApproved();
            } else if (data.status === 'rejected' || data.status === 'cancelled') {
                clearInterval(interval);
                statusEl.textContent = '❌ Pagamento não concluído. Informe ao atendente.';
            }
        } catch (_) {}
    }, 3000);
}

// ===== REGULAR MESSAGES =====

function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function addMessage(text, direction) {
    const time  = now();
    const isOut = direction === 'out';

    if (direction === 'in') {
        const order = tryParseOrder(text);
        if (order) {
            addOrderCard(order);
            return;
        }
    }

    const wrap   = document.createElement('div');
    wrap.className = `msg-wrap msg-wrap--${direction}`;

    const bubble = document.createElement('div');
    bubble.className = `msg-bubble msg-bubble--${direction}`;

    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    if (direction === 'in') {
        textEl.innerHTML = renderMarkdown(text);
    } else {
        textEl.textContent = text;
    }

    const meta = document.createElement('div');
    meta.className = 'msg-meta';

    const timeEl = document.createElement('span');
    timeEl.className = 'msg-time';
    timeEl.textContent = time;

    meta.appendChild(timeEl);

    if (isOut) {
        meta.insertAdjacentHTML('beforeend', `
            <span class="msg-ticks">
                <svg viewBox="0 0 16 11" fill="none">
                    <path d="M11.071.653 4.42 7.304 1.354 4.238.3 5.292l4.12 4.12.707-.708 7.651-7.65L11.07.653z" fill="#53BDEB"/>
                    <path d="M15.426.653 8.775 7.304 7.72 6.25l-1.054 1.053 2.108 2.109.707-.708L16.48 1.707 15.426.653z" fill="#53BDEB"/>
                </svg>
            </span>`);
    }

    bubble.appendChild(textEl);
    bubble.appendChild(meta);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    scrollDown();

    const preview = isOut
        ? `Você: ${text.slice(0, 45)}${text.length > 45 ? '…' : ''}`
        : `${text.slice(0, 50)}${text.length > 50 ? '…' : ''}`;
    updateContact(preview, time);
}

// ===== SEND MESSAGE =====

async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isBusy) return;

    inputEl.value = '';
    handleInput();
    addMessage(text, 'out');
    setInputLock(true);
    showTyping();
    setStatus('digitando...');

    try {
        const res  = await fetch('/api/message', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ message: text })
        });
        const data = await res.json();

        hideTyping();
        setStatus('online');
        setInputLock(false);

        addMessage(data.response, 'in');

        if (data.order_complete) {
            inputAreaEl.style.display = 'none';

            const order  = tryParseOrder(data.response);
            const isPix  = order && /pix/i.test(order.forma_pagamento || '');

            if (isPix) {
                setStatus('aguardando pagamento PIX...');
                // banner e mensagem de confirmação são disparados pelo polling
            } else {
                setStatus('pedido finalizado');
                orderBannerEl.style.display = 'flex';
            }
        } else {
            inputEl.focus();
        }
    } catch (_) {
        hideTyping();
        setStatus('online');
        setInputLock(false);
        addMessage('Erro de conexão. Verifique o servidor e tente novamente.', 'in');
        inputEl.focus();
    }
}

// ===== NEW CONVERSATION =====

async function newConversation() {
    messagesEl.innerHTML = '<div class="date-badge">HOJE</div>';
    orderBannerEl.style.display = 'none';
    inputAreaEl.style.display   = '';
    updateContact('Envie uma mensagem para começar', '');

    try {
        await fetch('/api/reset', { method: 'POST' });
    } catch (_) {}

    setStatus('online');
    inputEl.focus();
}

// ===== KEYBOARD & INPUT =====

function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function handleInput() {
    sendBtnEl.classList.toggle('active', inputEl.value.trim().length > 0);
}

// ===== RESPONSIVE SIDEBAR =====

function showSidebar() {
    document.getElementById('sidebar').classList.remove('hidden');
}

function selectContact() {
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.add('hidden');
    }
}

window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
        document.getElementById('sidebar').classList.remove('hidden');
    }
});

// ===== INIT =====

function init() {
    setStatus('online');
    updateContact('Envie uma mensagem para começar', '');

    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('hidden');
    }

    inputEl.focus();
}

init();
