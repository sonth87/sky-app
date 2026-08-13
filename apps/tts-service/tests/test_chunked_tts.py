"""Test chunked_tts.py — cắt đoạn, nối crossfade, phát hiện + thử lại runaway.

Port từ voicebox's `backend/tests/test_qwen_runaway_retry.py`
(/Users/skyline/TEST/voicebox-main). Giữ nguyên các con số cụ thể của bản gốc (chuỗi
gọi, độ dài audio, thang chia nhỏ) vì chúng mã hoá chính xác hành vi đã chạy production
— đổi số là đổi hành vi mà không nhận ra.

SAMPLE_RATE=1000 là tốc độ giả: bộ phát hiện runaway làm việc theo TỈ LỆ (ms/khung) nên
không phụ thuộc tốc độ thật, dùng số nhỏ cho test chạy nhanh và số mẫu dễ tính nhẩm.
"""
import numpy as np
import pytest

from audio_dsp import has_tts_runaway
from chunked_tts import (
    MAX_RUNAWAY_RETRIES,
    MIN_RUNAWAY_RETRY_CHARS,
    concatenate_audio_chunks,
    generate_chunked,
    split_text_into_chunks,
)

SAMPLE_RATE = 1000


# ── Cắt đoạn ──────────────────────────────────────────────────────────────────

def test_text_ngan_khong_bi_cat():
    assert split_text_into_chunks("Xin chào.", 800) == ["Xin chào."]


def test_text_rong_tra_ve_list_rong():
    assert split_text_into_chunks("   ", 800) == []


def test_cat_tai_ranh_gioi_cau():
    text = f"{'A' * 50}. {'B' * 50}. {'C' * 50}."
    chunks = split_text_into_chunks(text, 60)
    assert all(c.endswith(".") for c in chunks)
    assert "".join(c.replace(" ", "") for c in chunks) == text.replace(" ", "")


def test_khong_cat_sau_viet_tat_tieng_viet():
    """'GS.' / 'TP.' không phải hết câu — cắt ở đó là xẻ đôi tên người/địa danh.
    Đây là phần thêm cho tiếng Việt, danh sách gốc của voicebox chỉ có tiếng Anh."""
    for abbr in ("GS", "PGS", "TS", "ThS", "TP", "NXB", "ĐH"):
        text = f"Kính mời {abbr}. Nguyễn Văn A lên nhận bằng tốt nghiệp hôm nay."
        chunks = split_text_into_chunks(text, 40)
        assert not any(c.endswith(f"{abbr}.") for c in chunks), f"cắt nhầm sau {abbr}."


def test_khong_cat_giua_so_thap_phan():
    text = f"Điểm trung bình là 3.75 {'x' * 60} và kết thúc."
    for chunk in split_text_into_chunks(text, 40):
        assert not chunk.endswith("3.")


def test_khong_cat_giua_the_vuong():
    text = f"{'a' * 55}[laugh]{'b' * 55}"
    for chunk in split_text_into_chunks(text, 60):
        assert chunk.count("[") == chunk.count("]")


def test_moi_doan_khong_vuot_gioi_han():
    text = "Câu văn tiếng Việt có dấu. " * 100
    assert all(len(c) <= 100 for c in split_text_into_chunks(text, 100))


# ── Nối crossfade ─────────────────────────────────────────────────────────────

def test_noi_hai_doan_tru_di_phan_crossfade():
    a = np.full(1000, 0.5, dtype=np.float32)
    b = np.full(1000, 0.5, dtype=np.float32)
    out = concatenate_audio_chunks([a, b], SAMPLE_RATE, crossfade_ms=50)
    assert out.size == 1000 + 1000 - 50  # 50ms @1000Hz = 50 mẫu chồng lấn


def test_mot_doan_giu_nguyen():
    a = np.full(100, 0.5, dtype=np.float32)
    assert concatenate_audio_chunks([a], SAMPLE_RATE).size == 100


def test_khong_co_doan_nao_tra_ve_rong():
    assert concatenate_audio_chunks([], SAMPLE_RATE).size == 0


# ── Sinh audio + thử lại runaway ──────────────────────────────────────────────

def _runaway_audio() -> np.ndarray:
    """`[tiếng nói][im lặng 2,5s][tiếng ảo giác]` — đúng dạng model bỏ lỡ EOS."""
    return np.concatenate([
        np.full(SAMPLE_RATE, 0.2, dtype=np.float32),
        np.zeros(2500, dtype=np.float32),
        np.full(SAMPLE_RATE, 0.8, dtype=np.float32),
    ])


def _clean_audio() -> np.ndarray:
    return np.full(SAMPLE_RATE, 0.2, dtype=np.float32)


def test_text_ngan_goi_thang_khong_qua_chunking():
    calls = []

    def fake(text):
        calls.append(text)
        return _clean_audio()

    generate_chunked(fake, "Xin chào.", SAMPLE_RATE, max_chunk_chars=800)
    assert calls == ["Xin chào."]


def test_doan_bi_runaway_duoc_chia_doi_thu_lai():
    """Chuỗi gọi và độ dài output đều bị chốt cứng — đây là test chặt nhất của bản gốc.

    241 ký tự ≤ 800 nên đi đường tắt trước; fake trả audio runaway; retry chia ở
    max(100, 241//2)=120 ký tự thành 2 câu; mỗi câu trả 1000 mẫu sạch; crossfade 50ms
    @1000Hz = 50 mẫu → 1000 + 1000 − 50 = 1950.
    """
    calls = []

    def fake(text):
        calls.append(text)
        return _runaway_audio() if len(text) > 200 else _clean_audio()

    text = f"{'A' * 119}. {'B' * 119}."
    audio = generate_chunked(
        fake, text, SAMPLE_RATE,
        max_chunk_chars=800, crossfade_ms=50, runaway_detector=has_tts_runaway,
    )

    assert calls == [text, f"{'A' * 119}.", f"{'B' * 119}."]
    assert audio.size == 1950


def test_runaway_dai_dang_bao_loi_thay_vi_tra_audio_hong():
    """Không bao giờ giao file rác cho người dùng. Thang [241, 120, 100] mã hoá
    MAX_RUNAWAY_RETRIES=2 và MIN_RUNAWAY_RETRY_CHARS=100: ở độ sâu 2, đoạn 120 ký tự
    chia còn 100 rồi dừng."""
    calls = []

    def always_runaway(text):
        calls.append(text)
        return _runaway_audio()

    text = f"{'A' * 119}. {'B' * 119}."
    with pytest.raises(RuntimeError, match="sau khi đã thử chia nhỏ"):
        generate_chunked(
            always_runaway, text, SAMPLE_RATE,
            max_chunk_chars=800, runaway_detector=has_tts_runaway,
        )

    assert [len(c) for c in calls] == [241, 120, 100]
    assert MAX_RUNAWAY_RETRIES == 2 and MIN_RUNAWAY_RETRY_CHARS == 100


def test_khong_co_detector_thi_audio_runaway_van_di_qua():
    """Engine không sinh tự hồi quy (VoxCPM) không truyền detector — phải giữ nguyên
    hành vi cũ, không báo động nhầm."""
    audio = generate_chunked(
        lambda t: _runaway_audio(), "Xin chào.", SAMPLE_RATE, runaway_detector=None,
    )
    assert audio.size == _runaway_audio().size
