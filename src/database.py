import sqlite3
import os

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'espetaria.db'
)


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _conn() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS clientes (
                telefone      TEXT PRIMARY KEY,
                nome          TEXT,
                endereco      TEXT,
                pedido_1      TEXT,
                pedido_2      TEXT,
                pedido_3      TEXT,
                criado_em     TEXT DEFAULT (datetime('now','localtime')),
                atualizado_em TEXT DEFAULT (datetime('now','localtime'))
            )
        ''')
        conn.commit()


def get_cliente(telefone: str) -> dict | None:
    with _conn() as conn:
        row = conn.execute(
            'SELECT * FROM clientes WHERE telefone = ?', (telefone,)
        ).fetchone()
    return dict(row) if row else None


def save_pedido(telefone: str, nome: str, endereco: str | None, pedido_json: str):
    """Insert or update a customer, rotating the last 3 orders (newest first)."""
    with _conn() as conn:
        existing = conn.execute(
            'SELECT pedido_1, pedido_2 FROM clientes WHERE telefone = ?',
            (telefone,)
        ).fetchone()

        if existing:
            conn.execute('''
                UPDATE clientes
                SET nome          = ?,
                    endereco      = COALESCE(?, endereco),
                    pedido_1      = ?,
                    pedido_2      = ?,
                    pedido_3      = ?,
                    atualizado_em = datetime('now','localtime')
                WHERE telefone = ?
            ''', (nome, endereco, pedido_json,
                  existing['pedido_1'], existing['pedido_2'],
                  telefone))
        else:
            conn.execute(
                '''INSERT INTO clientes (telefone, nome, endereco, pedido_1)
                   VALUES (?, ?, ?, ?)''',
                (telefone, nome, endereco, pedido_json)
            )
        conn.commit()
