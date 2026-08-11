"""
engine_qwen_mlx.py — Adapter Qwen3-TTS (0.6B/1.7B) qua MLX, khớp TTSEngine Protocol.

CHỈ dùng trên Apple Silicon (arm64 Darwin) — engine_registry.py's _make_qwen_06b/_17b tự
chọn class này thay vì engine_qwen.py's QwenEngine (torch) khi phát hiện Apple Silicon
(xem engine_registry.py's _is_apple_silicon()). Class này KHÔNG tự kiểm tra nền tảng —
caller quyết định, ở đây chỉ biết chạy MLX (single responsibility, giống cách
engine_qwen.py không tự hỏi "có nên dùng torch không").

Vì sao đường này có giá trị hơn hẳn engine_qwen.py (torch) trên CHÍNH nền tảng này:
package `qwen-tts` (torch) chính chủ có bug report công khai về device_map/CUDA không
hoạt động đúng trên máy không CUDA — mà Mac KHÔNG BAO GIỜ có CUDA (không phải "chưa cài",
mà là không tồn tại phần cứng đó). MLX dùng GPU riêng của Apple qua Metal, tích hợp sẵn
trong MỌI chip Apple Silicon (không cần card rời, không cần driver riêng) — đây là đường
DUY NHẤT có gia tốc phần cứng THẬT cho Qwen trên Mac.

Package: `mlx-audio` (Blaizzy/mlx-audio, MIT, https://pypi.org/project/mlx-audio).

API + các case đã đối chiếu với `backends/mlx_backend.py` THẬT của voicebox (app TTS khác
đã chạy Qwen qua MLX trong production — /Users/skyline/TEST/voicebox-main), không chỉ dựa
README/web search (từng lệch với thực tế ở 1 điểm — xem `_run()`'s comment về sample_rate):
  - Import đúng: `from mlx_audio.tts import load` (README ghi `mlx_audio.tts.utils.load_model`
    — voicebox dùng đường `mlx_audio.tts.load` và chạy được thật, ưu tiên cái đã verify).
  - `result.sample_rate` CÓ THẬT trên GenerationResult (README không nhắc tới field này).
  - `generate()` nhận `lang_code=` (tên ngôn ngữ hoặc `"auto"`) — khác README (không thấy
    nhắc `language` cho clone). `"auto"` là giá trị hợp lệ, để MLX tự nhận diện thay vì ép
    "English" như engine_qwen.py's _guess_language() phải làm (không có bằng chứng `qwen-tts`
    torch hỗ trợ "auto" nên bên đó vẫn giữ hành vi cũ).
  - HF_HUB_OFFLINE: voicebox phải tự patch `hf_offline_patch.py` vì process của họ sống lâu,
    quyết định offline-state SAU KHI vài module đã import huggingface_hub (cache nhầm state
    cũ). sky-app KHÔNG cần patch tương tự: mỗi tier là process MỚI, `HF_HUB_OFFLINE=1` set
    ngay lúc `spawn()` (python-server.ts) — có sẵn trong env TRƯỚC khi Python kịp chạy dòng
    import đầu tiên, nên không có module nào import huggingface_hub với state cũ để mà cache.

Env:
  VIENEU_ENGINES_DIR — gốc thư mục engine mở rộng (Electron truyền)
"""
from __future__ import annotations

import os
import re
from pathlib import Path

import numpy as np

# Tái dùng hằng + hậu xử lý audio của VieNeu (speed giữ pitch, loudness, trailing silence).
from engine import SAMPLE_RATE, TRAILING_SILENCE_S, _target_dbfs  # noqa

_FALLBACK_SAMPLE_RATE = 24_000  # chỉ dùng nếu result thiếu hẳn .sample_rate (phòng hờ)


def _ref_text_for(wav_path: str) -> str | None:
    """Giống engine_qwen.py's _ref_text_for — quy ước file .txt cùng tên cạnh ref audio."""
    try:
        p = Path(wav_path)
        side = p.with_suffix(".txt")
        if side.exists():
            text = side.read_text(encoding="utf-8").strip()
            return text or None
    except Exception:
        pass
    return None


def _guess_lang_code(text: str) -> str:
    """
    Đoán `lang_code` cho mlx-audio's generate(). Khác engine_qwen.py's _guess_language
    (torch path): fallback ở đây là `"auto"` (mlx-audio tự nhận diện, xác nhận qua code
    thật của voicebox — `LANGUAGE_CODE_TO_NAME.get(language, "auto")`), KHÔNG ép "English"
    như bên torch — bên đó phải ép vì không có bằng chứng `qwen-tts` hỗ trợ "auto".
    Chỉ script riêng biệt (CJK/Cyrillic) mới đủ tin cậy để đoán tường minh.
    """
    if re.search(r'[一-鿿]', text):
        return "Chinese"
    if re.search(r'[぀-ヿ]', text):
        return "Japanese"
    if re.search(r'[가-힯]', text):
        return "Korean"
    if re.search(r'[Ѐ-ӿ]', text):
        return "Russian"
    return "auto"


def _resolve_lang_code(text: str, overrides: dict | None) -> str:
    from engine_qwen import SUPPORTED_LANGUAGES  # nguồn chuẩn duy nhất, tránh trùng danh sách
    lang = (overrides or {}).get("language")
    if isinstance(lang, str) and lang in SUPPORTED_LANGUAGES:
        return lang
    return _guess_lang_code(text)


class QwenMlxEngine:
    """Qwen3-TTS qua package `mlx-audio` (MLX, Apple Silicon). Khớp TTSEngine Protocol.

    Dùng chung cho mọi kích thước — `engine_id`/`label` truyền vào lúc tạo quyết định
    thư mục model đọc (`VIENEU_ENGINES_DIR/<engine_id>/model/`), giống
    engine_qwen.py's QwenEngine (2 file riêng vì API mlx-audio khác hẳn qwen-tts,
    không đáng gộp chung 1 class rồi if/else runtime khắp nơi).
    """

    def __init__(self, engine_id: str, label: str) -> None:
        self.engine_id = engine_id
        self.label = label

        try:
            # `mlx_audio.tts.load` (không phải `.utils.load_model` như README) — đường
            # đã xác nhận chạy được thật trong code voicebox, xem docstring module.
            from mlx_audio.tts import load
        except ImportError as e:
            raise ImportError(f"mlx-audio package không được cài đặt: {e}") from e

        model_dir = self._model_dir()
        try:
            self._model = load(str(model_dir))
        except Exception as e:
            raise RuntimeError(
                f"Không thể load {label} model từ {model_dir}: {type(e).__name__}: {e}"
            ) from e

    def _model_dir(self) -> Path:
        """Thư mục model đã tải: VIENEU_ENGINES_DIR/<engine_id>/model[/<snapshot>]."""
        base = os.environ.get("VIENEU_ENGINES_DIR", "").strip()
        if not base:
            raise RuntimeError(f"VIENEU_ENGINES_DIR chưa set — không tìm được model {self.label}.")
        model_root = Path(base) / self.engine_id / "model"
        if not model_root.exists():
            raise RuntimeError(f"Model {self.label} chưa tải: {model_root}")
        if (model_root / "config.json").exists():
            return model_root
        for sub in model_root.rglob("config.json"):
            return sub.parent
        return model_root

    def capabilities(self) -> dict:
        return {
            "id": self.engine_id,
            "label": self.label,
            "sample_rate": SAMPLE_RATE,
            "supports_clone": True,
            "supports_preset": False,   # bản Base không có giọng preset — chỉ clone
            "supports_emotion": False,
            "supports_sampling": False,
            "multilingual": True,       # 10 ngôn ngữ, KHÔNG có tiếng Việt
            "device": "mlx",
        }

    def encode_reference(self, wav_path: str) -> object:
        """Clone thẳng từ file wav — giữ dạng dict để về sau thêm trường không phá cache
        đã lưu (giống engine_qwen.py/engine_voxcpm.py)."""
        return {"wav_path": str(wav_path), "ref_text": _ref_text_for(str(wav_path))}

    def _run(self, text: str, ref: dict, overrides: dict | None) -> np.ndarray:
        wav_path = ref.get("wav_path")
        ref_text = ref.get("ref_text")
        lang_code = _resolve_lang_code(text, overrides)

        # Voice prompt có thể trỏ file đã bị xoá (vd cache cũ tham chiếu file tạm) — kiểm
        # trước, đọc rõ thay vì để generate() ném lỗi khó hiểu giữa chừng. Cùng cách xử lý
        # voicebox's mlx_backend.py đã làm (validate trước, không im lặng đoán bừa).
        if wav_path and not Path(wav_path).exists():
            raise RuntimeError(f"{self.label}: ref audio không tồn tại: {wav_path}")

        kwargs: dict = {"lang_code": lang_code}
        if wav_path:
            kwargs["ref_audio"] = wav_path
            kwargs["ref_text"] = ref_text or ""

        # generate() là generator (hỗ trợ streaming qua stream=True) — không streaming ở
        # đây, nối MỌI chunk lại (không chỉ lấy result đầu) — model có thể trả nhiều đoạn
        # cho text dài, bỏ sót sẽ cắt cụt audio giữa chừng.
        chunks: list[np.ndarray] = []
        sr: int | None = None
        for result in self._model.generate(text, **kwargs):
            chunks.append(np.array(result.audio, dtype=np.float32))
            sr = int(result.sample_rate)  # có thật trên GenerationResult — xác nhận qua voicebox
        if not chunks:
            raise RuntimeError(f"{self.label}: generate() không trả audio nào.")

        wav = np.concatenate(chunks).ravel()
        sr = sr or _FALLBACK_SAMPLE_RATE
        if sr != SAMPLE_RATE:
            import soxr
            wav = soxr.resample(wav, sr, SAMPLE_RATE).astype(np.float32)
        return wav

    def synthesize(self, text: str, ref_embedding: object, speed: float = 1.0,
                   overrides: dict | None = None) -> np.ndarray:
        ref = ref_embedding if isinstance(ref_embedding, dict) else {"wav_path": str(ref_embedding)}
        wav = self._run(text, ref, overrides)
        return self._post_process(wav, speed)

    def synthesize_preset(self, text: str, preset_id: str, speed: float = 1.0,
                          overrides: dict | None = None) -> np.ndarray:
        raise RuntimeError(f"{self.label} không có giọng preset — hãy chọn một giọng clone từ audio mẫu.")

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
        # `del` trước khi None — giống voicebox's unload_model(), giải phóng tham chiếu
        # tường minh trước khi GC chạy thay vì chỉ đổi tên biến (đáng làm cho model vài GB
        # trên unified memory, macOS không tự trả RAM cho hệ thống ngay cả khi Python đã
        # GC xong nếu không có tín hiệu rõ ràng).
        if getattr(self, "_model", None) is not None:
            del self._model
        self._model = None
