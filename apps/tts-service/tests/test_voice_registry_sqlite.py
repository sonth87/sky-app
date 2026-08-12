"""Test VoiceRegistrySqlite + create_voice_registry() + nhập một lần từ JSON cũ.

Dựng bảng `tts_voice` bằng tay trong SQLite in-memory — schema PHẢI khớp
`packages/app-db/src/migrations/017_tts_voice.ts`. Không có cách nào import trực tiếp file
.ts từ Python nên khớp bằng tay là chấp nhận được; lệch nhau sẽ lộ ngay ở test đầu
(INSERT thiếu cột / sai kiểu).

Test VoiceRegistryJson (class gốc, không đổi logic) đã có sẵn ở nơi khác — không lặp lại ở
đây, chỉ test đường SQL mới và điểm nối giữa 2 kho.
"""
import sqlite3

import pytest

import voice_registry as vr

SCHEMA_SQL = """
CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
CREATE TABLE tts_voice (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('cloned', 'preset')),
  label TEXT NOT NULL,
  gender TEXT,
  region TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  ref_file TEXT,
  ref_text TEXT,
  accent TEXT,
  category_json TEXT,
  tags_json TEXT,
  tagline TEXT,
  description TEXT,
  source_catalog_id TEXT,
  source_lang TEXT,
  preset_id TEXT,
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
def registry(conn, tmp_path):
    return vr.VoiceRegistrySqlite(conn, tmp_path)


# ── _ensure_presets ────────────────────────────────────────────────────────────

def test_khoi_tao_tu_dong_them_10_preset(registry):
    all_voices = registry.list_voices(include_hidden=True)
    presets = [v for v in all_voices if v["type"] == "preset"]
    assert len(presets) == len(vr.PRESET_VOICES)


def test_preset_mac_dinh_bi_an(registry):
    assert registry.list_voices(include_hidden=False) == []


def test_khoi_tao_lai_khong_nhan_doi_preset(conn, tmp_path):
    vr.VoiceRegistrySqlite(conn, tmp_path)
    vr.VoiceRegistrySqlite(conn, tmp_path)  # instance thứ 2, cùng connection
    presets = [v for v in vr.VoiceRegistrySqlite(conn, tmp_path).list_voices(include_hidden=True)
               if v["type"] == "preset"]
    assert len(presets) == len(vr.PRESET_VOICES)


def test_khong_de_len_preset_da_sua(registry):
    """`INSERT OR IGNORE` không được ghi đè preset người dùng đã lỡ set hidden=False cho nó."""
    some_id = next(iter(vr.PRESET_VOICES))
    registry.set_hidden(some_id, False)
    vr.VoiceRegistrySqlite(registry._conn, registry._ref_dir)._ensure_presets()
    assert registry.get_voice(some_id)["hidden"] is False


# ── add_cloned / get_voice / list_voices ──────────────────────────────────────

def test_them_giong_clone_toi_thieu(registry):
    v = registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="x.wav")
    assert v["type"] == "cloned"
    assert v["label"] == "Test"
    assert v["ref_file"] == "x.wav"
    assert v["hidden"] is False
    assert "ref_text" not in v  # None bị lọc — đúng hình dạng JSON gốc


def test_them_giong_voi_du_extra_field(registry):
    v = registry.add_cloned(
        label="Test", gender="male", region="Nam", ref_file="y.wav",
        extra={
            "ref_text": "Xin chào", "accent": "southern",
            "category": ["narrator"], "tags": ["calm", "warm"],
            "tagline": "Giọng ấm", "description": "Mô tả dài",
            "source_catalog_id": "cat-1", "source_lang": "vi-VN",
        },
    )
    assert v["ref_text"] == "Xin chào"
    assert v["category"] == ["narrator"]
    assert v["tags"] == ["calm", "warm"]
    assert v["source_catalog_id"] == "cat-1"
    assert v["source_lang"] == "vi-VN"


def test_id_tu_sinh_co_tien_to_clone(registry):
    v = registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="x.wav")
    assert v["id"].startswith("clone-")


def test_id_chi_dinh_duoc_giu_nguyen(registry):
    v = registry.add_cloned(
        label="Test", gender="female", region="Bắc", ref_file="x.wav", voice_id="clone-fixed",
    )
    assert v["id"] == "clone-fixed"


def test_get_voice_khong_ton_tai_tra_none(registry):
    assert registry.get_voice("khong-co") is None


def test_list_voices_bao_gom_ca_an_khi_yeu_cau(registry):
    registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="x.wav")
    assert len(registry.list_voices(include_hidden=False)) == 1
    registry.set_hidden(registry.list_voices()[0]["id"], True)
    assert len(registry.list_voices(include_hidden=False)) == 0
    assert len(registry.list_voices(include_hidden=True)) == 1 + len(vr.PRESET_VOICES)


# ── set_hidden / set_ref_text ──────────────────────────────────────────────────

def test_set_hidden_tra_false_neu_khong_ton_tai(registry):
    assert registry.set_hidden("khong-co", True) is False


def test_set_ref_text_chuoi_rong_xoa_field(registry):
    v = registry.add_cloned(
        label="Test", gender="female", region="Bắc", ref_file="x.wav",
        extra={"ref_text": "Có sẵn"},
    )
    assert registry.set_ref_text(v["id"], "") is True
    assert "ref_text" not in registry.get_voice(v["id"])


def test_set_ref_text_cap_nhat_duoc(registry):
    v = registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="x.wav")
    registry.set_ref_text(v["id"], "  Nội dung mới  ")
    assert registry.get_voice(v["id"])["ref_text"] == "Nội dung mới"


# ── find_by_source_catalog_id ──────────────────────────────────────────────────

def test_tim_theo_source_catalog_id(registry):
    registry.add_cloned(
        label="Test", gender="female", region="Bắc", ref_file="x.wav",
        extra={"source_catalog_id": "gia_bao"},
    )
    found = registry.find_by_source_catalog_id("gia_bao")
    assert found is not None and found["source_catalog_id"] == "gia_bao"
    assert registry.find_by_source_catalog_id("khong-co") is None


# ── delete_cloned ───────────────────────────────────────────────────────────────

def test_xoa_preset_bi_tu_choi(registry):
    preset_id = next(iter(vr.PRESET_VOICES))
    ok, reason = registry.delete_cloned(preset_id)
    assert (ok, reason) == (False, "is_preset")


def test_xoa_khong_ton_tai(registry):
    ok, reason = registry.delete_cloned("khong-co")
    assert (ok, reason) == (False, "not_found")


def test_xoa_clone_thanh_cong_va_don_file(registry, tmp_path):
    ref = tmp_path / "clone-x.wav"
    ref.write_bytes(b"RIFF....WAVEfmt ")
    (tmp_path / "clone-x.txt").write_text("transcript", encoding="utf-8")

    v = registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="clone-x.wav")
    ok, reason = registry.delete_cloned(v["id"])

    assert (ok, reason) == (True, "")
    assert registry.get_voice(v["id"]) is None
    assert not ref.exists()
    assert not (tmp_path / "clone-x.txt").exists()


# ── get_ref_path / get_preset_id ────────────────────────────────────────────────

def test_get_ref_path_giong_clone(registry, tmp_path):
    v = registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="clone-x.wav")
    assert registry.get_ref_path(v["id"]) == tmp_path / "clone-x.wav"


def test_get_ref_path_preset_tra_none(registry):
    preset_id = next(iter(vr.PRESET_VOICES))
    assert registry.get_ref_path(preset_id) is None


def test_get_preset_id_giong_clone_tra_none(registry):
    v = registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="x.wav")
    assert registry.get_preset_id(v["id"]) is None


def test_get_preset_id_dung_gia_tri(registry):
    preset_id = next(iter(vr.PRESET_VOICES))
    expected = vr.PRESET_VOICES[preset_id]["preset_id"]
    assert registry.get_preset_id(preset_id) == expected


# ── create_voice_registry() — điểm chọn kho ────────────────────────────────────

def test_factory_chon_json_khi_khong_co_db(monkeypatch, tmp_path):
    monkeypatch.setattr(vr._db, "connect", lambda: None)
    reg = vr.create_voice_registry(tmp_path / "voice-registry.json", tmp_path)
    assert isinstance(reg, vr.VoiceRegistryJson)


def test_factory_chon_sqlite_khi_co_db(monkeypatch, conn, tmp_path):
    monkeypatch.setattr(vr._db, "connect", lambda: conn)
    reg = vr.create_voice_registry(tmp_path / "voice-registry.json", tmp_path)
    assert isinstance(reg, vr.VoiceRegistrySqlite)


# ── _import_json_once — nhập dữ liệu cũ, đúng một lần ─────────────────────────

def test_nhap_tu_json_cu_khi_chuyen_sang_sql(monkeypatch, conn, tmp_path):
    registry_path = tmp_path / "voice-registry.json"
    registry_path.write_text(
        '{"version": 1, "voices": {'
        '"clone-abc": {"type": "cloned", "label": "Cũ", "gender": "female", "region": "Bắc", '
        '"ref_file": "old.wav", "ref_text": "Xin chào", "hidden": false, '
        '"category": ["narrator"], "source_catalog_id": "cat-x"}'
        '}}',
        encoding="utf-8",
    )
    monkeypatch.setattr(vr._db, "connect", lambda: conn)

    reg = vr.create_voice_registry(registry_path, tmp_path)

    v = reg.get_voice("clone-abc")
    assert v is not None
    assert v["label"] == "Cũ"
    assert v["ref_text"] == "Xin chào"
    assert v["category"] == ["narrator"]
    # File JSON cũ được đổi tên, không xoá — dữ liệu gốc vẫn đối chiếu được nếu nhập sai.
    assert not registry_path.exists()
    assert (tmp_path / "voice-registry.imported.json").exists()


def test_nhap_khong_chay_lai_lan_2(monkeypatch, conn, tmp_path):
    """Bảng đã có cloned voice (đã nhập trước, hoặc người dùng clone mới qua SQL) → không
    đụng gì, kể cả khi có file JSON khác đang nằm cạnh đó."""
    registry_path = tmp_path / "voice-registry.json"
    registry_path.write_text(
        '{"version": 1, "voices": {'
        '"clone-new": {"type": "cloned", "label": "Sẽ không được nhập", "ref_file": "n.wav"}'
        '}}',
        encoding="utf-8",
    )
    conn.execute(
        "INSERT INTO tts_voice (id, type, label, hidden, ref_file, created_at) "
        "VALUES ('clone-existing', 'cloned', 'Đã có', 0, 'e.wav', '2026')"
    )
    conn.commit()
    monkeypatch.setattr(vr._db, "connect", lambda: conn)

    reg = vr.create_voice_registry(registry_path, tmp_path)

    assert reg.get_voice("clone-new") is None  # KHÔNG được nhập
    assert reg.get_voice("clone-existing") is not None
    assert registry_path.exists()  # không bị đụng vào


def test_nhap_bo_qua_neu_khong_co_file_json(monkeypatch, conn, tmp_path):
    monkeypatch.setattr(vr._db, "connect", lambda: conn)
    reg = vr.create_voice_registry(tmp_path / "khong-ton-tai.json", tmp_path)
    assert isinstance(reg, vr.VoiceRegistrySqlite)  # không raise, không crash


def test_nhap_bo_qua_neu_file_json_hong(monkeypatch, conn, tmp_path):
    registry_path = tmp_path / "voice-registry.json"
    registry_path.write_text("{ khong phai json hop le", encoding="utf-8")
    monkeypatch.setattr(vr._db, "connect", lambda: conn)

    reg = vr.create_voice_registry(registry_path, tmp_path)

    assert isinstance(reg, vr.VoiceRegistrySqlite)
    assert registry_path.exists()  # không bị đổi tên/xoá vì chưa đọc được
