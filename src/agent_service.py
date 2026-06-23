from google import genai
from google.genai import types
from src.config import GEMINI_API_KEY

class EspetariaAgent:
    def __init__(self):
        # Inicializa o cliente do Gemini
        self.client = genai.Client(api_key=GEMINI_API_KEY)
        
        # System Prompt rigoroso com as instruções e o cardápio
        system_instruction = """Você é o assistente virtual de atendimento de uma espetaria chamada 'Espetaria do Chef'.
Seu objetivo é ser educado, prestativo e anotar o pedido do cliente.

Aqui está o cardápio:
- Espeto de Carne: R$ 10,00
- Espeto de Frango: R$ 8,00
- Pão de Alho: R$ 6,00

Regras:
1. Cumprimente o cliente, apresente-se e mostre o cardápio.
2. Tire dúvidas sobre os itens, se houver.
3. Anote o pedido do cliente passo a passo. Confirme com ele se deseja mais alguma coisa.
4. Quando o cliente disser que encerrou o pedido, ou se despedir (ex: "só isso", "fechar a conta", "tchau"), você DEVE finalizar a conversa gerando um resumo estruturado no formato JSON estrito.
5. O JSON de encerramento deve seguir EXATAMENTE a seguinte estrutura, sem nenhum texto adicional antes ou depois do JSON (não use crases ```json no final, apenas retorne o JSON cru):

{
  "itens": [
    {"nome": "Espeto de Carne", "quantidade": 2, "preco_unitario": 10.00, "subtotal": 20.00}
  ],
  "valor_total": 20.00
}

Atenção: 
- Até o momento da despedida, responda de forma natural em texto normal conversacional.
- APENAS no final, retorne EXCLUSIVAMENTE o objeto JSON."""

        config = types.GenerateContentConfig(
            system_instruction=system_instruction
        )
        
        # Inicia a sessão de chat com a nova biblioteca
        self.chat_session = self.client.chats.create(
            model="gemini-2.5-flash", 
            config=config
        )

    def send_message(self, user_input: str) -> str:
        """
        Envia uma mensagem do usuário para a sessão de chat do modelo
        e retorna a resposta gerada.
        """
        response = self.chat_session.send_message(user_input)
        return response.text
