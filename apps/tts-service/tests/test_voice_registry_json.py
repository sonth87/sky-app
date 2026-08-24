"""Test VoiceRegistryJson — kho lưu trữ gốc (JSON file), dùng khi không có DB dùng chung
(chạy độc lập, verify_engine.py, hoặc Electron cũ hơn schema Python cần).

Chưa từng có file test riêng cho class này trước Phase 2 (chỉ được chạm gián tiếp qua nơi
khác) — bổ sung ở đây, đặc biệt vì Phase 2 thêm 3 method lớn (list_samples/add_sample/
delete_sample) và sửa get_voice()/list_voices()/set_ref_text() để nhất quán hình dạng với
VoiceRegistrySqlite (xem test_voice_registry_sqlite.py cho đối chiếu 2 kho).
"""
import json

import pytest

from voice_registry import VoiceRegistryJson


@pytest.fixture
def registry(tmp_path):
    return VoiceRegistryJson(tmp_path / "voice-registry.json", tmp_path)


def _write_wav(path):
    path.write_bytes(b"RIFF....WAVEfmt ")


# ── Khởi tạo ────────────────────────────────────────────────────────────────────

def test_khoi_tao_tao_10_preset_an(registry):
    all_voices = registry.list_voices(include_hidden=True)
    presets = [v for v in all_voices if v["type"] == "preset"]
    assert len(presets) == 10
    assert registry.list_voices(include_hidden=False) == []


def test_khoi_tao_lai_khong_mat_giong_da_clone(tmp_path):
    # File ref PHẢI tồn tại thật trên đĩa — `_load_or_init` tự dọn cloned voice không có
    # `source_catalog_id` mà file ref không tồn tại (coi là rác từ registry cũ orphan),
    # nên thiếu bước này sẽ khiến voice "biến mất" ở lần mở thứ 2 vì đúng thiết kế, không
    # phải vì đang test sai thứ cần test.
    _write_wav(tmp_path / "x.wav")
    path = tmp_path / "voice-registry.json"
    r1 = VoiceRegistryJson(path, tmp_path)
    r1.add_cloned(label="Test", gender="female", region="Bắc", ref_file="x.wav")

    r2 = VoiceRegistryJson(path, tmp_path)  # mở lại, mô phỏng restart
    cloned = [v for v in r2.list_voices() if v["type"] == "cloned"]
    assert len(cloned) == 1
    assert cloned[0]["label"] == "Test"


def test_file_hong_duoc_backup_khong_xoa_im_lang(tmp_path):
    path = tmp_path / "voice-registry.json"
    path.write_text("{ khong phai json hop le", encoding="utf-8")

    VoiceRegistryJson(path, tmp_path)  # không raise

    backups = list(tmp_path.glob("voice-registry.corrupt-*.json"))
    assert len(backups) == 1
    assert backups[0].read_text(encoding="utf-8") == "{ khong phai json hop le"


# ── merge_presets — preset built-in đọc ĐỘNG từ engine.list_presets() lúc runtime ──────────

def test_merge_presets_them_entry_moi(registry):
    registry.merge_presets([
        {"id": "builtin-adam", "type": "preset", "label": "Adam", "gender": "male",
         "region": "Nam", "preset_id": "Adam", "hidden": False, "accent": "southern",
         "category": ["conversational"], "tags": [], "tagline": "Nam · Tự nhiên",
         "description": "Giọng nam miền Nam, phong cách tự nhiên."},
    ])
    v = registry.get_voice("builtin-adam")
    assert v is not None
    assert v["type"] == "preset"
    assert v["preset_id"] == "Adam"
    assert v["accent"] == "southern"
    assert v["category"] == ["conversational"]
    # hidden=False → phải lộ ra qua list_voices() mặc định, khác 10 preset tĩnh (hidden=True)
    assert "builtin-adam" in {x["id"] for x in registry.list_voices(include_hidden=False)}


def test_merge_presets_giu_nguyen_hidden_nguoi_dung_da_sua(registry):
    registry.merge_presets([
        {"id": "builtin-adam", "type": "preset", "label": "Adam", "gender": "male",
         "region": "Nam", "preset_id": "Adam", "hidden": False},
    ])
    registry.set_hidden("builtin-adam", True)  # người dùng tự ẩn đi

    registry.merge_presets([  # merge lại (vd restart server) — KHÔNG được ghi đè hidden=False
        {"id": "builtin-adam", "type": "preset", "label": "Adam", "gender": "male",
         "region": "Nam", "preset_id": "Adam", "hidden": False},
    ])
    assert registry.get_voice("builtin-adam")["hidden"] is True


def test_merge_presets_refresh_metadata_entry_da_co(registry):
    """Bug thật đã sửa: field mới thêm vào code (vd "language") sau khi 1 preset ĐÃ merge lần
    trước đó phải tự áp dụng lại ở lần merge sau (restart server), không kẹt mãi ở dữ liệu cũ."""
    registry.merge_presets([
        {"id": "builtin-adam", "type": "preset", "label": "Adam", "gender": "male",
         "region": "Nam", "preset_id": "Adam", "hidden": False,
         "description": "Mô tả cũ, chưa có language"},
    ])
    registry.merge_presets([
        {"id": "builtin-adam", "type": "preset", "label": "Adam", "gender": "male",
         "region": "Nam", "preset_id": "Adam", "hidden": False,
         "language": "Vietnamese", "description": "Mô tả mới, đã thêm language"},
    ])
    v = registry.get_voice("builtin-adam")
    assert v["language"] == "Vietnamese"
    assert v["description"] == "Mô tả mới, đã thêm language"


def test_merge_presets_preset_builtin_khong_the_xoa(registry):
    registry.merge_presets([
        {"id": "builtin-adam", "type": "preset", "label": "Adam", "gender": "male",
         "region": "Nam", "preset_id": "Adam", "hidden": False},
    ])
    ok, reason = registry.delete_cloned("builtin-adam")
    assert ok is False
    assert reason == "is_preset"


# ── get_voice / list_voices — hình dạng KHÔNG lộ ref_file/ref_text/samples ──────

def test_get_voice_khong_lo_ref_file_ref_text(registry):
    v = registry.add_cloned(
        label="Test", gender="female", region="Bắc", ref_file="x.wav",
        extra={"ref_text": "Xin chào"},
    )
    fetched = registry.get_voice(v["id"])
    assert "ref_file" not in fetched
    assert "ref_text" not in fetched
    assert "samples" not in fetched


def test_list_voices_khong_lo_ref_file_ref_text(registry):
    registry.add_cloned(
        label="Test", gender="female", region="Bắc", ref_file="x.wav",
        extra={"ref_text": "Xin chào"},
    )
    cloned = [v for v in registry.list_voices() if v["type"] == "cloned"][0]
    assert "ref_file" not in cloned
    assert "ref_text" not in cloned


def test_du_lieu_luu_tren_dia_van_giu_ref_file(registry):
    """Ẩn khỏi API trả về KHÔNG có nghĩa xoá khỏi lưu trữ — đây vẫn là nguồn thật cho
    voice 1-sample, chỉ là get_voice()/list_voices() không lộ ra."""
    v = registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="x.wav")
    raw = json.loads(registry._path.read_text(encoding="utf-8"))
    assert raw["voices"][v["id"]]["ref_file"] == "x.wav"


# ── list_samples — suy luận "sample ảo" cho voice chưa convert ─────────────────

def test_list_samples_suy_luan_tu_ref_file_cu(registry):
    v = registry.add_cloned(
        label="Test", gender="female", region="Bắc", ref_file="x.wav",
        extra={"ref_text": "Xin chào"},
    )
    samples = registry.list_samples(v["id"])
    assert len(samples) == 1
    assert samples[0]["ref_file"] == "x.wav"
    assert samples[0]["ref_text"] == "Xin chào"
    assert samples[0]["id"] == f"{v['id']}-primary"


def test_list_samples_voice_khong_ton_tai_tra_rong(registry):
    assert registry.list_samples("khong-co") == []


def test_list_samples_preset_tra_rong(registry):
    from voice_registry import PRESET_VOICES
    preset_id = next(iter(PRESET_VOICES))
    assert registry.list_samples(preset_id) == []


# ── add_sample — chuyển hoá 1 lần rồi thêm ──────────────────────────────────────

def test_add_sample_chuyen_hoa_sample_dau_tien(registry):
    v = registry.add_cloned(
        label="Test", gender="female", region="Bắc", ref_file="a.wav",
        extra={"ref_text": "Mẫu 1"},
    )
    registry.add_sample(v["id"], "b.wav", "Mẫu 2")

    samples = registry.list_samples(v["id"])
    assert [s["ref_file"] for s in samples] == ["a.wav", "b.wav"]
    assert samples[0]["ref_text"] == "Mẫu 1"
    assert samples[1]["ref_text"] == "Mẫu 2"


def test_add_sample_sau_chuyen_hoa_khong_con_ref_file_tren_entry(registry):
    """Sau khi convert, ref_file/ref_text cũ phải BIẾN MẤT khỏi entry (chuyển hẳn vào
    samples[0]) — không giữ song song 2 nơi có thể lệch nhau."""
    v = registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="a.wav")
    registry.add_sample(v["id"], "b.wav")

    raw = json.loads(registry._path.read_text(encoding="utf-8"))
    entry = raw["voices"][v["id"]]
    assert "ref_file" not in entry
    assert "ref_text" not in entry
    assert len(entry["samples"]) == 2


def test_add_sample_khong_co_transcript(registry):
    v = registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="a.wav")
    s = registry.add_sample(v["id"], "b.wav")
    assert "ref_text" not in s


def test_add_sample_voice_khong_ton_tai_bao_loi(registry):
    with pytest.raises(ValueError):
        registry.add_sample("khong-co", "x.wav")


def test_add_sample_preset_bao_loi(registry):
    from voice_registry import PRESET_VOICES
    preset_id = next(iter(PRESET_VOICES))
    with pytest.raises(ValueError):
        registry.add_sample(preset_id, "x.wav")


# ── delete_sample ────────────────────────────────────────────────────────────────

def test_khong_cho_xoa_sample_ao_duy_nhat(registry):
    """Voice CHƯA convert (chỉ có sample ảo suy từ ref_file) — vẫn phải chặn xoá đúng như
    voice đã convert, không được để lọt qua vì 'chưa thấy trong samples[]'."""
    v = registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="only.wav")
    sample_id = registry.list_samples(v["id"])[0]["id"]
    ok, reason = registry.delete_sample(sample_id)
    assert (ok, reason) == (False, "last_sample")


def test_khong_cho_xoa_sample_cuoi_cung_sau_convert(registry):
    v = registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="a.wav")
    registry.add_sample(v["id"], "b.wav")
    samples = registry.list_samples(v["id"])
    registry.delete_sample(samples[1]["id"])  # xoá còn 1 -> OK

    ok, reason = registry.delete_sample(samples[0]["id"])
    assert (ok, reason) == (False, "last_sample")


def test_xoa_sample_khong_ton_tai(registry):
    ok, reason = registry.delete_sample("khong-co")
    assert (ok, reason) == (False, "not_found")


def test_xoa_1_trong_2_sample_thanh_cong(registry):
    v = registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="a.wav")
    sample_b = registry.add_sample(v["id"], "b.wav")

    ok, reason = registry.delete_sample(sample_b["id"])
    assert (ok, reason) == (True, "")
    assert [s["ref_file"] for s in registry.list_samples(v["id"])] == ["a.wav"]


# ── set_ref_text — sửa sample đầu tiên ──────────────────────────────────────────

def test_set_ref_text_voice_chua_convert(registry):
    v = registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="x.wav")
    registry.set_ref_text(v["id"], "  Nội dung mới  ")
    assert registry.list_samples(v["id"])[0]["ref_text"] == "Nội dung mới"


def test_set_ref_text_voice_da_convert_sua_sample_dau(registry):
    v = registry.add_cloned(
        label="Test", gender="female", region="Bắc", ref_file="a.wav",
        extra={"ref_text": "Cũ"},
    )
    registry.add_sample(v["id"], "b.wav", "Mẫu 2 giữ nguyên")

    registry.set_ref_text(v["id"], "Mới")

    samples = registry.list_samples(v["id"])
    assert samples[0]["ref_text"] == "Mới"
    assert samples[1]["ref_text"] == "Mẫu 2 giữ nguyên"  # không bị đụng vào


def test_set_ref_text_chuoi_rong_xoa_field(registry):
    v = registry.add_cloned(
        label="Test", gender="female", region="Bắc", ref_file="x.wav",
        extra={"ref_text": "Có sẵn"},
    )
    assert registry.set_ref_text(v["id"], "") is True
    assert "ref_text" not in registry.list_samples(v["id"])[0]


def test_set_ref_text_khong_ton_tai_tra_false(registry):
    assert registry.set_ref_text("khong-co", "x") is False


# ── add_cloned / delete_cloned / find_by_source_catalog_id / get_ref_path ──────

def test_add_cloned_id_tu_sinh(registry):
    v = registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="x.wav")
    assert v["id"].startswith("clone-")


def test_delete_cloned_don_file_sample_duy_nhat(registry, tmp_path):
    ref = tmp_path / "x.wav"
    _write_wav(ref)
    (tmp_path / "x.txt").write_text("transcript", encoding="utf-8")

    v = registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="x.wav")
    ok, reason = registry.delete_cloned(v["id"])

    assert (ok, reason) == (True, "")
    assert not ref.exists()
    assert not (tmp_path / "x.txt").exists()


def test_get_ref_path_tra_sample_dau_tien(registry, tmp_path):
    v = registry.add_cloned(label="Test", gender="female", region="Bắc", ref_file="x.wav")
    assert registry.get_ref_path(v["id"]) == tmp_path / "x.wav"


def test_find_by_source_catalog_id(registry):
    registry.add_cloned(
        label="Test", gender="female", region="Bắc", ref_file="x.wav",
        extra={"source_catalog_id": "gia_bao"},
    )
    found = registry.find_by_source_catalog_id("gia_bao")
    assert found is not None and found["source_catalog_id"] == "gia_bao"
