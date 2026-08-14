"""Test state/switch STT (Phase 1) — engine STT riêng, KHÔNG dùng chung cache/LRU với TTS
(xem docs/dev/history/2026-08-14-stt-nen-tang-giai-doan-1.md cho lý do). Mirror phong cách
test_engine_cache.py: engine giả, không nạp model thật, chạy trong mili giây.
"""
import asyncio

import pytest
from fastapi import HTTPException

import main


class FakeSttEngine:
    """Engine STT giả — đếm số lần tạo để phát hiện nạp lại thừa."""

    created: dict[str, int] = {}

    def __init__(self, engine_id: str):
        self.engine_id = engine_id
        FakeSttEngine.created[engine_id] = FakeSttEngine.created.get(engine_id, 0) + 1

    def capabilities(self) -> dict:
        return {"id": self.engine_id}

    def transcribe(self, audio_path: str, language: str | None = None) -> dict:
        return {"text": f"[{self.engine_id}] fake transcript", "language": language, "duration_sec": 1.0}


@pytest.fixture(autouse=True)
def reset_state(monkeypatch):
    FakeSttEngine.created = {}
    main._stt_engine = None
    main._current_stt_engine_id = None
    # Không đụng state TTS (_engine/_engines/...) ở đây — cố ý tách biệt, xem test riêng
    # test_engine_cache.py cho state TTS.

    def fake_create_engine(engine_id: str):
        if engine_id == "khong-ton-tai":
            raise ValueError(f"Engine không tồn tại: {engine_id!r}")
        if engine_id == "whisper-torch-fake":
            raise ImportError("No module named 'torch'")
        return FakeSttEngine(engine_id)

    monkeypatch.setattr("engine_registry.create_engine", fake_create_engine)
    yield
    main._stt_engine = None
    main._current_stt_engine_id = None


def switch_stt(engine_id: str):
    return asyncio.run(main.switch_stt_engine(main.EngineSwitchRequest(engine_id=engine_id)))


def switch_tts(engine_id: str):
    return asyncio.run(main.switch_engine(main.EngineSwitchRequest(engine_id=engine_id)))


def unload_tts(engine_id: str):
    return asyncio.run(main.unload_engine(main.EngineSwitchRequest(engine_id=engine_id)))


# ── Switch engine STT (đơn instance, không LRU) ────────────────────────────────

def test_switch_nap_engine_stt_va_dat_lam_hien_hanh():
    res = switch_stt("whisper-base")
    assert res["ok"] is True
    assert res["current"] == "whisper-base"
    assert res["reused"] is False
    assert main._current_stt_engine_id == "whisper-base"
    assert FakeSttEngine.created["whisper-base"] == 1


def test_switch_lai_dung_engine_dang_dung_la_no_op():
    switch_stt("whisper-base")
    res = switch_stt("whisper-base")
    assert res["reused"] is True
    assert FakeSttEngine.created["whisper-base"] == 1


def test_switch_stt_engine_khong_co_runtime_tra_409():
    with pytest.raises(HTTPException) as exc:
        switch_stt("whisper-torch-fake")
    assert exc.value.status_code == 409
    assert exc.value.detail["reason"] == "unavailable_in_process"


def test_switch_stt_engine_la_tra_404():
    with pytest.raises(HTTPException) as exc:
        switch_stt("khong-ton-tai")
    assert exc.value.status_code == 404
    assert exc.value.detail["reason"] == "unknown_engine"


def test_switch_stt_thieu_engine_id_tra_400():
    with pytest.raises(HTTPException) as exc:
        switch_stt("   ")
    assert exc.value.status_code == 400


# ── Guard chặn chéo category (rủi ro phát hiện lúc research — sửa NGAY từ đầu) ─

def test_stt_switch_tu_choi_engine_id_la_tts():
    with pytest.raises(HTTPException) as exc:
        switch_stt("vieneu")
    assert exc.value.status_code == 400
    assert exc.value.detail["reason"] == "wrong_category"


def test_tts_switch_tu_choi_engine_id_la_stt():
    # So sánh TRƯỚC/SAU thay vì giả định giá trị cố định (vd None) — `main._current_engine_id`
    # là state module dùng chung xuyên suốt phiên pytest, test_engine_cache.py chạy trước có
    # thể để lại giá trị khác None; test này chỉ cần xác nhận guard KHÔNG ĐỔI state đó, không
    # cần xác nhận state đó là gì.
    before = main._current_engine_id
    with pytest.raises(HTTPException) as exc:
        switch_tts("whisper-base")
    assert exc.value.status_code == 400
    assert exc.value.detail["reason"] == "wrong_category"
    assert main._current_engine_id == before  # guard không đụng gì tới state TTS


def test_tts_unload_tu_choi_engine_id_la_stt():
    with pytest.raises(HTTPException) as exc:
        unload_tts("whisper-base")
    assert exc.value.status_code == 400
    assert exc.value.detail["reason"] == "wrong_category"


# ── Concurrency: _stt_lock KHÔNG serialize với _synth_lock ─────────────────────
# Đây là bằng chứng THẬT cho yêu cầu "STT phải chạy song song với TTS, không giành tài
# nguyên" — so sánh identity 2 lock khác nhau không đủ (không chứng minh được hành vi thật,
# chỉ chứng minh 2 biến khác nhau), phải đo thời gian thực khi 2 tác vụ cùng lúc.

def test_stt_lock_khac_han_synth_lock():
    assert main._stt_lock is not main._synth_lock


def test_stt_va_tts_chay_song_song_khong_cho_nhau():
    import time

    async def hold_synth_lock():
        async with main._synth_lock:
            await asyncio.sleep(0.2)

    async def hold_stt_lock():
        async with main._stt_lock:
            await asyncio.sleep(0.2)

    async def run_both():
        t0 = time.monotonic()
        await asyncio.gather(hold_synth_lock(), hold_stt_lock())
        return time.monotonic() - t0

    elapsed = asyncio.run(run_both())

    # Nếu 2 lock LÀ MỘT (bug), tổng thời gian sẽ ~0.4s (serialize). Chạy song song thật thì
    # ~0.2s (max, không phải sum). Ngưỡng 0.35s đủ dư để không flaky trên máy chậm.
    assert elapsed < 0.35, f"STT và TTS có vẻ đang chờ nhau (elapsed={elapsed:.3f}s)"
