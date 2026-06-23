# Documentação Técnica: Agente Conversacional - Espetaria do Chef

Este documento detalha a arquitetura, o fluxo de execução e a finalidade de cada componente do sistema. Ele serve como guia para novos desenvolvedores e para a apresentação do funcionamento lógico do agente.

## 1. Visão Geral da Arquitetura

O sistema foi desenhado seguindo princípios de **responsabilidade única** e **modularização**. Em vez de ter todo o código em um único script, as funções foram separadas para garantir que a lógica de configuração não se misture com as chamadas de API, e que a interface de terminal (CLI) seja independente do "cérebro" da Inteligência Artificial.

A estrutura de diretórios do projeto reflete essa arquitetura:
- A raiz do projeto (onde fica o `main.py`) lida com a interface do usuário.
- O diretório `src/` contém a lógica de negócios e configuração.
- O diretório `venv/` encapsula todas as dependências externas.

## 2. Mapeamento dos Arquivos

### `main.py`
**Responsabilidade:** Interface com o usuário (CLI - Command Line Interface).
**Como funciona:**
- Inicializa a classe `EspetariaAgent` vinda do `agent_service.py`.
- Lida com o bloco de tentativas (`try-except`) garantindo que o programa avise o usuário caso haja problemas de inicialização (como a falta da chave API).
- Aciona uma "mensagem invisível" no começo para forçar o robô a ser o primeiro a cumprimentar o cliente.
- Roda um loop infinito (`while True`) aguardando que o usuário digite suas mensagens via `input()`.
- Possui uma "heurística" (uma condição de verificação) em cada resposta da IA. Se a resposta da IA contiver as palavras `"itens"` e `"valor_total"` e usar as chaves `{ }`, ele assume que a IA emitiu o JSON final e encerra o programa (quebra o loop com um `break`).

### `src/agent_service.py`
**Responsabilidade:** Cérebro da Inteligência Artificial.
**Como funciona:**
- Configura o `genai.Client` passando a nossa chave secreta.
- Cria a **Configuração de Geração de Conteúdo (`GenerateContentConfig`)**, que injeta o nosso **System Prompt**.
- **System Prompt (O Segredo do Robô):** É um texto longo que a IA lê antes de falar com o usuário. Nele estão "as ordens" que definem a personalidade dela: 
  - *Identidade:* Ser um assistente da 'Espetaria do Chef'.
  - *Conhecimento:* O cardápio exato e os preços.
  - *Regra Estrita:* Quando o usuário se despedir ou fechar a conta, o robô é proibido de falar texto normal e obrigado a devolver a estrutura de dados (JSON) preenchida com o que o cliente consumiu.
- Instancia o modelo **`gemini-2.5-flash`** que é ágil e mantém memória através de um histórico de chat interno (`self.client.chats.create`).
- Expõe um método chamado `send_message()`, que pega a mensagem recebida pelo `main.py`, envia para o Google e devolve o texto de resposta.

### `src/config.py`
**Responsabilidade:** Segurança e Gestão de Variáveis de Ambiente.
**Como funciona:**
- Em vez de embutir ("chumbar") senhas no meio do código, ele usa a biblioteca `python-dotenv`.
- O método `load_dotenv()` procura por um arquivo oculto chamado `.env` e carrega o seu conteúdo para a memória do sistema operacional (`os.environ`).
- Se a variável `GEMINI_API_KEY` não for encontrada no `.env`, o sistema aborta instantaneamente antes mesmo de tentar ligar o Agente, lançando uma exceção (`ValueError`) com uma instrução amigável.

### `requirements.txt`
**Responsabilidade:** Gestão de Dependências.
**Como funciona:** Lista de todas as bibliotecas de terceiros necessárias. Atualmente inclui o `google-genai` (SDK oficial do Gemini) e `python-dotenv`.

### `.env` (Arquivo local) e `.env.example`
**Responsabilidade:** Armazenamento seguro de segredos.
- O `.env` guarda a chave real e nunca é enviado para a nuvem.
- O `.env.example` é enviado para a nuvem com senhas falsas apenas para ensinar outros programadores quais variáveis o projeto precisa para rodar.

### `.gitignore`
**Responsabilidade:** Controle de versionamento.
Diz ao Git QUAIS pastas e arquivos ele DEVE ignorar e NUNCA salvar na nuvem, garantindo segurança (escondendo o `.env`) e leveza (escondendo a pesada pasta `venv/`).

## 3. Fluxo de Comunicação e o Encerramento via JSON

O principal atrativo técnico desse sistema é a integração entre conversação natural e formatação estruturada de dados.
1. O cliente interage com a linguagem humana.
2. O modelo Gemini (na nuvem) processa e lembra o contexto do carrinho de compras por trás dos panos.
3. Graças ao forte *System Prompt*, o Gemini entende a "mudança de estado" (de conversação para processamento).
4. O `main.py` age como um interceptador, detectando a mudança de estado (o objeto JSON gerado) para finalizar o serviço graciosamente.
