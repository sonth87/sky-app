"""Test main.py's `_encode_reference` — điểm gọi `engine.encode_reference()` ĐÚNG SIGNATURE
THẬT của engine đang chạy.

Bug thật đã sửa: gọi `encode_reference(path, ref_text)` vô điều kiện cho MỌI engine làm vỡ
engine kiểu preset/embedding thuần (VieneuEngine, MossNanoEngine) — 2 engine đó không khai
tham số `ref_text`, Python raise `TypeError: takes 2 positional arguments but 3 were given`
(không phải lỗi nghiệp vụ). Chỉ Qwen/VoxCPM (kiểu in-context) mới khai tham số này.
"""
import main


class _EngineNhanRefText:
    """Mô phỏng Qwen/VoxCPM — encode_reference(wav_path, ref_text=None)."""

    def __init__(self):
        self.calls = []

    def encode_reference(self, wav_path, ref_text=None):
        self.calls.append((wav_path, ref_text))
        return "emb"


class _EngineKhongNhanRefText:
    """Mô phỏng VieneuEngine/MossNanoEngine — encode_reference(wav_path) CHỈ 1 đối số."""

    def __init__(self):
        self.calls = []

    def encode_reference(self, wav_path):
        self.calls.append(wav_path)
        return "emb"


def test_engine_nhan_ref_text_duoc_truyen_ca_2_doi_so():
    engine = _EngineNhanRefText()
    result = main._encode_reference(engine, "/tmp/a.wav", "Xin chào")
    assert result == "emb"
    assert engine.calls == [("/tmp/a.wav", "Xin chào")]


def test_engine_khong_nhan_ref_text_chi_truyen_1_doi_so_khong_vo():
    engine = _EngineKhongNhanRefText()
    result = main._encode_reference(engine, "/tmp/a.wav", "Xin chào")
    assert result == "emb"
    assert engine.calls == ["/tmp/a.wav"]


def test_engine_khong_nhan_ref_text_van_ok_khi_ref_text_none():
    engine = _EngineKhongNhanRefText()
    result = main._encode_reference(engine, "/tmp/a.wav", None)
    assert result == "emb"
    assert engine.calls == ["/tmp/a.wav"]
