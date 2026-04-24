import sqlite3
from flask import g

DATABASE = 'hosting_manager.db'


def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
    return db


def close_db(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")

    db.executescript('''
        CREATE TABLE IF NOT EXISTS clients (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            business_name TEXT  DEFAULT '',
            phone       TEXT    DEFAULT '',
            email       TEXT    DEFAULT '',
            notes       TEXT    DEFAULT '',
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS websites (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id        INTEGER NOT NULL,
            domain           TEXT    NOT NULL,
            hosting_provider TEXT    DEFAULT '',
            start_date       DATE,
            billing_cycle    TEXT    DEFAULT 'monthly',
            price            REAL    DEFAULT 0,
            status           TEXT    DEFAULT 'active',
            created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id)
        );

        CREATE TABLE IF NOT EXISTS payments (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            website_id   INTEGER NOT NULL,
            amount       REAL,
            payment_date DATE,
            next_due_date DATE,
            notes        TEXT    DEFAULT '',
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (website_id) REFERENCES websites(id)
        );
    ''')

    db.commit()
    db.close()
