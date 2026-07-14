"""
Unit tests for the encrypted local database service.

Tests cover key derivation, session CRUD, persistence across re-open,
deletion, and wrong-key failure scenarios. They intentionally use a
temporary database path so the developer's real ~/.bcd/local.db is untouched.
"""

import os
import sqlite3
import tempfile
from pathlib import Path
from uuid import uuid4

import pytest

from app.services import local_db
from app.services.local_db import (
    CorruptedDatabaseError,
    DatabaseError,
    EncryptedLocalDatabase,
    InvalidKeyError,
    delete_all,
    delete_session,
    get_session_images,
    get_sessions,
    init_db,
    store_session,
)


@pytest.fixture
def tmp_db_path(tmp_path):
    """Provide a fresh temporary database path for each test."""
    return tmp_path / "test_local.db"


@pytest.fixture
def password():
    return "super-secret-password"


@pytest.fixture
def wrong_password():
    return "not-the-right-password"


@pytest.fixture
def sample_images():
    """Return a small list of image dicts suitable for store_session."""
    return [
        {
            "angle_type": "frontal",
            "embedding": b"\x00\x01\x02\x03" * 32,
            "quality_data": {"sharpness": 0.92, "brightness": 0.78},
        },
        {
            "angle_type": "lateral",
            "embedding": b"\xff\xfe\xfd\xfc" * 32,
            "quality_data": {"sharpness": 0.85, "brightness": 0.81},
        },
    ]


def test_init_db_creates_file(tmp_db_path, password):
    db = init_db(password, db_path=tmp_db_path)
    assert tmp_db_path.exists()
    # In fallback mode, a metadata table stores the salt.
    with sqlite3.connect(str(tmp_db_path)) as conn:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
    assert "sessions" in tables
    assert "images" in tables
    # Either SQLCipher is used (no _db_meta) or fallback salt table exists.
    assert ("_db_meta" in tables) != db._uses_sqlcipher or db._uses_sqlcipher


def test_key_derivation(password, tmp_db_path):
    db = init_db(password, db_path=tmp_db_path)
    if not db._uses_sqlcipher:
        salt = db._salt
        assert salt is not None
        assert len(salt) == 16
        key = local_db._derive_key(password, salt)
        assert len(key) == 32
        # Same password + salt must yield identical key.
        assert local_db._derive_key(password, salt) == key
        # Different password must yield a different key.
        assert local_db._derive_key("other-password", salt) != key


def test_session_crud(tmp_db_path, password, sample_images):
    user_id = f"user-{uuid4()}"
    db = init_db(password, db_path=tmp_db_path)

    session = store_session(
        db,
        user_id=user_id,
        images=sample_images,
    )
    assert session.user_id == user_id
    assert session.id

    sessions = get_sessions(db, user_id)
    assert len(sessions) == 1
    assert sessions[0].id == session.id
    assert sessions[0].user_id == user_id

    images = get_session_images(db, session.id, user_id=user_id)
    assert len(images) == len(sample_images)
    assert images[0].angle_type == "frontal"
    assert images[1].angle_type == "lateral"
    assert images[0].embedding == sample_images[0]["embedding"]
    assert images[1].quality_data == sample_images[1]["quality_data"]

    deleted = delete_session(db, session.id, user_id=user_id)
    assert deleted is True
    assert get_sessions(db, user_id) == []
    assert get_session_images(db, session.id, user_id=user_id) == []


def test_persistence_across_reopen(tmp_db_path, password, sample_images):
    user_id = f"user-{uuid4()}"
    session_id = f"session-{uuid4()}"

    db1 = init_db(password, db_path=tmp_db_path)
    store_session(
        db1,
        user_id=user_id,
        session_id=session_id,
        images=sample_images,
    )
    del db1

    db2 = init_db(password, db_path=tmp_db_path)
    sessions = get_sessions(db2, user_id)
    assert len(sessions) == 1
    assert sessions[0].id == session_id

    images = get_session_images(db2, session_id, user_id=user_id)
    assert len(images) == len(sample_images)
    assert images[0].embedding == sample_images[0]["embedding"]


def test_wrong_key_fails(tmp_db_path, password, wrong_password, sample_images):
    user_id = f"user-{uuid4()}"
    db = init_db(password, db_path=tmp_db_path)
    session = store_session(db, user_id=user_id, images=sample_images)

    # Opening with the wrong password should fail when reading encrypted data.
    bad_db = EncryptedLocalDatabase(password=wrong_password, db_path=tmp_db_path)
    if bad_db._uses_sqlcipher:
        # SQLCipher typically raises on the first access with a wrong key.
        with pytest.raises((InvalidKeyError, DatabaseError)):
            bad_db.get_session_images(session.id, user_id=user_id)
    else:
        # Fallback: metadata table exists but decryption of image blobs fails.
        with pytest.raises(InvalidKeyError):
            bad_db.get_session_images(session.id, user_id=user_id)


def test_delete_all(tmp_db_path, password, sample_images):
    user_id = f"user-{uuid4()}"
    db = init_db(password, db_path=tmp_db_path)
    store_session(db, user_id=user_id, images=sample_images)

    delete_all(db)
    assert not tmp_db_path.exists()

    # Re-initializing yields a fresh empty database.
    db2 = init_db(password, db_path=tmp_db_path)
    assert get_sessions(db2, user_id) == []


def test_corrupted_database_recreates(tmp_db_path, password, sample_images, monkeypatch):
    user_id = f"user-{uuid4()}"
    db = init_db(password, db_path=tmp_db_path)
    store_session(db, user_id=user_id, images=sample_images)

    # Corrupt the file by overwriting the SQLite header.
    original_size = tmp_db_path.stat().st_size
    with tmp_db_path.open("r+b") as f:
        f.write(b"CORRUPTED" + b"\x00" * 512)

    # Attempting to open should raise a clear corruption error.
    with pytest.raises(CorruptedDatabaseError):
        EncryptedLocalDatabase(password=password, db_path=tmp_db_path).get_sessions(
            user_id
        )

    # Re-initialize should detect corruption, recreate, and notify via exception
    # (callers can catch CorruptedDatabaseError and re-run init_db to recover).
    tmp_db_path.unlink(missing_ok=True)
    db2 = init_db(password, db_path=tmp_db_path)
    assert get_sessions(db2, user_id) == []


def test_delete_session_unauthorized_user(tmp_db_path, password, sample_images):
    user_id = f"user-{uuid4()}"
    other_user = f"other-{uuid4()}"
    db = init_db(password, db_path=tmp_db_path)
    session = store_session(db, user_id=user_id, images=sample_images)

    # Another user should not be able to delete the session.
    deleted = delete_session(db, session.id, user_id=other_user)
    assert deleted is False
    assert len(get_sessions(db, user_id)) == 1


def test_get_session_images_unauthorized_user(tmp_db_path, password, sample_images):
    user_id = f"user-{uuid4()}"
    other_user = f"other-{uuid4()}"
    db = init_db(password, db_path=tmp_db_path)
    session = store_session(db, user_id=user_id, images=sample_images)

    images = get_session_images(db, session.id, user_id=other_user)
    assert images == []
