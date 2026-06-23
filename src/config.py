import os
from dotenv import load_dotenv

# Carrega as variáveis de ambiente do arquivo .env (se existir)
load_dotenv()

# Obtém a chave da API do ambiente
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY or GEMINI_API_KEY == "sua_chave_de_api_do_google_aqui":
    raise ValueError(
        "A variável de ambiente GEMINI_API_KEY não está configurada ou é inválida. "
        "Crie um arquivo .env na raiz do projeto contendo: GEMINI_API_KEY=sua_chave_real"
    )
