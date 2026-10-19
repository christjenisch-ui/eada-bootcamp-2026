"""SQLite storage for Ownly: users, login sessions, listings and messages.

The database file (portal/ownly.db) is created automatically on first run.
"""
import hashlib
import hmac
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "ownly.db"
SESSION_DAYS = 30
PBKDF2_ITERATIONS = 310_000

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS listings (
    id            INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    property_type TEXT NOT NULL,
    area          TEXT NOT NULL,
    address       TEXT NOT NULL,
    price         INTEGER NOT NULL,
    sqft          INTEGER NOT NULL,
    year_built    INTEGER NOT NULL,
    bedrooms      INTEGER NOT NULL,
    bathrooms     REAL NOT NULL,
    garage        INTEGER NOT NULL DEFAULT 0,
    quality       INTEGER NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    contact_name  TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    contact_phone TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS listings_by_area ON listings(area);
CREATE INDEX IF NOT EXISTS listings_by_user ON listings(user_id);
CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY,
    listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    phone      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    read_at    TEXT
);
CREATE INDEX IF NOT EXISTS messages_by_listing ON messages(listing_id);
"""


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def transaction():
    """A connection that commits on success, rolls back on error and always closes."""
    conn = connect()
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init():
    with transaction() as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        columns = {row[1] for row in conn.execute("PRAGMA table_info(listings)")}
    if "quality" not in columns:
        raise SystemExit(f"{DB_PATH.name} was made for the old Boston version of Ownly. "
                         "Delete it (and any ownly.db-wal / -shm files) to start fresh.")


# ---- passwords ----
def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def check_password(password, stored):
    _, iterations, salt, digest = stored.split("$")
    test = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
    return hmac.compare_digest(test.hex(), digest)


# Compared against when an email is unknown, so failed logins take the same time either way.
DUMMY_HASH = hash_password(secrets.token_hex(8))


# ---- sessions ----
def _token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(conn, user_id):
    """Store a new session and return its token (only the token's hash is stored)."""
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    conn.execute("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                 (_token_hash(token), user_id, expires.isoformat(timespec="seconds")))
    return token


def session_user(conn, token):
    row = conn.execute(
        """SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ? AND s.expires_at > ?""",
        (_token_hash(token), now())).fetchone()
    return dict(row) if row else None


def delete_session(conn, token):
    conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))
