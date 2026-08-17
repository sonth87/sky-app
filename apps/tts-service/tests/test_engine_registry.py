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


# ── 4 size Whisper thêm 2026-08-15 — cùng code (WhisperOnnxEngine(size)), khác repo/file ────

import pytest


@pytest.mark.parametrize("size,repo,total_mb", [
    ("small", "csukuangfj/sherpa-onnx-whisper-small", 375),
    ("medium", "csukuangfj/sherpa-onnx-whisper-medium", 946),
    ("large-v3", "csukuangfj/sherpa-onnx-whisper-large-v3", 1778),
    ("turbo", "csukuangfj/sherpa-onnx-whisper-turbo", 1037),
])
def test_moi_size_whisper_dung_hinh_dang(size, repo, total_mb):
    engine_id = f"whisper-{size}"
    engines = {e["id"]: e for e in er.list_engines()}
    assert engine_id in engines
    w = engines[engine_id]
    assert w["category"] == "stt"
    assert w["bundled"] is False
    assert w["runtime_kind"] == "onnx-ext"
    assert w["install"]["model"]["repo"] == repo
    assert w["install"]["model"]["total_mb"] == total_mb
    # Cùng quy ước đặt tên file với whisper-base: "{size}-encoder/decoder.int8.onnx" +
    # "{size}-tokens.txt" — sai tên ở đây là _model_dir() không tìm được file lúc chạy thật.
    assert set(w["install"]["model"]["files"]) == {
        f"{size}-encoder.int8.onnx", f"{size}-decoder.int8.onnx", f"{size}-tokens.txt",
    }


@pytest.mark.parametrize("size", ["small", "medium", "large-v3", "turbo"])
def test_moi_size_whisper_co_factory_rieng(size):
    """Mỗi size phải có factory RIÊNG trong _ENGINES (không phải trỏ nhầm chung 1 factory
    của size khác) — kiểm bằng cách gọi factory và xác nhận engine_id truyền vào constructor
    đúng size, không cần model thật (patch WhisperOnnxEngine)."""
    import unittest.mock as mock

    captured = {}

    def fake_ctor(self, size_arg):
        captured["size"] = size_arg

    with mock.patch("engine_whisper_onnx.WhisperOnnxEngine.__init__", fake_ctor):
        er.create_engine(f"whisper-{size}")
    assert captured["size"] == size
