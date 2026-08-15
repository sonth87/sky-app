"""Test tầng HTTP của /stt/transcribe — mirror test_clone_endpoint.py's style: TestClient
KHÔNG dùng `with` (tránh trigger lifespan() thật), WAV magic-byte fixture có sẵn.
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
        return {"text": "xin chào thế giới", "language": language or "vi", "duration_sec": 1.5}


class _BrokenSttEngine:
    def __init__(self, engine_id: str):
        raise RuntimeError("model chưa tải")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main, "_stt_engine", None)
    monkeypatch.setattr(main, "_current_stt_engine_id", None)
    monkeypatch.setattr("engine_registry.create_engine", lambda eid: _FakeSttEngine(eid))
    return TestClient(main.app)


def test_transcribe_thanh_cong(client):
    res = client.post(
        "/stt/transcribe",
        files={"file": ("sample.wav", WAV_HEADER, "audio/wav")},
        data={"language": "vi"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["text"] == "xin chào thế giới"
    assert body["language"] == "vi"
    assert main._current_stt_engine_id == "whisper-base"  # lazy-activate mặc định


def test_transcribe_tai_su_dung_engine_da_nap(client, monkeypatch):
    created = []
    monkeypatch.setattr(
        "engine_registry.create_engine",
        lambda eid: created.append(eid) or _FakeSttEngine(eid),
    )
    client.post("/stt/transcribe", files={"file": ("a.wav", WAV_HEADER, "audio/wav")})
    client.post("/stt/transcribe", files={"file": ("b.wav", WAV_HEADER, "audio/wav")})
    assert created == ["whisper-base"]  # chỉ nạp đúng 1 lần cho 2 lượt gọi liên tiếp


def test_transcribe_khong_truyen_language_van_ok(client):
    res = client.post("/stt/transcribe", files={"file": ("sample.wav", WAV_HEADER, "audio/wav")})
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_transcribe_file_rac_tra_400(client):
    res = client.post(
        "/stt/transcribe",
        files={"file": ("sample.wav", b"khong-phai-audio", "audio/wav")},
    )
    assert res.status_code == 400


def test_transcribe_qua_lon_tra_400(client):
    big = WAV_HEADER + b"\x00" * (16 * 1024 * 1024)
    res = client.post(
        "/stt/transcribe",
        files={"file": ("big.wav", big, "audio/wav")},
    )
    assert res.status_code == 400


def test_transcribe_engine_chua_cai_tra_503(client, monkeypatch):
    monkeypatch.setattr("engine_registry.create_engine", lambda eid: _BrokenSttEngine(eid))
    res = client.post("/stt/transcribe", files={"file": ("sample.wav", WAV_HEADER, "audio/wav")})
    assert res.status_code == 503


def test_transcribe_engine_id_sai_category_tra_400(client):
    # "vieneu" tồn tại thật trong registry nhưng là engine TTS — /stt/transcribe phải chặn
    # NGAY bằng guard category (giống /stt/engines/switch), không để lọt xuống
    # create_engine() rồi crash mơ hồ khi gọi .transcribe() trên 1 engine TTS thật.
    res = client.post(
        "/stt/transcribe",
        files={"file": ("sample.wav", WAV_HEADER, "audio/wav")},
        data={"engine_id": "vieneu"},
    )
    assert res.status_code == 400
    assert res.json()["detail"]["reason"] == "wrong_category"


def test_get_stt_engines_liet_ke_dung_category(client):
    res = client.get("/stt/engines")
    assert res.status_code == 200
    body = res.json()
    ids = [e["id"] for e in body["engines"]]
    assert "whisper-base" in ids
    assert "vieneu" not in ids  # lọc category='stt', không lẫn engine TTS


# ── Lịch sử (GĐ 3) — ghi qua _transcribe_with_stt() dùng chung ────────────────

@pytest.fixture
def stt_history_store(monkeypatch):
    # `check_same_thread=False` — khớp db.py's connect() thật: endpoint chạy trong anyio's
    # worker thread (asyncio.to_thread), khác thread tạo connection ở fixture này (xem
    # test_synthesize_history.py's history_conn cho cùng lý do ở TTS).
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(STT_HISTORY_SCHEMA_SQL)
    store = shs.SttHistoryStore(conn)
    monkeypatch.setattr(main, "_stt_history", store)
    return store


def test_transcribe_thanh_cong_ghi_lich_su_dung_source(client, stt_history_store):
    res = client.post(
        "/stt/transcribe",
        files={"file": ("sample.wav", WAV_HEADER, "audio/wav")},
        data={"source": "speech_to_text"},
    )
    assert res.status_code == 200
    entries = stt_history_store.list_entries()
    assert len(entries) == 1
    assert entries[0]["source"] == "speech_to_text"
    assert entries[0]["text"] == "xin chào thế giới"
    assert entries[0]["source_filename"] == "sample.wav"


def test_transcribe_khong_truyen_source_mac_dinh_unknown(client, stt_history_store):
    client.post("/stt/transcribe", files={"file": ("sample.wav", WAV_HEADER, "audio/wav")})
    entries = stt_history_store.list_entries()
    assert entries[0]["source"] == "unknown"


def test_transcribe_loi_runtime_van_ghi_lich_su_voi_error(client, stt_history_store, monkeypatch):
    class _CrashingEngine(_FakeSttEngine):
        def transcribe(self, audio_path, language=None):
            raise RuntimeError("model crash")

    monkeypatch.setattr("engine_registry.create_engine", lambda eid: _CrashingEngine(eid))
    res = client.post(
        "/stt/transcribe",
        files={"file": ("sample.wav", WAV_HEADER, "audio/wav")},
        data={"source": "speech_to_text"},
    )
    assert res.status_code == 500
    entries = stt_history_store.list_entries()
    assert len(entries) == 1
    assert entries[0]["text"] == ""
    assert "model crash" in entries[0]["error"]


def test_transcribe_loi_guard_category_khong_ghi_lich_su(client, stt_history_store):
    # 400 wrong_category xảy ra TRƯỚC khi có nỗ lực phiên âm thật — không phải "đã thử",
    # đúng nguyên tắc TTS history đã áp dụng (bỏ qua lỗi 400 do speaker_id sai).
    res = client.post(
        "/stt/transcribe",
        files={"file": ("sample.wav", WAV_HEADER, "audio/wav")},
        data={"engine_id": "vieneu", "source": "speech_to_text"},
    )
    assert res.status_code == 400
    assert stt_history_store.list_entries() == []


def test_transcribe_file_rac_khong_ghi_lich_su(client, stt_history_store):
    res = client.post(
        "/stt/transcribe",
        files={"file": ("sample.wav", b"khong-phai-audio", "audio/wav")},
        data={"source": "speech_to_text"},
    )
    assert res.status_code == 400
    assert stt_history_store.list_entries() == []
