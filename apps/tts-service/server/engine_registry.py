"""
engine_registry.py — Đăng ký các TTS engine để có thể swap (multi-engine).

Engine ẩn sau Protocol `TTSEngine` (engine.py). Server chỉ gọi qua synthesize/
synthesize_preset/encode_reference + capabilities(). Thêm engine mới = implement
Protocol + đăng ký ở đây, KHÔNG đụng endpoint.

Điều kiện để engine mới nhét vào (xem docs/tts-nang-cap-plan.md §5):
  - synthesize(text, ref_embedding, speed, overrides) -> float32 np.ndarray @ 48kHz
    (hoặc khai sample_rate khác qua capabilities() và server tự resample).
  - synthesize_preset(text, preset_id, speed, overrides) nếu có giọng dựng sẵn.
  - encode_reference(wav_path) nếu hỗ trợ clone.
  - capabilities() -> {id, label, sample_rate, supports_clone, supports_preset, ...}

── Engine mở rộng tải theo nhu cầu (docs/tts-engine-download-trien-khai.md) ──
Engine không bundle sẵn (`bundled=False`) khai thêm field `install`:
  - runtime:      Python + gói pip cần cài (vd torch) — engine TỰ CHỨA runtime riêng.
  - model:        nguồn + danh sách file + checksum để tải/verify.
  - requirements: RAM/GPU/đĩa tối thiểu để preflight cảnh báo/chặn.
VieNeu (`bundled=True`) đã kèm installer nên không có `install`.
"""
from __future__ import annotations

import os
import platform
from pathlib import Path
from typing import Callable


def _is_apple_silicon() -> bool:
    """Apple Silicon THẬT (arm64) — Intel Mac cũng là Darwin nhưng KHÔNG chạy được MLX,
    nên phải kiểm cả machine(), không chỉ system()."""
    return platform.system() == "Darwin" and platform.machine() == "arm64"


def _make_vieneu():
    from engine import VieneuEngine
    return VieneuEngine()


def _make_moss_nano():
    from engine_moss_nano import MossNanoEngine
    return MossNanoEngine()


def _make_voxcpm():
    from engine_voxcpm import VoxCpmEngine
    return VoxCpmEngine()


# Qwen: 2 implementation khác hẳn nhau theo nền tảng (xem _qwen_runtime_variant bên dưới
# cho lý do) — factory tự chọn đúng class, engine_id/label giữ nguyên nên UI/registry
# không thấy khác biệt gì ngoài field runtime_kind.
def _make_qwen_06b():
    if _is_apple_silicon():
        from engine_qwen_mlx import QwenMlxEngine
        return QwenMlxEngine("qwen-0.6b", "Qwen3-TTS 0.6B")
    from engine_qwen import QwenEngine
    return QwenEngine("qwen-0.6b", "Qwen3-TTS 0.6B")


def _make_qwen_17b():
    if _is_apple_silicon():
        from engine_qwen_mlx import QwenMlxEngine
        return QwenMlxEngine("qwen-1.7b", "Qwen3-TTS 1.7B")
    from engine_qwen import QwenEngine
    return QwenEngine("qwen-1.7b", "Qwen3-TTS 1.7B")


def _qwen_runtime_variant(model_id: str) -> dict:
    """
    Phần PHỤ THUỘC NỀN TẢNG của 1 entry Qwen — tính 1 LẦN lúc import module (platform
    không đổi giữa chừng 1 phiên chạy), giống voicebox's get_backend_type() nhưng không
    cần gọi lại mỗi lần vì _ENGINES vốn là dict tĩnh.

    Apple Silicon → mlx-community's bf16 quant qua package `mlx-audio` (GPU riêng của
    Apple qua Metal, tích hợp sẵn mọi chip Apple Silicon — không cần/không có CUDA nên
    không thể dùng đường torch). Nền tảng khác → repo PyTorch gốc qua `qwen-tts` (cần
    CUDA thật — xem cảnh báo trong engine_qwen.py's docstring).
    """
    if _is_apple_silicon():
        return {
            "runtime_kind": "mlx",
            "pip_packages": ["mlx-audio", "soundfile", "soxr>=0.3,<0.4"],
            "repo": f"mlx-community/Qwen3-TTS-12Hz-{model_id}-Base-bf16",
            "needs_gpu": False,  # Metal tích hợp sẵn Apple Silicon, không cần card rời
            "note": "Chạy qua MLX trên Apple Silicon (dùng GPU tích hợp qua Metal)",
        }
    return {
        "runtime_kind": "torch",
        "pip_packages": ["torch>=2.5", "qwen-tts", "soundfile", "soxr>=0.3,<0.4"],
        "repo": f"Qwen/Qwen3-TTS-12Hz-{model_id}-Base",
        "needs_gpu": True,
        "note": "Cần GPU CUDA — chưa xác nhận chạy ổn định trên CPU",
    }


_qwen_06b_variant = _qwen_runtime_variant("0.6B")
_qwen_17b_variant = _qwen_runtime_variant("1.7B")


# id -> metadata. `factory` lười (chỉ gọi khi chọn engine đó, ở create_engine).
# `bundled`=True: kèm installer, luôn sẵn sàng. False: phải tải theo nhu cầu.
_ENGINES: dict[str, dict] = {
    "vieneu": {
        "label": "VieNeu v3 Turbo",
        "factory": _make_vieneu,
        "description": "48kHz, clone giọng, chạy CPU/ONNX torch-free. Engine mặc định.",
        "implemented": True,
        "bundled": True,
        "runtime_kind": "onnx-bundled",
    },
    # Engine mở rộng THẬT (OpenMOSS MOSS-TTS-Nano): 0.1B, ĐA NGÔN NGỮ (20 ngôn ngữ,
    # auto-detect từ text; KHÔNG có tiếng Việt) → bổ sung cho text/tên nước ngoài.
    # Chạy runtime ONNX/CPU TORCH-FREE (server/moss_runtime/, đã vá torchaudio).
    # Output 48kHz — đồng nhất VieNeu. Tải model + runtime nhẹ theo nhu cầu.
    "moss-tts-nano": {
        "label": "MOSS-TTS-Nano (đa ngôn ngữ)",
        "factory": _make_moss_nano,
        "description": "OpenMOSS MOSS-TTS-Nano 0.1B — TTS 20 ngôn ngữ (tiếng nước ngoài), chạy CPU/ONNX torch-free, 48kHz. Không hỗ trợ tiếng Việt (dùng VieNeu cho tên Việt).",
        "implemented": True,
        "bundled": False,
        "runtime_kind": "onnx-ext",
        "install": {
            "runtime": {
                "python_version": "3.11",
                # TORCH-FREE: chỉ dependency nhẹ (~không có torch/transformers).
                # WeTextProcessing để CUỐI + cho phép fail (pynini khó cài) — engine
                # mặc định tắt WeText (MOSS_ENABLE_WETEXT=0), đọc tên/chữ không cần.
                "pip_packages": [
                    "onnxruntime>=1.20.0",
                    "numpy>=1.24",
                    "sentencepiece>=0.1.99",
                    "soundfile",
                    "soxr>=0.3,<0.4",
                ],
                "pip_packages_optional": [
                    "WeTextProcessing>=1.0.4.1",       # chuẩn hoá số/ngày — không bắt buộc
                ],
            },
            "model": {
                "source": "hf",
                "repo": "OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX",  # ~673MB (đã verify)
                "files": [],                          # resolve từ HF API khi cài
                "total_mb": 700,                      # ước lượng (model + codec dùng lại VieNeu bundled)
            },
            "requirements": {
                "min_ram_gb": 2,
                "recommended_ram_gb": 4,
                "needs_gpu": False,
                "disk_headroom_factor": 2.0,
            },
        },
    },
    # Engine mở rộng ĐA NGÔN NGỮ CÓ TIẾNG VIỆT (30 ngôn ngữ) — khác MOSS ở đúng điểm
    # đó. Chạy PyTorch nên nặng và CHẬM (RTF 4.5–9.5 trên CPU: 10 giây audio mất
    # 45–95 giây); đổi lại chất lượng cao và clone giọng có thể kèm bản chép lời.
    "voxcpm": {
        "label": "VoxCPM (đa ngôn ngữ, chất lượng cao)",
        "factory": _make_voxcpm,
        "description": "OpenBMB VoxCPM — TTS 30 ngôn ngữ gồm tiếng Việt, clone giọng chất lượng cao. CHẬM hơn VieNeu nhiều lần trên CPU; nên dùng khi ưu tiên chất lượng hoặc cần ngôn ngữ khác.",
        "implemented": True,
        "bundled": False,
        "runtime_kind": "torch",
        "install": {
            "runtime": {
                "python_version": "3.11",
                # Khác MOSS (torch-free): VoxCPM buộc phải có torch. Ghim CPU-only wheel
                # là việc của người dùng nếu muốn nhẹ; ở đây để pip tự giải.
                "pip_packages": [
                    "torch>=2.5",
                    "voxcpm",
                    "soundfile",
                    "soxr>=0.3,<0.4",
                ],
            },
            "model": {
                "source": "hf",
                "repo": "openbmb/VoxCPM2",
                "files": [],        # resolve từ HF API khi cài
                "total_mb": 4500,   # ước lượng trọng số 2B; preflight tự cộng ~2500MB cho torch
            },
            "requirements": {
                "min_ram_gb": 8,
                "recommended_ram_gb": 16,
                "needs_gpu": False,   # chạy được CPU, chỉ là chậm
                "disk_headroom_factor": 2.0,
            },
        },
    },
    # Qwen3-TTS (Alibaba) — 10 NGÔN NGỮ (zh/en/ja/ko/de/fr/ru/pt/es/it), KHÔNG có tiếng
    # Việt (đã xác nhận qua HuggingFace model card chính chủ 2026-08-11, không chỉ dựa
    # config phụ của app khác) — vai trò tương tự MOSS (đọc text không phải tiếng Việt),
    # KHÔNG thay VieNeu. Đăng ký vì ceremony/TTS Studio đi qua TTS server chung, không
    # cột cứng theo VieNeu — thêm 1 lựa chọn giọng, không cần "hơn MOSS" mới đáng thêm.
    #
    # runtime_kind/repo/pip_packages/needs_gpu PHỤ THUỘC NỀN TẢNG (xem
    # _qwen_runtime_variant) — Apple Silicon dùng MLX (Metal, tích hợp sẵn, không cần
    # CUDA); nền tảng khác dùng torch (cần GPU CUDA thật — package `qwen-tts` chính chủ
    # có bug report công khai QwenLM/Qwen-Audio#85 về device_map/CPU không hoạt động
    # đúng, chưa có số đo RTF CPU thật như VoxCPM đã có). engine_id/label giữ nguyên bất
    # kể nền tảng — người dùng chỉ thấy 1 "Qwen3-TTS 0.6B", không phải 2 lựa chọn.
    "qwen-0.6b": {
        "label": "Qwen3-TTS 0.6B",
        "factory": _make_qwen_06b,
        "description": f"Qwen3-TTS 0.6B (Alibaba) — TTS 10 ngôn ngữ (zh/en/ja/ko/de/fr/ru/pt/es/it), không hỗ trợ tiếng Việt. {_qwen_06b_variant['note']}.",
        "implemented": True,
        "bundled": False,
        "runtime_kind": _qwen_06b_variant["runtime_kind"],
        "install": {
            "runtime": {
                "python_version": "3.11",
                "pip_packages": _qwen_06b_variant["pip_packages"],
            },
            "model": {
                "source": "hf",
                "repo": _qwen_06b_variant["repo"],
                "files": [],        # resolve từ HF API khi cài
                "total_mb": 1750,   # đo thật qua HF API 2026-08-11 — torch VÀ mlx bf16 cùng ~1744.6MB
            },
            "requirements": {
                "min_ram_gb": 4,
                "recommended_ram_gb": 8,
                "needs_gpu": _qwen_06b_variant["needs_gpu"],
                "disk_headroom_factor": 2.0,
            },
        },
    },
    "qwen-1.7b": {
        "label": "Qwen3-TTS 1.7B",
        "factory": _make_qwen_17b,
        "description": f"Qwen3-TTS 1.7B (Alibaba) — TTS 10 ngôn ngữ (zh/en/ja/ko/de/fr/ru/pt/es/it), không hỗ trợ tiếng Việt. {_qwen_17b_variant['note']}.",
        "implemented": True,
        "bundled": False,
        "runtime_kind": _qwen_17b_variant["runtime_kind"],
        "install": {
            "runtime": {
                "python_version": "3.11",
                "pip_packages": _qwen_17b_variant["pip_packages"],
            },
            "model": {
                "source": "hf",
                "repo": _qwen_17b_variant["repo"],
                "files": [],        # resolve từ HF API khi cài
                "total_mb": 3690,   # đo thật qua HF API 2026-08-11 — torch VÀ mlx bf16 cùng ~3678.7MB
            },
            "requirements": {
                "min_ram_gb": 6,
                "recommended_ram_gb": 12,
                "needs_gpu": _qwen_17b_variant["needs_gpu"],
                "disk_headroom_factor": 2.0,
            },
        },
    },
}


def list_engines() -> list[dict]:
    """Liệt kê engine đăng ký (cho UI). Không khởi tạo engine, không tải model."""
    out = []
    for eid, meta in _ENGINES.items():
        install = meta.get("install")
        # Chỉ expose phần install cần cho preflight/tải (model + runtime), KHÔNG expose factory.
        install_public = None
        if install:
            install_public = {
                "model": install.get("model"),
                "runtime": install.get("runtime"),
            }
        out.append({
            "id": eid,
            "label": meta["label"],
            "description": meta["description"],
            "implemented": meta["implemented"],
            "bundled": meta.get("bundled", False),
            "runtime_kind": engine_runtime_kind(eid),
            "capabilities": _static_caps(eid) if meta["implemented"] else None,
            "requirements": (install or {}).get("requirements"),
            "install": install_public,
            "install_status": engine_install_status(eid),
        })
    return out


def _static_caps(engine_id: str) -> dict | None:
    """Capabilities tĩnh (không load model). Chỉ cho engine biết trước."""
    if engine_id == "vieneu":
        return {
            "id": "vieneu",
            "label": "VieNeu v3 Turbo",
            "sample_rate": 48_000,
            "supports_clone": True,
            "supports_preset": True,
            "supports_emotion": False,
        }
    return None


def engine_runtime_kind(engine_id: str) -> str:
    """Loại runtime engine cần: 'onnx-bundled' | 'onnx-ext' | 'torch'.

    Dùng để (a) quyết định engine nào ở chung được 1 process, (b) đặt hạn mức giữ ấm
    trong cache (engine torch tốn vài GB RAM nên chỉ giữ 1, engine ONNX rẻ hơn nhiều).

    Khai tường minh trong `_ENGINES`; nếu thiếu thì suy ra từ `pip_packages` (có torch
    → 'torch') để engine thêm sau mà quên khai vẫn được xếp đúng nhóm nặng.
    """
    meta = _ENGINES.get(engine_id)
    if meta is None:
        return "torch"  # không biết → giả định nặng, an toàn hơn cho hạn mức RAM
    declared = meta.get("runtime_kind")
    if isinstance(declared, str) and declared:
        return declared
    if meta.get("bundled"):
        return "onnx-bundled"
    pkgs = ((meta.get("install") or {}).get("runtime") or {}).get("pip_packages") or []
    return "torch" if any("torch" in str(p).lower() for p in pkgs) else "onnx-ext"


def engine_site_packages(engine_id: str) -> Path | None:
    """site-packages riêng của engine mở rộng đã cài, hoặc None nếu không có.

    Cho phép process đang chạy nạp engine mở rộng KHÔNG cần restart: thêm đường dẫn này
    vào cuối `sys.path` (cuối, không phải đầu — gói của process chủ luôn thắng, tránh
    numpy/onnxruntime của engine ghi đè bản đã bundle gây lệch ABI).
    """
    d = _engine_data_dir(engine_id)
    if d is None:
        return None
    sp = d / "runtime" / "site-packages"
    return sp if sp.exists() else None


def _engine_data_dir(engine_id: str) -> Path | None:
    """Thư mục cài đặt engine mở rộng (do Electron truyền qua VIENEU_ENGINES_DIR).

    Cấu trúc: <VIENEU_ENGINES_DIR>/<engine_id>/{runtime, model, manifest.json}.
    Trả None nếu env chưa set (vd chạy server độc lập không qua Electron).
    """
    base = os.environ.get("VIENEU_ENGINES_DIR", "").strip()
    if not base:
        return None
    return Path(base) / engine_id


def engine_install_status(engine_id: str) -> str:
    """Trạng thái cài đặt engine trên đĩa: 'installed' | 'partial' | 'missing'.

    - Bundled (VieNeu): luôn 'installed'.
    - Mở rộng: đọc manifest.json trong thư mục engine. Không có → 'missing';
      có nhưng chưa đủ (runtime/model thiếu) → 'partial'; đủ → 'installed'.
    """
    meta = _ENGINES.get(engine_id)
    if meta is None:
        return "missing"
    if meta.get("bundled"):
        return "installed"

    d = _engine_data_dir(engine_id)
    if d is None or not d.exists():
        return "missing"
    manifest = d / "manifest.json"
    if not manifest.exists():
        # Có thư mục nhưng chưa có manifest → đang tải dở hoặc lỗi.
        return "partial" if any(d.iterdir()) else "missing"
    try:
        import json
        data = json.loads(manifest.read_text(encoding="utf-8"))
        # Chỉ 'installed' (đủ model + runtime) mới coi là dùng được; còn lại partial.
        return "installed" if data.get("status") == "installed" else "partial"
    except Exception:
        return "partial"


def create_engine(engine_id: str):
    """Khởi tạo engine theo id. Lỗi nếu id lạ hoặc engine chưa dùng được."""
    meta = _ENGINES.get(engine_id)
    if meta is None:
        raise ValueError(f"Engine không tồn tại: {engine_id!r}. Có: {list(_ENGINES)}")
    if not meta["implemented"] or meta["factory"] is None:
        raise NotImplementedError(
            f"Engine {engine_id!r} chưa dùng được (chưa nối factory / chưa cài xong). "
            f"Xem docs/tts-engine-download-trien-khai.md."
        )

    # Engine mở rộng TORCH-FREE: nạp được ngay trong process đang chạy bằng cách thêm
    # site-packages của nó vào CUỐI sys.path — nhờ vậy đổi engine không cần restart.
    # KHÔNG làm điều này cho engine torch: trộn torch + numpy của bản cài rời vào một
    # process đã bundle sẵn numpy/onnxruntime rất dễ lệch ABI. Engine torch để cho
    # ImportError xảy ra tự nhiên — caller (main.py) bắt và báo cho Electron biết là
    # phải spawn process runtime riêng cho nó.
    if engine_runtime_kind(engine_id) == "onnx-ext":
        sp = engine_site_packages(engine_id)
        if sp is not None:
            import sys
            sp_str = str(sp)
            if sp_str not in sys.path:
                sys.path.append(sp_str)

    factory: Callable = meta["factory"]
    return factory()
