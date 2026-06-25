import json
import os
import re
import sys
import time

from flask import Flask, jsonify, request, send_from_directory

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src.agent_service import EspetariaAgent
from src.database import get_cliente, init_db, save_pedido

app = Flask(__name__, static_folder='static')

# ── session state ─────────────────────────────────────────────────────────────
agent: EspetariaAgent | None = None
current_cart: list = []       # [{nome, quantidade, preco_unitario, subtotal}]
customer_data: dict | None = None   # DB row if returning customer
customer_checked: bool = False      # True once we've queried the DB this session

# ── phone detection ───────────────────────────────────────────────────────────
# Matches Brazilian numbers: DDD (2 digits) + 8 or 9 digit number
PHONE_RE = re.compile(r'\b(\d{2})[\s\-]?(9?\d{4})[\s\-]?(\d{4})\b')
ITEMS_RE  = re.compile(r'§ITEMS§(.+?)§END§', re.DOTALL)


def _extract_phone(text: str) -> str | None:
    m = PHONE_RE.search(text)
    if m:
        digits = re.sub(r'\D', '', m.group(0))
        if len(digits) in (10, 11):
            return digits
    return None


# ── customer context ──────────────────────────────────────────────────────────

def _build_customer_context(cliente: dict) -> str:
    """Format DB row into a compact one-line context prefix for the AI."""
    nome = cliente.get('nome') or ''
    tel  = cliente.get('telefone') or ''
    parts = [f"nome={nome}", f"tel={tel}"]

    # Include last 3 orders compactly
    for key in ('pedido_1', 'pedido_2', 'pedido_3'):
        raw = cliente.get(key)
        if not raw:
            break
        try:
            p = json.loads(raw)
            items_str = '+'.join(
                f"{i['quantidade']}x{i['nome']}" for i in p.get('itens', [])
            )
            parts.append(
                f"pedido(R${p.get('valor_total',0):.0f},{p.get('tipo_pedido','')}"
                f",{p.get('forma_pagamento','')}:{items_str})"
            )
        except Exception:
            break

    return f"[Cliente cadastrado: {','.join(parts)}]\n"


# ── cart helpers ──────────────────────────────────────────────────────────────

def _parse_items_marker(text: str) -> list | None:
    m = ITEMS_RE.search(text)
    if not m:
        return None
    try:
        items = json.loads(m.group(1).strip())
        return items if isinstance(items, list) else None
    except (json.JSONDecodeError, ValueError):
        return None


def _strip_items_marker(text: str) -> str:
    return ITEMS_RE.sub('', text).strip()


def _cart_prefix() -> str:
    if not current_cart:
        return ''
    parts = ','.join(
        f"{i['nome']}×{i['quantidade']}=R${i['subtotal']:.2f}"
        for i in current_cart
    )
    total = sum(i['subtotal'] for i in current_cart)
    return f"[Cart:{parts}|Total:R${total:.2f}]\n"


# ── agent lifecycle ───────────────────────────────────────────────────────────

def init_agent():
    global agent, current_cart, customer_data, customer_checked
    current_cart     = []
    customer_data    = None
    customer_checked = False
    try:
        agent = EspetariaAgent()
    except Exception as e:
        print(f"Erro ao inicializar IA: {e}")
        agent = None


# ── startup ───────────────────────────────────────────────────────────────────

init_db()
init_agent()

# ── routes ────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/api/message', methods=['POST'])
def message():
    global current_cart, customer_data, customer_checked

    data = request.get_json()
    text = data.get('message', '').strip()
    if not text:
        return jsonify({'error': 'Mensagem vazia'}), 400

    if agent is None:
        return jsonify({'response': 'IA indisponível. Reinicie o servidor.', 'order_complete': False})

    # ── 1. Detect phone and look up customer (once per session) ───────────────
    customer_prefix = ''
    if not customer_checked:
        phone = _extract_phone(text)
        if phone:
            customer_checked = True
            found = get_cliente(phone)
            if found:
                customer_data = found
                customer_prefix = _build_customer_context(found)
                print(f"[DB] Cliente encontrado: {found.get('nome')} ({phone})")
            else:
                # New customer — store phone for later save
                customer_data = {'telefone': phone}
                customer_prefix = f"[Cliente novo: tel={phone}]\n"
                print(f"[DB] Cliente novo: {phone}")

    # ── 2. Build augmented message ────────────────────────────────────────────
    augmented = customer_prefix + _cart_prefix() + text

    # ── 3. Call AI with retry ─────────────────────────────────────────────────
    raw_response = None
    last_error   = None
    for attempt in range(4):
        try:
            raw_response = agent.send_message(augmented)
            break
        except Exception as e:
            last_error = e
            err_str = str(e)
            if '429' in err_str or 'RESOURCE_EXHAUSTED' in err_str:
                break
            if attempt < 3:
                time.sleep(2 ** attempt)

    if raw_response is None:
        err_str = str(last_error)
        if '429' in err_str or 'RESOURCE_EXHAUSTED' in err_str:
            msg = 'Cota diária da API esgotada. Aguarde até amanhã ou ative o plano pago no Google AI Studio.'
        else:
            msg = 'O Google Gemini está sobrecarregado. Tente novamente em alguns segundos.'
        print(f"[API ERROR] {last_error}")
        return jsonify({'response': msg, 'order_complete': False})

    # ── 4. Parse cart marker and clean response ───────────────────────────────
    new_cart = _parse_items_marker(raw_response)
    if new_cart is not None:
        current_cart = new_cart

    clean_response = _strip_items_marker(raw_response)

    # ── 5. Detect order completion and persist ────────────────────────────────
    order_complete = (
        '"itens"'          in clean_response
        and '"valor_total"'    in clean_response
        and '"forma_pagamento"' in clean_response
        and '"cliente"'        in clean_response
    )

    if order_complete:
        _persist_order(clean_response)

    return jsonify({
        'response':      clean_response,
        'order_complete': order_complete,
        'cart':          current_cart,
    })


@app.route('/api/reset', methods=['POST'])
def reset():
    init_agent()
    return jsonify({'ok': True})


@app.route('/api/cliente/<telefone>')
def lookup_cliente(telefone):
    cliente = get_cliente(telefone)
    if not cliente:
        return jsonify({'found': False}), 404
    return jsonify({'found': True, 'cliente': cliente})


# ── helpers ───────────────────────────────────────────────────────────────────

def _persist_order(response_text: str):
    try:
        match = re.search(r'\{[\s\S]*\}', response_text)
        if not match:
            return
        order    = json.loads(match.group(0))
        cliente  = order.get('cliente', {})
        telefone = str(cliente.get('telefone', '')).strip()
        nome     = str(cliente.get('nome', '')).strip()
        if not telefone:
            return

        endereco = order.get('endereco') if order.get('tipo_pedido') == 'entrega' else None

        pedido_resumo = json.dumps({
            'itens':           order.get('itens', []),
            'valor_total':     order.get('valor_total'),
            'tipo_pedido':     order.get('tipo_pedido'),
            'forma_pagamento': order.get('forma_pagamento'),
        }, ensure_ascii=False)

        save_pedido(telefone, nome, endereco, pedido_resumo)
        print(f"[DB] Pedido salvo: {nome} ({telefone})")

    except Exception as e:
        print(f"[DB] Erro ao salvar: {e}")


# ── entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("Espetaria do Chef - Interface Web")
    print("Acesse: http://localhost:5000")
    app.run(debug=True, port=5000)
