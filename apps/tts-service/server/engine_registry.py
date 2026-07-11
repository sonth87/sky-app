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
from pathlib import Path
from typing import Callable


def _make_vieneu():
    from engine import VieneuEngine
    return VieneuEngine()


def _make_moss_nano():
    from engine_moss_nano import MossNanoEngine
    return MossNanoEngine()


# id -> metadata. `factory` lười (chỉ gọi khi chọn engine đó, ở create_engine).
# `bundled`=True: kèm installer, luôn sẵn sàng. False: phải tải theo nhu cầu.
_ENGINES: dict[str, dict] = {
    "vieneu": {
        "label": "VieNeu v3 Turbo",
        "factory": _make_vieneu,
        "description": "48kHz, clone giọng, chạy CPU/ONNX torch-free. Engine mặc định.",
        "implemented": True,
        "bundled": True,
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
    factory: Callable = meta["factory"]
    return factory()
