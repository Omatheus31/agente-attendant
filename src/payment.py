import os
import uuid
import requests
from pathlib import Path
from dotenv import load_dotenv

# Caminho explícito para garantir que o .env seja encontrado independente do CWD
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / '.env')

# .strip() remove \r invisível que o Windows às vezes adiciona
_MP_ACCESS_TOKEN = os.getenv('MERCADO_PAGO_ACCESS_TOKEN', '').strip()
_MP_API_BASE = 'https://api.mercadopago.com'

# O sandbox do Mercado Pago não tem nenhum jeito real de aprovar um PIX de teste
# (nem ticket_url, nem o truque payer.first_name=APRO funcionam pra PIX, só pra cartão).
# Por isso, quando o token é de TESTE, expomos um botão de simulação manual no chat.
MP_IS_TEST = _MP_ACCESS_TOKEN.startswith('TEST-')

# IDs de pagamento aprovados manualmente via botão de simulação (somente ambiente de teste)
_SIMULATED_APPROVALS: set[int] = set()

if not _MP_ACCESS_TOKEN:
    print('[MP] AVISO: MERCADO_PAGO_ACCESS_TOKEN não encontrado no .env!')


def criar_pagamento_pix(valor: float, descricao: str, telefone: str = '') -> dict:
    """Cria um pagamento PIX via Mercado Pago e retorna os dados do QR code."""
    email_payer = (
        f'{telefone}@pagamento.espetaria.com'
        if telefone
        else 'cliente@pagamento.espetaria.com'
    )

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
        'ticket_url': tx_data.get('ticket_url'),
        'valor': round(float(valor), 2),
        'is_test': MP_IS_TEST,
    }


def consultar_pagamento(payment_id: int) -> dict:
    """Consulta o status de um pagamento no Mercado Pago."""
    if payment_id in _SIMULATED_APPROVALS:
        return {
            'payment_id': payment_id,
            'status': 'approved',
            'status_detail': 'simulated_approval',
        }

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


def simular_aprovacao(payment_id: int) -> None:
    """Marca um pagamento de TESTE como aprovado localmente.

    O sandbox do Mercado Pago não tem mecanismo real pra aprovar um PIX,
    então essa função só serve pra validar o fluxo de UI (mensagem de
    confirmação + liberação do pedido) durante o desenvolvimento.
    """
    _SIMULATED_APPROVALS.add(int(payment_id))
