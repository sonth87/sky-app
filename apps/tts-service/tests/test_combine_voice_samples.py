"""Test combine_voice_samples() — port từ voicebox's combine_voice_prompts
(backends/base.py:203-231, /Users/skyline/TEST/voicebox-main).
"""
import numpy as np
import pytest
import soundfile as sf

from audio_dsp import combine_voice_samples

SR = 24_000


def _write_tone(path, seconds, amplitude, sr=SR, freq=220.0):
    t = np.linspace(0.0, seconds, int(sr * seconds), endpoint=False)
    tone = (amplitude * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    sf.write(str(path), tone, sr)
    return tone


def test_do_dai_bang_tong_cac_clip(tmp_path):
    p1 = tmp_path / "a.wav"
    p2 = tmp_path / "b.wav"
    _write_tone(p1, 1.0, 0.5)
    _write_tone(p2, 2.0, 0.5)
    out = combine_voice_samples([p1, p2], SR)
    assert out.size == 3 * SR


def test_can_bang_muc_giua_cac_clip_lech_nhau(tmp_path):
    """Đây là điểm khác biệt với 'nối rồi chuẩn hoá 1 lần': mỗi clip được san bằng RIÊNG
    trước khi nối, nên clip to không áp đảo clip nhỏ trong bản ghép cuối."""
    loud = tmp_path / "loud.wav"
    quiet = tmp_path / "quiet.wav"
    _write_tone(loud, 1.0, 0.9)
    _write_tone(quiet, 1.0, 0.1)

    out = combine_voice_samples([loud, quiet], SR)
    half = out.size // 2
    rms_first = float(np.sqrt(np.mean(out[:half] ** 2)))
    rms_second = float(np.sqrt(np.mean(out[half:] ** 2)))
    assert abs(rms_first - rms_second) < 0.01


def test_resample_ve_dung_tan_so_engine(tmp_path):
    """File mẫu có thể ở sample rate khác engine (vd người dùng upload WAV 48kHz cho Qwen
    24kHz) — phải resample TRƯỚC khi chuẩn hoá, không phải sau."""
    p1 = tmp_path / "48k.wav"
    p2 = tmp_path / "24k.wav"
    _write_tone(p1, 1.0, 0.5, sr=48_000)
    _write_tone(p2, 1.0, 0.5, sr=24_000)

    out = combine_voice_samples([p1, p2], SR)
    # Cả 2 clip resample về 24kHz rồi mới nối — tổng đúng 2s @ SR, không phải lệch vì 1
    # clip còn ở 48kHz (sẽ ra 3s nếu quên resample).
    assert abs(out.size - 2 * SR) <= 2  # dung sai làm tròn resample


def test_stereo_duoc_gop_ve_mono(tmp_path):
    p = tmp_path / "stereo.wav"
    t = np.linspace(0, 1, SR, endpoint=False)
    stereo = np.stack([0.3 * np.sin(2 * np.pi * 220 * t), 0.3 * np.sin(2 * np.pi * 220 * t)], axis=1)
    sf.write(str(p), stereo.astype(np.float32), SR)
    p2 = tmp_path / "mono.wav"
    _write_tone(p2, 1.0, 0.3)

    out = combine_voice_samples([p, p2], SR)
    assert out.ndim == 1
    assert out.size == 2 * SR
