"""
audio_dsp.py — DSP thuần numpy cho hậu xử lý TTS (không thêm dependency).

Chỉ dùng numpy để KHÔNG tăng kích thước gói (venv/PyInstaller đang tối giản:
numpy + soxr + soundfile). Các hàm chính:

  time_stretch_keep_pitch(x, rate)  — đổi TỐC ĐỘ giữ nguyên CAO ĐỘ (phase vocoder).
  rms_normalize(x, target_dbfs)     — cân âm lượng về mức RMS mục tiêu.
  trim_silence(x, sr)               — cắt im lặng 2 đầu.
  preprocess_reference_audio(...)   — làm sạch audio mẫu TRƯỚC khi clone giọng.
  has_tts_runaway(x, sr)            — phát hiện model sinh lạc (miss EOS).
  combine_voice_samples(paths, sr)  — ghép NHIỀU file mẫu thành 1 clip cho voice clone.

Phase vocoder ở đây đủ tốt cho giọng đọc nghi lễ (rate 0.5–1.5). Không phải chất
lượng studio như rubberband, nhưng tránh hẳn việc kéo pitch của resample thuần và
không cần binary ngoài.

3 hàm cuối port từ voicebox's `backend/utils/audio.py`
(/Users/skyline/TEST/voicebox-main) — app TTS tham chiếu đã chạy Qwen3-TTS production.
Bản gốc dùng `librosa.effects.trim`; ở đây viết lại bằng numpy vì librosa KHÔNG có
trong bất kỳ tier runtime nào của sky-app (tier MLX chỉ có numpy/scipy/soundfile/soxr,
tier bundled còn tối giản hơn) — thêm librosa kéo theo numba + llvmlite, quá đắt cho
mấy chục dòng phân tích khung.
"""
from __future__ import annotations

import numpy as np

_EPS = 1e-8


def _frame_rms(x: np.ndarray, frame_len: int) -> np.ndarray:
    """RMS của từng khung `frame_len` mẫu liên tiếp (khung cuối dư bị bỏ).

    Vector hoá bằng reshape thay vì vòng lặp Python — cùng cách engine.py's
    analyze_quality làm, và là lý do các hàm dưới đây chạy được trên audio dài
    mà không tốn thời gian đáng kể.
    """
    n_frames = x.size // frame_len
    if n_frames == 0:
        return np.empty(0, dtype=np.float32)
    frames = x[: n_frames * frame_len].reshape(n_frames, frame_len)
    return np.sqrt(np.mean(frames.astype(np.float32) ** 2, axis=1) + _EPS)


def _stft(x: np.ndarray, n_fft: int, hop: int, window: np.ndarray) -> np.ndarray:
    """STFT đơn giản, trả (n_frames, n_fft//2+1) phức.

    Cắt khung bằng `as_strided` (view, không copy) rồi rfft MỘT LẦN trên cả ma trận thay
    vì gọi rfft trong vòng lặp Python từng khung — audio 30s ở 48kHz là ~5.600 khung, tức
    5.600 lần vào/ra numpy thay vì 1.
    """
    n = len(x)
    if n < n_fft:
        x = np.pad(x, (0, n_fft - n))
        n = len(x)
    n_frames = 1 + (n - n_fft) // hop

    x = np.ascontiguousarray(x, dtype=np.float32)
    frames = np.lib.stride_tricks.as_strided(
        x, shape=(n_frames, n_fft), strides=(x.strides[0] * hop, x.strides[0]),
    )
    return np.fft.rfft(frames * window, axis=1).astype(np.complex64)


def _istft(frames: np.ndarray, n_fft: int, hop: int, window: np.ndarray) -> np.ndarray:
    """Nghịch STFT với overlap-add + chuẩn hoá cửa sổ.

    irfft chạy một lần trên cả ma trận; riêng bước overlap-add vẫn phải lặp vì các khung
    GHI ĐÈ LÊN NHAU (`np.add.at` xử lý được nhưng chậm hơn hẳn vòng lặp cho kích thước
    này). Phần đắt — biến đổi Fourier — đã ra khỏi vòng lặp.
    """
    n_frames = frames.shape[0]
    out_len = n_fft + hop * (n_frames - 1)
    out = np.zeros(out_len, dtype=np.float32)
    wsum = np.zeros(out_len, dtype=np.float32)

    segs = np.fft.irfft(frames, n=n_fft, axis=1).astype(np.float32) * window
    win_sq = (window ** 2).astype(np.float32)
    for i in range(n_frames):
        start = i * hop
        out[start:start + n_fft] += segs[i]
        wsum[start:start + n_fft] += win_sq

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


def trim_silence(x: np.ndarray, sample_rate: int, top_db: float = 40.0,
                 frame_ms: float = 10.0) -> np.ndarray:
    """Cắt im lặng ở HAI ĐẦU. Tương đương `librosa.effects.trim(y, top_db=...)`.

    `top_db`: ngưỡng tính TỪ ĐỈNH xuống — khung nào yếu hơn `peak - top_db` (dB) thì coi
    là im lặng. Mặc định 40 (KHÔNG phải 60 như librosa) theo voicebox: dynamic range
    giọng nói thường ~30dB, nên 40dB nằm dưới ngưỡng đó và giữ được âm tiết cuối phát
    nhẹ, trong khi vẫn bắt được khoảng lặng đầu/cuối rõ ràng.

    Trả về chính `x` (không copy) nếu không có gì để cắt.
    """
    x = np.asarray(x, dtype=np.float32).ravel()
    frame_len = max(1, int(sample_rate * frame_ms / 1000.0))
    rms = _frame_rms(x, frame_len)
    if rms.size == 0:
        return x

    peak = float(np.max(rms))
    if peak <= _EPS:
        return x  # toàn im lặng — không có "đầu/cuối" nào để cắt cho có nghĩa
    threshold = peak * (10.0 ** (-top_db / 20.0))

    voiced = np.flatnonzero(rms >= threshold)
    if voiced.size == 0:
        return x
    start = int(voiced[0]) * frame_len
    # +1 để lấy trọn khung cuối còn tiếng, clamp theo độ dài thật (khung dư đã bị bỏ).
    end = min(x.size, (int(voiced[-1]) + 1) * frame_len)
    return x[start:end]


def preprocess_reference_audio(
    audio: np.ndarray,
    sample_rate: int,
    peak_target: float = 0.95,
    trim_top_db: float = 40.0,
    edge_padding_ms: int = 100,
) -> np.ndarray:
    """Làm sạch audio mẫu TRƯỚC khi validate/lưu để clone giọng.

    Bỏ DC offset → cắt im lặng 2 đầu → chèn lại một chút đệm → hạ đỉnh nếu quá nóng.
    Mục tiêu là NHẬN được bản ghi đời thực ở mức hợp lý, KHÔNG phải cứu bản ghi đã méo:
    clipping thật bên trong dạng sóng thì scale đỉnh không phục hồi được, vẫn nghe tệ.

    Port từ voicebox's `preprocess_reference_audio` (backend/utils/audio.py:239-296).

    `edge_padding_ms`: chỉ chèn lại khi việc cắt THẬT SỰ làm ngắn dạng sóng, và
    KHÔNG BAO GIỜ chèn vượt độ dài gốc — chèn vô điều kiện sẽ đẩy file gần chạm trần
    thời lượng vượt ngưỡng rồi bị từ chối oan (voicebox có regression test riêng cho
    chính tình huống này).
    """
    audio = np.asarray(audio, dtype=np.float32).ravel()
    if audio.size == 0:
        return audio

    audio = audio - float(np.mean(audio))

    trimmed = trim_silence(audio, sample_rate, top_db=trim_top_db)
    if 0 < trimmed.size < audio.size:
        pad_each = int(sample_rate * edge_padding_ms / 1000)
        headroom = (audio.size - trimmed.size) // 2
        pad = min(pad_each, max(headroom, 0))
        if pad > 0:
            trimmed = np.pad(trimmed, (pad, pad), mode="constant")
        audio = trimmed

    peak = float(np.abs(audio).max())
    if peak > peak_target and peak > 0:
        audio = audio * (peak_target / peak)

    return audio.astype(np.float32)


def has_tts_runaway(
    audio: np.ndarray,
    sample_rate: int,
    frame_ms: int = 20,
    silence_threshold_db: float = -40.0,
    max_internal_silence_ms: int = 2000,
) -> bool:
    """Phát hiện dạng `tiếng nói → im lặng dài → lại có tiếng`.

    Đây là dấu hiệu ĐÁNG TIN của việc model TTS bỏ lỡ token EOS rồi sinh tiếp phần ảo
    giác (hoặc nhiễu codec). Im lặng ở ĐẦU và CUỐI không tính — chỉ khoảng lặng bị kẹp
    giữa hai đoạn có tiếng mới là bất thường; đó là ý nghĩa của cờ `seen_speech`.

    Port từ voicebox's `has_tts_runaway` (backend/utils/audio.py:113-147), giữ nguyên
    3 ngưỡng đã dùng production.
    """
    audio = np.asarray(audio, dtype=np.float32).ravel()
    frame_len = int(sample_rate * frame_ms / 1000)
    if frame_len == 0 or audio.size < frame_len:
        return False

    rms = _frame_rms(audio, frame_len)
    is_speech = rms >= (10.0 ** (silence_threshold_db / 20.0))
    max_silence_frames = int(max_internal_silence_ms / frame_ms)

    seen_speech = False
    consecutive_silence = 0
    for speaking in is_speech:
        if speaking:
            if seen_speech and consecutive_silence >= max_silence_frames:
                return True
            seen_speech = True
            consecutive_silence = 0
        elif seen_speech:
            consecutive_silence += 1
    return False


def post_process(audio: np.ndarray, speed: float, sample_rate: int,
                 trailing_silence_s: float, target_dbfs: float | None) -> np.ndarray:
    """Hậu xử lý chung sau khi engine sinh audio: đổi tốc độ (giữ cao độ) → cân loudness
    → nối đuôi im lặng.

    Trước đây 4 engine mỗi cái giữ một bản sao gần giống hệt của đoạn này, đều đọc hằng
    `SAMPLE_RATE = 48000` ở module scope. Gom lại và nhận `sample_rate` làm THAM SỐ là
    điều kiện để mỗi engine chạy ở tần số gốc của nó — Qwen xuất 24kHz, ép lên 48kHz
    khiến mọi bước dưới đây xử lý gấp đôi số mẫu mà không thêm thông tin gì.
    """
    audio = np.asarray(audio, dtype=np.float32).ravel()

    if abs(speed - 1.0) > 0.01:
        try:
            audio = time_stretch_keep_pitch(audio, speed)
        except Exception:
            # Fallback: resample thuần ĐÚNG chiều (mất pitch nhưng còn hơn ngược chiều —
            # bug thật đã sửa trước đây).
            import soxr
            audio = soxr.resample(audio, int(sample_rate * speed), sample_rate)

    if target_dbfs is not None:
        audio = rms_normalize(audio, target_dbfs=target_dbfs)
    else:
        peak = np.max(np.abs(audio)) if audio.size else 0.0
        if peak > 1.0:
            audio = audio / peak

    # Sau normalize để khoảng lặng không bị scale theo.
    silence = np.zeros(int(sample_rate * trailing_silence_s), dtype=np.float32)
    return np.concatenate([audio, silence])


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


def combine_voice_samples(wav_paths: list, target_sample_rate: int) -> np.ndarray:
    """Ghép NHIỀU file audio mẫu thành 1 clip cho engine clone kiểu in-context.

    Port từ voicebox's `combine_voice_prompts` (backends/base.py:203-231): chuẩn hoá TỪNG
    clip → nối lại → chuẩn hoá LẠI bản đã nối. Chuẩn hoá HAI LẦN là có chủ đích, không phải
    thừa: người dùng thường ghi các mẫu ở nhiều thời điểm/thiết bị khác nhau nên mức to nhỏ
    lệch nhau — san bằng từng clip trước (lần 1) để không có clip nào áp đảo phép đo RMS của
    bản ghép, rồi cân lại mức TỔNG (lần 2) vì nối các clip đã san bằng chưa chắc ra đúng mức
    mục tiêu (RMS không cộng tuyến tính qua phép nối).

    Chỉ gọi hàm này khi có ≥2 file — với 1 file thì không có gì để "ghép", caller tự rẽ
    nhánh dùng thẳng (xem main.py's `_resolve_voice_ref`).

    `target_sample_rate` PHẢI là tần số của engine sẽ dùng bản ghép này để clone (không phải
    tần số gốc của từng file mẫu) — mỗi file được resample TRƯỚC KHI chuẩn hoá nếu lệch, để
    hai bước xử lý DSP không cộng dồn sai số của nhau.
    """
    import soundfile as sf

    clips: list[np.ndarray] = []
    for p in wav_paths:
        data, sr = sf.read(str(p), dtype="float32", always_2d=True)
        mono = data.mean(axis=1).astype(np.float32)
        if sr != target_sample_rate:
            import soxr
            mono = soxr.resample(mono, sr, target_sample_rate).astype(np.float32)
        clips.append(rms_normalize(mono, target_dbfs=-20.0))

    mixed = np.concatenate(clips)
    return rms_normalize(mixed, target_dbfs=-20.0)
