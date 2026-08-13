"""Test phần THUẦN LOGIC của engine_qwen.py — không nạp model thật.

Nạp model Qwen3-TTS cần torch + GPU CUDA (chưa xác nhận chạy ổn định trên CPU, xem
docstring engine_qwen.py) và tải vài GB — không khả thi test tự động trong CI/máy dev
không có CUDA. Chỉ test được phần không đụng model: đoán ngôn ngữ theo Unicode script,
override qua `overrides.language`, và đọc file transcript cạnh ref audio.
"""
from pathlib import Path

from engine_qwen import SUPPORTED_LANGUAGES, _guess_language, _ref_text_for, _resolve_language


def test_doan_ngon_ngu_theo_script_rieng():
    assert _guess_language("你好世界") == "Chinese"
    assert _guess_language("こんにちは") == "Japanese"
    assert _guess_language("안녕하세요") == "Korean"
    assert _guess_language("Привет мир") == "Russian"


def test_chu_latin_roi_ve_english_khong_phan_biet_duoc():
    """Hạn chế đã biết: en/de/fr/pt/es/it đều là chữ Latin, heuristic không phân biệt
    được — đây là hành vi CHỦ Ý (xem docstring _guess_language), không phải bug."""
    for text in ["Hello world", "Bonjour le monde", "Guten Tag", "Ciao mondo"]:
        assert _guess_language(text) == "English"


def test_resolve_language_uu_tien_override_hop_le():
    assert _resolve_language("Bonjour", {"language": "French"}) == "French"


def test_resolve_language_bo_qua_override_khong_hop_le():
    assert _resolve_language("Bonjour", {"language": "Klingon"}) == "English"


def test_resolve_language_khong_co_override_dung_heuristic():
    assert _resolve_language("Привет", None) == "Russian"
    assert _resolve_language("Привет", {}) == "Russian"


def test_moi_ngon_ngu_ho_tro_deu_hop_le_cho_override():
    for lang in SUPPORTED_LANGUAGES:
        assert _resolve_language("text bất kỳ", {"language": lang}) == lang


def test_ref_text_doc_duoc_file_txt_cung_ten(tmp_path: Path):
    wav = tmp_path / "giong-mau.wav"
    wav.write_bytes(b"RIFF....WAVEfmt ")
    (tmp_path / "giong-mau.txt").write_text("  Xin chào, đây là bản chép lời.  ", encoding="utf-8")

    assert _ref_text_for(str(wav)) == "Xin chào, đây là bản chép lời."


def test_ref_text_tra_none_khi_khong_co_file_txt(tmp_path: Path):
    wav = tmp_path / "khong-co-transcript.wav"
    wav.write_bytes(b"RIFF....WAVEfmt ")

    assert _ref_text_for(str(wav)) is None


def test_ref_text_tra_none_khi_file_txt_rong(tmp_path: Path):
    wav = tmp_path / "transcript-rong.wav"
    wav.write_bytes(b"RIFF....WAVEfmt ")
    (tmp_path / "transcript-rong.txt").write_text("   ", encoding="utf-8")

    assert _ref_text_for(str(wav)) is None
