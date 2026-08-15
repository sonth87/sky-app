"""Test tầng HTTP của POST /voices/{voice_id}/samples/{sample_id}/transcribe — endpoint
RIÊNG cho mẫu audio ĐÃ CÓ SẴN trên server (khác /stt/transcribe, vốn nhận file upload mới —
xem test_stt_transcribe_endpoint.py). Guard category/engine-chưa-cài dùng chung
`_transcribe_with_stt()` với `/stt/transcribe` nên KHÔNG lặp lại hết mọi case ở đó — chỉ
test phần THẬT SỰ riêng của endpoint này: tra sample theo voice_id+sample_id, đọc đúng file
trong `_ref_dir`, cộng 1 case guard đại diện xác nhận core dùng chung vẫn chạy đúng qua
đường mới.
"""
import sqlite3

import pytest
from fastapi.testclient import TestClient

import main
import stt_history_store as shs

WAV_HEADER = b"RIFF\x00\x00\x00\x00WAVEfmt " + b"\x00" * (44 - 16)

STT_HISTORY_SCHEMA_SQL = """
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


class _FakeSttEngine:
    def __init__(self, engine_id: str):
        self.engine_id = engine_id

    def capabilities(self) -> dict:
        return {"id": self.engine_id}

    def transcribe(self, audio_path: str, language: str | None = None) -> dict:
        return {"text": f"phiên âm của {audio_path.split('/')[-1]}", "language": language or "vi", "duration_sec": 2.0}


class _FakeRegistry:
    def __init__(self, samples: dict):
        self._samples = samples

    def list_samples(self, voice_id):
        return self._samples.get(voice_id, [])


@pytest.fixture
def client(monkeypatch, tmp_path):
    (tmp_path / "sample-a.wav").write_bytes(WAV_HEADER)
    registry = _FakeRegistry({
        "clone-1": [
            {"id": "sample-1", "ref_file": "sample-a.wav", "ref_text": None},
            {"id": "sample-2", "ref_file": "khong-ton-tai.wav", "ref_text": None},
        ],
    })
    monkeypatch.setattr(main, "_registry", registry)
    monkeypatch.setattr(main, "_ref_dir", tmp_path)
    monkeypatch.setattr(main, "_stt_engine", None)
    monkeypatch.setattr(main, "_current_stt_engine_id", None)
    monkeypatch.setattr("engine_registry.create_engine", lambda eid: _FakeSttEngine(eid))
    return TestClient(main.app)


def test_transcribe_sample_da_co_thanh_cong(client):
    res = client.post("/voices/clone-1/samples/sample-1/transcribe", json={"language": "vi"})
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert "sample-a.wav" in body["text"]
    assert body["language"] == "vi"
    assert main._current_stt_engine_id == "whisper-base"  # lazy-activate mặc định, giống /stt/transcribe


def test_transcribe_sample_khong_truyen_body_van_ok(client):
    # body rỗng — client gõ dấu ngoặc rỗng hoặc bỏ hẳn Content-Type application/json.
    res = client.post("/voices/clone-1/samples/sample-1/transcribe")
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_voice_khong_ton_tai_tra_404(client):
    res = client.post("/voices/khong-ton-tai/samples/sample-1/transcribe")
    assert res.status_code == 404


def test_sample_id_khong_ton_tai_trong_voice_tra_404(client):
    res = client.post("/voices/clone-1/samples/sample-khong-co/transcribe")
    assert res.status_code == 404


def test_file_tren_disk_bi_thieu_tra_404(client):
    # sample-2 CÓ trong registry nhưng file thật đã bị xoá/không tồn tại trên đĩa.
    res = client.post("/voices/clone-1/samples/sample-2/transcribe")
    assert res.status_code == 404


def test_engine_id_sai_category_tra_400(client):
    # Đúng guard dùng chung với /stt/transcribe — xác nhận core `_transcribe_with_stt()`
    # vẫn chạy đúng khi gọi từ endpoint này (không phải lặp lại toàn bộ test guard).
    res = client.post("/voices/clone-1/samples/sample-1/transcribe", json={"engine_id": "vieneu"})
    assert res.status_code == 400
    assert res.json()["detail"]["reason"] == "wrong_category"


# ── Lịch sử (GĐ 3) — source cố định "voice_clone_edit", không cần field client ────

@pytest.fixture
def stt_history_store(monkeypatch):
    # `check_same_thread=False` — khớp db.py's connect() thật: endpoint chạy trong anyio's
    # worker thread (asyncio.to_thread), khác thread tạo connection ở fixture này.
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(STT_HISTORY_SCHEMA_SQL)
    store = shs.SttHistoryStore(conn)
    monkeypatch.setattr(main, "_stt_history", store)
    return store


def test_transcribe_sample_thanh_cong_ghi_lich_su_voice_clone_edit(client, stt_history_store):
    client.post("/voices/clone-1/samples/sample-1/transcribe", json={"language": "vi"})
    entries = stt_history_store.list_entries()
    assert len(entries) == 1
    assert entries[0]["source"] == "voice_clone_edit"
    assert entries[0]["source_filename"] == "sample-a.wav"


def test_transcribe_sample_khong_ton_tai_khong_ghi_lich_su(client, stt_history_store):
    client.post("/voices/clone-1/samples/sample-khong-co/transcribe")
    assert stt_history_store.list_entries() == []
