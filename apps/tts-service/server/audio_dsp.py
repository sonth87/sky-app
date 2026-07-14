"""
audio_dsp.py — DSP thuần numpy cho hậu xử lý TTS (không thêm dependency).

Chỉ dùng numpy để KHÔNG tăng kích thước gói (venv/PyInstaller đang tối giản:
numpy + soxr + soundfile). Hai hàm chính:

  time_stretch_keep_pitch(x, rate)  — đổi TỐC ĐỘ giữ nguyên CAO ĐỘ (phase vocoder).
  rms_normalize(x, target_dbfs)     — cân âm lượng về mức RMS mục tiêu.

Phase vocoder ở đây đủ tốt cho giọng đọc nghi lễ (rate 0.5–1.5). Không phải chất
lượng studio như rubberband, nhưng tránh hẳn việc kéo pitch của resample thuần và
không cần binary ngoài.
"""
from __future__ import annotations

import numpy as np

_EPS = 1e-8


def _stft(x: np.ndarray, n_fft: int, hop: int, window: np.ndarray) -> np.ndarray:
    """STFT đơn giản, trả (n_frames, n_fft//2+1) phức."""
    n = len(x)
    if n < n_fft:
        x = np.pad(x, (0, n_fft - n))
        n = len(x)
    n_frames = 1 + (n - n_fft) // hop
    frames = np.empty((n_frames, n_fft // 2 + 1), dtype=np.complex64)
    for i in range(n_frames):
        start = i * hop
        seg = x[start:start + n_fft] * window
        frames[i] = np.fft.rfft(seg)
    return frames


def _istft(frames: np.ndarray, n_fft: int, hop: int, window: np.ndarray) -> np.ndarray:
    """Nghịch STFT với overlap-add + chuẩn hoá cửa sổ."""
    n_frames = frames.shape[0]
    out_len = n_fft + hop * (n_frames - 1)
    out = np.zeros(out_len, dtype=np.float32)
    wsum = np.zeros(out_len, dtype=np.float32)
    for i in range(n_frames):
        start = i * hop
        seg = np.fft.irfft(frames[i], n=n_fft).astype(np.float32)
        out[start:start + n_fft] += seg * window
        wsum[start:start + n_fft] += window ** 2
    nonzero = wsum > _EPS
    out[nonzero] /= wsum[nonzero]
    return out


def time_stretch_keep_pitch(x: np.ndarray, rate: float, n_fft: int = 1024, hop: int = 256) -> np.ndarray:
    """
    Đổi tốc độ theo `rate` (giữ cao độ) bằng phase vocoder.
      rate > 1.0 → NHANH hơn (audio NGẮN lại).
      rate < 1.0 → CHẬM hơn (audio DÀI ra).
    Trả float32. rate ~1.0 (±0.01) trả nguyên bản để tránh xử lý thừa.
    """
    x = np.asarray(x, dtype=np.float32).ravel()
    if abs(rate - 1.0) <= 0.01 or x.size < n_fft:
        return x

    window = np.hanning(n_fft).astype(np.float32)
    stft = _stft(x, n_fft, hop, window)
    n_frames, n_bins = stft.shape

    # Vị trí frame nguồn (thời gian) cần lấy mẫu lại theo rate.
    time_steps = np.arange(0, n_frames, rate, dtype=np.float64)
    mag = np.abs(stft)
    phase = np.angle(stft)

    # Chênh pha kỳ vọng mỗi hop cho từng bin.
    expected = 2.0 * np.pi * hop * np.arange(n_bins) / n_fft

    out_frames = np.empty((len(time_steps), n_bins), dtype=np.complex64)
    acc_phase = phase[0].copy()

    for idx, t in enumerate(time_steps):
        i = int(np.floor(t))
        frac = t - i
        i2 = min(i + 1, n_frames - 1)
        # Nội suy biên độ giữa 2 frame nguồn.
        m = (1.0 - frac) * mag[i] + frac * mag[i2]
        out_frames[idx] = m * np.exp(1j * acc_phase)
        # Cập nhật pha tích luỹ dùng phase advance đã "gói" về (-pi, pi].
        if i2 != i:
            dphi = phase[i2] - phase[i] - expected
            dphi = dphi - 2.0 * np.pi * np.round(dphi / (2.0 * np.pi))
            acc_phase = acc_phase + expected + dphi

    return _istft(out_frames, n_fft, hop, window)


def rms_normalize(x: np.ndarray, target_dbfs: float = -20.0, peak_ceiling: float = 0.99) -> np.ndarray:
    """
    Cân âm lượng về mức RMS `target_dbfs` (dBFS). Giới hạn peak để không clip.
    Trả float32. Tín hiệu gần im lặng (RMS ~0) trả nguyên bản.
    """
    x = np.asarray(x, dtype=np.float32).ravel()
    if x.size == 0:
        return x
    rms = float(np.sqrt(np.mean(x ** 2)))
    if rms < _EPS:
        return x
    target_rms = 10.0 ** (target_dbfs / 20.0)
    gain = target_rms / rms
    y = x * gain
    peak = float(np.max(np.abs(y)))
    if peak > peak_ceiling:
        y = y * (peak_ceiling / peak)
    return y.astype(np.float32)
