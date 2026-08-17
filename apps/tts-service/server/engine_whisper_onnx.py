"""
engine_whisper_onnx.py — Adapter Whisper (đa ngôn ngữ, gồm tiếng Việt) khớp `SttEngine`
Protocol (stt_engine.py), chạy qua `sherpa-onnx` — ONNX/CPU TORCH-FREE, cùng triết lý với
VieNeu/MOSS-TTS-Nano (không kéo theo torch/transformers chỉ để chạy 1 model nhỏ).

Đã spike trước khi viết bản `base` (xem docs/dev/history/2026-08-14-stt-nen-tang-giai-doan-1.md):
thử `sherpa-onnx` với model `whisper-base` (int8), phiên âm 1 mẫu audio tiếng Việt thật ra kết
quả đọc hiểu được, ~1.5-1.8s cho 8.5s audio trên CPU 4 luồng, auto-detect ngôn ngữ nhận đúng
"vi" không cần ép. Không cần thử phương án dự phòng (onnx-community export qua transformers).

MỘT class dùng chung cho MỌI size (base/small/medium/large-v3/turbo — xem
docs/dev/history/2026-08-15-them-whisper-small-medium-large-turbo.md) — `size` truyền vào
constructor quyết định cả thư mục tải (`VIENEU_ENGINES_DIR/whisper-{size}/model/`) lẫn tên 3
file model (`{size}-encoder.int8.onnx`/`{size}-decoder.int8.onnx`/`{size}-tokens.txt`) — đã
verify quy ước đặt tên này GIỐNG HỆT nhau trên mọi size trong repo HF gốc
(csukuangfj/sherpa-onnx-whisper-{size}), kể cả `large-v3` (file int8 vẫn gộp gọn trong 1 file
duy nhất, không cần các file `.weights` external-data chỉ dùng cho bản fp32 đầy đủ).

Model + engine tải theo nhu cầu vào VIENEU_ENGINES_DIR/whisper-{size}/model/ (xem
engine_registry.py's entry tương ứng "whisper-{size}", runtime_kind="onnx-ext").

Env:
  VIENEU_ENGINES_DIR    — gốc thư mục engine mở rộng (Electron truyền)
  VIENEU_ONNX_PROVIDERS — provider (cpu/coreml/...) — dùng chung với VieNeu
  VIENEU_ONNX_THREADS   — số thread
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import soundfile as sf

from stt_engine import TranscriptionResult

_TARGET_SR = 16_000  # Whisper luôn nhận input 16kHz mono


def _model_dir(size: str) -> Path:
    """Thư mục model đã tải: VIENEU_ENGINES_DIR/whisper-{size}/model/<snapshot>."""
    base = os.environ.get("VIENEU_ENGINES_DIR", "").strip()
    if not base:
        raise RuntimeError("VIENEU_ENGINES_DIR chưa set — không tìm được model Whisper.")
    model_root = Path(base) / f"whisper-{size}" / "model"
    if not model_root.exists():
        raise RuntimeError(f"Model Whisper ({size}) chưa tải: {model_root}")
    tokens_name = f"{size}-tokens.txt"
    if (model_root / tokens_name).exists():
        return model_root
    for sub in model_root.rglob(tokens_name):
        return sub.parent
    raise RuntimeError(f"Không tìm thấy {tokens_name} trong {model_root}")


def _sherpa_provider(providers: list[str]) -> str:
    """`sherpa_onnx.OfflineRecognizer.from_whisper()`'s `provider` nhận string đơn giản
    ('cpu'/'cuda'/'coreml'), khác hẳn tên provider đầy đủ của onnxruntime
    ('CUDAExecutionProvider'...) mà `resolve_providers()` trả — map lại, giống cách
    `engine_moss_nano.py` đã làm cho MOSS (chỉ nhận 'cpu'/'cuda')."""
    joined = ",".join(providers)
    if "CUDA" in joined:
        return "cuda"
    if "CoreML" in joined:
        return "coreml"
    return "cpu"


def _read_audio_mono16k(audio_path: str) -> np.ndarray:
    audio, sr = sf.read(audio_path, dtype="float32", always_2d=False)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)  # downmix stereo -> mono
    if sr != _TARGET_SR:
        import soxr
        audio = soxr.resample(audio, sr, _TARGET_SR).astype(np.float32)
    return audio


class WhisperOnnxEngine:
    """Whisper (int8) qua sherpa-onnx — DÙNG CHUNG cho mọi size, xem module docstring. Khớp
    `SttEngine` Protocol."""

    def __init__(self, size: str) -> None:
        self._size = size

        from onnx_providers import resolve_providers, resolve_threads

        providers = resolve_providers(os.environ.get("VIENEU_ONNX_PROVIDERS"))
        threads = resolve_threads()
        self.providers = providers
        self.threads = max(1, threads) if threads else 4

        import sherpa_onnx

        model_dir = _model_dir(size)
        self._recognizer = sherpa_onnx.OfflineRecognizer.from_whisper(
            encoder=str(model_dir / f"{size}-encoder.int8.onnx"),
            decoder=str(model_dir / f"{size}-decoder.int8.onnx"),
            tokens=str(model_dir / f"{size}-tokens.txt"),
            # `language=""` — không ép sẵn ở mức recognizer; ép/auto-detect quyết định
            # PER REQUEST bằng cách build lại context ở transcribe() (sherpa-onnx's
            # OfflineRecognizer không cho đổi language sau khi khởi tạo — xem transcribe()).
            language="",
            task="transcribe",
            num_threads=self.threads,
            provider=_sherpa_provider(providers),
        )
        self._recognizer_lang = ""  # ngôn ngữ đang build sẵn trong self._recognizer
        self._model_dir = model_dir

    def _recognizer_for(self, language: str | None):
        """sherpa-onnx's `OfflineRecognizer` cố định `language` lúc khởi tạo (không đổi
        được per-stream) — đổi ngôn ngữ phải dựng lại recognizer. Đo thực nghiệm lúc spike:
        dựng lần đầu ~1.1s (cold start), các lần dựng lại sau đó (kể cả đổi ngôn ngữ) chỉ
        ~0.4s — chấp nhận được cho nút bấm-rồi-chờ, không phải cái giá cho mỗi từ. Giữ
        instance hiện tại nếu request dùng ĐÚNG ngôn ngữ lần trước, tránh dựng lại vô ích
        khi người dùng bấm nhiều lần liên tiếp cùng 1 ngôn ngữ (trường hợp phổ biến nhất)."""
        lang = (language or "").strip().lower()
        if lang == self._recognizer_lang:
            return self._recognizer
        import sherpa_onnx
        rec = sherpa_onnx.OfflineRecognizer.from_whisper(
            encoder=str(self._model_dir / f"{self._size}-encoder.int8.onnx"),
            decoder=str(self._model_dir / f"{self._size}-decoder.int8.onnx"),
            tokens=str(self._model_dir / f"{self._size}-tokens.txt"),
            language=lang,
            task="transcribe",
            num_threads=self.threads,
            provider=_sherpa_provider(self.providers),
        )
        self._recognizer = rec
        self._recognizer_lang = lang
        return rec

    def capabilities(self) -> dict:
        return {
            "id": f"whisper-{self._size}",
            "label": f"Whisper {self._size} (đa ngôn ngữ, torch-free)",
            "languages": None,  # Whisper hỗ trợ ~99 ngôn ngữ, không giới hạn danh sách cụ thể
            "supports_language_hint": True,
            "providers": self.providers,
        }

    def transcribe(self, audio_path: str, language: str | None = None) -> TranscriptionResult:
        audio = _read_audio_mono16k(audio_path)
        duration_sec = len(audio) / _TARGET_SR

        recognizer = self._recognizer_for(language)
        stream = recognizer.create_stream()
        stream.accept_waveform(_TARGET_SR, audio)
        recognizer.decode_stream(stream)

        text = (stream.result.text or "").strip()
        # `stream.result.lang` — sherpa-onnx's Whisper TỰ trả ngôn ngữ đã nhận diện, kể cả
        # khi caller không ép `language` (verify thật lúc kiểm chứng end-to-end: audio tiếng
        # Việt không ép ngôn ngữ → "vi"). Ưu tiên `language` đã ép (rõ ràng hơn, khỏi phụ
        # thuộc autodetect) — chỉ đọc `detected` khi caller để trống.
        detected = (getattr(stream.result, "lang", "") or "").strip()
        resolved_lang = (language or "").strip() or detected or None
        return TranscriptionResult(text=text, language=resolved_lang, duration_sec=duration_sec)

    def close(self) -> None:
        self._recognizer = None
