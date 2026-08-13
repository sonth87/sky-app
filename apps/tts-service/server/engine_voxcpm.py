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

        try:
            from voxcpm import VoxCPM
        except ImportError as e:
            raise ImportError(f"voxcpm package không được cài đặt: {e}") from e

        model_dir = _model_dir()  # Có thể raise RuntimeError nếu không tìm được
        try:
            # load_denoiser=False: mặc định của voxcpm là True, khởi tạo ZipEnhancer
            # (modelscope.pipelines.pipeline) — TỰ TẢI một model khử nhiễu riêng từ
            # ModelScope (không phải HF, nên HF_HUB_OFFLINE=1 không chặn được), model
            # này KHÔNG nằm trong preflight/download flow của app. Adapter này cũng
            # không bao giờ dùng denoise=True (xem _run() bên dưới) nên tải là thừa.
            #
            # optimize=False khi không phải CUDA: voxcpm/model/voxcpm2.py's optimize()
            # tự raise ValueError nếu device != "cuda" (torch.compile chỉ chạy được
            # trên CUDA) — nhưng core.py VẪN chạy 1 lượt generate() "warm up" TRƯỚC KHI
            # biết optimize có thành công hay không, bất kể device gì. Trên CPU/MPS (mọi
            # máy không CUDA — vd Mac) lượt warmup này quan sát thực tế mất 5-10+ PHÚT
            # (RTF cực chậm khi chưa "nóng máy"), vượt xa timeout verify (120s) VÀ timeout
            # khởi động service (HEALTH_TIMEOUT_MS 120s ở python-server.ts) — treo hẳn,
            # không có tác dụng gì (không có gì được compile để "warm up" cả). Đây mới là
            # nguyên nhân chính của bug thật 2026-08-05: "Không đọc được kết quả verify"
            # khi đổi sang VoxCPM trên máy không CUDA.
            self._model = VoxCPM.from_pretrained(
                str(model_dir), load_denoiser=False, optimize=(device == "cuda"),
            )
        except Exception as e:
            raise RuntimeError(
                f"Không thể load VoxCPM model từ {model_dir}: {type(e).__name__}: {e}"
            ) from e

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
            "supports_sampling": False,  # VoxCPM dùng diffusion, không có temperature/top_k
            "multilingual": True,       # 30 ngôn ngữ, có tiếng Việt
            "providers": self.providers,
            "device": self.device,
            "slow": True,               # RTF 4.5–9.5 trên CPU — UI dùng để cảnh báo
        }

    def encode_reference(self, wav_path: str, ref_text: str | None = None) -> object:
        """
        VoxCPM clone thẳng từ file wav, không pre-encode như VieNeu.

        Trả kèm bản chép lời (nếu có) để synthesize dùng chế độ clone chính xác hơn.
        Giữ nguyên dạng dict để về sau thêm trường mà không phá cache đã lưu.

        `ref_text` từ registry ưu tiên hơn sidecar `.txt` — xem engine_qwen_mlx.py.
        """
        return {
            "wav_path": str(wav_path),
            "ref_text": (ref_text or "").strip() or _ref_text_for(str(wav_path)),
        }

    def _run(self, text: str, ref: dict, overrides: dict | None) -> np.ndarray:
        kwargs: dict = {"text": text}
        wav_path = ref.get("wav_path")
        ref_text = ref.get("ref_text")
        # voxcpm có 2 cơ chế clone RIÊNG, không trộn tuỳ ý được — generate() tự
        # raise ValueError nếu chỉ set 1 trong 2 của cặp prompt_*:
        #   - prompt_wav_path + prompt_text (bắt buộc ĐI CÙNG NHAU): "continuation
        #     mode" — biết ref nói gì nên tách content/giọng chính xác hơn
        #     ("Ultimate Cloning", xem docstring module).
        #   - reference_wav_path (dùng RIÊNG, không kèm text): clone thuần qua
        #     ref_audio token, chỉ VoxCPM2 hỗ trợ (model đang dùng ở đây).
        # Bug thật 2026-08-05: trước đây LUÔN set prompt_wav_path khi có file audio
        # bất kể ref_text có hay không (file .txt transcript là tuỳ chọn, phần lớn
        # giọng clone không có) → thiếu prompt_text đi kèm → crash mọi lần đọc giọng
        # clone không kèm transcript.
        if wav_path and ref_text:
            kwargs["prompt_wav_path"] = wav_path
            kwargs["prompt_text"] = ref_text
        elif wav_path:
            kwargs["reference_wav_path"] = wav_path
            # Nhánh này CHẠY ĐƯỢC nhưng là chế độ clone KÉM HƠN (không biết ref nói gì
            # nên tách content/giọng kém chính xác). Trước đây rơi vào đây im lặng, không
            # có cách nào biết trừ khi nghe kỹ. Ghi log để phân biệt "giọng vốn thế" với
            # "đang chạy nhầm chế độ vì thiếu transcript" — khác Qwen (bắt buộc có
            # transcript, thiếu là raise), VoxCPM chỉ giảm chất lượng nên không chặn.
            import sys
            print(
                f"[voxcpm] '{Path(wav_path).name}' chưa có bản chép lời — dùng chế độ "
                f"clone thuần (kém chính xác hơn continuation mode). Nhập transcript ở "
                f"Quản lý giọng để cải thiện.",
                file=sys.stderr, flush=True,
            )

        # `overrides` (temperature/top_k/top_p/...) là tham số sampling chung của
        # server, mặc định tuned riêng cho VieNeu (autoregressive — xem config_store.py,
        # ~0.1/5/0.95 để tránh random bad sample) và LUÔN khác None. VoxCPM sinh audio
        # bằng diffusion (cfg_value/inference_timesteps ở generate(), không có khái niệm
        # temperature/top_k/top_p) — package voxcpm cài đặt không nhận các kwargs này
        # (bug thật 2026-08-05: forward thẳng vào generate() → TypeError mọi lần
        # synthesize). Bỏ qua có chủ đích, giống synthesize_preset() bên dưới đã khai
        # rõ VoxCPM không hỗ trợ preset — không phải mọi engine đều cần honor mọi knob.

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

        # Chia đoạn cho text dài (xem chunked_tts.py). KHÔNG bật `runaway_detector`:
        # runaway là lỗi đặc trưng của đường sinh tự hồi quy bỏ lỡ EOS (Qwen), còn VoxCPM
        # sinh bằng diffusion với số bước cố định — không có EOS để mà lỡ. Bật lên chỉ
        # tạo nguy cơ báo động nhầm rồi thử lại vô ích trên engine vốn đã chậm (RTF
        # 4.5–9.5 trên CPU). voicebox cũng chỉ bật cho đúng đường MLX: `retries_runaway =
        # backend_type == "mlx"` (backends/__init__.py:238).
        from chunked_tts import generate_chunked

        wav = generate_chunked(
            lambda chunk: self._run(chunk, ref, overrides),
            text,
            sample_rate=SAMPLE_RATE,
        )
        return self._post_process(wav, speed)

    def synthesize_preset(self, text: str, preset_id: str, speed: float = 1.0,
                          overrides: dict | None = None) -> np.ndarray:
        raise RuntimeError("VoxCPM không có giọng preset — hãy chọn một giọng clone từ audio mẫu.")

    def _post_process(self, audio: np.ndarray, speed: float) -> np.ndarray:
        """Hậu xử lý dùng chung — xem audio_dsp.post_process (trước đây mỗi engine giữ
        một bản sao gần giống hệt của cùng đoạn code này)."""
        from audio_dsp import post_process
        return post_process(audio, speed, SAMPLE_RATE, TRAILING_SILENCE_S, _target_dbfs())

    def close(self) -> None:
        self._model = None
