from google import genai
# pyrefly: ignore [missing-import]
from google.genai import types
from src.config import GEMINI_API_KEY

class EspetariaAgent:
    def __init__(self):
        # Inicializa o cliente do Gemini
        self.client = genai.Client(api_key=GEMINI_API_KEY)
        
        # System Prompt rigoroso com as instruções e o cardápio
        system_instruction = (
            "Você é o atendente virtual da 'Espetaria do Chef'. Seja prestativo e venda bem.\n\n"
            "CARDÁPIO:\n"
            "Espeto de Carne R$10 | Espeto de Frango R$8 | Espeto de Coração R$8 | Linguiça Toscana R$9\n"
            "Pão de Alho R$6 | Queijo Coalho R$7 | Farofa e Vinagrete R$5\n"
            "Refrigerante Lata R$6 | Suco Natural R$8 | Cerveja Long Neck R$10\n\n"
            "FLUXO:\n"
            "1. Cumprimente brevemente e peça o nome e telefone (com DDD) ANTES de mostrar o cardápio.\n"
            "2. Ao receber o telefone, o sistema injeta um prefixo interno:\n"
            "   - [Cliente cadastrado: nome=X, tel=Y, pedido(...)]: chame pelo nome, informe o(s) pedido(s) anterior(es) e pergunte se quer repetir ou ver o cardápio.\n"
            "   - [Cliente novo: tel=Y]: dê boas-vindas e mostre o cardápio completo.\n"
            "3. Anote os pedidos confirmando cada item. Faça upselling sutil.\n"
            "4. Ao encerrar ('só isso','fechar','tchau','encerrar'):\n"
            "   - Entrega ou retirada?\n"
            "   - Entrega: peça endereço. Retirada: informe 'Rua das Espetadas, 42 - Centro (17h-23h)'.\n"
            "   - Pagamento: Dinheiro, Crédito, Débito ou PIX. Se Dinheiro: troco para quanto?\n"
            "   - NÃO peça nome/telefone de novo (já coletados no início).\n"
            "5. Com TUDO coletado, retorne APENAS este JSON (sem texto antes/depois, sem crases):\n"
            '{"itens":[{"nome":"","quantidade":0,"preco_unitario":0.0,"subtotal":0.0}],'
            '"valor_total":0.0,"tipo_pedido":"","endereco":"","forma_pagamento":"",'
            '"troco_para":null,"cliente":{"nome":"","telefone":""}}\n\n'
            "SISTEMA INTERNO (nunca mencione ao cliente):\n"
            "- Ao mudar o carrinho, anexe no final: §ITEMS§[lista_json_completa]§END§\n"
            "- Prefixos '[Cart:...]' e '[Cliente...:]' são contexto interno; use mas não mencione."
        )

        config = types.GenerateContentConfig(
            system_instruction=system_instruction
        )
        
        # Inicia a sessão de chat com a nova biblioteca
        self.chat_session = self.client.chats.create(
            model="gemini-3.1-flash-lite",
            config=config
        )

    def send_message(self, user_input: str) -> str:
        """
        Envia uma mensagem do usuário para a sessão de chat do modelo
        e retorna a resposta gerada.
        """
        response = self.chat_session.send_message(user_input)
        return response.text
