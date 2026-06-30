import os
import uuid
import requests
from dotenv import load_dotenv

load_dotenv()

_MP_ACCESS_TOKEN = os.getenv('MERCADO_PAGO_ACCESS_TOKEN', '')
_MP_ENV = os.getenv('MP_ENV', 'production')
_MP_TEST_PAYER_EMAIL = os.getenv('MP_TEST_PAYER_EMAIL', '')
_MP_API_BASE = 'https://api.mercadopago.com'


def criar_pagamento_pix(valor: float, descricao: str, telefone: str = '') -> dict:
    """Cria um pagamento PIX via Mercado Pago e retorna os dados do QR code."""
    if _MP_ENV == 'sandbox' and _MP_TEST_PAYER_EMAIL:
        email_payer = _MP_TEST_PAYER_EMAIL
    elif telefone:
        email_payer = f'{telefone}@pagamento.espetaria.com'
    else:
        email_payer = 'cliente@pagamento.espetaria.com'

    headers = {
        'Authorization': f'Bearer {_MP_ACCESS_TOKEN}',
        'Content-Type': 'application/json',
        'X-Idempotency-Key': str(uuid.uuid4()),
    }

    payload = {
        'transaction_amount': round(float(valor), 2),
        'description': descricao[:255],
        'payment_method_id': 'pix',
        'payer': {
            'email': email_payer,
        },
    }

    resp = requests.post(
        f'{_MP_API_BASE}/v1/payments',
        json=payload,
        headers=headers,
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    tx_data = data.get('point_of_interaction', {}).get('transaction_data', {})

    return {
        'payment_id': data['id'],
        'status': data['status'],
        'qr_code': tx_data.get('qr_code'),
        'qr_code_base64': tx_data.get('qr_code_base64'),
        'valor': round(float(valor), 2),
    }


def consultar_pagamento(payment_id: int) -> dict:
    """Consulta o status de um pagamento no Mercado Pago."""
    headers = {'Authorization': f'Bearer {_MP_ACCESS_TOKEN}'}
    resp = requests.get(
        f'{_MP_API_BASE}/v1/payments/{payment_id}',
        headers=headers,
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    return {
        'payment_id': data['id'],
        'status': data['status'],
        'status_detail': data.get('status_detail'),
    }
