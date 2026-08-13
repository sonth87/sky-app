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

    # Tần số GỐC của Qwen3-TTS-12Hz — codec 12Hz giải mã ra 24kHz. Không ép lên 48kHz
    # của VieNeu: upsample không thêm thông tin, chỉ nhân đôi chi phí mọi bước sau.
    SAMPLE_RATE = 24_000

    def __init__(self, engine_id: str, label: str) -> None:
        self.engine_id = engine_id
        self.label = label
        # `main.py`'s `GET /capabilities` đọc thẳng `_engine.providers`/`_engine.threads`
        # (không qua Protocol, không có getattr fallback) — MỌI engine khác (VieNeu, MOSS,
        # QwenEngine torch, VoxCPM) đều set 2 field này dù không phải lúc nào cũng là
        # onnxruntime provider thật (vd QwenEngine torch cũng chỉ tái dùng để suy ra có
        # muốn CUDA hay không). MLX không có khái niệm "provider" kiểu ONNX (chỉ có 1
        # thiết bị GPU tích hợp qua Metal, không tự chọn) — set giá trị mô tả để tránh
        # crash `/capabilities` với `AttributeError`, không có ý nghĩa suy luận gì thêm.
        # Bug thật 2026-08-11: thiếu 2 dòng này khiến `/capabilities` ném 500 mỗi lần
        # gọi trong lúc Qwen (MLX) đang là engine phục vụ.
        self.providers = ["MLXProvider"]
        self.threads = 0

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
        """Thư mục model đã tải: VIENEU_ENGINES_DIR/<engine_id đã sanitize>/model[/<snapshot>].

        Dùng `engine_dir_name()` (không phải `self.engine_id` thẳng) — `engine_id` của
        Qwen có dấu chấm ("qwen-1.7b"), nhưng Electron ghi model vào thư mục đã lọc dấu
        chấm thành gạch dưới ("qwen-1_7b"). Thiếu bước này thì mọi lần load đều báo
        "Model chưa tải" dù đã tải/cài xong hoàn toàn — bug thật 2026-08-11, xem
        `engine_registry.py`'s `engine_dir_name()`.
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
            "sample_rate": self.SAMPLE_RATE,
            "supports_clone": True,
            "supports_preset": False,   # bản Base không có giọng preset — chỉ clone
            "supports_emotion": False,
            # False = KHÔNG nhận khối `infer` global (tuning riêng của VieNeu — top_k=5
            # sẽ ép EOS của Qwen ra ngoài top-k). Chỉnh sampling cho Qwen phải đi qua
            # `engine_overrides["qwen-*"]`; xem _run() và main.py's _run_synthesis.
            "supports_sampling": False,
            "multilingual": True,       # 10 ngôn ngữ, KHÔNG có tiếng Việt
            # Clone kiểu ICL cần bản chép lời của audio mẫu — thiếu là audio hỏng hoàn
            # toàn, không phải giảm chất lượng (xem _run). UI/`/voices/clone` đọc cờ này
            # để bắt buộc nhập transcript thay vì để lỗi xảy ra lúc synthesize.
            "requires_ref_text": True,
            "device": "mlx",
        }

    def encode_reference(self, wav_path: str, ref_text: str | None = None) -> object:
        """Clone thẳng từ file wav — giữ dạng dict để về sau thêm trường không phá cache
        đã lưu (giống engine_qwen.py/engine_voxcpm.py).

        `ref_text` từ registry ưu tiên hơn sidecar `.txt`: registry sửa được qua API/UI
        và sống sót khi voice được import lại, còn sidecar là quy ước cũ chỉ đặt được
        bằng tay (giữ làm fallback để không phá dữ liệu ai đã tạo theo cách đó).
        """
        return {
            "wav_path": str(wav_path),
            "ref_text": (ref_text or "").strip() or _ref_text_for(str(wav_path)),
        }

    def _estimate_text_tokens(self, text: str) -> int:
        """Số token của `text` theo tokenizer của chính model, hoặc ước lượng theo ký tự.

        Chỉ dùng để tính trần `max_tokens` (xem `_run`), không cần chính xác tuyệt đối —
        nhưng ưu tiên tokenizer thật vì tiếng Việt có dấu tốn token hơn hẳn tiếng Anh.
        """
        tok = getattr(self._model, "tokenizer", None)
        if tok is not None:
            try:
                return max(1, len(tok.encode(text)))
            except Exception:
                pass  # tokenizer nội bộ của lib có thể đổi API giữa các version
        # Ước lượng THỪA có chủ ý (~2 ký tự/token): cap quá chặt sẽ cắt cụt câu, còn
        # thừa một chút vẫn chặn được runaway (mốc nguy hiểm là 4096 token của lib).
        return max(1, (len(text) + 1) // 2)

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
            # ⚠️ ref_text RỖNG LÀ LỖI, KHÔNG PHẢI "thiếu tuỳ chọn". mlx-audio bật chế độ
            # ICL (in-context learning voice clone) theo điều kiện:
            #     use_icl = ref_audio is not None and ref_text is not None and has_encoder
            # Chuỗi rỗng "" KHÔNG phải None → ICL vẫn bật, nhưng với transcript TRỐNG.
            # Trong _prepare_icl_generation_inputs, prompt dựng thành
            #     ref_chat = f"<|im_start|>assistant\n{ref_text}<|im_end|>\n"
            # rồi text tokens = ref_text_tokens + target_text_tokens, còn codec stream
            # vẫn có đủ N giây ref codes. Model bị prefill với "chỗ audio này ứng với 0
            # chữ" rồi ép align target text lên đó → alignment text↔codec vỡ ngay từ
            # prefill → audio ảo giác, sai độ dài, ú ớ.
            #
            # Bug thật 2026-08-11: truyền `ref_text or ""` nên MỌI lần clone bằng Qwen
            # đều rơi vào đúng trường hợp này (thư mục ref có 14 .wav, 0 .txt).
            #
            # Đây cũng chính là cơ chế khiến Qwen đọc được TIẾNG VIỆT dù không hỗ trợ
            # chính chủ: cặp (audio Việt, transcript Việt) dạy model mapping chữ→âm ngay
            # trong prompt. Bỏ ref_text đi là bỏ luôn cơ chế đó. voicebox chặn từ tầng
            # schema (`reference_text: str = Field(..., min_length=1)`) — ta chặn ở đây.
            if not (ref_text or "").strip():
                raise RuntimeError(
                    f"{self.label} cần bản chép lời của audio mẫu để clone giọng. "
                    f"Hãy mở Quản lý giọng và nhập nội dung audio mẫu đang nói."
                )
            kwargs["ref_audio"] = wav_path
            kwargs["ref_text"] = ref_text

        # Trần số token — chặn runaway khi model miss EOS. Codec 12Hz, ~3-5 token/text
        # token là nhịp nói bình thường; hệ số 6 chừa ~50% biên cho giọng chậm/nhiều ngắt.
        #
        # Port từ mlx-audio 0.4.1 (`_generate_icl`), bản 0.4.8 đang cài ĐÃ GỠ cap này
        # (`effective_max_tokens = max_tokens` thẳng) nên không thể trông cậy vào lib:
        # thiếu cap thì mỗi lần miss EOS là sinh trọn 4096 token ≈ 5,5 phút audio rác.
        # Tính ở đây thay vì pin về 0.4.1 để không phụ thuộc version lib nào.
        kwargs["max_tokens"] = max(75, self._estimate_text_tokens(text) * 6)

        # Sampling params — chỉ nhận từ `engine_overrides` chỉ đích danh engine này.
        # KHÔNG nhận khối `infer` global (tuning của VieNeu: top_k=5 sẽ ép EOS của Qwen
        # ra ngoài top-k → gần như không dừng được); main.py's _run_synthesis đã lọc sẵn
        # theo `sampling_params` mà capabilities() khai — Qwen cố ý KHÔNG khai key nào.
        # Không set thì giữ nguyên mặc định của lib (0.9 / 50 / 1.0 / 1.05).
        #
        # Ghi chú đối chiếu: voicebox KHÔNG truyền tham số sampling nào cho Qwen (đã rà
        # toàn backend) — đây là phần sky-app làm thêm, không phải port.
        for key in ("temperature", "top_k", "top_p", "repetition_penalty", "max_tokens"):
            v = (overrides or {}).get(key)
            if v is not None:
                kwargs[key] = v

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

        # Giữ NGUYÊN tần số gốc của model (24kHz), KHÔNG ép lên 48kHz của VieNeu nữa.
        # Upsample 2× không thêm thông tin gì mà bắt mọi bước sau (cân loudness, phase
        # vocoder, chấm chất lượng, đóng gói int16) xử lý gấp đôi số mẫu. `sample_rate`
        # thật được khai qua capabilities() và trả về client qua header X-Sample-Rate.
        #
        # Trường hợp model trả sample rate KHÁC với cái đã khai (không nên xảy ra, nhưng
        # `_FALLBACK_SAMPLE_RATE` tồn tại vì result có thể thiếu hẳn field này): resample
        # về đúng cái đã khai, vì client đã được báo con số đó rồi.
        sr = sr or _FALLBACK_SAMPLE_RATE
        if sr != self.SAMPLE_RATE:
            import soxr
            wav = soxr.resample(wav, sr, self.SAMPLE_RATE).astype(np.float32)
        return wav

    def synthesize(self, text: str, ref_embedding: object, speed: float = 1.0,
                   overrides: dict | None = None) -> np.ndarray:
        ref = ref_embedding if isinstance(ref_embedding, dict) else {"wav_path": str(ref_embedding)}

        # Chia đoạn + bắt runaway ở đây, TRƯỚC `_post_process`: hậu xử lý phải chạy một
        # lần trên toàn bộ audio đã ghép, không phải từng đoạn (xem docstring
        # generate_chunked). Text ngắn đi đường tắt, không tốn thêm gì.
        from audio_dsp import has_tts_runaway
        from chunked_tts import generate_chunked

        wav = generate_chunked(
            lambda chunk: self._run(chunk, ref, overrides),
            text,
            sample_rate=self.SAMPLE_RATE,
            runaway_detector=has_tts_runaway,
        )
        return self._post_process(wav, speed)

    def synthesize_preset(self, text: str, preset_id: str, speed: float = 1.0,
                          overrides: dict | None = None) -> np.ndarray:
        raise RuntimeError(f"{self.label} không có giọng preset — hãy chọn một giọng clone từ audio mẫu.")

    def _post_process(self, audio: np.ndarray, speed: float) -> np.ndarray:
        """Hậu xử lý ở tần số GỐC của engine (24kHz) — xem audio_dsp.post_process."""
        from audio_dsp import post_process
        return post_process(audio, speed, self.SAMPLE_RATE, TRAILING_SILENCE_S, _target_dbfs())

    def close(self) -> None:
        # `del` trước khi None — giống voicebox's unload_model(), giải phóng tham chiếu
        # tường minh trước khi GC chạy thay vì chỉ đổi tên biến (đáng làm cho model vài GB
        # trên unified memory, macOS không tự trả RAM cho hệ thống ngay cả khi Python đã
        # GC xong nếu không có tín hiệu rõ ràng).
        if getattr(self, "_model", None) is not None:
            del self._model
        self._model = None
