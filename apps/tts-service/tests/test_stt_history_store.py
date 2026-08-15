"""Test SttHistoryStore + create_stt_history_store() (GĐ 3 — lịch sử phiên âm trong DB dùng
chung, xem docs/dev/history/2026-08-15-stt-app-rieng-va-lich-su.md).

Dựng bảng `stt_history` bằng tay trong SQLite in-memory — schema PHẢI khớp
`packages/app-db/src/migrations/020_stt_history.ts`. Không có cách nào import trực tiếp file
.ts từ Python nên khớp bằng tay là chấp nhận được; lệch nhau sẽ lộ ngay ở test đầu (INSERT
thiếu cột / sai kiểu) — cùng cách `test_history_store.py` (TTS) đã làm.
"""
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

import stt_history_store as shs

SCHEMA_SQL = """
CREATE TABLE stt_history (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('speech_to_text', 'voice_clone', 'voice_clone_edit', 'unknown')),
  text TEXT NOT NULL,
  language TEXT,
  duration_sec REAL,
  engine_id TEXT,
  source_filename TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);
"""


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(SCHEMA_SQL)
    yield c
    c.close()


@pytest.fixture
def store(conn):
    return shs.SttHistoryStore(conn)


# ── add_entry — round-trip cơ bản ───────────────────────────────────────────────

def test_add_entry_luu_du_field(store):
    entry = store.add_entry(
        source="speech_to_text", text="Xin chào", language="vi", duration_sec=2.5,
        engine_id="whisper-base", source_filename="sample.wav",
    )
    assert entry["id"].startswith("stt-")
    assert entry["source"] == "speech_to_text"
    assert entry["text"] == "Xin chào"
    assert entry["language"] == "vi"
    assert entry["duration_sec"] == 2.5
    assert entry["engine_id"] == "whisper-base"
    assert entry["source_filename"] == "sample.wav"
    assert entry["error"] is None


def test_add_entry_loi_van_ghi_duoc_dong(store):
    entry = store.add_entry(
        source="voice_clone_edit", text="", engine_id="whisper-base",
        source_filename="clone-abc.wav", error="RuntimeError: boom",
    )
    assert entry["text"] == ""
    assert entry["error"] == "RuntimeError: boom"


# ── list_entries ─────────────────────────────────────────────────────────────

def test_list_entries_moi_nhat_truoc(store):
    store.add_entry(source="speech_to_text", text="A")
    store.add_entry(source="speech_to_text", text="B")
    entries = store.list_entries()
    assert [e["text"] for e in entries] == ["B", "A"]


def test_list_entries_gioi_han_limit(store):
    for i in range(5):
        store.add_entry(source="speech_to_text", text=f"T{i}")
    assert len(store.list_entries(limit=2)) == 2


def test_list_entries_loc_theo_source(store):
    store.add_entry(source="speech_to_text", text="A")
    store.add_entry(source="voice_clone", text="B")
    entries = store.list_entries(source="voice_clone")
    assert len(entries) == 1
    assert entries[0]["text"] == "B"


# ── delete_entry / clear_all ─────────────────────────────────────────────────

def test_delete_entry_xoa_dong(store):
    entry = store.add_entry(source="speech_to_text", text="Test")
    assert store.delete_entry(entry["id"]) is True
    assert store.get_entry(entry["id"]) is None


def test_delete_entry_khong_ton_tai_tra_false(store):
    assert store.delete_entry("khong-co") is False


def test_clear_all_xoa_het_dong(store):
    store.add_entry(source="speech_to_text", text="A")
    store.add_entry(source="voice_clone", text="B")
    store.add_entry(source="voice_clone_edit", text="C")

    count = store.clear_all()
    assert count == 3
    assert store.list_entries() == []


# ── Prune theo số lượng ────────────────────────────────────────────────────────

def test_prune_theo_so_luong_xoa_dong_cu_nhat(conn):
    store = shs.SttHistoryStore(conn, max_rows=3, max_age_days=9999)
    ids = []
    for i in range(4):
        entry = store.add_entry(source="speech_to_text", text=f"T{i}")
        ids.append(entry["id"])

    remaining = store.list_entries(limit=100)
    assert len(remaining) == 3
    remaining_ids = {e["id"] for e in remaining}
    assert ids[0] not in remaining_ids  # dòng cũ nhất bị prune
    assert ids[-1] in remaining_ids  # dòng mới nhất còn nguyên


# ── Prune theo tuổi ───────────────────────────────────────────────────────────

def test_prune_theo_tuoi_xoa_bat_ke_so_luong(conn):
    store = shs.SttHistoryStore(conn, max_rows=9999, max_age_days=30)
    old_entry = store.add_entry(source="speech_to_text", text="Old")

    # Lùi created_at của dòng vừa tạo về quá hạn 30 ngày.
    old_ts = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
    conn.execute("UPDATE stt_history SET created_at = ? WHERE id = ?", (old_ts, old_entry["id"]))
    conn.commit()

    # Ghi thêm 1 dòng mới — trigger _prune() sau INSERT.
    store.add_entry(source="speech_to_text", text="New")

    assert store.get_entry(old_entry["id"]) is None


# ── create_stt_history_store() — degrade êm khi DB không sẵn sàng ─────────────

def test_factory_tra_none_khi_khong_co_db(monkeypatch):
    monkeypatch.setattr(shs._db, "connect", lambda: None)
    assert shs.create_stt_history_store() is None


def test_factory_tra_store_khi_co_db(monkeypatch, conn):
    monkeypatch.setattr(shs._db, "connect", lambda: conn)
    result = shs.create_stt_history_store()
    assert isinstance(result, shs.SttHistoryStore)
