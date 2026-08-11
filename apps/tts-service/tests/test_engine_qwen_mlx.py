"""Test phần THUẦN LOGIC của engine_qwen_mlx.py — không nạp model thật.

Nạp model qua mlx-audio cần package `mlx` (chỉ cài được trên Apple Silicon) — CI/máy
không phải Mac không chạy được. Chỉ test được phần không đụng model: đoán lang_code,
override, đọc transcript. Phần nạp model thật + generate() ĐÃ verify thủ công trên máy
Apple Silicon thật (xem docs/dev/history/2026-08-11-them-mlx-cho-qwen.md) — không lặp lại
tự động ở đây vì cần tải model vài GB, không phù hợp chạy trong test suite thường xuyên.
"""
from pathlib import Path

from engine_qwen import SUPPORTED_LANGUAGES
from engine_qwen_mlx import _guess_lang_code, _ref_text_for, _resolve_lang_code


def test_doan_lang_code_theo_script_rieng():
    assert _guess_lang_code("你好世界") == "Chinese"
    assert _guess_lang_code("こんにちは") == "Japanese"
    assert _guess_lang_code("안녕하세요") == "Korean"
    assert _guess_lang_code("Привет мир") == "Russian"


def test_chu_latin_fallback_ve_auto_khong_phai_english():
    """Khác engine_qwen.py (torch, fallback 'English'): mlx-audio hỗ trợ 'auto' thật
    (xác nhận qua code voicebox VÀ chạy thử thật — generate() mặc định lang_code='auto'),
    nên KHÔNG cần ép "English" như bên torch phải làm vì thiếu bằng chứng."""
    for text in ["Hello world", "Bonjour le monde", "Guten Tag", "Ciao mondo"]:
        assert _guess_lang_code(text) == "auto"


def test_resolve_lang_code_uu_tien_override_hop_le():
    assert _resolve_lang_code("Bonjour", {"language": "French"}) == "French"


def test_resolve_lang_code_bo_qua_override_khong_hop_le():
    assert _resolve_lang_code("你好", {"language": "Klingon"}) == "Chinese"


def test_resolve_lang_code_khong_co_override_dung_heuristic():
    assert _resolve_lang_code("Привет", None) == "Russian"
    assert _resolve_lang_code("Hello", {}) == "auto"


def test_moi_ngon_ngu_ho_tro_deu_hop_le_cho_override():
    for lang in SUPPORTED_LANGUAGES:
        assert _resolve_lang_code("text bất kỳ", {"language": lang}) == lang


def test_ref_text_doc_duoc_file_txt_cung_ten(tmp_path: Path):
    wav = tmp_path / "giong-mau.wav"
    wav.write_bytes(b"RIFF....WAVEfmt ")
    (tmp_path / "giong-mau.txt").write_text("Bản chép lời mẫu.", encoding="utf-8")

    assert _ref_text_for(str(wav)) == "Bản chép lời mẫu."


def test_ref_text_tra_none_khi_khong_co_file_txt(tmp_path: Path):
    wav = tmp_path / "khong-co-transcript.wav"
    wav.write_bytes(b"RIFF....WAVEfmt ")

    assert _ref_text_for(str(wav)) is None
