"""Test việc lọc khối `infer` global theo `sampling_params` mà engine tự khai
(main.py's `_run_synthesis`).

Vì sao đáng test riêng: khối `infer` trong config.json là namespace DÙNG CHUNG nhưng
giá trị mặc định của nó là tuning riêng của VieNeu (temperature=0.1, top_k=5,
repetition_penalty=1.3 — xem config_store.py's DEFAULTS). Trước đây cả 5 key được rót
xuống MỌI engine. Với Qwen, `top_k=5` ép model chỉ xét 5 token mỗi bước, mà token EOS
của Qwen thường không nằm trong top-5 → model gần như không dừng được đúng lúc. Tức là
cấu hình tuned cho engine NÀY lại gây runaway ở engine KIA — im lặng, không thông báo gì.
"""
import numpy as np
import pytest

import main


class _FakeConfig:
    """Trả đúng DEFAULTS của config_store.py — giá trị tuned cho VieNeu."""

    def get_infer(self):
        return {
            "temperature": 0.1, "top_k": 5, "top_p": 0.95,
            "repetition_penalty": 1.3, "max_new_frames": None,
        }


class _FakeEngine:
    def __init__(self, engine_id: str, sampling_params: dict | None):
        self._id = engine_id
        self._sampling_params = sampling_params
        self.received: dict | None = None

    def capabilities(self):
        caps = {"id": self._id, "label": self._id}
        if self._sampling_params is not None:
            caps["sampling_params"] = self._sampling_params
        return caps

    def encode_reference(self, wav_path, ref_text=None):
        return {"wav_path": wav_path, "ref_text": ref_text}

    def synthesize(self, text, ref_embedding, speed=1.0, overrides=None):
        self.received = overrides
        return np.zeros(10, dtype=np.float32)


@pytest.fixture
def wired(monkeypatch):
    """Nối engine giả vào main + nạp sẵn ref cache để không đụng đĩa."""
    def _wire(engine_id: str, sampling_params: dict | None):
        engine = _FakeEngine(engine_id, sampling_params)
        monkeypatch.setattr(main, "_engine", engine)
        monkeypatch.setattr(main, "_config", _FakeConfig())
        monkeypatch.setattr(main, "_current_engine_id", engine_id)
        monkeypatch.setattr(main, "_ref_codes_cache", {engine_id: {"v1": {"wav_path": "x"}}})
        return engine
    return _wire


def _run(engine, **req_kwargs):
    req = main.TtsRequest(text="Xin chào", speaker_id="v1", **req_kwargs)
    main._run_synthesis(req, {"id": "v1", "type": "cloned"})
    return engine.received


def test_qwen_khong_nhan_tuning_cua_vieneu(wired):
    """Qwen không khai `sampling_params` → không nhận key nào từ khối infer global.
    Đây là bản sửa của lỗi mô tả ở đầu file."""
    engine = wired("qwen-1.7b", None)
    assert _run(engine) == {}


def test_vieneu_van_nhan_du_tuning_cua_no(wired):
    """Không được sửa lỗi này bằng cách làm VieNeu mất cấu hình — nó phải nhận đủ 5 key
    nó khai, kể cả `max_new_frames` (trước đây thiếu trong capabilities dù _merge_kwargs
    vẫn chấp nhận)."""
    engine = wired("vieneu", {
        "temperature": {}, "top_k": {}, "top_p": {},
        "repetition_penalty": {}, "max_new_frames": {},
    })
    assert _run(engine) == {
        "temperature": 0.1, "top_k": 5, "top_p": 0.95,
        "repetition_penalty": 1.3, "max_new_frames": None,
    }


def test_moss_chi_nhan_key_no_khai(wired):
    """MOSS chỉ dùng `max_new_frames` — 4 key sampling kia không được rót xuống."""
    engine = wired("moss-tts-nano", {"max_new_frames": {}})
    assert _run(engine) == {"max_new_frames": None}


def test_engine_overrides_van_toi_duoc_engine_khong_khai_gi(wired):
    """Đường DUY NHẤT để chỉnh sampling của Qwen: chỉ đích danh engine id. Không bị lọc
    vì người gọi đã nói rõ họ đang chỉnh engine nào."""
    engine = wired("qwen-1.7b", None)
    got = _run(engine, engine_overrides={"qwen-1.7b": {"temperature": 0.3, "top_k": 20}})
    assert got == {"temperature": 0.3, "top_k": 20}


def test_engine_overrides_cua_engine_khac_bi_bo_qua(wired):
    engine = wired("qwen-1.7b", None)
    assert _run(engine, engine_overrides={"vieneu": {"temperature": 0.9}}) == {}


def test_per_request_thang_config_global(wired):
    engine = wired("vieneu", {"temperature": {}, "top_k": {}})
    assert _run(engine, temperature=0.7) == {"temperature": 0.7, "top_k": 5}
