"""Test 3 hàm DSP phục vụ chất lượng clone: trim_silence, preprocess_reference_audio,
has_tts_runaway (audio_dsp.py).

Port từ voicebox's `backend/tests/test_audio_preprocess.py` +
`backend/tests/test_qwen_runaway_retry.py` (/Users/skyline/TEST/voicebox-main) — giữ
nguyên các contract đã được kiểm chứng production, kể cả các con số cụ thể, vì chúng mã
hoá đúng những bug đã xảy ra thật ở bên đó.

Khác bản gốc: sky-app không có librosa (xem docstring audio_dsp.py) nên `trim_silence`
là bản viết lại bằng numpy — các test dưới đây chính là thứ chứng minh nó tương đương
`librosa.effects.trim` ở những điểm mà pipeline thật sự phụ thuộc vào.
"""
import numpy as np

from audio_dsp import has_tts_runaway, preprocess_reference_audio, trim_silence

SR = 24_000


def _tone(seconds: float, amplitude: float = 0.5, freq: float = 220.0,
          sample_rate: int = SR) -> np.ndarray:
    t = np.linspace(0.0, seconds, int(sample_rate * seconds), endpoint=False)
    return (amplitude * np.sin(2 * np.pi * freq * t)).astype(np.float32)


# ── preprocess_reference_audio ────────────────────────────────────────────────

def test_ha_dinh_khi_input_qua_nong():
    """Bản ghi hơi quá mức KHÔNG bị loại — hạ đỉnh về 0.95 rồi dùng tiếp."""
    out = preprocess_reference_audio(_tone(1.0, amplitude=0.99), SR)
    assert float(np.abs(out).max()) <= 0.951


def test_khong_dung_toi_input_o_muc_vua():
    """Cap là CÓ ĐIỀU KIỆN, không phải normalize vô điều kiện — biên độ 0.5 giữ nguyên
    0.5, không bị kéo lên 0.95 (kéo lên sẽ khuếch đại cả nhiễu nền)."""
    out = preprocess_reference_audio(_tone(1.0, amplitude=0.5), SR)
    assert float(np.abs(out).max()) == pytest_approx(0.5)


def test_bo_dc_offset():
    audio = _tone(1.0, amplitude=0.3) + 0.1
    out = preprocess_reference_audio(audio, SR)
    assert abs(float(np.mean(out))) < 1e-3


def test_cat_im_lang_nhung_giu_lai_dem():
    audio = np.concatenate([
        np.zeros(SR, dtype=np.float32), _tone(3.0), np.zeros(SR, dtype=np.float32),
    ])
    out = preprocess_reference_audio(audio, SR)
    assert out.size <= audio.size - SR      # cắt được ít nhất 1 giây im lặng
    assert out.size >= int(3.0 * SR)        # nhưng không đụng vào phần có tiếng


def test_khong_bao_gio_dem_vuot_do_dai_goc():
    """Regression quan trọng nhất của hàm này: audio SẠCH (không có gì để cắt) phải trả
    về đúng độ dài cũ. Nếu chèn đệm vô điều kiện, file dài gần chạm trần thời lượng sẽ
    bị đẩy vượt ngưỡng rồi bị từ chối oan là 'quá dài'."""
    audio = _tone(2.0)
    assert preprocess_reference_audio(audio, SR).size <= audio.size


def test_input_rong_tra_ve_rong():
    assert preprocess_reference_audio(np.array([], dtype=np.float32), SR).size == 0


def test_toan_im_lang_khong_crash():
    """Không có 'đầu/cuối' nào để cắt cho có nghĩa — phải trả về gọn gàng, để tầng
    validate phía trên bắt bằng ngưỡng RMS (thông báo 'quá nhỏ tiếng' dễ hiểu hơn hẳn
    một mảng rỗng không giải thích được)."""
    out = preprocess_reference_audio(np.zeros(SR, dtype=np.float32), SR)
    assert float(np.sqrt(np.mean(out ** 2))) < 0.01


# ── trim_silence ──────────────────────────────────────────────────────────────

def test_trim_cat_ca_hai_dau():
    audio = np.concatenate([
        np.zeros(SR // 2, dtype=np.float32), _tone(1.0), np.zeros(SR // 2, dtype=np.float32),
    ])
    out = trim_silence(audio, SR)
    assert out.size < audio.size
    assert out.size >= int(0.9 * SR)  # giữ gần trọn phần có tiếng


def test_trim_giu_nguyen_khi_khong_co_im_lang():
    audio = _tone(1.0)
    assert trim_silence(audio, SR).size == audio.size


def test_trim_giu_am_tiet_cuoi_phat_nhe():
    """top_db=40 (không phải 60 của librosa) là để đoạn cuối phát nhẹ không bị cắt —
    dynamic range giọng nói thường ~30dB nên 40dB nằm dưới ngưỡng đó."""
    quiet_tail = _tone(0.5, amplitude=0.5 * (10 ** (-25 / 20)))  # nhẹ hơn 25dB
    audio = np.concatenate([_tone(1.0), quiet_tail])
    assert trim_silence(audio, SR).size >= audio.size - int(0.05 * SR)


# ── has_tts_runaway ───────────────────────────────────────────────────────────

def test_phat_hien_im_lang_dai_o_giua():
    """Đúng dạng model miss EOS: nói xong, lặng dài, rồi lại phát ra tiếng."""
    audio = np.concatenate([
        np.full(2 * SR, 0.2, dtype=np.float32),      # tiếng nói
        np.zeros(int(2.5 * SR), dtype=np.float32),   # 2,5s > ngưỡng 2s
        np.full(2 * SR, 0.8, dtype=np.float32),      # phần ảo giác
    ])
    assert has_tts_runaway(audio, SR) is True


def test_khong_bao_dong_voi_ngat_nghi_binh_thuong():
    audio = np.concatenate([
        np.full(2 * SR, 0.2, dtype=np.float32),
        np.zeros(int(1.2 * SR), dtype=np.float32),   # 1,2s — ngắt câu bình thường
        np.full(2 * SR, 0.2, dtype=np.float32),
    ])
    assert has_tts_runaway(audio, SR) is False


def test_im_lang_cuoi_khong_tinh_la_runaway():
    """Im lặng KHÔNG bị kẹp giữa hai đoạn có tiếng thì không phải bất thường — nếu
    không, đuôi im lặng 200ms mà _post_process luôn nối vào sẽ bị báo động nhầm ở mọi
    lần sinh audio."""
    audio = np.concatenate([
        np.full(2 * SR, 0.2, dtype=np.float32), np.zeros(2 * SR, dtype=np.float32),
    ])
    assert has_tts_runaway(audio, SR) is False


def test_im_lang_dau_khong_tinh_la_runaway():
    audio = np.concatenate([
        np.zeros(2 * SR, dtype=np.float32), np.full(2 * SR, 0.2, dtype=np.float32),
    ])
    assert has_tts_runaway(audio, SR) is False


def test_audio_qua_ngan_khong_crash():
    assert has_tts_runaway(np.zeros(3, dtype=np.float32), SR) is False


def pytest_approx(value: float, tol: float = 1e-3):
    """Bọc mỏng quanh pytest.approx để import gọn ở đầu file (chỉ dùng 1 chỗ)."""
    import pytest
    return pytest.approx(value, abs=tol)
