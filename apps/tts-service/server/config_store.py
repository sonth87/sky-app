"""
config_store.py — Cấu hình TTS lưu server-side (JSON trong userData).

Một file config CHUNG cho toàn app, chứa:
  - infer:  tham số sinh (temperature, top_k, top_p, repetition_penalty, max_new_frames)
  - device: chọn ONNX provider + số thread (Phase 3)
  - engine: id engine đang dùng (Phase 5)

Endpoint GET/PUT /config đọc/ghi file này. PUT nhận partial → merge + validate + lưu.
Config `infer` được dùng làm MẶC ĐỊNH khi /synthesize không truyền override per-request.

Đọc/ghi qua VIENEU_CONFIG_PATH (Electron truyền). Thiếu env → dùng path cạnh registry.
"""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path

# Mặc định = preset "An toàn" (khớp _INFER_KWARGS của engine cho đọc tên nghi lễ).
DEFAULTS: dict = {
    "infer": {
        "temperature": 0.1,
        "top_k": 5,
        "top_p": 0.95,
        "repetition_penalty": 1.3,
        "max_new_frames": None,   # None = engine tự tính động theo độ dài text
    },
    "device": {
        "providers": "",          # "" = auto (CPU). Xem onnx_providers.resolve_providers.
        "threads": 0,             # 0 = ORT tự quyết
    },
    "engine": "vieneu",
}

# Ngưỡng hợp lệ cho từng tham số infer (min, max). Ngoài khoảng → clamp.
_INFER_BOUNDS = {
    "temperature": (0.05, 1.5),
    "top_k": (1, 100),
    "top_p": (0.1, 1.0),
    "repetition_penalty": (1.0, 2.0),
    "max_new_frames": (40, 800),
}


def _clamp(name: str, value):
    if value is None:
        return None
    lo, hi = _INFER_BOUNDS[name]
    try:
        v = type(lo)(value) if isinstance(lo, int) and not isinstance(value, bool) else float(value)
    except (TypeError, ValueError):
        return DEFAULTS["infer"].get(name)
    return max(lo, min(hi, v))


class ConfigStore:
    """Thread-safe config store, persist JSON."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.RLock()
        self._data = self._load()

    def _load(self) -> dict:
        data = json.loads(json.dumps(DEFAULTS))  # deep copy
        if self._path.exists():
            try:
                on_disk = json.loads(self._path.read_text(encoding="utf-8"))
                for section in ("infer", "device"):
                    if isinstance(on_disk.get(section), dict):
                        data[section].update(on_disk[section])
                if isinstance(on_disk.get("engine"), str):
                    data["engine"] = on_disk["engine"]
            except Exception:
                pass  # config hỏng → dùng mặc định (không critical như registry)
        # Validate infer sau khi load.
        for k in list(data["infer"].keys()):
            if k in _INFER_BOUNDS:
                data["infer"][k] = _clamp(k, data["infer"][k])
        return data

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self._path)

    def get(self) -> dict:
        with self._lock:
            return json.loads(json.dumps(self._data))  # copy

    def get_infer(self) -> dict:
        """Chỉ phần infer (dùng làm mặc định cho /synthesize)."""
        with self._lock:
            return dict(self._data["infer"])

    def update(self, partial: dict) -> dict:
        """Merge partial (chỉ các section/khóa hợp lệ), validate, lưu, trả config mới."""
        with self._lock:
            if isinstance(partial.get("infer"), dict):
                for k, v in partial["infer"].items():
                    if k in _INFER_BOUNDS:
                        self._data["infer"][k] = _clamp(k, v)
            if isinstance(partial.get("device"), dict):
                dev = partial["device"]
                if "providers" in dev and isinstance(dev["providers"], str):
                    self._data["device"]["providers"] = dev["providers"]
                if "threads" in dev:
                    try:
                        self._data["device"]["threads"] = max(0, int(dev["threads"]))
                    except (TypeError, ValueError):
                        pass
            if isinstance(partial.get("engine"), str):
                self._data["engine"] = partial["engine"]
            self._save()
            return self.get()


def resolve_config_path() -> Path:
    """Path config: env VIENEU_CONFIG_PATH, fallback cạnh registry/ref."""
    env = os.environ.get("VIENEU_CONFIG_PATH", "").strip()
    if env:
        return Path(env)
    ref_env = os.environ.get("VIENEU_REF_DIR", "").strip()
    if ref_env:
        return Path(ref_env).parent / "config.json"
    return Path(__file__).resolve().parent / "config.json"
