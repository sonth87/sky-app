"""Test StoryStore + create_story_store() (Phase 4 — timeline nhiều track, xem
docs/dev/history/2026-08-17-stories-timeline.md; Phase 4.5 — regenerate/versions).

Dựng bảng `tts_story`/`tts_story_item`/`tts_story_item_version` bằng tay trong SQLite
in-memory — schema PHẢI khớp `packages/app-db/src/migrations/021_tts_story.ts` +
`022_tts_story_item_version.ts`. Cùng cách `test_history_store.py` đã làm.
"""
import shutil
import sqlite3

import numpy as np
import pytest
import soundfile as sf

import stories as st

SCHEMA_SQL = """
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
  created_at TEXT NOT NULL,
  voice_id TEXT,
  speed REAL,
  engine_id TEXT,
  active_version_id TEXT REFERENCES tts_story_item_version(id) ON DELETE SET NULL
);
CREATE TABLE tts_story_item_version (
  id TEXT PRIMARY KEY,
  story_item_id TEXT NOT NULL REFERENCES tts_story_item(id) ON DELETE CASCADE,
  audio_file TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
);
"""

SR = 24_000


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")  # sqlite3 mặc định TẮT — phải bật thủ công như db.py làm
    c.executescript(SCHEMA_SQL)
    yield c
    c.close()


@pytest.fixture
def store(conn, tmp_path):
    return st.StoryStore(conn, tmp_path / "tts-stories")


class FakeHistoryStore:
    """Double tối giản cho HistoryStore — chỉ implement 2 method add_item_from_history cần."""

    def __init__(self, tmp_path):
        self._tmp_path = tmp_path
        self._tmp_path.mkdir(parents=True, exist_ok=True)
        self._entries: dict[str, dict] = {}

    def add_fake_entry(self, entry_id: str, *, text="Xin chào", voice_label="Giang",
                       duration_ms=1000, with_audio=True, seconds=1.0, amplitude=0.3,
                       voice_id="voice-1", speed=1.0, engine_id="vieneu"):
        audio_file = None
        if with_audio:
            audio_file = self._tmp_path / f"{entry_id}.wav"
            tone = (amplitude * np.ones(int(SR * seconds))).astype(np.float32)
            sf.write(str(audio_file), tone, SR)
        self._entries[entry_id] = {
            "id": entry_id, "text": text, "voice_label": voice_label,
            "duration_ms": duration_ms, "audio_file": audio_file,
            "voice_id": voice_id, "speed": speed, "engine_id": engine_id,
        }

    def get_entry(self, entry_id: str) -> dict | None:
        e = self._entries.get(entry_id)
        return None if e is None else {k: v for k, v in e.items() if k != "audio_file"}

    def get_audio_path(self, entry_id: str):
        e = self._entries.get(entry_id)
        return e["audio_file"] if e else None


@pytest.fixture
def history(tmp_path):
    return FakeHistoryStore(tmp_path / "src-audio")


# ── Story CRUD ──────────────────────────────────────────────────────────────────

def test_create_va_get_story(store):
    created = store.create_story("Lễ tốt nghiệp K10", "Mở đầu buổi lễ")
    assert created["name"] == "Lễ tốt nghiệp K10"
    assert created["id"].startswith("story-")
    fetched = store.get_story(created["id"])
    assert fetched == created


def test_list_stories_moi_nhat_truoc(store):
    a = store.create_story("A")
    b = store.create_story("B")
    ids = [s["id"] for s in store.list_stories()]
    assert ids.index(b["id"]) < ids.index(a["id"])


def test_update_story_giu_nguyen_field_khong_truyen(store):
    s = store.create_story("Gốc", "Mô tả gốc")
    updated = store.update_story(s["id"], name="Đã đổi tên")
    assert updated["name"] == "Đã đổi tên"
    assert updated["description"] == "Mô tả gốc"


def test_delete_story_khong_ton_tai_tra_false(store):
    assert store.delete_story("khong-co") is False


def test_delete_story_xoa_ca_thu_muc_audio(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1")
    store.add_item_from_history(s["id"], history, "h1")
    story_dir = store._story_dir(s["id"])
    assert story_dir.exists() and any(story_dir.iterdir())

    assert store.delete_story(s["id"]) is True
    assert not story_dir.exists()


# ── add_item_from_history ────────────────────────────────────────────────────────

def test_them_item_tu_history_thanh_cong(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1", text="Xin chào", voice_label="Giang", duration_ms=1500)
    item = store.add_item_from_history(s["id"], history, "h1", track=0)

    assert item["source_text"] == "Xin chào"
    assert item["voice_label"] == "Giang"
    assert item["duration_ms"] == 1500
    assert item["start_time_ms"] == 0
    assert (store._story_dir(s["id"]) / item["audio_file"]).exists()


def test_them_item_bao_loi_khi_history_khong_co_audio(store, history):
    """Nguồn 'pregen' hoặc dòng lỗi — history_store.get_audio_path() trả None. Đây là điểm
    quan trọng nhất của thiết kế: Story KHÔNG được im lặng thêm item rỗng."""
    s = store.create_story("S")
    history.add_fake_entry("h-loi", with_audio=False)
    with pytest.raises(ValueError, match="không có audio"):
        store.add_item_from_history(s["id"], history, "h-loi")


def test_them_item_bao_loi_khi_history_id_khong_ton_tai(store, history):
    s = store.create_story("S")
    with pytest.raises(ValueError, match="Không tìm thấy"):
        store.add_item_from_history(s["id"], history, "khong-co")


def test_them_item_bao_loi_khi_story_khong_ton_tai(store, history):
    history.add_fake_entry("h1")
    with pytest.raises(st.StoryNotFound):
        store.add_item_from_history("khong-co-story", history, "h1")


def test_them_2_item_cung_track_cach_nhau_200ms(store, history):
    """Port đúng logic add_item_to_story của voicebox: item thứ 2 đặt ngay sau cuối item thứ
    nhất (đã trừ trim) + khoảng cách mặc định."""
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000)
    history.add_fake_entry("h2", duration_ms=500)

    item1 = store.add_item_from_history(s["id"], history, "h1", track=0)
    item2 = store.add_item_from_history(s["id"], history, "h2", track=0)

    assert item1["start_time_ms"] == 0
    assert item2["start_time_ms"] == 1000 + st.DEFAULT_GAP_MS


def test_them_item_khac_track_khong_anh_huong_lan_nhau(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000)
    history.add_fake_entry("h2", duration_ms=500)

    store.add_item_from_history(s["id"], history, "h1", track=0)
    item2 = store.add_item_from_history(s["id"], history, "h2", track=1)
    assert item2["start_time_ms"] == 0  # track 1 rỗng, không bị đẩy theo track 0


def test_them_item_tinh_dat_cho_sau_khi_da_trim(store, history):
    """_next_start_time_ms phải trừ trim_start/trim_end, không dùng duration_ms thô."""
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000)
    item1 = store.add_item_from_history(s["id"], history, "h1", track=0)
    store.trim_item(s["id"], item1["id"], trim_start_ms=0, trim_end_ms=400)  # còn 600ms

    history.add_fake_entry("h2", duration_ms=500)
    item2 = store.add_item_from_history(s["id"], history, "h2", track=0)
    assert item2["start_time_ms"] == 600 + st.DEFAULT_GAP_MS


# ── move_item — vị trí tuyệt đối (canvas kéo-thả) ────────────────────────────────

def test_move_item_dat_toa_do_tuyet_doi(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1")
    item = store.add_item_from_history(s["id"], history, "h1")

    moved = store.move_item(s["id"], item["id"], start_time_ms=5000, track=2)
    assert moved["start_time_ms"] == 5000
    assert moved["track"] == 2


def test_move_item_khong_cho_am(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1")
    item = store.add_item_from_history(s["id"], history, "h1")
    moved = store.move_item(s["id"], item["id"], start_time_ms=-500, track=0)
    assert moved["start_time_ms"] == 0


def test_move_item_khong_ton_tai_tra_none(store):
    assert store.move_item("s", "khong-co", 0, 0) is None


# ── trim_item ─────────────────────────────────────────────────────────────────

def test_trim_item_hop_le(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000)
    item = store.add_item_from_history(s["id"], history, "h1")
    trimmed = store.trim_item(s["id"], item["id"], trim_start_ms=100, trim_end_ms=200)
    assert (trimmed["trim_start_ms"], trimmed["trim_end_ms"]) == (100, 200)


def test_trim_item_vuot_qua_do_dai_bi_tu_choi(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000)
    item = store.add_item_from_history(s["id"], history, "h1")
    with pytest.raises(ValueError, match="Trim vượt"):
        store.trim_item(s["id"], item["id"], trim_start_ms=600, trim_end_ms=500)


def test_trim_item_khong_ton_tai(store):
    with pytest.raises(st.StoryItemNotFound):
        store.trim_item("s", "khong-co", 0, 0)


# ── set_volume ────────────────────────────────────────────────────────────────

def test_set_volume_gioi_han_0_den_2(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1")
    item = store.add_item_from_history(s["id"], history, "h1")
    assert store.set_volume(s["id"], item["id"], 3.5)["volume"] == 2.0
    assert store.set_volume(s["id"], item["id"], -1.0)["volume"] == 0.0
    assert store.set_volume(s["id"], item["id"], 1.5)["volume"] == 1.5


# ── duplicate_item / split_item — file ĐỘC LẬP, không chia sẻ ────────────────────

def test_duplicate_item_tao_file_rieng(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000)
    item = store.add_item_from_history(s["id"], history, "h1")

    dup = store.duplicate_item(s["id"], item["id"])
    assert dup["id"] != item["id"]
    assert dup["audio_file"] != item["audio_file"]

    story_dir = store._story_dir(s["id"])
    assert (story_dir / item["audio_file"]).exists()
    assert (story_dir / dup["audio_file"]).exists()

    # Xoá bản gốc KHÔNG được ảnh hưởng bản nhân bản — đúng lý do tại sao phải copy file riêng.
    store.delete_item(s["id"], item["id"])
    assert (story_dir / dup["audio_file"]).exists()


def test_split_item_tao_2_item_khong_chia_se_file(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000)
    item = store.add_item_from_history(s["id"], history, "h1", track=0)

    left, right = store.split_item(s["id"], item["id"], split_time_ms=400)

    assert left["id"] == item["id"]  # nửa trái giữ nguyên id/audio_file
    assert left["audio_file"] == item["audio_file"]
    assert right["audio_file"] != item["audio_file"]  # nửa phải file ĐỘC LẬP

    # Trim cộng lại đúng — không "mất" hay "thừa" audio ở điểm nối.
    assert left["trim_end_ms"] == item["duration_ms"] - 400
    assert right["trim_start_ms"] == 400
    assert right["start_time_ms"] == item["start_time_ms"] + 400

    story_dir = store._story_dir(s["id"])
    assert (story_dir / left["audio_file"]).exists()
    assert (story_dir / right["audio_file"]).exists()

    # Xoá 1 nửa không phá nửa kia (khác voicebox — item ở đây sở hữu file riêng).
    store.delete_item(s["id"], right["id"])
    assert (story_dir / left["audio_file"]).exists()


def test_split_item_ngoai_khoang_hop_le_bi_tu_choi(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000)
    item = store.add_item_from_history(s["id"], history, "h1")
    with pytest.raises(ValueError):
        store.split_item(s["id"], item["id"], split_time_ms=0)
    with pytest.raises(ValueError):
        store.split_item(s["id"], item["id"], split_time_ms=1000)


# ── delete_item — dọn file ────────────────────────────────────────────────────

def test_delete_item_xoa_file_audio(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1")
    item = store.add_item_from_history(s["id"], history, "h1")
    audio_path = store._story_dir(s["id"]) / item["audio_file"]
    assert audio_path.exists()

    assert store.delete_item(s["id"], item["id"]) is True
    assert not audio_path.exists()


def test_delete_item_khong_ton_tai_tra_false(store):
    assert store.delete_item("s", "khong-co") is False


# ── export_audio — mixdown ───────────────────────────────────────────────────

def test_export_audio_story_rong_tra_mang_rong(store):
    s = store.create_story("S")
    audio, sr = store.export_audio(s["id"])
    assert audio.size == 0
    assert sr == st.MIX_SAMPLE_RATE


def test_export_audio_dat_dung_vi_tri_offset(store, history):
    """2 item track khác nhau, KHÔNG chồng thời gian — kiểm audio xuất hiện đúng vị trí mẫu,
    không bị dịch."""
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000, seconds=1.0, amplitude=0.5)
    item = store.add_item_from_history(s["id"], history, "h1")
    store.move_item(s["id"], item["id"], start_time_ms=2000, track=0)  # bắt đầu ở giây thứ 2

    audio, sr = store.export_audio(s["id"])
    start_sample = int(2000 / 1000 * sr)
    assert np.allclose(audio[:start_sample], 0.0)
    assert np.isclose(float(np.abs(audio[start_sample:start_sample + 100]).mean()), 0.5, atol=0.05)


def test_export_audio_cong_don_2_track_chong_nhau(store, history):
    """2 item CÙNG vị trí thời gian, khác track — phải CỘNG dồn (đúng ngữ nghĩa mix nhiều
    track), không phải ghi đè."""
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000, amplitude=0.2)
    history.add_fake_entry("h2", duration_ms=1000, amplitude=0.2)
    store.add_item_from_history(s["id"], history, "h1", track=0)
    store.add_item_from_history(s["id"], history, "h2", track=1)  # track 1 cũng bắt đầu ở 0

    audio, sr = store.export_audio(s["id"])
    # 2 track cùng biên độ 0.2 cộng lại ~0.4, không phải 0.2 (đè) hay 1.0 (sai hoàn toàn).
    assert np.isclose(float(np.abs(audio[:100]).mean()), 0.4, atol=0.05)


def test_export_audio_ap_dung_volume(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000, amplitude=0.5)
    item = store.add_item_from_history(s["id"], history, "h1")
    store.set_volume(s["id"], item["id"], 0.5)

    audio, sr = store.export_audio(s["id"])
    assert np.isclose(float(np.abs(audio[:100]).mean()), 0.25, atol=0.05)


def test_export_audio_ap_dung_trim(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=2000, seconds=2.0, amplitude=0.5)
    item = store.add_item_from_history(s["id"], history, "h1")
    store.trim_item(s["id"], item["id"], trim_start_ms=1000, trim_end_ms=0)  # bỏ giây đầu

    audio, sr = store.export_audio(s["id"])
    # Sau trim chỉ còn 1 giây audio — không phải 2.
    assert audio.size == pytest.approx(sr * 1, abs=sr * 0.05)


def test_export_audio_chi_normalize_khi_vuot_1(store, history):
    """3 track cùng biên độ 0.5 cộng dồn ra 1.5 — VƯỢT 1.0 nên phải normalize. Khác trường
    hợp không vượt (test_export_audio_cong_don_2_track_chong_nhau) — không normalize."""
    s = store.create_story("S")
    for i in range(3):
        history.add_fake_entry(f"h{i}", duration_ms=1000, amplitude=0.5)
        store.add_item_from_history(s["id"], history, f"h{i}", track=i)

    audio, sr = store.export_audio(s["id"])
    assert float(np.abs(audio).max()) <= 1.0 + 1e-6


def test_export_audio_bo_qua_item_file_bi_mat(store, history):
    """File audio bị xoá thủ công khỏi đĩa (ngoài ý muốn) — export KHÔNG được crash, chỉ bỏ
    qua item đó, các item khác vẫn trộn bình thường."""
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000, amplitude=0.5)
    history.add_fake_entry("h2", duration_ms=1000, amplitude=0.5)
    item1 = store.add_item_from_history(s["id"], history, "h1", track=0)
    store.add_item_from_history(s["id"], history, "h2", track=1)

    (store._story_dir(s["id"]) / item1["audio_file"]).unlink()

    audio, sr = store.export_audio(s["id"])
    assert audio.size > 0  # item2 vẫn trộn được


# ── Regenerate / Versions (Phase 4.5) ────────────────────────────────────────

def _fake_regen_audio(seconds=0.5, amplitude=0.7):
    return (amplitude * np.ones(int(SR * seconds))).astype(np.float32)


def test_them_item_snapshot_voice_id_speed_engine(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1", voice_id="voice-xyz", speed=1.2, engine_id="qwen3")
    item = store.add_item_from_history(s["id"], history, "h1")
    assert item["voice_id"] == "voice-xyz"
    assert item["speed"] == 1.2
    assert item["engine_id"] == "qwen3"
    assert item["can_regenerate"] is True


def test_them_item_khong_co_voice_id_can_regenerate_false(store, history):
    history.add_fake_entry("h1", voice_id=None)
    s = store.create_story("S")
    item = store.add_item_from_history(s["id"], history, "h1")
    assert item["can_regenerate"] is False


def test_regenerate_tao_version_moi_giu_ca_ban_goc(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000)
    item = store.add_item_from_history(s["id"], history, "h1")
    original_audio_file = item["audio_file"]

    updated = store.regenerate_item(s["id"], item["id"], _fake_regen_audio(seconds=0.5), SR)

    # Item giờ trỏ audio MỚI, KHÔNG còn là file gốc lúc thêm.
    assert updated["audio_file"] != original_audio_file
    assert updated["active_version_id"] is not None
    # Trim reset về 0 — bản mới thường khác duration bản cũ.
    assert updated["trim_start_ms"] == 0 and updated["trim_end_ms"] == 0

    versions = store.list_item_versions(s["id"], item["id"])
    assert len(versions) == 2
    assert versions[0]["label"] == "Bản gốc"
    assert versions[0]["audio_file"] == original_audio_file
    assert versions[1]["label"] == "Bản 2"
    assert versions[1]["audio_file"] == updated["audio_file"]

    story_dir = store._story_dir(s["id"])
    # Bản gốc vẫn còn nguyên trên đĩa — regenerate không xoá gì cả.
    assert (story_dir / original_audio_file).exists()
    assert (story_dir / updated["audio_file"]).exists()


def test_regenerate_lan_2_khong_tao_lai_ban_goc(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000)
    item = store.add_item_from_history(s["id"], history, "h1")

    store.regenerate_item(s["id"], item["id"], _fake_regen_audio(), SR)
    store.regenerate_item(s["id"], item["id"], _fake_regen_audio(), SR)

    versions = store.list_item_versions(s["id"], item["id"])
    labels = [v["label"] for v in versions]
    assert labels == ["Bản gốc", "Bản 2", "Bản 3"]  # đúng 1 "Bản gốc" duy nhất


def test_regenerate_item_khong_ton_tai(store):
    with pytest.raises(st.StoryItemNotFound):
        store.regenerate_item("story-x", "item-x", _fake_regen_audio(), SR)


def test_regenerate_item_thieu_voice_id_bao_loi(store, history):
    history.add_fake_entry("h1", voice_id=None)
    s = store.create_story("S")
    item = store.add_item_from_history(s["id"], history, "h1")
    with pytest.raises(ValueError):
        store.regenerate_item(s["id"], item["id"], _fake_regen_audio(), SR)


def test_set_item_version_tro_lai_ban_cu(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000)
    item = store.add_item_from_history(s["id"], history, "h1")
    original_audio_file = item["audio_file"]
    original_duration_ms = item["duration_ms"]

    store.regenerate_item(s["id"], item["id"], _fake_regen_audio(), SR)
    versions = store.list_item_versions(s["id"], item["id"])
    origin_version = next(v for v in versions if v["label"] == "Bản gốc")

    restored = store.set_item_version(s["id"], item["id"], origin_version["id"])
    assert restored["audio_file"] == original_audio_file
    assert restored["duration_ms"] == original_duration_ms
    assert restored["active_version_id"] == origin_version["id"]
    assert restored["trim_start_ms"] == 0 and restored["trim_end_ms"] == 0


def test_set_item_version_khong_ton_tai_bao_loi(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1")
    item = store.add_item_from_history(s["id"], history, "h1")
    with pytest.raises(ValueError):
        store.set_item_version(s["id"], item["id"], "ver-khong-co")


def test_split_item_xoa_kha_nang_regenerate(store, history):
    """Sau khi Tách, cả 2 nửa đều chỉ còn trỏ đúng NGUYÊN VĂN source_text — regenerate 1 nửa sẽ
    sinh lại CẢ câu gốc chứ không phải riêng nửa đó, nên phải vô hiệu hoá."""
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000, voice_id="voice-1")
    item = store.add_item_from_history(s["id"], history, "h1")
    assert item["can_regenerate"] is True

    left, right = store.split_item(s["id"], item["id"], split_time_ms=400)
    assert left["can_regenerate"] is False
    assert right["can_regenerate"] is False


def test_duplicate_item_giu_kha_nang_regenerate(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1", voice_id="voice-1", speed=0.9, engine_id="vieneu")
    item = store.add_item_from_history(s["id"], history, "h1")

    dup = store.duplicate_item(s["id"], item["id"])
    assert dup["can_regenerate"] is True
    assert dup["voice_id"] == "voice-1"
    assert dup["speed"] == 0.9
    assert dup["engine_id"] == "vieneu"


def test_list_item_versions_rong_khi_chua_regenerate(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1")
    item = store.add_item_from_history(s["id"], history, "h1")
    assert store.list_item_versions(s["id"], item["id"]) == []


def test_get_item_audio_path(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1")
    item = store.add_item_from_history(s["id"], history, "h1")
    path = store.get_item_audio_path(s["id"], item["id"])
    assert path is not None and path.exists()
    assert path.name == item["audio_file"]


def test_get_item_audio_path_item_khong_ton_tai_tra_none(store):
    assert store.get_item_audio_path("story-x", "item-x") is None


# ── Reorder (Phase 4.5 — list dọc sortable) ──────────────────────────────────

def test_reorder_items_tinh_lai_start_time_ms_tuan_tu(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000)
    history.add_fake_entry("h2", duration_ms=500)
    history.add_fake_entry("h3", duration_ms=800)
    i1 = store.add_item_from_history(s["id"], history, "h1", track=0)
    i2 = store.add_item_from_history(s["id"], history, "h2", track=0)
    i3 = store.add_item_from_history(s["id"], history, "h3", track=0)

    # Đảo ngược thứ tự: h3, h1, h2.
    result = store.reorder_items(s["id"], 0, [i3["id"], i1["id"], i2["id"]])
    by_id = {r["id"]: r for r in result}
    assert by_id[i3["id"]]["start_time_ms"] == 0
    assert by_id[i1["id"]]["start_time_ms"] == 800 + st.DEFAULT_GAP_MS
    assert by_id[i2["id"]]["start_time_ms"] == 800 + st.DEFAULT_GAP_MS + 1000 + st.DEFAULT_GAP_MS


def test_reorder_items_khong_dung_track_khac_khong_bi_dong(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1", duration_ms=1000)
    history.add_fake_entry("h2", duration_ms=1000)
    i1 = store.add_item_from_history(s["id"], history, "h1", track=0)
    i2 = store.add_item_from_history(s["id"], history, "h2", track=1)
    original_i2_start = i2["start_time_ms"]

    store.reorder_items(s["id"], 0, [i1["id"]])
    unchanged = store.get_item(s["id"], i2["id"])
    assert unchanged["start_time_ms"] == original_i2_start  # track khác không bị đụng


def test_reorder_items_danh_sach_khong_khop_bao_loi(store, history):
    s = store.create_story("S")
    history.add_fake_entry("h1")
    item = store.add_item_from_history(s["id"], history, "h1", track=0)
    with pytest.raises(ValueError):
        store.reorder_items(s["id"], 0, [item["id"], "item-khong-co"])
    with pytest.raises(ValueError):
        store.reorder_items(s["id"], 0, [])  # thiếu item thật đang có trên track


def test_reorder_items_story_khong_ton_tai(store):
    with pytest.raises(st.StoryNotFound):
        store.reorder_items("story-x", 0, [])
