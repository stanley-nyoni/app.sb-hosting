import os
import psycopg2
import psycopg2.extras
from flask import g


def _connect():
    url = os.environ.get('DATABASE_URL')
    if not url:
        raise RuntimeError('DATABASE_URL environment variable is not set')
    # Render provides postgres:// URIs; psycopg2 needs postgresql://
    if url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql://', 1)
    return psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)


class _Conn:
    """Thin wrapper so app.py can call db.execute() / db.commit() / db.close()
    with the same interface it used against sqlite3."""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=()):
        cur = self._conn.cursor()
        cur.execute(sql, params)
        return cur

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = _Conn(_connect())
    return db


def close_db(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()


def init_db():
    conn = _connect()
    cur = conn.cursor()

    cur.execute('''
        CREATE TABLE IF NOT EXISTS clients (
            id            SERIAL PRIMARY KEY,
            name          TEXT NOT NULL,
            business_name TEXT NOT NULL DEFAULT '',
            phone         TEXT NOT NULL DEFAULT '',
            email         TEXT NOT NULL DEFAULT '',
            notes         TEXT NOT NULL DEFAULT '',
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cur.execute('''
        CREATE TABLE IF NOT EXISTS websites (
            id               SERIAL PRIMARY KEY,
            client_id        INTEGER NOT NULL REFERENCES clients(id),
            domain           TEXT NOT NULL,
            hosting_provider TEXT NOT NULL DEFAULT '',
            start_date       DATE,
            billing_cycle    TEXT NOT NULL DEFAULT 'monthly',
            price            NUMERIC(10,2) NOT NULL DEFAULT 0,
            status           TEXT NOT NULL DEFAULT 'active',
            created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cur.execute('''
        CREATE TABLE IF NOT EXISTS payments (
            id            SERIAL PRIMARY KEY,
            website_id    INTEGER NOT NULL REFERENCES websites(id),
            amount        NUMERIC(10,2),
            payment_date  DATE,
            next_due_date DATE,
            notes         TEXT NOT NULL DEFAULT '',
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()
    cur.close()
    conn.close()
