import os
import mercadopago
from dotenv import load_dotenv

load_dotenv()

_TOKEN            = os.getenv("MERCADO_PAGO_ACCESS_TOKEN", "")
_ENV              = os.getenv("MP_ENV", "sandbox")   # "sandbox" | "production"
_TEST_PAYER_EMAIL = os.getenv("MP_TEST_PAYER_EMAIL", "")  # email do comprador de teste MP


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
    Tenta gerar QR Code PIX via Payments API (Checkout API).
    Se o app não tiver essa permissão, cai para link via Checkout Pro.
    """
    sdk    = _sdk()
    # Em sandbox, a Payments API exige email de usuário de teste cadastrado no MP.
    email  = _TEST_PAYER_EMAIL if (_ENV == "sandbox" and _TEST_PAYER_EMAIL) else f"cliente.{telefone}@espetaria.com.br"
    partes = nome.strip().split()

    # --- Tentativa 1: Payments API (gera QR code inline) ---
    pay_payload = {
        "transaction_amount": round(float(valor), 2),
        "description":        descricao[:254],
        "payment_method_id":  "pix",
        "payer": {
            "email":      email,
            "first_name": partes[0] if partes else "Cliente",
            "last_name":  partes[-1] if len(partes) > 1 else "Cliente",
        },
    }

    result = sdk.payment().create(pay_payload)
    resp   = result.get("response", {})
    code   = result.get("status")

    if code in (200, 201):
        td = resp.get("point_of_interaction", {}).get("transaction_data", {})
        return {
            "tipo":           "pix",
            "payment_id":     resp.get("id"),
            "qr_code":        td.get("qr_code"),
            "qr_code_base64": td.get("qr_code_base64"),
            "valor":          valor,
            "status":         resp.get("status"),
        }

    print(f"[PIX API] Falhou ({code}): {resp.get('message')} | cause: {resp.get('cause', resp.get('error', ''))}")

    # --- Fallback: Checkout Pro (link externo) ---
    pref_payload = {
        "items": [{
            "title":       descricao[:254],
            "quantity":    1,
            "unit_price":  round(float(valor), 2),
            "currency_id": "BRL",
        }],
        "payer": {"name": nome, "email": email},
        "payment_methods": {
            "excluded_payment_types": [
                {"id": "credit_card"}, {"id": "debit_card"},
                {"id": "ticket"},      {"id": "atm"},
            ],
        },
        "statement_descriptor": "EspetariaChef",
        "binary_mode": True,
    }

    result2 = sdk.preference().create(pref_payload)
    resp2   = result2.get("response", {})
    code2   = result2.get("status")

    if code2 not in (200, 201):
        raise Exception(f"Mercado Pago PIX [{code2}]: {resp2.get('message', resp2)}")

    url_key = "init_point" if _ENV == "production" else "sandbox_init_point"
    return {
        "tipo":          "pix",
        "preference_id": resp2.get("id"),
        "checkout_url":  resp2.get(url_key),
        "valor":         valor,
        "status":        "pending",
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

    # Exclui apenas boleto/atm (nunca usados num restaurante).
    # Não filtramos crédito vs débito pois contas sandbox podem não ter ambos habilitados.
    excluded = [{"id": "ticket"}, {"id": "atm"}]

    payload = {
        "items": [{
            "title":       descricao[:254],
            "quantity":    1,
            "unit_price":  round(float(valor), 2),
            "currency_id": "BRL",
        }],
        "payer": {"name": nome, "email": email},
        "payment_methods": {
            "excluded_payment_types": excluded,
            "installments": 1,
        },
        "statement_descriptor": "EspetariaChef",
        "binary_mode": True,
    }

    result = sdk.preference().create(payload)
    resp   = result.get("response", {})
    code   = result.get("status")

    if code not in (200, 201):
        print(f"[CHECKOUT] Falhou ({code}): {resp.get('message')} | cause: {resp.get('cause', resp.get('error', resp))}")
        raise Exception(f"Mercado Pago Checkout [{code}]: {resp.get('message', resp)}")

    url_key = "init_point" if _ENV == "production" else "sandbox_init_point"
    return {
        "tipo":          "cartao",
        "preference_id": resp.get("id"),
        "checkout_url":  resp.get(url_key),
        "valor":         valor,
        "metodo":        metodo,
    }
