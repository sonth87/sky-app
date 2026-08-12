"""Test effects.py — bảng hiệu ứng, validate, và áp dụng lên audio.

Port từ voicebox's `backend/utils/effects.py` + `services/effects.py`
(/Users/skyline/TEST/voicebox-main). Bản gốc không có test riêng cho phần này; các test
dưới đây chốt hợp đồng mà UI và migration seed đều dựa vào.

Bỏ qua toàn bộ file nếu chưa cài pedalboard — nó là dependency có binary native, và
`effects.py` cố ý import lười để service vẫn chạy khi thiếu.
"""
import numpy as np
import pytest

import effects

pytestmark = pytest.mark.skipif(not effects.available(), reason="chưa cài pedalboard")

SR = 24_000

# 4 preset built-in sẽ được migration 015 seed vào ceremony-db. Giữ bản sao ở đây để test
# chốt rằng chúng THẬT SỰ hợp lệ với bảng hiệu ứng — seed một chuỗi sai vào DB thì lỗi chỉ
# lộ ra lúc người dùng bấm phát, và nằm trong migration nên sửa xong vẫn phải xử lý DB cũ.
BUILTIN_PRESETS: dict[str, list[dict]] = {
    "robotic": [
        {"type": "chorus", "enabled": True, "params": {
            "rate_hz": 0.2, "depth": 1.0, "feedback": 0.35, "centre_delay_ms": 7.0, "mix": 0.5}},
    ],
    "radio": [
        {"type": "highpass", "enabled": True, "params": {"cutoff_frequency_hz": 300.0}},
        {"type": "lowpass", "enabled": True, "params": {"cutoff_frequency_hz": 3500.0}},
        {"type": "compressor", "enabled": True, "params": {
            "threshold_db": -15.0, "ratio": 6.0, "attack_ms": 5.0, "release_ms": 50.0}},
        {"type": "gain", "enabled": True, "params": {"gain_db": 6.0}},
    ],
    "echo_chamber": [
        {"type": "reverb", "enabled": True, "params": {
            "room_size": 0.85, "damping": 0.3, "wet_level": 0.45, "dry_level": 0.55, "width": 1.0}},
        {"type": "delay", "enabled": True, "params": {
            "delay_seconds": 0.25, "feedback": 0.3, "mix": 0.2}},
    ],
    "deep_voice": [
        {"type": "pitch_shift", "enabled": True, "params": {"semitones": -3.0}},
        {"type": "lowpass", "enabled": True, "params": {"cutoff_frequency_hz": 6000.0}},
        {"type": "compressor", "enabled": True, "params": {
            "threshold_db": -18.0, "ratio": 3.0, "attack_ms": 10.0, "release_ms": 150.0}},
    ],
}


def _tone(seconds: float = 1.0, freq: float = 220.0) -> np.ndarray:
    t = np.linspace(0.0, seconds, int(SR * seconds), endpoint=False)
    return (0.3 * np.sin(2 * np.pi * freq * t)).astype(np.float32)


# ── Bảng hiệu ứng ─────────────────────────────────────────────────────────────

def test_du_8_loai_hieu_ung():
    types = {e["type"] for e in effects.get_available_effects()}
    assert types == {"chorus", "reverb", "delay", "compressor",
                     "gain", "highpass", "lowpass", "pitch_shift"}


def test_moi_tham_so_deu_khai_du_min_max_step_default():
    """UI dựng slider từ chính dữ liệu này — thiếu một khoá là slider hỏng."""
    for e in effects.get_available_effects():
        for name, pdef in e["params"].items():
            assert {"default", "min", "max", "step"} <= pdef.keys(), f"{e['type']}.{name}"
            assert pdef["min"] <= pdef["default"] <= pdef["max"], f"{e['type']}.{name}"


def test_danh_sach_hieu_ung_json_hoa_duoc():
    """Trả qua HTTP nên không được lọt class Python (`cls`) vào payload."""
    import json
    json.dumps(effects.get_available_effects())


# ── Validate ──────────────────────────────────────────────────────────────────

def test_chap_nhan_chuoi_hop_le():
    assert effects.validate_effects_chain(
        [{"type": "reverb", "params": {"room_size": 0.5}}]) is None


def test_chap_nhan_chuoi_rong():
    assert effects.validate_effects_chain([]) is None


def test_tu_choi_type_khong_ton_tai():
    assert "không tồn tại" in effects.validate_effects_chain([{"type": "khong_co"}])


def test_tu_choi_tham_so_ngoai_khoang():
    err = effects.validate_effects_chain([{"type": "reverb", "params": {"room_size": 5.0}}])
    assert "room_size" in err and "0.0" in err


def test_tu_choi_tham_so_khong_ton_tai():
    err = effects.validate_effects_chain([{"type": "gain", "params": {"khong_co": 1.0}}])
    assert "khong_co" in err


def test_tu_choi_tham_so_khong_phai_so():
    assert "phải là số" in effects.validate_effects_chain(
        [{"type": "gain", "params": {"gain_db": "to len"}}])


def test_bool_khong_duoc_coi_la_so():
    """Python coi bool là int — không chặn riêng thì `gain_db: true` lọt qua thành 1.0."""
    assert "phải là số" in effects.validate_effects_chain(
        [{"type": "gain", "params": {"gain_db": True}}])


def test_tu_choi_chuoi_khong_phai_list():
    assert effects.validate_effects_chain({"type": "reverb"}) is not None


# ── Áp dụng ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("name", list(BUILTIN_PRESETS))
def test_4_preset_built_in_hop_le_va_chay_duoc(name):
    chain = BUILTIN_PRESETS[name]
    assert effects.validate_effects_chain(chain) is None, name
    x = _tone()
    y = effects.apply_effects(x, SR, chain)
    assert y.shape == x.shape
    assert np.isfinite(y).all()
    assert not np.allclose(x, y), "hiệu ứng phải thật sự đổi tín hiệu"


def test_chuoi_rong_tra_nguyen_ban():
    x = _tone()
    assert effects.apply_effects(x, SR, []) is x
    assert effects.apply_effects(x, SR, None) is x


def test_hieu_ung_bi_tat_khong_duoc_ap():
    x = _tone()
    y = effects.apply_effects(x, SR, [{"type": "gain", "enabled": False, "params": {"gain_db": 20.0}}])
    assert np.array_equal(x, y)


def test_tham_so_thieu_dung_gia_tri_mac_dinh():
    """Client chỉ gửi tham số nó thật sự đổi — phần còn lại lấy mặc định, không lỗi."""
    y = effects.apply_effects(_tone(), SR, [{"type": "reverb", "params": {}}])
    assert np.isfinite(y).all()


def test_gain_tang_bien_do_dung_huong():
    x = _tone()
    y = effects.apply_effects(x, SR, [{"type": "gain", "params": {"gain_db": 6.0}}])
    assert np.sqrt(np.mean(y ** 2)) > np.sqrt(np.mean(x ** 2)) * 1.5
