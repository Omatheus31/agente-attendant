from flask import Flask, request, jsonify, send_from_directory
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src.agent_service import EspetariaAgent

app = Flask(__name__, static_folder='static')

agent = None
initial_greeting = None


def init_agent():
    global agent, initial_greeting
    agent = EspetariaAgent()
    initial_greeting = agent.send_message("Olá! Cheguei no restaurante.")


init_agent()


@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/api/initial')
def get_initial():
    return jsonify({'response': initial_greeting})


@app.route('/api/message', methods=['POST'])
def message():
    data = request.get_json()
    text = data.get('message', '').strip()
    if not text:
        return jsonify({'error': 'Mensagem vazia'}), 400

    response = agent.send_message(text)
    order_complete = '"itens"' in response and '"valor_total"' in response

    return jsonify({'response': response, 'order_complete': order_complete})


@app.route('/api/reset', methods=['POST'])
def reset():
    init_agent()
    return jsonify({'response': initial_greeting})


if __name__ == '__main__':
    print("Espetaria do Chef - Interface Web")
    print("Acesse: http://localhost:5000")
    app.run(debug=True, port=5000)
