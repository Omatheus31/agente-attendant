# Agente de IA Conversacional - Espetaria do Chef

Este projeto implementa um Agente de IA Conversacional para uma espetaria, utilizando a API do Google Gemini (`google-generativeai`). O agente interage com os clientes no terminal, apresenta o cardápio, tira dúvidas e anota o pedido. Ao final da conversa, o agente gera um resumo estruturado no formato JSON estrito contendo os itens do pedido e o valor total.

## Estrutura do Projeto

O projeto foi organizado utilizando boas práticas de modularização em Python:

```text
agente/
├── .env                # Arquivo com as variáveis de ambiente e conexão do Banco
├── .env.example        # Exemplo de como o arquivo .env deve ser estruturado
├── requirements.txt    # Dependências do projeto (google-genai, python-dotenv, flask, PyMySQL)
├── main.py             # Ponto de entrada principal e loop de interação no terminal
└── src/
    ├── __init__.py     # Indica que a pasta 'src' é um módulo Python
    ├── config.py       # Responsável por carregar de forma segura as credenciais via .env
    └── agent_service.py# Serviço onde fica a lógica do Gemini (System Prompt e chamadas de API)
```

### O que cada arquivo faz?

1. **`requirements.txt`**: Lista as bibliotecas externas necessárias para rodar o projeto.
2. **`.env.example`**: Um gabarito para você entender como configurar sua chave da API. Por segurança, a chave real nunca deve ir para o controle de versão (Git).
3. **`src/config.py`**: Utiliza o `python-dotenv` para buscar a variável `GEMINI_API_KEY` do arquivo `.env`. Se o arquivo ou a variável não existirem, ele interrompe a execução com uma mensagem clara ensinando como corrigir.
4. **`src/agent_service.py`**: É o "cérebro" do projeto. Contém a classe `EspetariaAgent`, que inicializa o `Client` do Gemini. Aqui está definido o **System Prompt** rigoroso que orienta a IA sobre:
   - O cardápio disponível (Carne, Frango, Pão de Alho).
   - O comportamento educado.
   - A regra final mais importante: quando o cliente se despedir, a IA **deve** gerar um JSON estrito com os itens escolhidos e o valor total. O modelo escolhido é o `gemini-2.5-flash`, a versão mais moderna. Ele utiliza o método `chats.create` que mantém o histórico da conversa de forma automática.
5. **`main.py`**: O arquivo que você executa no terminal. Ele instancia o agente e inicia um loop (`while True`) permitindo que você converse em tempo real. Ele possui uma heurística (condição) para detectar quando a IA finalmente cospe o JSON na tela, o que sinaliza o final do pedido e encerra o loop de forma elegante.

## Como Configurar e Executar

Siga os passos abaixo para rodar o projeto:

### 1. Criar o Ambiente Virtual (se ainda não fez)
Abra o terminal na pasta do projeto e rode:
```bash
python -m venv venv
```

### 2. Ativar o Ambiente Virtual
No Windows (PowerShell):
```bash
.\venv\Scripts\Activate.ps1
```

### 3. Instalar as Dependências
Com o `venv` ativado (você verá um `(venv)` no início do seu terminal), instale as bibliotecas:
```bash
pip install -r requirements.txt
```
*(Se você ver um erro de `ModuleNotFoundError: No module named 'google'`, é porque este passo não foi executado ou a instalação foi feita fora do seu ambiente virtual ativado).*

### 4. Configurar o Banco de Dados e Variáveis de Ambiente
1. Você precisará de um servidor MySQL rodando localmente (recomendamos o **Laragon**, XAMPP ou WAMP).
2. Inicie o servidor MySQL e crie um banco de dados chamado `espetaria`.
3. Crie um arquivo chamado **exatamente** `.env` na raiz do projeto e preencha com a sua chave do Gemini e as configurações do banco (como no `.env.example`):
```text
GEMINI_API_KEY=AIzaSy...sua_chave_real_aqui...

DB_HOST=127.0.0.1
DB_USER=root
DB_PASS=
DB_NAME=espetaria
```

### 5. Rodar a Aplicação
O projeto agora possui uma interface Web! Execute o `app.py`:
```bash
python app.py
```
Isso iniciará o servidor Flask. Você poderá acessar:
- **Chat do Cliente**: `http://localhost:5000/`
- **Dashboard da Cozinha (Live)**: `http://localhost:5000/cozinha`

## Como Usar na Prática

1. O agente vai te dar um "Olá" automático.
2. Converse com ele naturalmente: "Quero dois espetinhos de carne".
3. Ele vai confirmar e perguntar se quer mais algo. Diga: "Um pão de alho também".
4. Por fim, se despeça ou feche o pedido: "Pode fechar a conta, só isso".
5. O programa detectará o JSON gerado na despedida e encerrará o processo com sucesso!

## Possíveis Alertas no VSCode (Solução de Problemas)

Se você vir um aviso visual no seu VSCode indicando `Import "google.genai" could not be resolved from source Pylance`, não se preocupe! Isso é apenas um atraso na ferramenta Pylance (o analisador de código do VSCode) que às vezes demora para "enxergar" pacotes recém-instalados no seu `venv`.
- **Como resolver:** Apenas clique no canto inferior direito do seu VSCode onde aparece a versão do Python (`3.13.x (venv)`), clique novamente e selecione o mesmo interpretador, ou apenas reinicie o seu VSCode.
- De qualquer forma, isso é apenas visual. Como você já testou, o código roda perfeitamente no terminal!
