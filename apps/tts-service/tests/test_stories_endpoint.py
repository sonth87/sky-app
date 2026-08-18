"""Test tầng HTTP của /stories/* — mirror test_stt_transcribe_endpoint.py's style: TestClient
KHÔNG dùng `with` (tránh trigger lifespan() thật), monkeypatch thẳng `main._stories`/
`main._history` bằng store thật (SQLite in-memory + tmp_path) thay vì mock.

Đây là lớp kiểm chứng CÒN THIẾU mà `test_stories.py` (test StoryStore trực tiếp) không phủ
được: routing FastAPI thật (path param, body Pydantic, mã lỗi HTTP đúng), và đặc biệt — WAV
header thật của `/stories/{id}/export-audio` (route này đổi từ PCM thô sang WAV đóng gói đầy
đủ giữa chừng lúc viết UI, cần xác nhận qua đúng đường HTTP chứ không chỉ gọi hàm Python).
"""
import sqlite3

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

import main
import stories as st

STORY_SCHEMA_SQL = """
CREATE TABLE tts_story (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE tts_story_item (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES tts_story(id) ON DELETE CASCADE,
  audio_file TEXT NOT NULL,
  source_text TEXT,
  voice_label TEXT,
  duration_ms INTEGER NOT NULL,
  start_time_ms INTEGER NOT NULL DEFAULT 0,
  track INTEGER NOT NULL DEFAULT 0,
  trim_start_ms INTEGER NOT NULL DEFAULT 0,
  trim_end_ms INTEGER NOT NULL DEFAULT 0,
  volume REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL
);
"""

SR = 24_000


class _FakeHistoryStore:
    """Double tối giản — chỉ 2 method add_item_from_history cần, giống test_stories.py's."""

    def __init__(self, tmp_path):
        self._dir = tmp_path / "src-audio"
        self._dir.mkdir(parents=True, exist_ok=True)
        self._entries: dict[str, dict] = {}

    def add_fake_entry(self, entry_id: str, *, with_audio=True, duration_ms=1000):
        audio_file = None
        if with_audio:
            audio_file = self._dir / f"{entry_id}.wav"
            sf.write(str(audio_file), np.full(SR, 0.3, dtype=np.float32), SR)
        self._entries[entry_id] = {
            "id": entry_id, "text": "Xin chào", "voice_label": "Giang",
            "duration_ms": duration_ms, "audio_file": audio_file,
        }

    def get_entry(self, entry_id):
        e = self._entries.get(entry_id)
        return None if e is None else {k: v for k, v in e.items() if k != "audio_file"}

    def get_audio_path(self, entry_id):
        e = self._entries.get(entry_id)
        return e["audio_file"] if e else None


@pytest.fixture
def history(tmp_path):
    return _FakeHistoryStore(tmp_path)


@pytest.fixture
def client(monkeypatch, tmp_path, history):
    # `check_same_thread=False` BẮT BUỘC: route /stories/* là `def` đồng bộ, FastAPI tự chạy
    # trong threadpool (`run_in_threadpool`) khác thread đã tạo connection — đúng lý do
    # `db.py`'s connect() thật cũng truyền cờ này (xem apps/tts-service/server/db.py).
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(STORY_SCHEMA_SQL)
    store = st.StoryStore(conn, tmp_path / "tts-stories")

    monkeypatch.setattr(main, "_stories", store)
    monkeypatch.setattr(main, "_history", history)
    return TestClient(main.app)


# ── CRUD qua HTTP ─────────────────────────────────────────────────────────────

def test_tao_va_lay_story(client):
    res = client.post("/stories", json={"name": "Lễ tốt nghiệp"})
    assert res.status_code == 200
    story = res.json()
    assert story["name"] == "Lễ tốt nghiệp"

    res2 = client.get(f"/stories/{story['id']}")
    assert res2.status_code == 200
    assert res2.json()["items"] == []


def test_get_story_khong_ton_tai_tra_404(client):
    res = client.get("/stories/khong-co")
    assert res.status_code == 404


def test_list_stories(client):
    client.post("/stories", json={"name": "A"})
    client.post("/stories", json={"name": "B"})
    res = client.get("/stories")
    assert res.status_code == 200
    assert len(res.json()) == 2


def test_update_story(client):
    story = client.post("/stories", json={"name": "Gốc"}).json()
    res = client.put(f"/stories/{story['id']}", json={"name": "Đã đổi"})
    assert res.status_code == 200
    assert res.json()["name"] == "Đã đổi"


def test_delete_story(client):
    story = client.post("/stories", json={"name": "S"}).json()
    res = client.delete(f"/stories/{story['id']}")
    assert res.status_code == 200
    assert client.get(f"/stories/{story['id']}").status_code == 404


# ── Item qua HTTP ─────────────────────────────────────────────────────────────

def test_them_item_thanh_cong(client, history):
    story = client.post("/stories", json={"name": "S"}).json()
    history.add_fake_entry("h1")
    res = client.post(f"/stories/{story['id']}/items", json={"history_entry_id": "h1"})
    assert res.status_code == 200
    assert res.json()["source_text"] == "Xin chào"


def test_them_item_khong_co_audio_tra_400(client, history):
    """Đúng điểm quan trọng nhất của thiết kế Phase 4 — nguồn 'pregen'/dòng lỗi không thêm
    được vào Story, và phải là 400 (lỗi do client chọn sai), không phải 500."""
    story = client.post("/stories", json={"name": "S"}).json()
    history.add_fake_entry("h-loi", with_audio=False)
    res = client.post(f"/stories/{story['id']}/items", json={"history_entry_id": "h-loi"})
    assert res.status_code == 400
    assert "không có audio" in res.text


def test_them_item_history_khong_san_sang_tra_503(client, monkeypatch):
    monkeypatch.setattr(main, "_history", None)
    story = client.post("/stories", json={"name": "S"}).json()
    res = client.post(f"/stories/{story['id']}/items", json={"history_entry_id": "h1"})
    assert res.status_code == 503


def test_move_trim_volume_item(client, history):
    story = client.post("/stories", json={"name": "S"}).json()
    history.add_fake_entry("h1", duration_ms=1000)
    item = client.post(f"/stories/{story['id']}/items", json={"history_entry_id": "h1"}).json()

    r1 = client.put(f"/stories/{story['id']}/items/{item['id']}/move", json={"start_time_ms": 2000, "track": 1})
    assert r1.status_code == 200 and r1.json()["start_time_ms"] == 2000

    r2 = client.put(f"/stories/{story['id']}/items/{item['id']}/trim", json={"trim_start_ms": 100, "trim_end_ms": 100})
    assert r2.status_code == 200 and r2.json()["trim_start_ms"] == 100

    r3 = client.put(f"/stories/{story['id']}/items/{item['id']}/volume", json={"volume": 0.5})
    assert r3.status_code == 200 and r3.json()["volume"] == 0.5


def test_trim_vuot_qua_do_dai_tra_400(client, history):
    story = client.post("/stories", json={"name": "S"}).json()
    history.add_fake_entry("h1", duration_ms=1000)
    item = client.post(f"/stories/{story['id']}/items", json={"history_entry_id": "h1"}).json()
    res = client.put(f"/stories/{story['id']}/items/{item['id']}/trim", json={"trim_start_ms": 600, "trim_end_ms": 500})
    assert res.status_code == 400


def test_split_va_duplicate_item(client, history):
    story = client.post("/stories", json={"name": "S"}).json()
    history.add_fake_entry("h1", duration_ms=1000)
    item = client.post(f"/stories/{story['id']}/items", json={"history_entry_id": "h1"}).json()

    r1 = client.post(f"/stories/{story['id']}/items/{item['id']}/split", json={"split_time_ms": 400})
    assert r1.status_code == 200
    body = r1.json()
    assert "left" in body and "right" in body

    r2 = client.post(f"/stories/{story['id']}/items/{item['id']}/duplicate")
    assert r2.status_code == 200
    assert r2.json()["id"] != item["id"]


def test_delete_item(client, history):
    story = client.post("/stories", json={"name": "S"}).json()
    history.add_fake_entry("h1")
    item = client.post(f"/stories/{story['id']}/items", json={"history_entry_id": "h1"}).json()
    res = client.delete(f"/stories/{story['id']}/items/{item['id']}")
    assert res.status_code == 200


def test_item_khong_ton_tai_tra_404(client):
    story = client.post("/stories", json={"name": "S"}).json()
    assert client.delete(f"/stories/{story['id']}/items/khong-co").status_code == 404
    assert client.put(f"/stories/{story['id']}/items/khong-co/volume", json={"volume": 1.0}).status_code == 404
    assert client.put(f"/stories/{story['id']}/items/khong-co/move", json={"start_time_ms": 0, "track": 0}).status_code == 404
    assert client.put(f"/stories/{story['id']}/items/khong-co/trim", json={"trim_start_ms": 0, "trim_end_ms": 0}).status_code == 404
    assert client.post(f"/stories/{story['id']}/items/khong-co/split", json={"split_time_ms": 100}).status_code == 404
    assert client.post(f"/stories/{story['id']}/items/khong-co/duplicate").status_code == 404


# ── export-audio: WAV header thật ──────────────────────────────────────────────

def test_export_audio_tra_ve_wav_that_co_header(client, history):
    """Route này đổi từ PCM thô (application/octet-stream) sang WAV đóng gói đầy đủ giữa
    chừng lúc viết UI — `playUrlAudio`/`<audio src>` cần RIFF header thật để trình duyệt
    nhận dạng được, không tự parse PCM thô như `/synthesize` yêu cầu client làm. Test này
    xác nhận qua ĐÚNG đường HTTP, không chỉ gọi StoryStore.export_audio() trực tiếp."""
    story = client.post("/stories", json={"name": "S"}).json()
    history.add_fake_entry("h1", duration_ms=1000)
    client.post(f"/stories/{story['id']}/items", json={"history_entry_id": "h1"})

    res = client.get(f"/stories/{story['id']}/export-audio")
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/wav"
    # RIFF....WAVE — 4 byte magic đầu + 4 byte size + 4 byte "WAVE".
    assert res.content[:4] == b"RIFF"
    assert res.content[8:12] == b"WAVE"

    # soundfile phải đọc được thẳng từ bytes — chứng minh đây là WAV hợp lệ, không phải PCM
    # trần đội lốt Content-Type.
    import io
    audio, sr = sf.read(io.BytesIO(res.content))
    assert sr == st.MIX_SAMPLE_RATE
    assert len(audio) > 0


def test_export_audio_story_rong_tra_400(client):
    story = client.post("/stories", json={"name": "S"}).json()
    res = client.get(f"/stories/{story['id']}/export-audio")
    assert res.status_code == 400


def test_export_audio_story_khong_ton_tai_tra_404(client):
    res = client.get("/stories/khong-co/export-audio")
    assert res.status_code == 404


def test_stories_khong_san_sang_tra_503(client, monkeypatch):
    monkeypatch.setattr(main, "_stories", None)
    assert client.get("/stories").status_code == 503
    assert client.post("/stories", json={"name": "S"}).status_code == 503
