import pymysql
import os
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv('DB_HOST', '127.0.0.1')
DB_USER = os.getenv('DB_USER', 'root')
DB_PASS = os.getenv('DB_PASS', '')
DB_NAME = os.getenv('DB_NAME', 'espetaria')


def _conn():
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True
    )


def init_db():
    try:
        conn = _conn()
        with conn.cursor() as cursor:
            # Tabela de Clientes
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS clientes (
                    telefone      VARCHAR(20) PRIMARY KEY,
                    nome          VARCHAR(100),
                    endereco      TEXT,
                    pedido_1      JSON,
                    pedido_2      JSON,
                    pedido_3      JSON,
                    criado_em     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            ''')
            
            # Tabela de Pedidos (Para a Cozinha)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS pedidos (
                    id            INT AUTO_INCREMENT PRIMARY KEY,
                    telefone      VARCHAR(20),
                    nome          VARCHAR(100),
                    detalhes_json JSON,
                    status        VARCHAR(20) DEFAULT 'pendente',
                    criado_em     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
        conn.close()
    except Exception as e:
        print(f"Erro ao inicializar o banco de dados: {e}")


def get_cliente(telefone: str) -> dict | None:
    conn = _conn()
    with conn.cursor() as cursor:
        cursor.execute(
            'SELECT * FROM clientes WHERE telefone = %s', (telefone,)
        )
        row = cursor.fetchone()
    conn.close()
    return row


def save_pedido(telefone: str, nome: str, endereco: str | None, pedido_json: str):
    """Insert or update a customer, rotating the last 3 orders (newest first). Also inserts into 'pedidos' table."""
    conn = _conn()
    with conn.cursor() as cursor:
        # Pega pedidos anteriores
        cursor.execute(
            'SELECT pedido_1, pedido_2 FROM clientes WHERE telefone = %s',
            (telefone,)
        )
        existing = cursor.fetchone()

        if existing:
            cursor.execute('''
                UPDATE clientes
                SET nome          = %s,
                    endereco      = COALESCE(%s, endereco),
                    pedido_1      = %s,
                    pedido_2      = %s,
                    pedido_3      = %s
                WHERE telefone = %s
            ''', (nome, endereco, pedido_json,
                  existing['pedido_1'], existing['pedido_2'],
                  telefone))
        else:
            cursor.execute('''
                INSERT INTO clientes (telefone, nome, endereco, pedido_1)
                VALUES (%s, %s, %s, %s)
            ''', (telefone, nome, endereco, pedido_json))
        
        # Insere na fila da cozinha
        cursor.execute('''
            INSERT INTO pedidos (telefone, nome, detalhes_json, status)
            VALUES (%s, %s, %s, 'pendente')
        ''', (telefone, nome, pedido_json))
        pedido_id = cursor.lastrowid

    conn.close()
    return pedido_id


def get_pedido_status(pedido_id: int) -> dict | None:
    conn = _conn()
    with conn.cursor() as cursor:
        cursor.execute(
            'SELECT id, status, detalhes_json FROM pedidos WHERE id = %s',
            (pedido_id,)
        )
        row = cursor.fetchone()
    conn.close()
    return row


def get_pedidos_pendentes() -> list:
    conn = _conn()
    with conn.cursor() as cursor:
        cursor.execute('''
            SELECT id, telefone, nome, detalhes_json, status, criado_em 
            FROM pedidos 
            WHERE status = 'pendente' 
            ORDER BY criado_em ASC
        ''')
        rows = cursor.fetchall()
    conn.close()
    return rows


def atualizar_status_pedido(pedido_id: int, status: str):
    conn = _conn()
    with conn.cursor() as cursor:
        cursor.execute('''
            UPDATE pedidos
            SET status = %s
            WHERE id = %s
        ''', (status, pedido_id))
    conn.close()
