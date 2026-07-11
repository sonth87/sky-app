"""
engine.py — VieNeu TTS engine abstraction.

TTSEngine là protocol tối giản. Để swap sang engine khác sau này:
  1. Implement TTSEngine protocol
  2. Thay VieneuEngine bằng class mới trong main.py lifespan()
  3. Không cần đụng bất kỳ endpoint nào

VieNeu-specific tuning params được tập trung tại đây, không rải rác.
"""
from __future__ import annotations

import os
import numpy as np
from typing import Protocol, runtime_checkable

SAMPLE_RATE = 48_000  # VieNeu v3 Turbo output sample rate (Hz)
TRAILING_SILENCE_S = 0.2  # 200ms silence appended sau mỗi utterance

# Loudness đầu ra: cân RMS về mức này để các giọng (ref lệch nhau ~8dB) đồng đều.
# 0 hoặc rỗng ở env VIENEU_TARGET_DBFS = tắt normalize (giữ hành vi cũ).
def _target_dbfs() -> float | None:
    raw = os.environ.get("VIENEU_TARGET_DBFS", "-20").strip()
    if raw == "" or raw.lower() == "off":
        return None
    try:
        return float(raw)
    except ValueError:
        return -20.0


# ── Quality analysis ──────────────────────────────────────────────────────────
#
# Chấm điểm heuristic để CẢNH BÁO file khả nghi (không chặn, không sửa audio).
# Bắt được: ú ớ/rè (noisy, low_energy), méo/clipping, cụt/lặp (bất thường về độ dài),
#           nói liền không ngắt hoặc gần như rỗng (silence_ratio).
# KHÔNG bắt được: lẫn giọng Bắc/Nam (cần speaker embedding — để giai đoạn sau).
#
# Ngưỡng đọc từ env var QUALITY_* để calibrate sau vài batch thật mà không build lại.

def _qenv(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def analyze_quality(
    audio: np.ndarray, text: str, sample_rate: int = SAMPLE_RATE, speed: float = 1.0
) -> dict:
    """
    Phân tích tín hiệu audio đã synthesize, trả về:
      { score: int 0-100, flags: list[str], metrics: dict }
    Chạy in-memory trên float32 array — nhanh, không đọc lại file.

    `speed`: audio đã bị đổi tốc độ ở _post_process. speed>1 → audio ngắn hơn →
    ms_per_char nhỏ đi. Chia ngưỡng theo speed để không dính cờ too_short/too_long giả.
    """
    flags: list[str] = []
    audio = np.asarray(audio, dtype=np.float32).ravel()
    n = audio.size
    duration_s = n / sample_rate if sample_rate > 0 else 0.0

    # Số ký tự chữ (bỏ khoảng trắng/dấu câu) để ước lượng nhịp đọc
    char_count = sum(1 for c in text if c.isalnum())

    # --- ms mỗi ký tự: bắt cụt (quá nhanh) hoặc lặp/kéo dài (quá chậm) ---
    # Ngưỡng chia cho speed: ở speed=1.5 audio ngắn 1.5x nên ms_per_char giảm 1.5x,
    # ngưỡng cũng giảm theo để so sánh công bằng.
    spd = speed if speed and speed > 0 else 1.0
    ms_per_char = (duration_s * 1000.0 / char_count) if char_count > 0 else 0.0
    mpc_min = _qenv("QUALITY_MS_PER_CHAR_MIN", 35.0) / spd
    mpc_max = _qenv("QUALITY_MS_PER_CHAR_MAX", 140.0) / spd
    if char_count > 0:
        if ms_per_char < mpc_min:
            flags.append("too_short")
        elif ms_per_char > mpc_max:
            flags.append("too_long")

    # --- RMS energy (dB) toàn cục: quá thấp = gần im lặng / ú ớ ---
    rms = float(np.sqrt(np.mean(audio ** 2))) if n > 0 else 0.0
    rms_db = 20.0 * np.log10(rms) if rms > 1e-9 else -120.0
    if rms_db < _qenv("QUALITY_RMS_DB_MIN", -40.0):
        flags.append("low_energy")

    # --- Chia khung 20ms để tính silence_ratio + spectral_flatness ---
    frame_len = max(1, int(sample_rate * 0.02))
    n_frames = n // frame_len
    silence_ratio = 0.0
    flatness = 0.0
    if n_frames > 0:
        frames = audio[: n_frames * frame_len].reshape(n_frames, frame_len)

        # Silence ratio: tỷ lệ khung có RMS rất thấp so với khung ồn nhất
        frame_rms = np.sqrt(np.mean(frames ** 2, axis=1) + 1e-12)
        peak_rms = float(np.max(frame_rms))
        if peak_rms > 1e-6:
            sil_thresh = peak_rms * _qenv("QUALITY_SILENCE_REL", 0.08)
            silence_ratio = float(np.mean(frame_rms < sil_thresh))
        sil_min = _qenv("QUALITY_SILENCE_MIN", 0.02)
        sil_max = _qenv("QUALITY_SILENCE_MAX", 0.75)
        if silence_ratio < sil_min:
            flags.append("no_pauses")      # nói liền không ngắt → ú ớ/rè
        elif silence_ratio > sil_max:
            flags.append("mostly_silent")  # gần như rỗng

        # Spectral flatness: gần 1 = giống nhiễu trắng (rè); tính trên khung có tiếng
        voiced = frames[frame_rms > peak_rms * 0.1] if peak_rms > 1e-6 else frames[:0]
        if voiced.shape[0] > 0:
            mag = np.abs(np.fft.rfft(voiced, axis=1)) + 1e-10
            geo = np.exp(np.mean(np.log(mag), axis=1))
            arith = np.mean(mag, axis=1)
            flatness = float(np.mean(geo / arith))
            if flatness > _qenv("QUALITY_FLATNESS_MAX", 0.5):
                flags.append("noisy")

    # --- Clipping: tỷ lệ mẫu chạm biên → méo/rè ---
    clip_ratio = float(np.mean(np.abs(audio) > 0.99)) if n > 0 else 0.0
    if clip_ratio > _qenv("QUALITY_CLIP_MAX", 0.01):
        flags.append("clipping")

    # Điểm: mỗi flag trừ 25, sàn 0
    score = max(0, 100 - 25 * len(flags))

    return {
        "score": score,
        "flags": flags,
        "metrics": {
            "duration_s": round(duration_s, 3),
            "ms_per_char": round(ms_per_char, 1),
            "rms_db": round(rms_db, 1),
            "silence_ratio": round(silence_ratio, 3),
            "flatness": round(flatness, 3),
            "clip_ratio": round(clip_ratio, 4),
        },
    }


@runtime_checkable
class TTSEngine(Protocol):
    """Minimal interface mà bất kỳ TTS engine nào phải implement."""

    def encode_reference(self, wav_path: str) -> object:
        """Encode WAV file thành voice embedding. Kết quả cache được."""
        ...

    def synthesize(
        self,
        text: str,
        ref_embedding: object,
        speed: float = 1.0,
    ) -> np.ndarray:
        """
        Sinh audio từ text + embedding.
        Returns: float32 numpy array, sample rate = SAMPLE_RATE.
        """
        ...

    def synthesize_preset(
        self,
        text: str,
        preset_id: str,
        speed: float = 1.0,
    ) -> np.ndarray:
        """Sinh audio dùng preset voice name (không cần ref audio)."""
        ...


class VieneuEngine:
    """
    Concrete implementation dùng VieNeu==3.0.9 (ONNX/CPU mode).

    Tuning decisions (không thay đổi nếu chưa test kỹ):
    - temperature=0.1, top_k=5: đủ thấp tránh random bad sample, nhưng > 0
      vì temperature=0 khiến model không bao giờ chọn EOS → WAV 23s thay vì ~1.5s
    - repetition_penalty=1.3: giảm lặp syllable
    - apply_watermark=False: output raw PCM không watermark
    """

    # Preset "An toàn" — giá trị mặc định đã tinh chỉnh cho đọc tên nghi lễ.
    # Advanced config (Phase 2) merge override LÊN dict này per-request.
    _INFER_KWARGS = dict(
        apply_watermark=False,
        temperature=0.1,
        top_k=5,
        repetition_penalty=1.3,
    )

    # max_new_frames mặc định của lib = 300 (~24s) → cắt cụt câu dài. Ta truyền ĐỘNG
    # theo độ dài text (mỗi ký tự ~vài frame). Trần trên để không treo vô hạn.
    _FRAMES_BASE = 40
    _FRAMES_PER_CHAR = 4
    _FRAMES_CAP = 800  # ~64s audio — quá dài thì chắc chắn lỗi, dừng

    def __init__(self) -> None:
        from vieneu import Vieneu  # lazy import — chỉ resolve khi khởi tạo

        # Phase 0: chọn ONNX provider + thread mà không sửa lib vendored.
        # Env do Electron truyền: VIENEU_ONNX_PROVIDERS, VIENEU_ONNX_THREADS.
        # LƯU Ý: CoreML KHÔNG chạy được graph VieNeu (external-data + empty KV cache)
        # — đã test 2026-07. resolve_providers vẫn để CPU fallback cuối nên an toàn.
        from onnx_providers import resolve_providers, resolve_threads, patched_session

        providers = resolve_providers(os.environ.get("VIENEU_ONNX_PROVIDERS"))
        threads = resolve_threads()
        self.providers = providers
        self.threads = threads

        with patched_session(providers, threads):
            self._model = Vieneu()

    def _max_new_frames(self, text: str) -> int:
        n = len(text or "")
        return min(self._FRAMES_CAP, self._FRAMES_BASE + n * self._FRAMES_PER_CHAR)

    def capabilities(self) -> dict:
        """Khai báo năng lực engine — Phase 5 (multi-engine) & UI dùng để ẩn/hiện."""
        return {
            "id": "vieneu",
            "label": "VieNeu v3 Turbo",
            "sample_rate": SAMPLE_RATE,
            "supports_clone": True,
            "supports_preset": True,
            "supports_emotion": False,  # v3 emotion path chưa expose ổn định
            "providers": self.providers,
        }

    def encode_reference(self, wav_path: str) -> object:
        return self._model.encode_reference(wav_path)

    def _merge_kwargs(self, text: str, overrides: dict | None) -> dict:
        kw = dict(self._INFER_KWARGS)
        kw["max_new_frames"] = self._max_new_frames(text)
        if overrides:
            # Chỉ nhận các key infer hợp lệ, bỏ None để không đè mặc định.
            allowed = {"temperature", "top_k", "top_p", "repetition_penalty", "max_new_frames"}
            for k, v in overrides.items():
                if k in allowed and v is not None:
                    kw[k] = v
        return kw

    def synthesize(
        self, text: str, ref_embedding: object, speed: float = 1.0, overrides: dict | None = None
    ) -> np.ndarray:
        kw = self._merge_kwargs(text, overrides)
        audio: np.ndarray = self._model.infer(text, ref_codes=ref_embedding, **kw)
        return self._post_process(audio, speed)

    def synthesize_preset(
        self, text: str, preset_id: str, speed: float = 1.0, overrides: dict | None = None
    ) -> np.ndarray:
        kw = self._merge_kwargs(text, overrides)
        audio: np.ndarray = self._model.infer(text, voice=preset_id, **kw)
        return self._post_process(audio, speed)

    def _post_process(self, audio: np.ndarray, speed: float) -> np.ndarray:
        audio = np.asarray(audio, dtype=np.float32).ravel()

        # Speed control: đổi tốc độ GIỮ CAO ĐỘ (phase vocoder numpy). speed>1 = nhanh
        # hơn = audio ngắn lại (đúng kỳ vọng slider). Trước đây resample thuần vừa
        # NGƯỢC chiều vừa kéo pitch — đã sửa.
        if abs(speed - 1.0) > 0.01:
            try:
                from audio_dsp import time_stretch_keep_pitch
                audio = time_stretch_keep_pitch(audio, speed)
            except Exception:
                # Fallback: resample thuần ĐÚNG chiều (mất pitch nhưng còn hơn ngược).
                import soxr
                audio = soxr.resample(audio, int(SAMPLE_RATE * speed), SAMPLE_RATE)

        # Cân loudness về mức RMS mục tiêu để các giọng đồng đều (ref lệch ~8dB).
        target = _target_dbfs()
        if target is not None:
            from audio_dsp import rms_normalize
            audio = rms_normalize(audio, target_dbfs=target)
        else:
            peak = np.max(np.abs(audio)) if audio.size else 0.0
            if peak > 1.0:
                audio = audio / peak

        # Trailing silence (sau normalize để không bị scale khoảng lặng).
        silence = np.zeros(int(SAMPLE_RATE * TRAILING_SILENCE_S), dtype=np.float32)
        audio = np.concatenate([audio, silence])

        return audio
