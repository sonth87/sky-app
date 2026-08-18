"""
engine_qwen.py — Adapter Qwen3-TTS (0.6B/1.7B) khớp TTSEngine Protocol (engine.py).

Engine mở rộng ĐA NGÔN NGỮ (10 ngôn ngữ chính chủ: zh/en/ja/ko/de/fr/ru/pt/es/it —
KHÔNG có tiếng Việt, ít hơn MOSS-TTS-Nano's 20 ngôn ngữ). Không thay MOSS cho ca dùng
ceremony — đây đơn thuần là 1 lựa chọn giọng thêm trong catalog cho người dùng chọn
(TTS Studio, hoặc ceremony khi cần đọc văn bản không phải tiếng Việt), giống cách
VoxCPM tồn tại song song MOSS dù cùng phục vụ nhu cầu đa ngôn ngữ.

Một class dùng chung cho CẢ 2 kích thước (0.6B/1.7B) — khác VoxCPM/MOSS (mỗi file 1
engine cố định) vì Qwen chỉ khác nhau ở repo/kích thước, code inference giống hệt.
engine_registry.py truyền `engine_id`/`label` lúc tạo (xem `_make_qwen_06b`/`_make_qwen_17b`).

⚠️ CHƯA VERIFY ĐƯỢC TRÊN CPU — khác VoxCPM (đã đo RTF CPU thật). Package `qwen-tts`
chính chủ có bug report công khai (QwenLM/Qwen-Audio#85): `device_map` chỉ định GPU bị
BỎ QUA, luôn chạy CPU một cách KHÔNG chủ đích (không phải đường CPU được hỗ trợ có
thiết kế), và ép sang GPU thủ công (`model.model.to("cuda")`) gây lỗi tensor khác device.
Máy dev hiện tại (Apple Silicon, không CUDA) không tự verify runtime được. Đăng ký
`needs_gpu: True` trong engine_registry.py (khác VoxCPM's `False`) để preflight cảnh báo
đúng thay vì hứa hẹn "chậm nhưng chạy được" — chưa có bằng chứng cho Qwen như đã có cho
VoxCPM (RTF 4.5–9.5 đo thật, xem engine_voxcpm.py).

Env:
  VIENEU_ENGINES_DIR    — gốc thư mục engine mở rộng (Electron truyền)
  VIENEU_ONNX_PROVIDERS — provider; ở đây chỉ dùng để suy ra có CUDA hay không
  QWEN_REF_TEXT_<id>    — (tuỳ chọn, chưa dùng — chừa chỗ nếu sau cần override ref_text
                          qua env thay vì file .txt cạnh ref, xem _ref_text_for())
"""
from __future__ import annotations

import os
import re
from pathlib import Path

import numpy as np

# Tái dùng hằng + hậu xử lý audio của VieNeu (speed giữ pitch, loudness, trailing silence).
from engine import SAMPLE_RATE, TRAILING_SILENCE_S, _target_dbfs  # noqa

# 10 ngôn ngữ Qwen3-TTS hỗ trợ chính chủ — dùng làm danh sách hợp lệ cho override
# `language` (qua engine_overrides, xem _resolve_language) và fallback heuristic.
SUPPORTED_LANGUAGES = [
    "Chinese", "English", "Japanese", "Korean", "German",
    "French", "Russian", "Portuguese", "Spanish", "Italian",
]


def _ref_text_for(wav_path: str) -> str | None:
    """Bản chép lời của audio tham chiếu, nếu có — giống VoxCPM's _ref_text_for
    (quy ước file .txt cùng tên cạnh audio). Qwen's generate_voice_clone nhận `ref_text`
    tuỳ chọn — chưa xác nhận được có bắt buộc hay không (chưa chạy thử được, xem
    cảnh báo CPU ở đầu file), truyền None nếu không có là an toàn nhất hiện tại."""
    try:
        p = Path(wav_path)
        side = p.with_suffix(".txt")
        if side.exists():
            text = side.read_text(encoding="utf-8").strip()
            return text or None
    except Exception:
        pass
    return None


def _guess_language(text: str) -> str:
    """
    Đoán ngôn ngữ theo Unicode script — KHÔNG phải nhận diện ngôn ngữ thật (không thêm
    dependency langdetect/fasttext chỉ cho việc này). Bắt đúng CJK/Cyrillic (script
    riêng biệt, đáng tin); mọi chữ Latin (en/de/fr/pt/es/it) đều rơi về "English" vì
    không phân biệt được bằng script — SAI cho de/fr/pt/es/it nếu không chỉ định.

    Client nên truyền `language` qua `engine_overrides[engine_id]` khi biết chắc (xem
    main.py's _run_synthesis, cùng cơ chế MOSS dùng cho `max_new_frames`) — hàm này chỉ
    là lưới an toàn khi không truyền gì, không phải giải pháp nhận diện ngôn ngữ đúng.
    """
    if re.search(r'[一-鿿]', text):
        return "Chinese"
    if re.search(r'[぀-ヿ]', text):
        return "Japanese"
    if re.search(r'[가-힯]', text):
        return "Korean"
    if re.search(r'[Ѐ-ӿ]', text):
        return "Russian"
    return "English"


def _resolve_language(text: str, overrides: dict | None) -> str:
    lang = (overrides or {}).get("language")
    if isinstance(lang, str) and lang in SUPPORTED_LANGUAGES:
        return lang
    return _guess_language(text)


class QwenEngine:
    """Qwen3-TTS qua package `qwen-tts` (PyTorch). Khớp TTSEngine Protocol.

    Dùng chung cho mọi kích thước — `engine_id`/`label` truyền vào lúc tạo quyết định
    thư mục model đọc (`VIENEU_ENGINES_DIR/<engine_id>/model/`) và nhãn hiển thị.
    """

    def __init__(self, engine_id: str, label: str) -> None:
        self.engine_id = engine_id
        self.label = label

        from onnx_providers import resolve_providers, resolve_threads

        providers = resolve_providers(os.environ.get("VIENEU_ONNX_PROVIDERS"))
        self.providers = providers
        self.threads = resolve_threads()

        # Giống VoxCPM: provider ONNX chỉ dùng để suy ra người dùng có muốn CUDA hay
        # không rồi map sang device_map của torch — Qwen không dùng ONNX Runtime.
        want_cuda = any("CUDA" in p for p in providers)
        device = "cpu"
        if want_cuda:
            try:
                import torch
                if torch.cuda.is_available():
                    device = "cuda:0"
            except Exception:
                device = "cpu"
        self.device = device

        try:
            import torch
            from qwen_tts import Qwen3TTSModel
        except ImportError as e:
            raise ImportError(f"qwen-tts package không được cài đặt: {e}") from e

        model_dir = self._model_dir()
        try:
            self._model = Qwen3TTSModel.from_pretrained(
                str(model_dir), device_map=device, dtype=torch.bfloat16,
            )
        except Exception as e:
            raise RuntimeError(
                f"Không thể load {label} model từ {model_dir}: {type(e).__name__}: {e}"
            ) from e

    def _model_dir(self) -> Path:
        """Thư mục model đã tải: VIENEU_ENGINES_DIR/<engine_id đã sanitize>/model[/<snapshot>].

        Dùng `engine_dir_name()` (không phải `self.engine_id` thẳng) — xem comment cùng
        tên ở `engine_qwen_mlx.py`/`engine_registry.py`'s `engine_dir_name()` (bug thật
        2026-08-11: dấu chấm trong "qwen-1.7b" không khớp thư mục Electron đã sanitize).
        """
        from engine_registry import engine_dir_name
        base = os.environ.get("VIENEU_ENGINES_DIR", "").strip()
        if not base:
            raise RuntimeError(f"VIENEU_ENGINES_DIR chưa set — không tìm được model {self.label}.")
        model_root = Path(base) / engine_dir_name(self.engine_id) / "model"
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
            # UI dùng danh sách này để hiện dropdown chọn ngôn ngữ (truyền qua
            # `engine_overrides[engine_id].language`) — KHÔNG hardcode lại bên TS, tránh lệch
            # nếu SUPPORTED_LANGUAGES đổi. Cần chọn tay vì `_resolve_language()`'s auto-guess
            # chỉ phân biệt được script CJK/Cyrillic; MỌI chữ Latin (de/fr/pt/es/it) đều rơi
            # nhầm về "English" nếu không chỉ định — xem `_guess_language`'s docstring.
            "supported_languages": SUPPORTED_LANGUAGES,
            "requires_ref_text": True,  # xem _run() — thiếu transcript là audio hỏng
            "providers": self.providers,
            "device": self.device,
            "needs_gpu_unverified": True,  # xem cảnh báo CPU ở đầu file
        }

    def encode_reference(self, wav_path: str, ref_text: str | None = None) -> object:
        """Clone thẳng từ file wav, không pre-encode như VieNeu — giữ dạng dict để về
        sau thêm trường không phá cache đã lưu (giống VoxCPM).

        `ref_text` từ registry ưu tiên hơn sidecar `.txt` — xem engine_qwen_mlx.py.
        """
        return {
            "wav_path": str(wav_path),
            "ref_text": (ref_text or "").strip() or _ref_text_for(str(wav_path)),
        }

    def _run(self, text: str, ref: dict, overrides: dict | None) -> np.ndarray:
        wav_path = ref.get("wav_path")
        ref_text = ref.get("ref_text")
        language = _resolve_language(text, overrides)

        # Cùng lý do như engine_qwen_mlx.py's _run (xem comment dài ở đó): clone kiểu ICL
        # cần bản chép lời của ref audio để căn text↔codec; thiếu nó thì model bị prefill
        # với "audio này ứng với 0 chữ" và cho ra audio hỏng. Chặn sớm với thông báo đọc
        # được thay vì để lib tự xoay xở rồi trả về tiếng rác.
        #
        # Đường torch này truyền `ref_text=None` khi thiếu (không phải `""` như đường
        # MLX từng làm) nên hành vi lib có thể khác, nhưng CHƯA VERIFY được trên máy dev
        # (không có CUDA — xem cảnh báo đầu file). Chặn thống nhất với đường MLX là lựa
        # chọn an toàn: thà báo lỗi rõ còn hơn im lặng cho ra giọng sai.
        if wav_path and not (ref_text or "").strip():
            raise RuntimeError(
                f"{self.label} cần bản chép lời của audio mẫu để clone giọng. "
                f"Hãy mở Quản lý giọng và nhập nội dung audio mẫu đang nói."
            )

        wavs, sr = self._model.generate_voice_clone(
            text=text, language=language, ref_audio=wav_path, ref_text=ref_text,
        )
        wav = np.asarray(wavs[0], dtype=np.float32).ravel()

        sr = int(sr or SAMPLE_RATE)
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
        self._model = None
