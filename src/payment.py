import os
import mercadopago
from dotenv import load_dotenv

load_dotenv()

_TOKEN = os.getenv("MERCADO_PAGO_ACCESS_TOKEN", "")
_ENV   = os.getenv("MP_ENV", "sandbox")   # "sandbox" | "production"


def _sdk() -> mercadopago.SDK:
    if not _TOKEN:
        raise Exception(
            "MERCADO_PAGO_ACCESS_TOKEN não definido no .env. "
            "Adicione o token de teste (sandbox) obtido em "
            "https://www.mercadopago.com.br/developers/panel"
        )
    return mercadopago.SDK(_TOKEN)


# ── PIX ───────────────────────────────────────────────────────────────────────

def create_pix(valor: float, descricao: str, nome: str, telefone: str) -> dict:
    """
    Cria uma cobrança PIX e retorna o QR code (base64) e o código copia-e-cola.
    Documentação MP: https://www.mercadopago.com.br/developers/pt/docs/checkout-api/payment-methods/other-payment-methods/brasil/pix
    """
    sdk = _sdk()

    # MP exige e-mail único por pagador; usamos o telefone como identificador
    email = f"pedido.{telefone}@espetaria.local"
    partes = nome.strip().split()

    payload = {
        "transaction_amount": round(float(valor), 2),
        "description": descricao[:254],
        "payment_method_id": "pix",
        "payer": {
            "email": email,
            "first_name": partes[0] if partes else "Cliente",
            "last_name": partes[-1] if len(partes) > 1 else "Cliente",
        },
    }

    result = sdk.payment().create(payload)
    resp   = result.get("response", {})
    code   = result.get("status")

    if code not in (200, 201):
        raise Exception(f"Mercado Pago PIX [{code}]: {resp.get('message', resp)}")

    td = resp.get("point_of_interaction", {}).get("transaction_data", {})
    return {
        "tipo":           "pix",
        "payment_id":     resp.get("id"),
        "qr_code":        td.get("qr_code"),        # código copia-e-cola
        "qr_code_base64": td.get("qr_code_base64"), # imagem do QR
        "valor":          valor,
        "status":         resp.get("status"),
    }


# ── CARTÃO (Checkout Pro) ─────────────────────────────────────────────────────

def create_checkout_link(
    valor: float, descricao: str, nome: str, telefone: str, metodo: str
) -> dict:
    """
    Cria uma preferência de pagamento no Checkout Pro do Mercado Pago.
    Retorna uma URL para a página de pagamento hospedada pelo MP (sem precisar
    de formulário de cartão no nosso lado — zero PCI compliance).
    Docs: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/landing
    """
    sdk = _sdk()

    email = f"pedido.{telefone}@espetaria.local"
    forma = metodo.lower()

    # Restringe ao tipo de cartão escolhido para não exibir opções desnecessárias
    if "créd" in forma or "cred" in forma:
        excluir = [
            {"id": "debit_card"}, {"id": "ticket"},
            {"id": "bank_transfer"}, {"id": "atm"},
        ]
    else:  # débito
        excluir = [
            {"id": "credit_card"}, {"id": "ticket"},
            {"id": "bank_transfer"}, {"id": "atm"},
        ]

    payload = {
        "items": [{
            "title":      descricao[:254],
            "quantity":   1,
            "unit_price": round(float(valor), 2),
            "currency_id": "BRL",
        }],
        "payer": {"name": nome, "email": email},
        "payment_methods": {
            "excluded_payment_types": excluir,
            "installments": 1,          # sem parcelamento = taxa menor
        },
        "statement_descriptor": "EspetariaChef",
        "binary_mode": True,            # só aprovado/rejeitado, sem pendente
    }

    result = sdk.preference().create(payload)
    resp   = result.get("response", {})
    code   = result.get("status")

    if code not in (200, 201):
        raise Exception(f"Mercado Pago Checkout [{code}]: {resp.get('message', resp)}")

    url_key = "init_point" if _ENV == "production" else "sandbox_init_point"
    return {
        "tipo":          "cartao",
        "preference_id": resp.get("id"),
        "checkout_url":  resp.get(url_key),
        "valor":         valor,
        "metodo":        metodo,
    }
