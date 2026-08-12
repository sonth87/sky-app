"""Test tầng HTTP của /voices/clone (nhiều file) + /voices/{id}/samples — xác nhận
multipart nhận đúng `files`/`ref_texts` dạng list và nối đúng vào voice_registry.

Không có TestClient nào trong repo trước Phase 2 — main.py's endpoint trước giờ chỉ được
kiểm qua test đơn vị các hàm nội bộ. Bổ sung ở đây để bắt lỗi "wiring" tầng HTTP mà unit
test (test_voice_registry_sqlite.py, test_resolve_voice_ref.py) không chạm tới: đúng cú
pháp FastAPI, đúng shape multipart, đúng thứ tự gọi add_cloned/add_sample.

`_validate_ref_audio` được mock (trả `[]`, không cảnh báo) — DSP thật (trim/normalize) đã
test riêng ở test_audio_dsp_ref.py; ở đây chỉ cần header WAV hợp lệ để qua được bước kiểm
định dạng, tập trung vào luồng nhiều file.
"""
import pytest
from fastapi.testclient import TestClient

import main

# Endpoint kiểm `len(content) < 44` (kích thước header WAV chuẩn tối thiểu) TRƯỚC cả bước
# đọc nội dung — 16 byte (chỉ có magic "RIFF"/"WAVE") không đủ, phải đệm cho đạt 44.
WAV_HEADER = b"RIFF\x00\x00\x00\x00WAVEfmt " + b"\x00" * (44 - 16)


class _FakeEngine:
    def capabilities(self):
        return {"id": "test-engine", "label": "Test Engine", "requires_ref_text": False}


class _RequiresRefTextEngine(_FakeEngine):
    def capabilities(self):
        return {"id": "qwen-1.7b", "label": "Qwen", "requires_ref_text": True}


class _FakeRegistry:
    """Ghi lại lời gọi thay vì đọc/ghi SQL/JSON thật — voice_registry.py's 2 kho đã có test
    riêng rất chặt (test_voice_registry_sqlite.py, test_voice_registry_json.py); ở đây chỉ
    cần xác nhận main.py GỌI ĐÚNG chúng theo đúng thứ tự."""

    def __init__(self):
        self.add_cloned_calls = []
        self.add_sample_calls = []
        self.samples = {}
        self._next_id = 0

    def add_cloned(self, label, gender, region, ref_file, voice_id=None, extra=None):
        self._next_id += 1
        vid = voice_id or f"clone-{self._next_id}"
        self.add_cloned_calls.append(
            {"label": label, "gender": gender, "region": region, "ref_file": ref_file, "extra": extra}
        )
        self.samples[vid] = [{"id": f"{vid}-primary", "ref_file": ref_file, **(extra or {})}]
        return {"id": vid, "type": "cloned", "label": label}

    def add_sample(self, voice_id, ref_file, ref_text=None):
        self.add_sample_calls.append({"voice_id": voice_id, "ref_file": ref_file, "ref_text": ref_text})
        entry = {"id": f"sample-{len(self.add_sample_calls)}", "ref_file": ref_file}
        if ref_text:
            entry["ref_text"] = ref_text
        self.samples.setdefault(voice_id, []).append(entry)
        return entry

    def list_samples(self, voice_id):
        return self.samples.get(voice_id, [])

    def get_voice(self, voice_id):
        if voice_id not in self.samples:
            return None
        return {"id": voice_id, "type": "cloned", "label": "X"}

    def delete_sample(self, sample_id):
        for vid, samples in self.samples.items():
            idx = next((i for i, s in enumerate(samples) if s["id"] == sample_id), None)
            if idx is None:
                continue
            if len(samples) <= 1:
                return False, "last_sample"
            samples.pop(idx)
            return True, ""
        return False, "not_found"


@pytest.fixture
def client(monkeypatch, tmp_path):
    # CỐ Ý KHÔNG dùng `with TestClient(...)` — context manager sẽ trigger `lifespan()`
    # THẬT: nạp engine VieNeu ONNX thật (~50s) rồi GHI ĐÈ `_registry`/`_engine`/`_ref_dir`
    # bằng instance thật, xoá sạch mọi monkeypatch đặt trước đó (lifespan() dùng `global`
    # để gán, không quan tâm ai đã setattr trước). Không dùng context manager thì lifespan
    # không chạy (xác nhận qua thực nghiệm) — TestClient vẫn phục vụ request bình thường,
    # ta tự set toàn bộ state module cần cho từng endpoint, đúng cách các test khác trong
    # repo này đã làm (vd test_overrides_filter.py).
    registry = _FakeRegistry()
    monkeypatch.setattr(main, "_registry", registry)
    monkeypatch.setattr(main, "_engine", _FakeEngine())
    monkeypatch.setattr(main, "_ref_dir", tmp_path)
    monkeypatch.setattr(main, "_validate_ref_audio", lambda path: [])
    monkeypatch.setattr(main, "_ref_cache_forget_voice", lambda voice_id: None)
    c = TestClient(main.app)
    c.registry = registry  # gắn kèm để test đọc lại lời gọi
    return c


def test_clone_1_file(client):
    res = client.post(
        "/voices/clone",
        files=[("files", ("a.wav", WAV_HEADER, "audio/wav"))],
        data={"label": "Test", "ref_texts": ["Xin chào"]},
    )
    assert res.status_code == 200
    assert len(client.registry.add_cloned_calls) == 1
    assert client.registry.add_cloned_calls[0]["extra"] == {"ref_text": "Xin chào"}
    assert client.registry.add_sample_calls == []  # chỉ 1 file -> không có sample bổ sung


def test_clone_3_file_tao_1_voice_2_sample_bo_sung(client):
    res = client.post(
        "/voices/clone",
        files=[
            ("files", ("a.wav", WAV_HEADER, "audio/wav")),
            ("files", ("b.wav", WAV_HEADER, "audio/wav")),
            ("files", ("c.wav", WAV_HEADER, "audio/wav")),
        ],
        data={"label": "Test", "ref_texts": ["Câu 1", "Câu 2", "Câu 3"]},
    )
    assert res.status_code == 200
    assert len(client.registry.add_cloned_calls) == 1  # đúng 1 voice, không phải 3
    assert len(client.registry.add_sample_calls) == 2  # 2 file còn lại thành sample bổ sung
    assert [c["ref_text"] for c in client.registry.add_sample_calls] == ["Câu 2", "Câu 3"]


def test_clone_so_luong_ref_texts_khong_khop_bao_loi(client):
    res = client.post(
        "/voices/clone",
        files=[("files", ("a.wav", WAV_HEADER, "audio/wav"))],
        data={"label": "Test", "ref_texts": ["Câu 1", "Câu thừa"]},
    )
    assert res.status_code == 400


def test_clone_khong_co_file_nao_bao_loi(client):
    res = client.post("/voices/clone", data={"label": "Test", "ref_texts": []})
    assert res.status_code in (400, 422)  # 422 nếu FastAPI tự chặn thiếu field bắt buộc


def test_clone_thieu_label_bao_loi(client):
    res = client.post(
        "/voices/clone",
        files=[("files", ("a.wav", WAV_HEADER, "audio/wav"))],
        data={"label": "  ", "ref_texts": [""]},
    )
    assert res.status_code == 400


def test_clone_engine_bat_buoc_ref_text_ma_sample_dau_thieu(monkeypatch, client):
    monkeypatch.setattr(main, "_engine", _RequiresRefTextEngine())
    res = client.post(
        "/voices/clone",
        files=[("files", ("a.wav", WAV_HEADER, "audio/wav"))],
        data={"label": "Test", "ref_texts": [""]},
    )
    assert res.status_code == 400


def test_clone_engine_bat_buoc_nhung_sample_dau_co_text_thi_qua(monkeypatch, client):
    monkeypatch.setattr(main, "_engine", _RequiresRefTextEngine())
    res = client.post(
        "/voices/clone",
        files=[("files", ("a.wav", WAV_HEADER, "audio/wav"))],
        data={"label": "Test", "ref_texts": ["Xin chào"]},
    )
    assert res.status_code == 200


def test_clone_file_khong_phai_wav_bao_loi_va_khong_tao_voice(client):
    res = client.post(
        "/voices/clone",
        files=[("files", ("a.wav", b"khong-phai-wav", "audio/wav"))],
        data={"label": "Test", "ref_texts": [""]},
    )
    assert res.status_code == 400
    assert client.registry.add_cloned_calls == []


def test_clone_loi_o_file_thu_2_don_sach_file_thu_1(client, tmp_path):
    """File đầu hợp lệ, file 2 hỏng — không được để lại rác trên đĩa từ file đầu."""
    res = client.post(
        "/voices/clone",
        files=[
            ("files", ("a.wav", WAV_HEADER, "audio/wav")),
            ("files", ("b.wav", b"khong-phai-wav", "audio/wav")),
        ],
        data={"label": "Test", "ref_texts": ["", ""]},
    )
    assert res.status_code == 400
    assert client.registry.add_cloned_calls == []
    assert list(tmp_path.glob("clone-*.wav")) == []


# ── /voices/{id}/samples ────────────────────────────────────────────────────────

def test_them_sample_cho_voice_da_co(client):
    client.post(
        "/voices/clone",
        files=[("files", ("a.wav", WAV_HEADER, "audio/wav"))],
        data={"label": "Test", "ref_texts": [""]},
    )
    voice_id = client.registry.add_cloned_calls and list(client.registry.samples.keys())[0]

    res = client.post(
        f"/voices/{voice_id}/samples",
        files={"file": ("b.wav", WAV_HEADER, "audio/wav")},
        data={"ref_text": "Mẫu mới"},
    )
    assert res.status_code == 200
    assert client.registry.add_sample_calls[-1]["ref_text"] == "Mẫu mới"


def test_them_sample_voice_khong_ton_tai(client):
    res = client.post(
        "/voices/khong-co/samples",
        files={"file": ("b.wav", WAV_HEADER, "audio/wav")},
    )
    assert res.status_code == 404


def test_xoa_sample_cuoi_cung_bi_tu_choi(client):
    client.post(
        "/voices/clone",
        files=[("files", ("a.wav", WAV_HEADER, "audio/wav"))],
        data={"label": "Test", "ref_texts": [""]},
    )
    voice_id = list(client.registry.samples.keys())[0]
    sample_id = client.registry.samples[voice_id][0]["id"]

    res = client.delete(f"/voices/{voice_id}/samples/{sample_id}")
    assert res.status_code == 400


def test_xoa_sample_khong_ton_tai(client):
    res = client.delete("/voices/v1/samples/khong-co")
    assert res.status_code == 404


def test_list_samples(client):
    client.post(
        "/voices/clone",
        files=[("files", ("a.wav", WAV_HEADER, "audio/wav"))],
        data={"label": "Test", "ref_texts": ["Xin chào"]},
    )
    voice_id = list(client.registry.samples.keys())[0]

    res = client.get(f"/voices/{voice_id}/samples")
    assert res.status_code == 200
    assert len(res.json()) == 1
