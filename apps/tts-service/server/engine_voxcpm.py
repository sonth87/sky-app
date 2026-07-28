"""
engine_voxcpm.py — Adapter VoxCPM khớp TTSEngine Protocol (engine.py).

Engine mở rộng ĐA NGÔN NGỮ (30 ngôn ngữ, CÓ tiếng Việt) — khác MOSS-TTS-Nano ở chỗ
MOSS không có tiếng Việt. Bổ sung cho VieNeu về chất lượng và độ đa dạng ngôn ngữ.

Vì sao đi đường pip thay vì binary C++ (VoxCPM.cpp):
    Cơ chế cài engine mở rộng của app đã hỗ trợ `pip_packages` sẵn (xem
    engine_registry.py + engine-installer.ts), nên bản Python chính chủ cắm vào là
    dùng được ngay. Bản GGUF/C++ tuy nhẹ hơn nhưng phải build binary cho từng nền
    tảng — thêm cả một pipeline CI mà không đổi được gì về chất lượng.

ĐÁNH ĐỔI PHẢI BIẾT — CHẬM:
    Trên CPU, VoxCPM có RTF khoảng 4.5–9.5 (tạo 10 giây audio mất 45–95 giây). Chậm
    hơn VieNeu (xấp xỉ thời gian thực) chừng 5–10 lần. Đây là lựa chọn có ý thức:
    đổi tốc độ lấy chất lượng + đa ngôn ngữ. UI nên cảnh báo trước khi người dùng chọn.

CLONE GIỌNG — vì sao có thể hơn VieNeu:
    VoxCPM hỗ trợ truyền kèm BẢN CHÉP LỜI của audio tham chiếu ("Ultimate Cloning").
    Biết ref nói gì thì model tách được "nội dung" khỏi "đặc trưng giọng", thay vì
    phải suy ra cả hai từ tín hiệu. Đây là điểm VieNeu không có, và là lý do đáng thử
    engine này cho vấn đề clone sai vùng miền (xem docs/services/tts-clone-giong-accent.md).

Env:
  VIENEU_ENGINES_DIR    — gốc thư mục engine mở rộng (Electron truyền)
  VIENEU_ONNX_PROVIDERS — provider; ở đây chỉ dùng để suy ra có CUDA hay không
  VOXCPM_REF_TEXT_<id>  — (tuỳ chọn) bản chép lời cho ref audio, xem _ref_text_for()
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np

# Tái dùng hằng + hậu xử lý audio của VieNeu (speed giữ pitch, loudness, trailing silence).
from engine import SAMPLE_RATE, TRAILING_SILENCE_S, _target_dbfs  # noqa

_ENGINE_ID = "voxcpm"


def _model_dir() -> Path:
    """Thư mục model VoxCPM đã tải: VIENEU_ENGINES_DIR/voxcpm/model[/<snapshot>]."""
    base = os.environ.get("VIENEU_ENGINES_DIR", "").strip()
    if not base:
        raise RuntimeError("VIENEU_ENGINES_DIR chưa set — không tìm được model VoxCPM.")
    model_root = Path(base) / _ENGINE_ID / "model"
    if not model_root.exists():
        raise RuntimeError(f"Model VoxCPM chưa tải: {model_root}")
    # HF snapshot có thể nằm trong thư mục con — nhận diện qua config.json.
    if (model_root / "config.json").exists():
        return model_root
    for sub in model_root.rglob("config.json"):
        return sub.parent
    return model_root


def _ref_text_for(wav_path: str) -> str | None:
    """
    Bản chép lời của audio tham chiếu, nếu có — bật chế độ clone chính xác hơn.

    Quy ước: đặt file .txt cùng tên cạnh file audio (vd `gia_bao.wav` → `gia_bao.txt`).
    Chọn cách này thay vì thêm trường vào registry để người dùng chỉ cần thả file cạnh
    bản ghi là xong, không phải sửa cấu hình.
    """
    try:
        p = Path(wav_path)
        side = p.with_suffix(".txt")
        if side.exists():
            text = side.read_text(encoding="utf-8").strip()
            return text or None
    except Exception:
        pass
    return None


class VoxCpmEngine:
    """VoxCPM qua package `voxcpm` (PyTorch). Khớp TTSEngine Protocol."""

    def __init__(self) -> None:
        from onnx_providers import resolve_providers, resolve_threads

        providers = resolve_providers(os.environ.get("VIENEU_ONNX_PROVIDERS"))
        self.providers = providers
        self.threads = resolve_threads()

        # VoxCPM chạy trên torch, không phải ONNX Runtime — provider của ORT chỉ dùng
        # để suy ra người dùng có muốn/có GPU hay không rồi map sang device của torch.
        want_cuda = any("CUDA" in p for p in providers)
        device = "cpu"
        if want_cuda:
            try:
                import torch
                if torch.cuda.is_available():
                    device = "cuda"
            except Exception:
                device = "cpu"
        self.device = device

        from voxcpm import VoxCPM
        self._model = VoxCPM.from_pretrained(str(_model_dir()))
        try:
            self._model.to(device)
        except Exception:
            # Một số bản đã tự chọn device lúc load — không có .to() thì bỏ qua.
            pass

    def capabilities(self) -> dict:
        return {
            "id": _ENGINE_ID,
            "label": "VoxCPM",
            "sample_rate": SAMPLE_RATE,
            "supports_clone": True,
            "supports_preset": False,   # VoxCPM dùng "voice design" bằng mô tả, không có preset cố định
            "supports_emotion": False,
            "multilingual": True,       # 30 ngôn ngữ, có tiếng Việt
            "providers": self.providers,
            "device": self.device,
            "slow": True,               # RTF 4.5–9.5 trên CPU — UI dùng để cảnh báo
        }

    def encode_reference(self, wav_path: str) -> object:
        """
        VoxCPM clone thẳng từ file wav, không pre-encode như VieNeu.

        Trả kèm bản chép lời (nếu có) để synthesize dùng chế độ clone chính xác hơn.
        Giữ nguyên dạng dict để về sau thêm trường mà không phá cache đã lưu.
        """
        return {"wav_path": str(wav_path), "ref_text": _ref_text_for(str(wav_path))}

    def _run(self, text: str, ref: dict, overrides: dict | None) -> np.ndarray:
        kwargs: dict = {"text": text}
        wav_path = ref.get("wav_path")
        if wav_path:
            kwargs["prompt_wav_path"] = wav_path
        ref_text = ref.get("ref_text")
        if ref_text:
            kwargs["prompt_text"] = ref_text

        ov = overrides or {}
        if ov.get("temperature") is not None:
            kwargs["temperature"] = ov["temperature"]
        if ov.get("top_k") is not None:
            kwargs["top_k"] = ov["top_k"]
        if ov.get("top_p") is not None:
            kwargs["top_p"] = ov["top_p"]

        wav = self._model.generate(**kwargs)
        wav = np.asarray(wav, dtype=np.float32).ravel()

        # VoxCPM2 xuất 48kHz, bản 0.5B xuất 16kHz — hỏi model rồi resample nếu lệch,
        # vì contract của server là 48kHz cho mọi engine.
        sr = int(getattr(self._model, "sample_rate", SAMPLE_RATE) or SAMPLE_RATE)
        if sr != SAMPLE_RATE:
            import soxr
            wav = soxr.resample(wav, sr, SAMPLE_RATE).astype(np.float32)
        return wav

    def synthesize(self, text: str, ref_embedding: object, speed: float = 1.0,
                   overrides: dict | None = None) -> np.ndarray:
        # Chấp nhận cả dict (từ encode_reference) lẫn str (registry/cache bản cũ).
        ref = ref_embedding if isinstance(ref_embedding, dict) else {"wav_path": str(ref_embedding)}
        wav = self._run(text, ref, overrides)
        return self._post_process(wav, speed)

    def synthesize_preset(self, text: str, preset_id: str, speed: float = 1.0,
                          overrides: dict | None = None) -> np.ndarray:
        raise RuntimeError("VoxCPM không có giọng preset — hãy chọn một giọng clone từ audio mẫu.")

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
        self._model = None
