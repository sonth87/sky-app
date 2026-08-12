"""
effects.py — hiệu ứng hậu kỳ cho audio đã sinh (reverb, delay, pitch shift...).

Port từ voicebox's `backend/utils/effects.py` (/Users/skyline/TEST/voicebox-main), dùng
`pedalboard` của Spotify (DSP chất lượng studio, binary native, MIT/GPL-free).

Chuỗi hiệu ứng được mô tả bằng JSON thuần (list các dict) nên gửi qua HTTP và lưu xuống
DB được — client gửi kèm mỗi request `/synthesize`, server chỉ việc áp dụng.

KHÁC voicebox ở chỗ lưu preset: voicebox giữ preset trong SQLite của chính backend Python.
sky-app KHÔNG làm vậy được — tiến trình Python ở đây hoàn toàn CÁCH LY với cơ sở dữ liệu
(`packages/ceremony-db` chỉ Electron main/data-service mở được; Python không nhận đường dẫn
DB nào, xem `python-server.ts`'s danh sách env). Nên preset nằm ở ceremony-db phía
TypeScript, còn module này chỉ nhận `effects_chain` ĐÃ RESOLVE theo từng request và không
biết gì về khái niệm "preset". Ranh giới đó cũng khiến module này thuần tuý và test được.

Định nghĩa tham số (min/max/step/description) nằm ở đây và expose qua `GET /effects` —
UI dựng slider từ dữ liệu đó thay vì khai lại bằng tay ở TypeScript, tránh hai nơi lệch nhau.
"""
from __future__ import annotations

from typing import Any

import numpy as np


def _registry() -> dict[str, dict[str, Any]]:
    """Bảng hiệu ứng, dựng lười để `import effects` không kéo theo pedalboard.

    Quan trọng: `main.py` import module này ở top-level, mà pedalboard là dependency
    NẶNG có binary native. Nếu vì lý do nào đó nó không cài được (vd bản đóng gói
    PyInstaller chưa gom kịp), toàn bộ service phải vẫn chạy bình thường — chỉ mất
    tính năng effects. Import lười ở đây là thứ bảo đảm điều đó.
    """
    from pedalboard import (
        Chorus, Compressor, Delay, Gain, HighpassFilter, LowpassFilter, PitchShift, Reverb,
    )

    return {
        "chorus": {
            "cls": Chorus,
            "label": "Chorus / Flanger",
            "description": "Delay điều biến. centre_delay_ms nhỏ (<10) cho flanger, lớn hơn cho chorus.",
            "params": {
                "rate_hz": {"default": 1.0, "min": 0.01, "max": 20.0, "step": 0.01, "description": "Tốc độ LFO (Hz)"},
                "depth": {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Độ sâu điều biến"},
                "feedback": {"default": 0.0, "min": 0.0, "max": 0.95, "step": 0.01, "description": "Hồi tiếp"},
                "centre_delay_ms": {"default": 7.0, "min": 0.5, "max": 50.0, "step": 0.1, "description": "Độ trễ trung tâm (ms)"},
                "mix": {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Tỉ lệ trộn wet/dry"},
            },
        },
        "reverb": {
            "cls": Reverb,
            "label": "Reverb (vang phòng)",
            "description": "Mô phỏng tiếng vang của không gian.",
            "params": {
                "room_size": {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Kích thước phòng"},
                "damping": {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Hút âm tần cao"},
                "wet_level": {"default": 0.33, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Mức tín hiệu có hiệu ứng"},
                "dry_level": {"default": 0.4, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Mức tín hiệu gốc"},
                "width": {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Độ rộng stereo"},
            },
        },
        "delay": {
            "cls": Delay,
            "label": "Delay (tiếng vọng)",
            "description": "Lặp lại tín hiệu sau một khoảng trễ.",
            "params": {
                "delay_seconds": {"default": 0.3, "min": 0.01, "max": 2.0, "step": 0.01, "description": "Thời gian trễ (giây)"},
                "feedback": {"default": 0.3, "min": 0.0, "max": 0.95, "step": 0.01, "description": "Hồi tiếp"},
                "mix": {"default": 0.3, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Tỉ lệ trộn wet/dry"},
            },
        },
        "compressor": {
            "cls": Compressor,
            "label": "Compressor (nén động)",
            "description": "Thu hẹp dải động cho âm lượng đều hơn.",
            "params": {
                "threshold_db": {"default": -20.0, "min": -60.0, "max": 0.0, "step": 0.5, "description": "Ngưỡng (dB)"},
                "ratio": {"default": 4.0, "min": 1.0, "max": 20.0, "step": 0.1, "description": "Tỉ lệ nén"},
                "attack_ms": {"default": 10.0, "min": 0.1, "max": 100.0, "step": 0.1, "description": "Thời gian tác động (ms)"},
                "release_ms": {"default": 100.0, "min": 10.0, "max": 1000.0, "step": 1.0, "description": "Thời gian nhả (ms)"},
            },
        },
        "gain": {
            "cls": Gain,
            "label": "Gain (âm lượng)",
            "description": "Tăng/giảm âm lượng theo decibel.",
            "params": {
                "gain_db": {"default": 0.0, "min": -40.0, "max": 40.0, "step": 0.5, "description": "Độ lợi (dB)"},
            },
        },
        "highpass": {
            "cls": HighpassFilter,
            "label": "Lọc thông cao",
            "description": "Cắt các tần số dưới ngưỡng.",
            "params": {
                "cutoff_frequency_hz": {"default": 80.0, "min": 20.0, "max": 8000.0, "step": 1.0, "description": "Tần số cắt (Hz)"},
            },
        },
        "lowpass": {
            "cls": LowpassFilter,
            "label": "Lọc thông thấp",
            "description": "Cắt các tần số trên ngưỡng.",
            "params": {
                "cutoff_frequency_hz": {"default": 8000.0, "min": 200.0, "max": 20000.0, "step": 1.0, "description": "Tần số cắt (Hz)"},
            },
        },
        "pitch_shift": {
            "cls": PitchShift,
            "label": "Đổi cao độ",
            "description": "Nâng/hạ cao độ theo nửa cung, giữ nguyên tốc độ.",
            "params": {
                "semitones": {"default": 0.0, "min": -12.0, "max": 12.0, "step": 0.5, "description": "Số nửa cung"},
            },
        },
    }


_CACHE: dict[str, dict[str, Any]] | None = None


def registry() -> dict[str, dict[str, Any]]:
    """Bảng hiệu ứng (cache sau lần dựng đầu). Raise ImportError nếu thiếu pedalboard."""
    global _CACHE
    if _CACHE is None:
        _CACHE = _registry()
    return _CACHE


def available() -> bool:
    """pedalboard có dùng được không — để `GET /effects` trả danh sách rỗng thay vì 500."""
    try:
        registry()
        return True
    except Exception:
        return False


def get_available_effects() -> list[dict[str, Any]]:
    """Danh sách hiệu ứng + định nghĩa tham số, cho UI tự dựng bộ chỉnh."""
    return [
        {
            "type": effect_type,
            "label": info["label"],
            "description": info["description"],
            # Bỏ `cls` — class Python không JSON hoá được, và client không cần biết.
            "params": {name: dict(pdef) for name, pdef in info["params"].items()},
        }
        for effect_type, info in registry().items()
    ]


def validate_effects_chain(effects_chain: list[dict[str, Any]]) -> str | None:
    """Trả None nếu hợp lệ, hoặc chuỗi mô tả lỗi.

    Kiểm cả kiểu lẫn khoảng giá trị: tham số ngoài min/max đưa thẳng vào pedalboard có
    thể ném lỗi khó hiểu từ tầng C++, hoặc tệ hơn là cho ra audio vỡ tiếng mà không báo gì.
    """
    if not isinstance(effects_chain, list):
        return "effects_chain phải là một danh sách"

    reg = registry()
    for i, effect in enumerate(effects_chain):
        if not isinstance(effect, dict):
            return f"Hiệu ứng thứ {i} phải là object"

        effect_type = effect.get("type")
        if effect_type not in reg:
            return f"Hiệu ứng '{effect_type}' (thứ {i}) không tồn tại. Có: {list(reg)}"

        params = effect.get("params", {})
        if not isinstance(params, dict):
            return f"Hiệu ứng '{effect_type}' (thứ {i}): params phải là object"

        defs = reg[effect_type]["params"]
        for name, value in params.items():
            if name not in defs:
                return f"Hiệu ứng '{effect_type}' (thứ {i}): không có tham số '{name}'"
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                return f"Hiệu ứng '{effect_type}' (thứ {i}): '{name}' phải là số"
            pdef = defs[name]
            if value < pdef["min"] or value > pdef["max"]:
                return (
                    f"Hiệu ứng '{effect_type}' (thứ {i}): '{name}' phải trong khoảng "
                    f"{pdef['min']}–{pdef['max']} (nhận {value})"
                )

    return None


def build_pedalboard(effects_chain: list[dict[str, Any]]):
    """Dựng Pedalboard từ mô tả JSON. Bỏ qua hiệu ứng có `enabled: false`."""
    from pedalboard import Pedalboard

    reg = registry()
    plugins = []
    for effect in effects_chain:
        if not effect.get("enabled", True):
            continue
        info = reg[effect["type"]]
        given = effect.get("params", {}) or {}
        # Trộn với mặc định: client chỉ cần gửi tham số nó thật sự đổi.
        params = {name: given.get(name, pdef["default"]) for name, pdef in info["params"].items()}
        plugins.append(info["cls"](**params))

    return Pedalboard(plugins)


def apply_effects(audio: np.ndarray, sample_rate: int,
                  effects_chain: list[dict[str, Any]] | None) -> np.ndarray:
    """Áp chuỗi hiệu ứng lên audio mono float32. Chuỗi rỗng/None → trả nguyên bản."""
    if not effects_chain:
        return audio

    board = build_pedalboard(effects_chain)
    if len(board) == 0:  # mọi hiệu ứng đều bị tắt
        return audio

    # pedalboard nhận shape (channels, samples).
    mono = audio.ndim == 1
    audio_2d = audio[np.newaxis, :] if mono else audio
    processed = board(audio_2d.astype(np.float32), float(sample_rate))
    return processed[0] if mono else processed
