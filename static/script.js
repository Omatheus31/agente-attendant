const messagesEl       = document.getElementById('messages');
const inputEl          = document.getElementById('msg-input');
const sendBtnEl        = document.getElementById('send-btn');
const statusEl         = document.getElementById('chat-status');
const contactPreviewEl = document.getElementById('contact-preview');
const contactTimeEl    = document.getElementById('contact-time');
const orderBannerEl    = document.getElementById('order-banner');
const inputAreaEl      = document.getElementById('input-area');

let isBusy = false;

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

    wrap.innerHTML = `
        <div class="order-card">
            <div class="order-header">🎉 Pedido Confirmado!</div>
            <div class="order-items">${itemsHtml}</div>
            <div class="order-total">
                <span>Total</span>
                <span>R$ ${order.valor_total.toFixed(2)}</span>
            </div>
            <div class="order-footer">${time}</div>
        </div>`;

    messagesEl.appendChild(wrap);
    scrollDown();
    updateContact(`Pedido: R$ ${order.valor_total.toFixed(2)}`, time);
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
    textEl.textContent = text;

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
            setStatus('pedido finalizado');
            orderBannerEl.style.display = 'flex';
            inputAreaEl.style.display   = 'none';
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
    setStatus('conectando...');
    updateContact('Iniciando nova conversa...', '');
    setInputLock(true);

    try {
        const res  = await fetch('/api/reset', { method: 'POST' });
        const data = await res.json();
        setStatus('online');
        setInputLock(false);
        addMessage(data.response, 'in');
        inputEl.focus();
    } catch (_) {
        setStatus('offline');
        setInputLock(false);
        addMessage('Erro de conexão. Verifique o servidor.', 'in');
    }
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

async function init() {
    setStatus('conectando...');
    updateContact('Carregando...', '');
    setInputLock(true);

    // On mobile, start with sidebar visible
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('hidden');
    }

    try {
        const res  = await fetch('/api/initial');
        const data = await res.json();
        setStatus('online');
        setInputLock(false);
        addMessage(data.response, 'in');
        inputEl.focus();
    } catch (_) {
        setStatus('offline');
        setInputLock(false);
        addMessage('Erro ao conectar. Verifique se o servidor está rodando.', 'in');
    }
}

init();
