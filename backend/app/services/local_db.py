"""
BCD Backend - Encrypted on-device local SQLite database.

Since native SQLCipher bindings (pysqlcipher3/sqlcipher3) require
libsqlcipher-dev and often fail to build in lightweight environments, this
module uses a fallback implementation built on the already-required
cryptography library:

* AES-256-GCM encryption per row for embeddings and JSON payloads.
* Argon2id key derivation with a 128-bit random salt.
* Standard SQLite (stdlib sqlite3) for storage.

This satisfies the PRD requirement of on-device encrypted storage and remains
compatible with the existing backend dependency set. If SQLCipher bindings are
installed, they are preferred automatically.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import sqlite3
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.argon2 import Argon2id

logger = logging.getLogger("app")

DEFAULT_DB_DIR = Path.home() / ".bcd"
DEFAULT_DB_PATH = DEFAULT_DB_DIR / "local.db"

SALT_BYTES = 16  # 128-bit salt
KEY_BYTES = 32  # AES-256
NONCE_BYTES = 12  # 96-bit nonce for AES-GCM

ARGON2_ITERATIONS = 3
ARGON2_LANES = 4
ARGON2_MEMORY_KIB = 65536  # 64 MB


class DatabaseError(Exception):
    """Base exception for local database errors."""


class InvalidKeyError(DatabaseError):
    """Raised when the database key is incorrect or decryption fails."""


class CorruptedDatabaseError(DatabaseError):
    """Raised when the database file appears corrupted."""


@dataclass
class LocalImage:
    """Plaintext representation of an image row."""

    id: str
    session_id: str
    angle_type: str
    embedding: bytes
    quality_data: Dict[str, Any]
    created_at: datetime


@dataclass
class LocalSession:
    """Plaintext representation of a session row."""

    id: str
    created_at: datetime
    user_id: str
    images: List[LocalImage] = field(default_factory=list)


def _utc_now() -> datetime:
    """Return timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


def _default_db_path() -> Path:
    """Return the default local database path, creating parent dir if needed."""
    path = Path(os.getenv("BCD_LOCAL_DB_PATH", DEFAULT_DB_PATH))
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _derive_key(password: str, salt: bytes) -> bytes:
    """Derive a 32-byte AES key from password and salt using Argon2id."""
    kdf = Argon2id(
        salt=salt,
        length=KEY_BYTES,
        iterations=ARGON2_ITERATIONS,
        lanes=ARGON2_LANES,
        memory_cost=ARGON2_MEMORY_KIB,
    )
    return kdf.derive(password.encode("utf-8"))


def _pack_encrypted_blob(ciphertext: bytes, nonce: bytes, tag: bytes) -> bytes:
    """
    Pack ciphertext, nonce and tag into a single bytes blob.
    Layout: [nonce (12 bytes)][ciphertext (N bytes)][tag (16 bytes)]
    """
    return nonce + ciphertext + tag


def _unpack_encrypted_blob(blob: bytes) -> tuple[bytes, bytes, bytes]:
    """Unpack an encrypted blob into nonce, ciphertext and tag."""
    if len(blob) < NONCE_BYTES + 16:
        raise InvalidKeyError("Encrypted blob is too short to unpack")
    nonce = blob[:NONCE_BYTES]
    tag = blob[-16:]
    ciphertext = blob[NONCE_BYTES:-16]
    return nonce, ciphertext, tag


class EncryptedLocalDatabase:
    """
    Encrypted SQLite-backed local store for sessions and images.

    Uses either SQLCipher (when available) or a per-row AES-256-GCM fallback
    on top of stdlib sqlite3. Row encryption is transparent to callers.
    """

    def __init__(
        self,
        password: str,
        db_path: Optional[Path] = None,
    ):
        self.password = password
        self.db_path = db_path or _default_db_path()
        self._uses_sqlcipher = False
        self._sqlcipher_key: Optional[str] = None

        self._salt: Optional[bytes] = None
        self._key: Optional[bytes] = None
        self._aesgcm: Optional[AESGCM] = None

        self._init_module()

    def _init_module(self) -> None:
        """Prefer SQLCipher; fall back to per-row AES-GCM encryption."""
        self._sqlcipher_module: Any = None
        try:
            # Prefer sqlcipher3, then pysqlcipher3.
            sqlcipher = None
            try:
                import sqlcipher3  # type: ignore[import]

                sqlcipher = sqlcipher3
            except Exception:
                try:
                    import pysqlcipher3.dbapi2  # type: ignore[import]

                    sqlcipher = pysqlcipher3.dbapi2
                except Exception:
                    pass

            if sqlcipher is not None:
                self._uses_sqlcipher = True
                self._sqlcipher_module = sqlcipher
                self._sqlcipher_key = self.password
                logger.info("Using SQLCipher for local database encryption")
                return
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("SQLCipher availability check failed: %s", exc)

        logger.info("Falling back to per-row AES-256-GCM encryption for local DB")

    def _ensure_key(self) -> None:
        """Derive and cache the encryption key from the configured salt."""
        if self._key is not None:
            return
        if self._salt is None:
            raise InvalidKeyError("Database salt is missing")
        self._key = _derive_key(self.password, self._salt)
        self._aesgcm = AESGCM(self._key)

    def _encrypt(self, plaintext: bytes) -> bytes:
        """Encrypt plaintext with AES-256-GCM using a random nonce."""
        self._ensure_key()
        assert self._aesgcm is not None
        nonce = os.urandom(NONCE_BYTES)
        ciphertext_with_tag = self._aesgcm.encrypt(nonce, plaintext, None)
        ciphertext = ciphertext_with_tag[:-16]
        tag = ciphertext_with_tag[-16:]
        return _pack_encrypted_blob(ciphertext, nonce, tag)

    def _decrypt(self, blob: bytes) -> bytes:
        """Decrypt an AES-256-GCM packed blob."""
        self._ensure_key()
        assert self._aesgcm is not None
        nonce, ciphertext, tag = _unpack_encrypted_blob(blob)
        return self._aesgcm.decrypt(nonce, ciphertext + tag, None)

    @contextmanager
    def _connect(self):
        """Yield a SQLite connection, applying SQLCipher PRAGMA when available."""
        conn: sqlite3.Connection
        try:
            if self._uses_sqlcipher:
                conn = self._sqlcipher_module.connect(str(self.db_path))
                conn.execute(f"PRAGMA KEY = '{self._sqlcipher_key}'")
            else:
                conn = sqlite3.connect(str(self.db_path))
            conn.row_factory = sqlite3.Row
            yield conn
        except sqlite3.DatabaseError as exc:
            msg = str(exc).lower()
            if "file is not a database" in msg or "malformed" in msg or "database disk image is malformed" in msg:
                logger.error("Local database file corrupted: %s", self.db_path)
                raise CorruptedDatabaseError(
                    f"Database file is corrupted: {self.db_path}"
                ) from exc
            if "not a database" in msg and "encrypted" in msg:
                raise InvalidKeyError("Invalid database key") from exc
            raise DatabaseError(f"Database error: {exc}") from exc
        except Exception as exc:
            raise DatabaseError(f"Unexpected database error: {exc}") from exc

    def init_db(self) -> None:
        """
        Initialize (or migrate) the encrypted local database.

        For the fallback implementation, read or create the salt stored in a
        separate metadata table, then create the sessions and images tables.
        """
        try:
            with self._connect() as conn:
                if not self._uses_sqlcipher:
                    self._init_fallback_schema(conn)
                else:
                    self._init_sqlcipher_schema(conn)
        except (InvalidKeyError, CorruptedDatabaseError):
            raise
        except Exception as exc:
            logger.exception("Failed to initialize local database")
            raise DatabaseError(f"Failed to initialize local database: {exc}") from exc

    def _init_sqlcipher_schema(self, conn: sqlite3.Connection) -> None:
        """Create tables when SQLCipher is available."""
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                user_id TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS images (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                angle_type TEXT NOT NULL,
                embedding BLOB NOT NULL,
                quality_data TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_images_session ON images(session_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)"
        )
        conn.commit()

    def _init_fallback_schema(self, conn: sqlite3.Connection) -> None:
        """Create tables and metadata for the AES-GCM fallback implementation."""
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS _db_meta (
                key TEXT PRIMARY KEY,
                value BLOB NOT NULL
            )
            """
        )

        salt_row = conn.execute(
            "SELECT value FROM _db_meta WHERE key = 'salt'"
        ).fetchone()
        if salt_row is None:
            self._salt = os.urandom(SALT_BYTES)
            conn.execute(
                "INSERT INTO _db_meta (key, value) VALUES ('salt', ?)",
                (self._salt,),
            )
            conn.commit()
        else:
            self._salt = salt_row["value"]

        # Now that salt is known, derive key so that encrypted fields validate.
        self._ensure_key()

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                user_id TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS images (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                angle_type TEXT NOT NULL,
                embedding BLOB NOT NULL,
                quality_data BLOB NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_images_session ON images(session_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)"
        )
        conn.commit()

    def store_session(
        self,
        user_id: str,
        session_id: Optional[str] = None,
        images: Optional[List[Dict[str, Any]]] = None,
    ) -> LocalSession:
        """
        Insert a new session and optionally its images.

        Each image dict must contain:
            - angle_type: str
            - embedding: bytes
            - quality_data: dict (JSON-serializable)
        """
        images = images or []
        session_id = session_id or str(uuid.uuid4())
        created_at = _utc_now()

        try:
            with self._connect() as conn:
                conn.execute(
                    "INSERT INTO sessions (id, created_at, user_id) VALUES (?, ?, ?)",
                    (session_id, created_at.isoformat(), user_id),
                )
                for img in images:
                    img_id = str(uuid.uuid4())
                    angle_type = img["angle_type"]
                    embedding = img["embedding"]
                    quality_data = json.dumps(img["quality_data"]).encode("utf-8")

                    if not self._uses_sqlcipher:
                        embedding = self._encrypt(embedding)
                        quality_data = self._encrypt(quality_data)

                    conn.execute(
                        """
                        INSERT INTO images
                        (id, session_id, angle_type, embedding, quality_data, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            img_id,
                            session_id,
                            angle_type,
                            embedding,
                            quality_data,
                            created_at.isoformat(),
                        ),
                    )
                conn.commit()
        except (InvalidKeyError, CorruptedDatabaseError):
            raise
        except Exception as exc:
            logger.exception("Failed to store session %s", session_id)
            raise DatabaseError(f"Failed to store session: {exc}") from exc

        return LocalSession(
            id=session_id,
            created_at=created_at,
            user_id=user_id,
        )

    def get_sessions(self, user_id: str) -> List[LocalSession]:
        """List all sessions for a user, metadata only (no embeddings)."""
        try:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT id, created_at, user_id FROM sessions WHERE user_id = ? ORDER BY created_at DESC",
                    (user_id,),
                ).fetchall()
        except (InvalidKeyError, CorruptedDatabaseError):
            raise
        except Exception as exc:
            logger.exception("Failed to list sessions for user %s", user_id)
            raise DatabaseError(f"Failed to list sessions: {exc}") from exc

        sessions: List[LocalSession] = []
        for row in rows:
            sessions.append(
                LocalSession(
                    id=row["id"],
                    created_at=datetime.fromisoformat(row["created_at"]),
                    user_id=row["user_id"],
                )
            )
        return sessions

    def get_session_images(
        self,
        session_id: str,
        user_id: Optional[str] = None,
    ) -> List[LocalImage]:
        """Return decrypted images (with embeddings) for a session."""
        try:
            with self._connect() as conn:
                if user_id:
                    session_row = conn.execute(
                        "SELECT id FROM sessions WHERE id = ? AND user_id = ?",
                        (session_id, user_id),
                    ).fetchone()
                    if session_row is None:
                        return []

                rows = conn.execute(
                    """
                    SELECT id, session_id, angle_type, embedding, quality_data, created_at
                    FROM images WHERE session_id = ? ORDER BY created_at
                    """,
                    (session_id,),
                ).fetchall()
        except (InvalidKeyError, CorruptedDatabaseError):
            raise
        except Exception as exc:
            logger.exception("Failed to fetch images for session %s", session_id)
            raise DatabaseError(f"Failed to fetch session images: {exc}") from exc

        images: List[LocalImage] = []
        for row in rows:
            embedding = row["embedding"]
            quality_data_blob = row["quality_data"]

            if not self._uses_sqlcipher:
                try:
                    embedding = self._decrypt(embedding)
                    quality_data_blob = self._decrypt(quality_data_blob)
                except Exception as exc:
                    raise InvalidKeyError(
                        "Failed to decrypt image data; key may be incorrect"
                    ) from exc

            quality_data = json.loads(quality_data_blob.decode("utf-8"))
            images.append(
                LocalImage(
                    id=row["id"],
                    session_id=row["session_id"],
                    angle_type=row["angle_type"],
                    embedding=embedding,
                    quality_data=quality_data,
                    created_at=datetime.fromisoformat(row["created_at"]),
                )
            )
        return images

    def delete_session(self, session_id: str, user_id: Optional[str] = None) -> bool:
        """Delete a session and its images. Returns True if a row was removed."""
        try:
            with self._connect() as conn:
                if user_id:
                    row = conn.execute(
                        "SELECT id FROM sessions WHERE id = ? AND user_id = ?",
                        (session_id, user_id),
                    ).fetchone()
                    if row is None:
                        return False

                conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
                conn.commit()
                deleted = conn.total_changes > 0
        except (InvalidKeyError, CorruptedDatabaseError):
            raise
        except Exception as exc:
            logger.exception("Failed to delete session %s", session_id)
            raise DatabaseError(f"Failed to delete session: {exc}") from exc

        return deleted

    def delete_all(self) -> None:
        """Wipe the entire database file and reset internal state."""
        try:
            with self._connect() as conn:
                conn.execute("DROP TABLE IF EXISTS images")
                conn.execute("DROP TABLE IF EXISTS sessions")
                if not self._uses_sqlcipher:
                    conn.execute("DROP TABLE IF EXISTS _db_meta")
                conn.commit()
        except (InvalidKeyError, CorruptedDatabaseError):
            raise
        except Exception as exc:
            logger.exception("Failed to wipe database tables")
            raise DatabaseError(f"Failed to wipe database: {exc}") from exc

        # Also remove the physical file to guarantee a clean slate.
        try:
            if self.db_path.exists():
                self.db_path.unlink()
        except OSError as exc:
            logger.error("Failed to remove database file: %s", exc)
            raise DatabaseError(f"Failed to remove database file: {exc}") from exc

        # Reset cached key/salt so re-initialization creates a fresh database.
        self._salt = None
        self._key = None
        self._aesgcm = None


def init_db(password: str, db_path: Optional[Path] = None) -> EncryptedLocalDatabase:
    """
    Initialize encrypted local storage.

    Args:
        password: User password used to derive the encryption key.
        db_path: Optional path to the database file. Defaults to ~/.bcd/local.db.

    Returns:
        An initialized EncryptedLocalDatabase instance.
    """
    db = EncryptedLocalDatabase(password=password, db_path=db_path)
    db.init_db()
    return db


def store_session(
    db: EncryptedLocalDatabase,
    user_id: str,
    images: Optional[List[Dict[str, Any]]] = None,
    session_id: Optional[str] = None,
) -> LocalSession:
    """Convenience wrapper to store a session using an initialized database."""
    return db.store_session(
        user_id=user_id,
        session_id=session_id,
        images=images,
    )


def get_sessions(db: EncryptedLocalDatabase, user_id: str) -> List[LocalSession]:
    """Convenience wrapper to list sessions."""
    return db.get_sessions(user_id)


def get_session_images(
    db: EncryptedLocalDatabase,
    session_id: str,
    user_id: Optional[str] = None,
) -> List[LocalImage]:
    """Convenience wrapper to fetch decrypted images for a session."""
    return db.get_session_images(session_id, user_id)


def delete_session(
    db: EncryptedLocalDatabase,
    session_id: str,
    user_id: Optional[str] = None,
) -> bool:
    """Convenience wrapper to delete a session."""
    return db.delete_session(session_id, user_id)


def delete_all(db: EncryptedLocalDatabase) -> None:
    """Convenience wrapper to wipe the database."""
    db.delete_all()
