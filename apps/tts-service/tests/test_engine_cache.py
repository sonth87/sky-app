"""Test cache engine + ref-codes theo engine (GĐ A của kế hoạch tts-engine-architecture).

Trọng tâm: đổi engine KHÔNG được nạp lại model đã nạp, và ref codes của engine này KHÔNG
được rò sang engine khác. Toàn bộ dùng engine giả — không nạp model thật, chạy trong mili giây.
"""
import asyncio

import pytest
from fastapi import HTTPException

import main


class FakeEngine:
    """Engine giả đủ dùng cho cache: đếm số lần được tạo để phát hiện nạp lại thừa."""

    created: dict[str, int] = {}

    def __init__(self, engine_id: str):
        self.engine_id = engine_id
        FakeEngine.created[engine_id] = FakeEngine.created.get(engine_id, 0) + 1

    def capabilities(self) -> dict:
        return {"id": self.engine_id}

    def encode_reference(self, wav_path: str) -> str:
        # Embedding "của riêng engine này" — nếu bị dùng chéo, test sẽ thấy sai tiền tố.
        return f"{self.engine_id}:{wav_path}"


@pytest.fixture(autouse=True)
def reset_state(monkeypatch):
    """Dọn sạch state module giữa các test (main.py dùng biến global)."""
    FakeEngine.created = {}
    main._engines.clear()
    main._engine_lru.clear()
    main._ref_codes_cache.clear()
    main._engine = None
    main._current_engine_id = None
    main._config = None

    def fake_create_engine(engine_id: str):
        if engine_id == "khong-ton-tai":
            raise ValueError(f"Engine không tồn tại: {engine_id!r}")
        if engine_id == "voxcpm":
            # Mô phỏng process ONNX không có torch — đúng lỗi thật gặp khi nạp engine
            # torch trong process không có runtime của nó.
            raise ImportError("No module named 'torch'")
        return FakeEngine(engine_id)

    monkeypatch.setattr("engine_registry.create_engine", fake_create_engine)
    yield
    main._engines.clear()
    main._engine_lru.clear()
    main._ref_codes_cache.clear()


def switch(engine_id: str):
    return asyncio.run(main.switch_engine(main.EngineSwitchRequest(engine_id=engine_id)))


def unload(engine_id: str):
    return asyncio.run(main.unload_engine(main.EngineSwitchRequest(engine_id=engine_id)))


# ── Cache engine ─────────────────────────────────────────────────────────────

def test_switch_nap_engine_va_dat_lam_hien_hanh():
    res = switch("vieneu")
    assert res["ok"] is True
    assert res["current"] == "vieneu"
    assert res["reused"] is False
    assert main._current_engine_id == "vieneu"
    assert main._engine.engine_id == "vieneu"
    assert FakeEngine.created["vieneu"] == 1


def test_quay_lai_engine_da_nap_KHONG_tao_lai():
    """Đây chính là điều GĐ A mua về: lần đổi thứ hai không nạp lại model."""
    switch("vieneu")
    switch("moss-tts-nano")
    res = switch("vieneu")

    assert res["reused"] is True
    assert res["current"] == "vieneu"
    # Vẫn đúng 1 lần tạo dù đã rời đi rồi quay lại.
    assert FakeEngine.created["vieneu"] == 1
    assert FakeEngine.created["moss-tts-nano"] == 1


def test_switch_sang_chinh_engine_dang_dung_la_no_op():
    switch("vieneu")
    res = switch("vieneu")
    assert res["reused"] is True
    assert res["elapsed_ms"] == 0
    assert FakeEngine.created["vieneu"] == 1


def test_engine_khong_co_runtime_tra_409_unavailable_in_process():
    """Electron dựa vào tín hiệu này để spawn process runtime riêng thay vì báo lỗi."""
    switch("vieneu")
    with pytest.raises(HTTPException) as exc:
        switch("voxcpm")

    assert exc.value.status_code == 409
    assert exc.value.detail["reason"] == "unavailable_in_process"
    # Thất bại KHÔNG được làm mất engine đang chạy.
    assert main._current_engine_id == "vieneu"
    assert main._engine.engine_id == "vieneu"


def test_engine_la_tra_404():
    with pytest.raises(HTTPException) as exc:
        switch("khong-ton-tai")
    assert exc.value.status_code == 404
    assert exc.value.detail["reason"] == "unknown_engine"


def test_switch_thieu_engine_id_tra_400():
    with pytest.raises(HTTPException) as exc:
        switch("   ")
    assert exc.value.status_code == 400


# ── LRU + hạn mức giữ ấm ─────────────────────────────────────────────────────

def test_lru_day_engine_vua_dung_xuong_cuoi():
    switch("vieneu")
    switch("moss-tts-nano")
    assert main._engine_lru == ["vieneu", "moss-tts-nano"]
    switch("vieneu")
    assert main._engine_lru == ["moss-tts-nano", "vieneu"]


def test_thai_engine_cu_khi_vuot_han_muc(monkeypatch):
    monkeypatch.setattr(main, "_CACHE_MAX_ONNX", 1)
    switch("vieneu")
    res = switch("moss-tts-nano")

    # vieneu (cũ nhất, không phải engine hiện hành) bị thải để vừa hạn mức 1.
    assert res["evicted"] == ["vieneu"]
    assert "vieneu" not in main._engines
    assert main._engine_lru == ["moss-tts-nano"]


def test_khong_bao_gio_thai_engine_dang_dung(monkeypatch):
    monkeypatch.setattr(main, "_CACHE_MAX_ONNX", 1)
    switch("vieneu")
    switch("moss-tts-nano")
    # Engine hiện hành phải luôn còn trong cache dù hạn mức đã đầy.
    assert main._current_engine_id in main._engines


# ── Ref codes tách theo engine (bug §2.4 của kế hoạch) ───────────────────────

def test_ref_codes_khong_ro_ri_giua_cac_engine():
    switch("vieneu")
    main._ref_cache()["giong-A"] = main._engine.encode_reference("a.wav")

    switch("moss-tts-nano")
    # Engine mới KHÔNG được thấy embedding do engine cũ sinh ra.
    assert main._ref_cache().get("giong-A") is None

    main._ref_cache()["giong-A"] = main._engine.encode_reference("a.wav")
    assert main._ref_codes_cache["vieneu"]["giong-A"] == "vieneu:a.wav"
    assert main._ref_codes_cache["moss-tts-nano"]["giong-A"] == "moss-tts-nano:a.wav"


def test_xoa_voice_go_ref_codes_khoi_moi_engine():
    switch("vieneu")
    main._ref_cache()["giong-A"] = "x"
    switch("moss-tts-nano")
    main._ref_cache()["giong-A"] = "y"

    main._ref_cache_forget_voice("giong-A")

    assert "giong-A" not in main._ref_codes_cache["vieneu"]
    assert "giong-A" not in main._ref_codes_cache["moss-tts-nano"]


def test_thai_engine_don_luon_ref_codes_cua_no(monkeypatch):
    monkeypatch.setattr(main, "_CACHE_MAX_ONNX", 1)
    switch("vieneu")
    main._ref_cache()["giong-A"] = "x"
    switch("moss-tts-nano")

    assert "vieneu" not in main._ref_codes_cache


# ── Unload ───────────────────────────────────────────────────────────────────

def test_unload_nha_ram_nhung_van_nap_lai_duoc():
    switch("vieneu")
    switch("moss-tts-nano")

    res = unload("vieneu")
    assert res["unloaded"] is True
    assert "vieneu" not in main._engines
    assert main._engine_lru == ["moss-tts-nano"]

    # Nạp lại được ngay từ đĩa (tạo lần 2) — khác hẳn xoá engine khỏi đĩa.
    switch("vieneu")
    assert FakeEngine.created["vieneu"] == 2


def test_unload_engine_dang_dung_bi_tu_choi():
    switch("vieneu")
    with pytest.raises(HTTPException) as exc:
        unload("vieneu")
    assert exc.value.status_code == 400
    assert main._engine is not None


def test_unload_engine_chua_nap_la_no_op():
    switch("vieneu")
    res = unload("moss-tts-nano")
    assert res["ok"] is True
    assert res["unloaded"] is False
