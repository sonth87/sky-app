"""Test tầng HTTP của /synthesize ghi lịch sử (Phase 3, xem history_store.py) — xác nhận
wiring thật giữa endpoint và HistoryStore, không lặp lại test đơn vị của HistoryStore đã có
ở test_history_store.py.

CỐ Ý KHÔNG dùng `with TestClient(...)` — trigger `lifespan()` thật (nạp engine ONNX thật
~50s, ghi đè mọi monkeypatch), đúng cách test_clone_endpoint.py đã làm.
"""
import sqlite3

import numpy as np
import pytest
from fastapi.testclient import TestClient

import history_store as hs
import main


class _FakeEngine:
    def capabilities(self):
        return {"id": "test-engine", "sample_rate": 48000}


class _FakeRegistry:
    def get_voice(self, voice_id):
        return {"id": voice_id, "label": "Test Voice", "type": "cloned"}


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


def _fake_audio(n: int = 4800) -> np.ndarray:
    # Sóng sin nhỏ, không phải toàn 0 — tránh vướng cờ "silence" làm hỏng giả định test
    # (không assert cụ thể quality flags nào, nhưng vẫn nên là audio "bình thường").
    t = np.linspace(0, 1, n, dtype=np.float32)
    return (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)


@pytest.fixture
def history_conn():
    # `check_same_thread=False` — khớp db.py's connect() thật: endpoint chạy trong
    # anyio's worker thread (asyncio.to_thread), khác thread tạo connection ở fixture này.
    c = sqlite3.connect(":memory:", check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.executescript(SCHEMA_SQL)
    yield c
    c.close()


@pytest.fixture
def client(monkeypatch, tmp_path, history_conn):
    monkeypatch.setattr(main, "_engine", _FakeEngine())
    monkeypatch.setattr(main, "_registry", _FakeRegistry())
    monkeypatch.setattr(main, "_current_engine_id", "test-engine")
    monkeypatch.setattr(main, "_run_synthesis", lambda req, voice: _fake_audio())
    monkeypatch.setattr(main, "_history", hs.HistoryStore(history_conn, tmp_path / "tts-history"))
    c = TestClient(main.app)
    c.history_conn = history_conn  # gắn kèm để test đọc lại trực tiếp bảng
    return c


def _rows(client):
    return client.history_conn.execute(
        "SELECT * FROM tts_generation_history ORDER BY created_at"
    ).fetchall()


def test_synthesize_thanh_cong_ghi_1_dong_co_audio(client, tmp_path):
    res = client.post("/synthesize", json={
        "text": "Xin chào", "speaker_id": "clone-test", "speed": 1.0, "source": "tts_studio",
    })
    assert res.status_code == 200
    rows = _rows(client)
    assert len(rows) == 1
    row = rows[0]
    assert row["source"] == "tts_studio"
    assert row["text"] == "Xin chào"
    assert row["voice_id"] == "clone-test"
    assert row["voice_label"] == "Test Voice"
    assert row["audio_file"] is not None
    assert (tmp_path / "tts-history" / row["audio_file"]).exists()
    assert row["error"] is None


def test_synthesize_tra_ve_x_history_id_khop_dong_vua_ghi(client):
    res = client.post("/synthesize", json={
        "text": "Test", "speaker_id": "clone-test", "source": "ceremony",
    })
    history_id = res.headers.get("X-History-Id")
    assert history_id is not None
    row = _rows(client)[0]
    assert row["id"] == history_id


def test_synthesize_nguon_pregen_khong_tao_file_wav(client, tmp_path):
    res = client.post("/synthesize", json={
        "text": "Test", "speaker_id": "clone-test", "source": "pregen",
    })
    assert res.status_code == 200
    row = _rows(client)[0]
    assert row["source"] == "pregen"
    assert row["audio_file"] is None
    assert list((tmp_path / "tts-history").glob("*.wav")) == []


def test_synthesize_khong_truyen_source_mac_dinh_unknown(client):
    res = client.post("/synthesize", json={"text": "Test", "speaker_id": "clone-test"})
    assert res.status_code == 200
    assert _rows(client)[0]["source"] == "unknown"


def test_synthesize_that_bai_ghi_dong_co_loi_khong_audio(client, monkeypatch):
    def boom(req, voice):
        raise RuntimeError("engine crashed")
    monkeypatch.setattr(main, "_run_synthesis", boom)

    res = client.post("/synthesize", json={
        "text": "Test", "speaker_id": "clone-test", "source": "ceremony",
    })
    assert res.status_code == 500

    rows = _rows(client)
    assert len(rows) == 1
    assert rows[0]["audio_file"] is None
    assert "engine crashed" in rows[0]["error"]


def test_synthesize_khi_history_store_none_van_chay_binh_thuong(client, monkeypatch):
    """Hợp đồng quan trọng nhất: DB không sẵn sàng (`_history is None`, vd Electron chưa
    migrate đủ hoặc chạy Python độc lập) KHÔNG được làm hỏng /synthesize thật."""
    monkeypatch.setattr(main, "_history", None)
    res = client.post("/synthesize", json={
        "text": "Test", "speaker_id": "clone-test", "source": "tts_studio",
    })
    assert res.status_code == 200
    assert "X-History-Id" not in res.headers


def test_get_history_list_tra_dung_dong_da_ghi(client):
    client.post("/synthesize", json={"text": "A", "speaker_id": "clone-test", "source": "tts_studio"})
    client.post("/synthesize", json={"text": "B", "speaker_id": "clone-test", "source": "pregen"})

    res = client.get("/history")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 2
    assert {e["text"] for e in body} == {"A", "B"}


def test_get_history_list_loc_theo_source(client):
    client.post("/synthesize", json={"text": "A", "speaker_id": "clone-test", "source": "tts_studio"})
    client.post("/synthesize", json={"text": "B", "speaker_id": "clone-test", "source": "pregen"})

    res = client.get("/history", params={"source": "pregen"})
    body = res.json()
    assert len(body) == 1
    assert body[0]["text"] == "B"


def test_get_history_audio_tra_wav_that(client):
    res = client.post("/synthesize", json={"text": "A", "speaker_id": "clone-test", "source": "tts_studio"})
    history_id = res.headers["X-History-Id"]

    audio_res = client.get(f"/history/{history_id}/audio")
    assert audio_res.status_code == 200
    assert audio_res.headers["content-type"] == "audio/wav"


def test_get_history_audio_khong_ton_tai_tra_404(client):
    assert client.get("/history/khong-co/audio").status_code == 404


def test_get_history_audio_dong_pregen_tra_404(client):
    res = client.post("/synthesize", json={"text": "A", "speaker_id": "clone-test", "source": "pregen"})
    history_id = res.headers.get("X-History-Id")
    # pregen không có audio_file nên không có X-History-Id được set từ header thành công
    # thông thường — nhưng dòng vẫn tồn tại trong DB, tra id trực tiếp để kiểm audio endpoint.
    if history_id is None:
        history_id = _rows(client)[0]["id"]
    assert client.get(f"/history/{history_id}/audio").status_code == 404


def test_delete_history_entry(client):
    res = client.post("/synthesize", json={"text": "A", "speaker_id": "clone-test", "source": "tts_studio"})
    history_id = res.headers["X-History-Id"]

    del_res = client.delete(f"/history/{history_id}")
    assert del_res.status_code == 200
    assert del_res.json()["ok"] is True
    assert len(_rows(client)) == 0


def test_clear_history(client):
    client.post("/synthesize", json={"text": "A", "speaker_id": "clone-test", "source": "tts_studio"})
    client.post("/synthesize", json={"text": "B", "speaker_id": "clone-test", "source": "ceremony"})

    res = client.delete("/history")
    assert res.status_code == 200
    assert res.json() == {"ok": True, "count": 2}
    assert len(_rows(client)) == 0


def test_history_endpoints_degrade_em_khi_khong_co_history_store(client, monkeypatch):
    monkeypatch.setattr(main, "_history", None)
    assert client.get("/history").json() == []
    assert client.get("/history/x/audio").status_code == 404
    assert client.delete("/history/x").json()["ok"] is False
    assert client.delete("/history").json()["ok"] is False
