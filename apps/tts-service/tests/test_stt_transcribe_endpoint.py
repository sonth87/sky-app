"""Test tầng HTTP của /stt/transcribe — mirror test_clone_endpoint.py's style: TestClient
KHÔNG dùng `with` (tránh trigger lifespan() thật), WAV magic-byte fixture có sẵn.
"""
import pytest
from fastapi.testclient import TestClient

import main

WAV_HEADER = b"RIFF\x00\x00\x00\x00WAVEfmt " + b"\x00" * (44 - 16)


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
