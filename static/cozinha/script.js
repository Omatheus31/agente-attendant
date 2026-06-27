const container = document.getElementById('pedidos-container');
const emptyState = document.getElementById('empty-state');
const statusText = document.getElementById('status-text');

let pedidosAtuais = new Set();

async function fetchPedidos() {
    try {
        const response = await fetch('/api/cozinha/pedidos');
        if (!response.ok) throw new Error('Network error');
        
        const pedidos = await response.json();
        
        if (pedidos.length === 0) {
            if(pedidosAtuais.size > 0) {
                container.innerHTML = '';
                pedidosAtuais.clear();
            }
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
            renderPedidos(pedidos);
        }
        
        const now = new Date();
        statusText.textContent = `Ao vivo • ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}`;
    } catch (error) {
        console.error("Fetch error:", error);
        statusText.textContent = "Reconectando...";
    }
}

function renderPedidos(pedidos) {
    const novosIds = new Set(pedidos.map(p => p.id));
    
    // Removendo quem não está mais pendente
    document.querySelectorAll('.pedido-card').forEach(card => {
        const id = parseInt(card.dataset.id);
        if (!novosIds.has(id)) {
            card.style.transform = 'scale(0.9)';
            card.style.opacity = '0';
            setTimeout(() => card.remove(), 300);
            pedidosAtuais.delete(id);
        }
    });

    // Inserindo os novos
    pedidos.forEach(pedido => {
        if (!pedidosAtuais.has(pedido.id)) {
            const card = criarCardPedido(pedido);
            container.appendChild(card);
            pedidosAtuais.add(pedido.id);
        }
    });
}

function criarCardPedido(pedido) {
    const card = document.createElement('div');
    card.className = 'pedido-card';
    card.dataset.id = pedido.id;
    
    // Fallback pra criar date se der erro no isoformat
    let dataCriacao = new Date(pedido.criado_em);
    if(isNaN(dataCriacao.getTime())) dataCriacao = new Date();
    
    const hora = dataCriacao.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    const detalhes = typeof pedido.detalhes_json === 'string' 
        ? JSON.parse(pedido.detalhes_json) 
        : pedido.detalhes_json;
    
    const itensHtml = detalhes.itens.map(item => `
        <li class="item-row">
            <span class="item-qtd">${item.quantidade}x</span>
            <span class="item-name">${item.nome}</span>
        </li>
    `).join('');

    const tipoBadge = detalhes.tipo_pedido 
        ? `<div class="tipo-badge">${detalhes.tipo_pedido}</div>` 
        : '';

    card.innerHTML = `
        <div class="card-header">
            <div class="pedido-id">#${String(pedido.id).padStart(3, '0')}</div>
            <div class="pedido-time">🕒 ${hora}</div>
        </div>
        
        ${tipoBadge}
        
        <div class="pedido-info">
            <div class="cliente-nome">👤 ${pedido.nome || 'Cliente Local'}</div>
            <div class="cliente-telefone">${pedido.telefone}</div>
        </div>
        
        <ul class="itens-list">
            ${itensHtml}
        </ul>
        
        <button class="btn-concluir" onclick="concluirPedido(${pedido.id}, this)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Pronto para Entrega
        </button>
    `;
    
    return card;
}

async function concluirPedido(id, btnElement) {
    // UI Feedback imediato
    const card = btnElement.closest('.pedido-card');
    btnElement.innerHTML = 'Enviando...';
    btnElement.style.opacity = '0.7';
    card.style.transform = 'scale(0.95)';
    card.style.opacity = '0';
    
    setTimeout(() => {
        card.remove();
        pedidosAtuais.delete(id);
        if (pedidosAtuais.size === 0) {
            emptyState.classList.remove('hidden');
        }
    }, 400);

    try {
        await fetch(`/api/cozinha/pedidos/${id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'concluido' })
        });
    } catch (error) {
        console.error("Erro ao concluir:", error);
        fetchPedidos(); // Tenta sincronizar dnv caso dê erro
    }
}

// Inicialização
fetchPedidos();
setInterval(fetchPedidos, 5000);
