"""Test logic thuần của engine_registry.py — file này có ~500 dòng logic không phụ thuộc
model/mạng nhưng trước STT (2026-08-14) chưa có test riêng nào (chỉ được kiểm gián tiếp qua
test_engine_cache.py's monkeypatch của create_engine).
"""
import engine_registry as er


# ── engine_category ─────────────────────────────────────────────────────────

def test_category_mac_dinh_tts_cho_engine_khong_khai():
    assert er.engine_category("vieneu") == "tts"
    assert er.engine_category("moss-tts-nano") == "tts"


def test_category_stt_cho_whisper():
    assert er.engine_category("whisper-base") == "stt"


def test_category_mac_dinh_tts_cho_id_khong_ton_tai():
    """Có chủ đích (xem docstring engine_category) — nhưng caller cần engine_exists() nếu
    muốn phân biệt "id lạ" với "entry quên khai category", xem test bên dưới."""
    assert er.engine_category("khong-ton-tai") == "tts"


# ── engine_exists ────────────────────────────────────────────────────────────

def test_engine_exists_dung_cho_id_that():
    assert er.engine_exists("vieneu") is True
    assert er.engine_exists("whisper-base") is True


def test_engine_exists_sai_cho_id_la():
    assert er.engine_exists("khong-ton-tai") is False


# ── engine_runtime_kind ──────────────────────────────────────────────────────

def test_runtime_kind_dung_khai_bao():
    assert er.engine_runtime_kind("vieneu") == "onnx-bundled"
    assert er.engine_runtime_kind("moss-tts-nano") == "onnx-ext"
    assert er.engine_runtime_kind("whisper-base") == "onnx-ext"


# ── engine_dir_name — bug thật 2026-08-11 (dấu chấm trong engine_id) ──────────

def test_dir_name_giu_nguyen_id_khong_ky_tu_dac_biet():
    assert er.engine_dir_name("whisper-base") == "whisper-base"
    assert er.engine_dir_name("moss-tts-nano") == "moss-tts-nano"


def test_dir_name_thay_dau_cham_bang_gach_duoi():
    assert er.engine_dir_name("qwen-0.6b") == "qwen-0_6b"
    assert er.engine_dir_name("qwen-1.7b") == "qwen-1_7b"


def test_dir_name_thay_moi_ky_tu_khong_an_toan():
    assert er.engine_dir_name("a/b c.d") == "a_b_c_d"


# ── list_engines — xác nhận whisper-base xuất hiện đúng hình dạng ─────────────

def test_list_engines_co_whisper_dung_category_va_khong_bundled():
    engines = {e["id"]: e for e in er.list_engines()}
    assert "whisper-base" in engines
    w = engines["whisper-base"]
    assert w["category"] == "stt"
    assert w["bundled"] is False
    assert w["runtime_kind"] == "onnx-ext"
    assert w["install"]["model"]["repo"] == "csukuangfj/sherpa-onnx-whisper-base"
    # Chỉ tải file int8 — không tải nguyên repo (fp32 + int8 ~453MB, chỉ dùng int8 ~161MB).
    assert set(w["install"]["model"]["files"]) == {
        "base-encoder.int8.onnx", "base-decoder.int8.onnx", "base-tokens.txt",
    }


def test_list_engines_khong_bi_vo_khi_them_whisper():
    """Regression đơn giản — thêm entry mới không được làm hỏng engine cũ."""
    engines = {e["id"]: e for e in er.list_engines()}
    assert engines["vieneu"]["category"] == "tts"
    assert engines["vieneu"]["bundled"] is True
