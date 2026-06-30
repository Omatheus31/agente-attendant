const messagesEl       = document.getElementById('messages');
const inputEl          = document.getElementById('msg-input');
const sendBtnEl        = document.getElementById('send-btn');
const statusEl         = document.getElementById('chat-status');
const contactPreviewEl = document.getElementById('contact-preview');
const contactTimeEl    = document.getElementById('contact-time');
const orderBannerEl    = document.getElementById('order-banner');
const inputAreaEl      = document.getElementById('input-area');

let isBusy     = false;
let _restoring = false; // evita re-salvar no localStorage durante replay

// ===== PERSISTÊNCIA (localStorage) =====

const STORAGE_KEY = 'espetaria_chat_v1';

// Formato do estado persistido:
// {
//   history: [{kind:'msg',text,direction,time} | {kind:'order',order,time,pixData,pixApproved}],
//   orderComplete: bool,
//   bannerVisible: bool,
//   pedidoId: int|null,
//   tipoPedido: str|null,
//   pedidoNotified: bool,
// }

let chatState = _loadState();

function _loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : _defaultState();
    } catch (_) { return _defaultState(); }
}

function _defaultState() {
    return {
        history:        [],
        orderComplete:  false,
        bannerVisible:  false,
        pedidoId:       null,
        tipoPedido:     null,
        pedidoNotified: false,
    };
}

function _saveState() {
    if (_restoring) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chatState)); } catch (_) {}
}

function _pushHistory(entry) {
    if (_restoring) return;
    chatState.history.push(entry);
    _saveState();
}

// ===== MARKDOWN RENDERER =====

function renderMarkdown(text) {
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?<![*\n])\*(?!\*|[ \t])(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e0e0e0;margin:6px 0">');
    html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>(\n|$))+/g, '<ul style="padding-left:16px;margin:4px 0">$&</ul>');
    html = html.replace(/\n/g, '<br>');
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

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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

// Retorna o elemento .order-wrap adicionado ao DOM.
// opts.pixData   → se fornecido, renderiza PIX a partir do cache (sem novo fetch)
// opts.pixApproved → se true, mostra estado aprovado sem iniciar polling
// opts.time       → horário a exibir (usado no restore)
function addOrderCard(order, opts = {}) {
    const time = opts.time || now();
    const wrap = document.createElement('div');
    wrap.className = 'order-wrap';

    const itemsHtml = order.itens.map(item => `
        <div class="order-item">
            <span class="order-item-name">${escHtml(item.nome)}</span>
            <span class="order-item-qty">x${item.quantidade}</span>
            <span class="order-item-sub">R$ ${item.subtotal.toFixed(2)}</span>
        </div>`).join('<hr class="order-divider">');

    const isDelivery = order.tipo_pedido === 'entrega';
    const tipoIcon   = isDelivery ? '🛵' : '🏪';
    const tipoLabel  = isDelivery ? 'Entrega' : 'Retirada no local';

    const enderecoHtml = order.endereco ? `
        <div class="order-info-row">
            <span class="order-info-label">${isDelivery ? '📍 Endereço' : '📍 Local'}</span>
            <span class="order-info-value">${escHtml(order.endereco)}</span>
        </div>` : '';

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
                    <span class="order-info-value">${escHtml(order.forma_pagamento || '—')}</span>
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
        if (opts.pixData) {
            // Restore path: renderiza do cache, sem novo fetch
            _renderPixFromCache(wrap, opts.pixData, opts.pixApproved);
        } else {
            // Fresh path: busca da API e salva no histórico
            gerarPixQrCode(wrap, order);
        }
    }

    if (!_restoring) {
        _pushHistory({ kind: 'order', order, time, pixData: null, pixApproved: false });
    }

    return wrap;
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
                valor:    order.valor_total,
                descricao: `Pedido Espetaria - ${(order.cliente && order.cliente.nome) || 'Cliente'}`,
                telefone:  (order.cliente && order.cliente.telefone) || '',
            })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!data.qr_code_base64) throw new Error('QR Code não retornado');

        // Salva pixData no registro de histórico desta order
        const entry = chatState.history.findLast(e => e.kind === 'order');
        if (entry) { entry.pixData = data; _saveState(); }

        _renderPixSection(pixSection, data);
        iniciarPollingPix(pixSection.querySelector('.pix-status'), data.payment_id, _onPixApproved);

    } catch (e) {
        const entry = chatState.history.findLast(e => e.kind === 'order');
        if (entry) { entry.pixData = { error: e.message }; _saveState(); }
        pixSection.innerHTML = `<p class="pix-error">Erro ao gerar PIX: ${escHtml(e.message)}. Informe ao atendente.</p>`;
    }

    scrollDown();
}

// Renderiza a seção PIX a partir de dados já obtidos (fresh ou cache)
function _renderPixSection(pixSection, data) {
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
}

// Renderiza seção PIX na restore path
function _renderPixFromCache(wrap, pixData, alreadyApproved) {
    const pixSection = wrap.querySelector('.pix-section');
    if (!pixSection) return;

    if (pixData.error) {
        pixSection.innerHTML = `<p class="pix-error">Erro ao gerar PIX: ${escHtml(pixData.error)}. Informe ao atendente.</p>`;
        return;
    }

    _renderPixSection(pixSection, pixData);

    const statusEl2 = pixSection.querySelector('.pix-status');

    if (alreadyApproved) {
        statusEl2.textContent = '✅ Pagamento confirmado!';
        statusEl2.classList.add('pix-status--approved');
        const simulateBtn = pixSection.querySelector('.pix-simulate-btn');
        if (simulateBtn) simulateBtn.remove();
    } else {
        iniciarPollingPix(statusEl2, pixData.payment_id, _onPixApproved);
    }
}

function _onPixApproved() {
    addMessage('✅ **Pagamento PIX confirmado!** Seu pedido já foi para a cozinha. Obrigado! 🎉', 'in');
    orderBannerEl.style.display = 'flex';
    setStatus('pedido finalizado');

    chatState.bannerVisible = true;
    const entry = chatState.history.findLast(e => e.kind === 'order');
    if (entry) entry.pixApproved = true;
    _saveState();
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

function iniciarPollingPix(pixStatusEl, paymentId, onApproved) {
    let attempts = 0;
    const maxAttempts = 100;

    const interval = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(interval);
            pixStatusEl.textContent = '⏰ Tempo expirado. Informe o comprovante ao atendente.';
            return;
        }
        try {
            const res  = await fetch(`/api/pagamento/status/${paymentId}`);
            const data = await res.json();

            if (data.status === 'approved') {
                clearInterval(interval);
                pixStatusEl.textContent = '✅ Pagamento confirmado!';
                pixStatusEl.classList.add('pix-status--approved');
                if (typeof onApproved === 'function') onApproved();
            } else if (data.status === 'rejected' || data.status === 'cancelled') {
                clearInterval(interval);
                pixStatusEl.textContent = '❌ Pagamento não concluído. Informe ao atendente.';
            }
        } catch (_) {}
    }, 3000);
}

// ===== KITCHEN POLLING =====

function iniciarPollingPedido(pedidoId, tipoPedido) {
    const interval = setInterval(async () => {
        try {
            const res  = await fetch(`/api/pedido/status/${pedidoId}`);
            const data = await res.json();

            if (data.status === 'concluido') {
                clearInterval(interval);
                const msg = tipoPedido === 'entrega'
                    ? '🛵 Seu pedido saiu para entrega!'
                    : '🍽️ Seu pedido está pronto para retirada!';
                addMessage(msg, 'in');

                chatState.pedidoNotified = true;
                _saveState();
            }
        } catch (_) {}
    }, 5000);
}

// ===== REGULAR MESSAGES =====

function addMessage(text, direction, opts = {}) {
    const time  = opts.time || now();
    const isOut = direction === 'out';

    if (direction === 'in' && !opts.fromRestore) {
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

    if (!_restoring) {
        _pushHistory({ kind: 'msg', text, direction, time });
    }
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
            chatState.orderComplete = true;

            const order     = tryParseOrder(data.response);
            const isPix     = order && /pix/i.test(order.forma_pagamento || '');
            const pedidoId  = data.pedido_id || null;
            const tipoPedido = order ? order.tipo_pedido : '';

            chatState.pedidoId   = pedidoId;
            chatState.tipoPedido = tipoPedido;
            _saveState();

            if (isPix) {
                setStatus('aguardando pagamento PIX...');
            } else {
                setStatus('pedido finalizado');
                orderBannerEl.style.display = 'flex';
                chatState.bannerVisible = true;
                _saveState();
            }

            if (pedidoId && !chatState.pedidoNotified) {
                iniciarPollingPedido(pedidoId, tipoPedido);
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
    chatState = _defaultState();
    localStorage.removeItem(STORAGE_KEY);

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

// ===== RESTORE STATE FROM LOCALSTORAGE =====

function _restoreState() {
    if (!chatState.history || chatState.history.length === 0) return;

    _restoring = true;

    for (const entry of chatState.history) {
        if (entry.kind === 'msg') {
            addMessage(entry.text, entry.direction, { time: entry.time, fromRestore: true });
        } else if (entry.kind === 'order') {
            addOrderCard(entry.order, {
                time:         entry.time,
                pixData:      entry.pixData  || null,
                pixApproved:  entry.pixApproved || false,
            });
        }
    }

    _restoring = false;

    // Restaura estado da UI
    if (chatState.orderComplete) {
        inputAreaEl.style.display = 'none';
    }
    if (chatState.bannerVisible) {
        orderBannerEl.style.display = 'flex';
    }

    // Retoma polling da cozinha, se necessário
    if (chatState.pedidoId && !chatState.pedidoNotified) {
        iniciarPollingPedido(chatState.pedidoId, chatState.tipoPedido || '');
    }

    // Status bar
    if (chatState.orderComplete && chatState.bannerVisible) {
        setStatus('pedido finalizado');
    } else if (chatState.orderComplete) {
        setStatus('aguardando pagamento PIX...');
    } else {
        setStatus('online');
    }

    const last = chatState.history[chatState.history.length - 1];
    if (last) updateContact(
        last.kind === 'order'
            ? `Pedido: R$ ${last.order.valor_total.toFixed(2)}`
            : last.kind === 'msg'
                ? (last.direction === 'out' ? `Você: ${last.text.slice(0,45)}` : last.text.slice(0,50))
                : '',
        last.time || ''
    );
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
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('hidden');
    }

    if (chatState.history && chatState.history.length > 0) {
        _restoreState();
    } else {
        setStatus('online');
        updateContact('Envie uma mensagem para começar', '');
        inputEl.focus();
    }
}

init();
