"""
engine_moss_nano.py — Adapter MOSS-TTS-Nano khớp TTSEngine Protocol (engine.py).

Engine mở rộng ĐA NGÔN NGỮ (20 ngôn ngữ, auto-detect từ text; KHÔNG có tiếng Việt).
Dùng cho đọc text/tên tiếng nước ngoài mà VieNeu (chỉ tiếng Việt) không làm được.

Chạy runtime ONNX/CPU torch-free (server/moss_runtime/, đã vá torchaudio→soundfile+soxr).
Output codec = 48kHz (giống VieNeu) → KHÔNG cần resample, đồng nhất contract 48kHz.

Model + codec tải theo nhu cầu vào VIENEU_ENGINES_DIR/moss-tts-nano/model/.
Codec MOSS-Audio-Tokenizer app đã bundle sẵn cho VieNeu → có thể tái dùng.

Env:
  VIENEU_ENGINES_DIR    — gốc thư mục engine mở rộng (Electron truyền)
  VIENEU_ONNX_PROVIDERS — provider (cpu/coreml/...) — dùng chung với VieNeu
  VIENEU_ONNX_THREADS   — số thread
  MOSS_ENABLE_WETEXT    — '1' bật WeTextProcessing (chuẩn hoá số/ngày). Mặc định TẮT
                          vì pynini/WeText khó cài (nhất là Windows). Đọc tên/chữ
                          không cần WeText nên tắt an toàn.
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np

# Tái dùng hằng + hậu xử lý audio của VieNeu (speed giữ pitch, loudness, trailing silence).
from engine import SAMPLE_RATE, TRAILING_SILENCE_S, _target_dbfs  # noqa

_ENGINE_ID = "moss-tts-nano"


def _wetext_enabled() -> bool:
    return os.environ.get("MOSS_ENABLE_WETEXT", "0").strip() in ("1", "true", "yes", "on")


def _model_dir() -> Path:
    """Thư mục model MOSS đã tải: VIENEU_ENGINES_DIR/moss-tts-nano/model/<snapshot>."""
    base = os.environ.get("VIENEU_ENGINES_DIR", "").strip()
    if not base:
        raise RuntimeError("VIENEU_ENGINES_DIR chưa set — không tìm được model MOSS.")
    model_root = Path(base) / _ENGINE_ID / "model"
    if not model_root.exists():
        raise RuntimeError(f"Model MOSS chưa tải: {model_root}")
    # Tìm thư mục chứa manifest (browser_poc_manifest.json).
    if (model_root / "browser_poc_manifest.json").exists():
        return model_root
    for sub in model_root.rglob("browser_poc_manifest.json"):
        return sub.parent
    raise RuntimeError(f"Không tìm thấy browser_poc_manifest.json trong {model_root}")


class MossNanoEngine:
    """MOSS-TTS-Nano qua runtime ONNX torch-free. Khớp TTSEngine Protocol."""

    # max_new_frames động theo độ dài text (MOSS ~12.5 frame/giây như codec chung).
    _FRAMES_BASE = 40
    _FRAMES_PER_CHAR = 4
    _FRAMES_CAP = 800

    def __init__(self) -> None:
        from onnx_providers import resolve_providers, resolve_threads

        providers = resolve_providers(os.environ.get("VIENEU_ONNX_PROVIDERS"))
        threads = resolve_threads()
        self.providers = providers
        self.threads = threads
        # MOSS chỉ nhận 'cpu'/'cuda' cho execution_provider. Map: có CUDA→cuda, còn lại cpu.
        exec_provider = "cuda" if any("CUDA" in p for p in providers) else "cpu"

        from moss_runtime import OnnxTtsRuntime
        self._rt = OnnxTtsRuntime(
            model_dir=str(_model_dir()),
            thread_count=max(1, threads) if threads else 4,
            execution_provider=exec_provider,
        )
        self._enable_wetext = _wetext_enabled()

    def _max_new_frames(self, text: str) -> int:
        n = len(text or "")
        return min(self._FRAMES_CAP, self._FRAMES_BASE + n * self._FRAMES_PER_CHAR)

    def capabilities(self) -> dict:
        supports_preset = False
        try:
            supports_preset = len(self._rt.list_builtin_voices()) > 0
        except Exception:
            pass
        return {
            "id": _ENGINE_ID,
            "label": "MOSS-TTS-Nano",
            "sample_rate": SAMPLE_RATE,      # codec 48kHz — đồng nhất VieNeu
            "supports_clone": True,          # clone qua prompt_audio
            "supports_preset": supports_preset,
            "supports_emotion": False,
            "multilingual": True,            # 20 ngôn ngữ, auto-detect
            "providers": self.providers,
        }

    def encode_reference(self, wav_path: str) -> object:
        """MOSS clone qua ĐƯỜNG DẪN wav (không pre-encode như VieNeu).
        Trả chính path để cache; synthesize dùng làm prompt_audio_path."""
        return str(wav_path)

    def _run(self, text: str, *, voice: str | None, prompt_audio_path: str | None,
             overrides: dict | None) -> np.ndarray:
        max_frames = (overrides or {}).get("max_new_frames") or self._max_new_frames(text)
        result = self._rt.synthesize(
            text=text,
            voice=voice,
            prompt_audio_path=prompt_audio_path,
            output_audio_path=None,
            max_new_frames=int(max_frames),
            enable_wetext=self._enable_wetext,
            enable_normalize_tts_text=True,
        )
        wav = np.asarray(result["waveform"], dtype=np.float32).ravel()
        sr = int(result.get("sample_rate", SAMPLE_RATE))
        if sr != SAMPLE_RATE:  # phòng hờ codec đổi SR
            import soxr
            wav = soxr.resample(wav, sr, SAMPLE_RATE).astype(np.float32)
        return wav

    def synthesize(self, text: str, ref_embedding: object, speed: float = 1.0,
                   overrides: dict | None = None) -> np.ndarray:
        # ref_embedding = đường dẫn wav (từ encode_reference).
        wav = self._run(text, voice=None, prompt_audio_path=str(ref_embedding), overrides=overrides)
        return self._post_process(wav, speed)

    def synthesize_preset(self, text: str, preset_id: str, speed: float = 1.0,
                          overrides: dict | None = None) -> np.ndarray:
        wav = self._run(text, voice=preset_id, prompt_audio_path=None, overrides=overrides)
        return self._post_process(wav, speed)

    def _post_process(self, audio: np.ndarray, speed: float) -> np.ndarray:
        """Giống VieneuEngine._post_process: speed giữ pitch + loudness + trailing silence."""
        audio = np.asarray(audio, dtype=np.float32).ravel()
        if abs(speed - 1.0) > 0.01:
            try:
                from audio_dsp import time_stretch_keep_pitch
                audio = time_stretch_keep_pitch(audio, speed)
            except Exception:
                import soxr
                audio = soxr.resample(audio, int(SAMPLE_RATE * speed), SAMPLE_RATE)
        target = _target_dbfs()
        if target is not None:
            from audio_dsp import rms_normalize
            audio = rms_normalize(audio, target_dbfs=target)
        else:
            peak = np.max(np.abs(audio)) if audio.size else 0.0
            if peak > 1.0:
                audio = audio / peak
        silence = np.zeros(int(SAMPLE_RATE * TRAILING_SILENCE_S), dtype=np.float32)
        return np.concatenate([audio, silence])

    def close(self) -> None:
        self._rt = None
