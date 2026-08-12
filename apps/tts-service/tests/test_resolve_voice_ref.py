"""Test main.py's _resolve_voice_ref — điểm nối giữa voice registry (nhiều sample/voice,
Phase 2) và engine.encode_reference (nhận đúng 1 audio + 1 transcript).

1 sample → dùng thẳng, không tốn gì. Nhiều sample → ghép qua combine_voice_samples, cache
ra file theo (voice_id, hash sample id, tần số engine).
"""
import numpy as np
import pytest
import soundfile as sf

import main


class _FakeRegistry:
    def __init__(self, samples_by_voice: dict[str, list[dict]]):
        self._samples = samples_by_voice

    def list_samples(self, voice_id):
        return self._samples.get(voice_id, [])


class _FakeEngine:
    def __init__(self, sample_rate=24_000):
        self._sample_rate = sample_rate

    def capabilities(self):
        return {"sample_rate": self._sample_rate}


@pytest.fixture(autouse=True)
def wire_main(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "_ref_dir", tmp_path)
    monkeypatch.setattr(main, "_engine", _FakeEngine())
    yield


def _write_wav(path, seconds=1.0, sr=24_000, amplitude=0.3):
    t = np.linspace(0, seconds, int(sr * seconds), endpoint=False)
    tone = (amplitude * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
    sf.write(str(path), tone, sr)


def test_1_sample_dung_thang_khong_ghep(monkeypatch, tmp_path):
    _write_wav(tmp_path / "a.wav")
    monkeypatch.setattr(main, "_registry", _FakeRegistry({
        "v1": [{"id": "s1", "ref_file": "a.wav", "ref_text": "Xin chào"}],
    }))

    ref_path, ref_text = main._resolve_voice_ref("v1")

    assert ref_path == tmp_path / "a.wav"
    assert ref_text == "Xin chào"
    assert not (tmp_path / "_combined").exists()  # không tạo cache cho đường 1 sample


def test_khong_co_sample_nao_bao_loi(monkeypatch):
    monkeypatch.setattr(main, "_registry", _FakeRegistry({}))
    with pytest.raises(main.HTTPException):
        main._resolve_voice_ref("v-khong-co-sample")


def test_nhieu_sample_ghep_va_noi_transcript(monkeypatch, tmp_path):
    _write_wav(tmp_path / "a.wav")
    _write_wav(tmp_path / "b.wav")
    monkeypatch.setattr(main, "_registry", _FakeRegistry({
        "v1": [
            {"id": "s1", "ref_file": "a.wav", "ref_text": "Câu một"},
            {"id": "s2", "ref_file": "b.wav", "ref_text": "Câu hai"},
        ],
    }))

    ref_path, ref_text = main._resolve_voice_ref("v1")

    assert ref_path.exists()
    assert ref_path.parent == tmp_path / "_combined"
    assert ref_text == "Câu một Câu hai"
    data, sr = sf.read(str(ref_path))
    assert sr == 24_000
    assert abs(len(data) - 2 * 24_000) <= 2  # ~2 giây, dung sai làm tròn resample


def test_ghep_khong_lam_lai_neu_da_cache(monkeypatch, tmp_path):
    _write_wav(tmp_path / "a.wav")
    _write_wav(tmp_path / "b.wav")
    monkeypatch.setattr(main, "_registry", _FakeRegistry({
        "v1": [
            {"id": "s1", "ref_file": "a.wav"},
            {"id": "s2", "ref_file": "b.wav"},
        ],
    }))

    path1, _ = main._resolve_voice_ref("v1")
    mtime1 = path1.stat().st_mtime_ns
    path2, _ = main._resolve_voice_ref("v1")

    assert path1 == path2
    assert path1.stat().st_mtime_ns == mtime1  # không ghi lại file


def test_them_sample_lam_doi_cache_key(monkeypatch, tmp_path):
    """Danh sách sample đổi (thêm sample mới) → hash đổi → cache CŨ không bị dùng nhầm cho
    danh sách sample MỚI."""
    _write_wav(tmp_path / "a.wav")
    _write_wav(tmp_path / "b.wav")
    _write_wav(tmp_path / "c.wav")

    monkeypatch.setattr(main, "_registry", _FakeRegistry({
        "v1": [{"id": "s1", "ref_file": "a.wav"}, {"id": "s2", "ref_file": "b.wav"}],
    }))
    path_before, _ = main._resolve_voice_ref("v1")

    monkeypatch.setattr(main, "_registry", _FakeRegistry({
        "v1": [
            {"id": "s1", "ref_file": "a.wav"},
            {"id": "s2", "ref_file": "b.wav"},
            {"id": "s3", "ref_file": "c.wav"},
        ],
    }))
    path_after, _ = main._resolve_voice_ref("v1")

    assert path_before != path_after
    assert path_before.exists()  # cache cũ không bị xoá — chỉ không dùng nữa


def test_tan_so_engine_khac_nhau_khong_dung_chung_cache(monkeypatch, tmp_path):
    """Đổi engine (24kHz -> 48kHz) không được dùng nhầm bản ghép cache của engine cũ — sai
    tần số sẽ cho audio phát nhanh/chậm gấp đôi."""
    _write_wav(tmp_path / "a.wav")
    _write_wav(tmp_path / "b.wav")
    monkeypatch.setattr(main, "_registry", _FakeRegistry({
        "v1": [{"id": "s1", "ref_file": "a.wav"}, {"id": "s2", "ref_file": "b.wav"}],
    }))

    monkeypatch.setattr(main, "_engine", _FakeEngine(sample_rate=24_000))
    path_24k, _ = main._resolve_voice_ref("v1")

    monkeypatch.setattr(main, "_engine", _FakeEngine(sample_rate=48_000))
    path_48k, _ = main._resolve_voice_ref("v1")

    assert path_24k != path_48k
    assert "24000hz" in path_24k.name
    assert "48000hz" in path_48k.name


def test_sample_khong_co_transcript_join_thanh_chuoi_rong(monkeypatch, tmp_path):
    _write_wav(tmp_path / "a.wav")
    _write_wav(tmp_path / "b.wav")
    monkeypatch.setattr(main, "_registry", _FakeRegistry({
        "v1": [{"id": "s1", "ref_file": "a.wav"}, {"id": "s2", "ref_file": "b.wav"}],
    }))

    _, ref_text = main._resolve_voice_ref("v1")
    assert ref_text is None  # không có transcript nào -> None, không phải chuỗi rỗng
