import sys
import os
from src.agent_service import EspetariaAgent

def main():
    print("=" * 50)
    print(" Inicializando o Agente da Espetaria do Chef...")
    print("=" * 50)
    
    try:
        agent = EspetariaAgent()
    except ValueError as ve:
        print(f"\n[ERRO DE CONFIGURAÇÃO] {ve}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERRO] Falha ao inicializar o agente: {e}")
        sys.exit(1)

    print("\n[Agente pronto! Digite 'sair' para encerrar a conversa abruptamente.]\n")

    # Primeira interação invisível para provocar o modelo a enviar a saudação inicial
    print("Conectando ao assistente...\n")
    try:
        saudacao = agent.send_message("Olá! Cheguei no restaurante.")
        print(f"🤖 Agente: {saudacao}")
    except Exception as e:
        print(f"Erro ao conectar com o modelo Gemini: {e}")
        sys.exit(1)

    # Loop de conversa no terminal
    while True:
        try:
            user_input = input("\n👤 Você: ")
            
            # Condição de saída manual
            if user_input.lower().strip() in ['sair', 'exit', 'quit']:
                print("\nEncerrando o sistema a pedido do usuário...")
                break
                
            if not user_input.strip():
                continue
                
            # Envia a mensagem e recebe a resposta do Gemini
            response = agent.send_message(user_input)
            print(f"\n🤖 Agente: {response}")
            
            # Heurística para verificar se o agente retornou o JSON (fim do pedido)
            # Verifica se as chaves principais do JSON esperado estão na resposta
            if '"itens"' in response and '"valor_total"' in response and "{" in response and "}" in response:
                print("\n" + "=" * 50)
                print(" [SISTEMA] JSON Detectado! Pedido finalizado.")
                print("=" * 50)
                break
                
        except KeyboardInterrupt:
            print("\n\nOperação cancelada pelo usuário (Ctrl+C). Encerrando...")
            break
        except Exception as e:
            print(f"\n[ERRO NA CONVERSA] Ocorreu um erro: {e}")

if __name__ == "__main__":
    # Garante que as importações com src. funcionem rodando pelo root
    sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
    main()
