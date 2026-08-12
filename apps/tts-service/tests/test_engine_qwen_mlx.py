"""Test phần THUẦN LOGIC của engine_qwen_mlx.py — không nạp model thật.

Nạp model qua mlx-audio cần package `mlx` (chỉ cài được trên Apple Silicon) — CI/máy
không phải Mac không chạy được. Chỉ test được phần không đụng model: đoán lang_code,
override, đọc transcript. Phần nạp model thật + generate() ĐÃ verify thủ công trên máy
Apple Silicon thật (xem docs/dev/history/2026-08-11-them-mlx-cho-qwen.md) — không lặp lại
tự động ở đây vì cần tải model vài GB, không phù hợp chạy trong test suite thường xuyên.
"""
from pathlib import Path

import numpy as np
import pytest

from engine_qwen import SUPPORTED_LANGUAGES
from engine_qwen_mlx import QwenMlxEngine, _guess_lang_code, _ref_text_for, _resolve_lang_code


class _FakeResult:
    def __init__(self, n: int, sample_rate: int = 24_000):
        self.audio = np.full(n, 0.2, dtype=np.float32)
        self.sample_rate = sample_rate


class _FakeModel:
    """Đủ để `_run()` chạy: ghi lại kwargs đã nhận rồi trả 1 đoạn audio sạch."""

    def __init__(self):
        self.calls: list[dict] = []

    def generate(self, text, **kwargs):
        self.calls.append({"text": text, **kwargs})
        yield _FakeResult(24_000)


def _engine_with_fake_model() -> QwenMlxEngine:
    """Dựng engine KHÔNG chạy __init__ — __init__ nạp model MLX vài GB (chỉ có trên
    Apple Silicon, cần tải trước). Ở đây chỉ test phần logic quanh lời gọi generate()."""
    eng = object.__new__(QwenMlxEngine)
    eng.engine_id = "qwen-1.7b"
    eng.label = "Qwen3-TTS 1.7B"
    eng._model = _FakeModel()
    return eng


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


def test_encode_reference_uu_tien_registry_hon_sidecar(tmp_path: Path):
    """ref_text từ registry thắng file .txt: registry sửa được qua API/UI và sống sót
    khi voice bị import lại, sidecar chỉ đặt được bằng tay."""
    wav = tmp_path / "g.wav"
    wav.write_bytes(b"RIFF....WAVEfmt ")
    (tmp_path / "g.txt").write_text("từ sidecar", encoding="utf-8")

    eng = _engine_with_fake_model()
    assert eng.encode_reference(str(wav), "từ registry")["ref_text"] == "từ registry"
    assert eng.encode_reference(str(wav), "   ")["ref_text"] == "từ sidecar"
    assert eng.encode_reference(str(wav))["ref_text"] == "từ sidecar"


# ── Chặn ICL khi thiếu transcript (bug gốc 2026-08-11) ────────────────────────

@pytest.mark.parametrize("empty", ["", "   ", None])
def test_ref_text_rong_bao_loi_thay_vi_sinh_audio_rac(tmp_path: Path, empty):
    """mlx-audio bật ICL khi `ref_text is not None` — chuỗi rỗng KHÔNG phải None nên
    ICL vẫn chạy nhưng với transcript trống, làm vỡ alignment text↔codec và cho ra
    audio hỏng hoàn toàn. Phải chặn với thông báo đọc được, không im lặng sinh rác."""
    wav = tmp_path / "ref.wav"
    wav.write_bytes(b"RIFF....WAVEfmt ")

    eng = _engine_with_fake_model()
    with pytest.raises(RuntimeError, match="bản chép lời"):
        eng._run("Xin chào", {"wav_path": str(wav), "ref_text": empty}, None)

    assert eng._model.calls == [], "không được gọi generate() khi thiếu transcript"


def test_co_ref_text_thi_truyen_xuong_generate(tmp_path: Path):
    wav = tmp_path / "ref.wav"
    wav.write_bytes(b"RIFF....WAVEfmt ")

    eng = _engine_with_fake_model()
    eng._run("Xin chào", {"wav_path": str(wav), "ref_text": "Bản chép lời."}, None)

    call = eng._model.calls[0]
    assert call["ref_text"] == "Bản chép lời."
    assert call["ref_audio"] == str(wav)


def test_ref_audio_khong_ton_tai_bao_loi_ro(tmp_path: Path):
    eng = _engine_with_fake_model()
    with pytest.raises(RuntimeError, match="không tồn tại"):
        eng._run("Xin chào", {"wav_path": str(tmp_path / "mat-tieu.wav"), "ref_text": "x"}, None)


# ── Cap max_tokens (chặn runaway sau khi mlx-audio 0.4.8 gỡ cap của lib) ──────

def _call_with(eng: QwenMlxEngine, tmp_path: Path, text: str, overrides=None) -> dict:
    wav = tmp_path / "ref.wav"
    wav.write_bytes(b"RIFF....WAVEfmt ")
    eng._run(text, {"wav_path": str(wav), "ref_text": "Bản chép lời."}, overrides)
    return eng._model.calls[0]


def test_max_tokens_luon_duoc_cap(tmp_path: Path):
    """Không cap thì mỗi lần miss EOS là sinh trọn 4096 token ≈ 5,5 phút audio ảo giác."""
    eng = _engine_with_fake_model()
    call = _call_with(eng, tmp_path, "Xin chào các bạn.")
    assert "max_tokens" in call
    assert call["max_tokens"] < 4096


def test_max_tokens_co_san_toi_thieu_cho_text_ngan(tmp_path: Path):
    """Text cực ngắn vẫn cần đủ token để nói hết — sàn 75 theo mlx-audio 0.4.1."""
    eng = _engine_with_fake_model()
    assert _call_with(eng, tmp_path, "A")["max_tokens"] >= 75


def test_max_tokens_tang_theo_do_dai_text(tmp_path: Path):
    short = _call_with(_engine_with_fake_model(), tmp_path, "Xin chào.")["max_tokens"]
    long = _call_with(_engine_with_fake_model(), tmp_path, "Xin chào. " * 40)["max_tokens"]
    assert long > short


# ── Sampling params: chỉ nhận từ engine_overrides ─────────────────────────────

def test_sampling_params_tu_overrides_duoc_truyen_xuong(tmp_path: Path):
    eng = _engine_with_fake_model()
    call = _call_with(eng, tmp_path, "Xin chào", {
        "temperature": 0.3, "top_k": 20, "top_p": 0.9, "repetition_penalty": 1.5,
    })
    assert (call["temperature"], call["top_k"]) == (0.3, 20)
    assert (call["top_p"], call["repetition_penalty"]) == (0.9, 1.5)


def test_khong_override_thi_giu_mac_dinh_cua_lib(tmp_path: Path):
    """Không set thì KHÔNG truyền key nào — để mlx-audio dùng default của nó
    (0.9/50/1.0/1.05), không phải giá trị tuned cho VieNeu."""
    call = _call_with(_engine_with_fake_model(), tmp_path, "Xin chào", None)
    for key in ("temperature", "top_k", "top_p", "repetition_penalty"):
        assert key not in call


def test_key_la_trong_overrides_bi_bo_qua(tmp_path: Path):
    """`max_new_frames` là khái niệm của VieNeu/MOSS, không phải của Qwen — lọt xuống
    generate() sẽ thành TypeError."""
    call = _call_with(_engine_with_fake_model(), tmp_path, "Xin chào",
                      {"max_new_frames": 300, "emotion": "happy"})
    assert "max_new_frames" not in call and "emotion" not in call


def test_sample_rate_giu_nguyen_24khz_goc_cua_model():
    """Qwen3-TTS-12Hz giải mã ra 24kHz. Trước đây bị ép lên 48kHz (hằng của VieNeu) —
    upsample 2× không thêm thông tin mà bắt mọi bước sau xử lý gấp đôi số mẫu."""
    eng = _engine_with_fake_model()
    assert eng.SAMPLE_RATE == 24_000
    assert eng.capabilities()["sample_rate"] == 24_000


def test_post_process_chay_o_tan_so_cua_engine(tmp_path: Path):
    """Đuôi im lặng phải tính theo 24kHz, không phải 48kHz — tính nhầm thì đuôi dài gấp
    đôi và mọi ước lượng thời lượng phía client đều lệch."""
    from engine import TRAILING_SILENCE_S

    eng = _engine_with_fake_model()
    out = eng._post_process(np.zeros(24_000, dtype=np.float32), 1.0)
    assert out.size == 24_000 + int(24_000 * TRAILING_SILENCE_S)


def test_capabilities_khai_requires_ref_text_va_khong_khai_sampling_params():
    """Hai khai báo này là hợp đồng với main.py: `requires_ref_text` để chặn ngay lúc
    clone, và KHÔNG có `sampling_params` để khối `infer` global (tuning VieNeu, top_k=5)
    không rót vào Qwen."""
    caps = _engine_with_fake_model().capabilities()
    assert caps["requires_ref_text"] is True
    assert not caps.get("sampling_params")
