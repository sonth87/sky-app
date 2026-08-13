"""Test HistoryStore + create_history_store() (Phase 3 — lịch sử sinh audio trong DB dùng
chung, xem docs/dev/history/2026-08-13-lich-su-sinh-audio-trong-db.md).

Dựng bảng `tts_generation_history` bằng tay trong SQLite in-memory — schema PHẢI khớp
`packages/app-db/src/migrations/019_tts_generation_history.ts`. Không có cách nào import trực
tiếp file .ts từ Python nên khớp bằng tay là chấp nhận được; lệch nhau sẽ lộ ngay ở test đầu
(INSERT thiếu cột / sai kiểu).
"""
import sqlite3
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

import history_store as hs

SCHEMA_SQL = """
CREATE TABLE tts_generation_history (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('ceremony', 'tts_studio', 'warmup', 'pregen', 'web', 'unknown')),
  text TEXT NOT NULL,
  voice_id TEXT,
  voice_label TEXT,
  speed REAL,
  sample_rate INTEGER,
  duration_ms INTEGER,
  engine_id TEXT,
  quality_score INTEGER,
  quality_flags_json TEXT,
  audio_file TEXT,
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
def store(conn, tmp_path):
    return hs.HistoryStore(conn, tmp_path / "tts-history")


def fake_pcm(n: int = 100) -> np.ndarray:
    return np.zeros(n, dtype=np.int16)


# ── add_entry — round-trip cơ bản ───────────────────────────────────────────────

def test_add_entry_luu_du_field(store):
    entry = store.add_entry(
        source="tts_studio", text="Xin chào", voice_id="clone-abc", voice_label="Giang",
        speed=1.2, sample_rate=48000, duration_ms=1500, engine_id="vieneu",
        quality_score=90, quality_flags=["noisy"], audio_pcm_int16=fake_pcm(),
    )
    assert entry["id"].startswith("hist-")
    assert entry["source"] == "tts_studio"
    assert entry["text"] == "Xin chào"
    assert entry["voice_id"] == "clone-abc"
    assert entry["voice_label"] == "Giang"
    assert entry["quality_flags"] == ["noisy"]
    assert entry["has_audio"] is True
    assert entry["audio_file"] == f"{entry['id']}.wav"


def test_add_entry_ghi_file_wav_that(store, tmp_path):
    entry = store.add_entry(
        source="ceremony", text="Test", sample_rate=48000, audio_pcm_int16=fake_pcm(),
    )
    wav_path = tmp_path / "tts-history" / entry["audio_file"]
    assert wav_path.exists()
    assert wav_path.stat().st_size > 44  # header + ít nhất vài byte data


def test_add_entry_loi_khong_co_audio(store):
    entry = store.add_entry(source="ceremony", text="Test", error="RuntimeError: boom")
    assert entry["audio_file"] is None
    assert entry["has_audio"] is False
    assert entry["error"] == "RuntimeError: boom"


def test_add_entry_pregen_khong_nhan_ban_audio(store, tmp_path):
    """Nguồn 'pregen' đã có audio thật ở ttsPregenDir (Electron) — history_store KHÔNG được
    ghi thêm 1 bản WAV trùng, dù có audio_pcm_int16 truyền vào."""
    entry = store.add_entry(
        source="pregen", text="Test", sample_rate=48000, audio_pcm_int16=fake_pcm(),
    )
    assert entry["audio_file"] is None
    assert entry["has_audio"] is False
    assert list((tmp_path / "tts-history").glob("*.wav")) == []


# ── list_entries ─────────────────────────────────────────────────────────────

def test_list_entries_moi_nhat_truoc(store):
    store.add_entry(source="tts_studio", text="A")
    store.add_entry(source="tts_studio", text="B")
    entries = store.list_entries()
    assert [e["text"] for e in entries] == ["B", "A"]


def test_list_entries_gioi_han_limit(store):
    for i in range(5):
        store.add_entry(source="tts_studio", text=f"T{i}")
    assert len(store.list_entries(limit=2)) == 2


def test_list_entries_loc_theo_source(store):
    store.add_entry(source="tts_studio", text="A")
    store.add_entry(source="pregen", text="B")
    entries = store.list_entries(source="pregen")
    assert len(entries) == 1
    assert entries[0]["text"] == "B"


# ── get_audio_path ───────────────────────────────────────────────────────────

def test_get_audio_path_khong_ton_tai(store):
    assert store.get_audio_path("khong-co") is None


def test_get_audio_path_dong_pregen_tra_none(store):
    entry = store.add_entry(source="pregen", text="Test", audio_pcm_int16=fake_pcm())
    assert store.get_audio_path(entry["id"]) is None


def test_get_audio_path_dong_loi_tra_none(store):
    entry = store.add_entry(source="ceremony", text="Test", error="boom")
    assert store.get_audio_path(entry["id"]) is None


def test_get_audio_path_dung_khi_co_audio(store, tmp_path):
    entry = store.add_entry(source="tts_studio", text="Test", sample_rate=48000, audio_pcm_int16=fake_pcm())
    path = store.get_audio_path(entry["id"])
    assert path == tmp_path / "tts-history" / entry["audio_file"]
    assert path.exists()


def test_get_audio_path_file_da_bi_xoa_thu_cong_tra_none(store, tmp_path):
    entry = store.add_entry(source="tts_studio", text="Test", sample_rate=48000, audio_pcm_int16=fake_pcm())
    (tmp_path / "tts-history" / entry["audio_file"]).unlink()
    assert store.get_audio_path(entry["id"]) is None


# ── delete_entry / clear_all ─────────────────────────────────────────────────

def test_delete_entry_xoa_dong_va_file(store, tmp_path):
    entry = store.add_entry(source="tts_studio", text="Test", sample_rate=48000, audio_pcm_int16=fake_pcm())
    wav_path = tmp_path / "tts-history" / entry["audio_file"]
    assert wav_path.exists()

    assert store.delete_entry(entry["id"]) is True
    assert store.get_entry(entry["id"]) is None
    assert not wav_path.exists()


def test_delete_entry_khong_ton_tai_tra_false(store):
    assert store.delete_entry("khong-co") is False


def test_clear_all_xoa_het_dong_va_file(store, tmp_path):
    store.add_entry(source="tts_studio", text="A", sample_rate=48000, audio_pcm_int16=fake_pcm())
    store.add_entry(source="ceremony", text="B", sample_rate=48000, audio_pcm_int16=fake_pcm())
    store.add_entry(source="pregen", text="C")  # không có file

    count = store.clear_all()
    assert count == 3
    assert store.list_entries() == []
    assert list((tmp_path / "tts-history").glob("*.wav")) == []


# ── Prune theo số lượng ────────────────────────────────────────────────────────

def test_prune_theo_so_luong_xoa_dong_cu_nhat(conn, tmp_path):
    store = hs.HistoryStore(conn, tmp_path / "tts-history", max_rows=3, max_age_days=9999)
    ids = []
    for i in range(4):
        entry = store.add_entry(source="tts_studio", text=f"T{i}", sample_rate=48000, audio_pcm_int16=fake_pcm())
        ids.append(entry["id"])

    remaining = store.list_entries(limit=100)
    assert len(remaining) == 3
    remaining_ids = {e["id"] for e in remaining}
    assert ids[0] not in remaining_ids  # dòng cũ nhất bị prune
    assert ids[-1] in remaining_ids  # dòng mới nhất còn nguyên
    # File WAV của dòng bị prune cũng phải bị unlink theo.
    assert list((tmp_path / "tts-history").glob(f"{ids[0]}.wav")) == []


# ── Prune theo tuổi ───────────────────────────────────────────────────────────

def test_prune_theo_tuoi_xoa_bat_ke_so_luong(conn, tmp_path):
    store = hs.HistoryStore(conn, tmp_path / "tts-history", max_rows=9999, max_age_days=30)
    old_entry = store.add_entry(source="tts_studio", text="Old", sample_rate=48000, audio_pcm_int16=fake_pcm())

    # Lùi created_at của dòng vừa tạo về quá hạn 30 ngày.
    old_ts = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
    conn.execute("UPDATE tts_generation_history SET created_at = ? WHERE id = ?", (old_ts, old_entry["id"]))
    conn.commit()

    # Ghi thêm 1 dòng mới — trigger _prune() sau INSERT.
    store.add_entry(source="tts_studio", text="New")

    assert store.get_entry(old_entry["id"]) is None
    assert list((tmp_path / "tts-history").glob(f"{old_entry['id']}.wav")) == []


# ── create_history_store() — degrade êm khi DB không sẵn sàng ─────────────────

def test_factory_tra_none_khi_khong_co_db(monkeypatch, tmp_path):
    monkeypatch.setattr(hs._db, "connect", lambda: None)
    assert hs.create_history_store(tmp_path / "tts-history") is None


def test_factory_tra_store_khi_co_db(monkeypatch, conn, tmp_path):
    monkeypatch.setattr(hs._db, "connect", lambda: conn)
    result = hs.create_history_store(tmp_path / "tts-history")
    assert isinstance(result, hs.HistoryStore)
