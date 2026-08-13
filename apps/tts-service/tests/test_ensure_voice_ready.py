"""Test main.py's `_backfill_ref_text_from_catalog` + `_ensure_voice_ready`'s đường tìm thấy
voice NGAY qua `get_voice(speaker_id)`.

Bug thật: voice catalog ĐÃ import vào registry TRƯỚC khi catalog.json có `ref_text` (hoặc
transcript catalog vừa được cập nhật sau) không bao giờ được đồng bộ lại — vì backfill trước
đó chỉ nằm trong nhánh idempotent của `_import_catalog_entry`, nhánh đó CHỈ chạy khi
`speaker_id` vẫn còn là id catalog gốc (vd "hoai_my"). Đường phổ biến hơn hẳn trong thực tế:
client gửi id REGISTRY đã import (vd "clone-d0f05071" — UI/lịch sử/mặc định đều nhớ id này,
không phải id catalog), khiến `_registry.get_voice(speaker_id)` tìm thấy NGAY và trả về sớm,
bỏ qua hoàn toàn bước backfill.
"""
import json

import pytest

import main


class _FakeRegistry:
    def __init__(self):
        self.voices: dict[str, dict] = {}
        self.samples: dict[str, list[dict]] = {}
        self.set_ref_text_calls: list[tuple[str, str]] = []

    def add_voice(self, voice_id, source_catalog_id=None, source_lang=None, ref_text=None):
        self.voices[voice_id] = {
            "id": voice_id, "type": "cloned",
            "source_catalog_id": source_catalog_id, "source_lang": source_lang,
        }
        sample = {"id": f"{voice_id}-s1", "ref_file": f"{voice_id}.wav"}
        if ref_text:
            sample["ref_text"] = ref_text
        self.samples[voice_id] = [sample]

    def get_voice(self, voice_id):
        return dict(self.voices[voice_id]) if voice_id in self.voices else None

    def find_by_source_catalog_id(self, source_catalog_id):
        for v in self.voices.values():
            if v.get("source_catalog_id") == source_catalog_id:
                return dict(v)
        return None

    def list_samples(self, voice_id):
        return [dict(s) for s in self.samples.get(voice_id, [])]

    def set_ref_text(self, voice_id, text):
        self.set_ref_text_calls.append((voice_id, text))
        samples = self.samples.get(voice_id)
        if not samples:
            return False
        samples[0]["ref_text"] = text
        return True


def _write_catalog(tmp_path, lang, entries):
    lang_dir = tmp_path / lang
    lang_dir.mkdir(parents=True, exist_ok=True)
    (lang_dir / "catalog.json").write_text(json.dumps(entries), encoding="utf-8")


@pytest.fixture
def wire(monkeypatch, tmp_path):
    registry = _FakeRegistry()
    monkeypatch.setattr(main, "_registry", registry)
    monkeypatch.setattr(main, "_catalog_dir", tmp_path)
    monkeypatch.setattr(main, "_ref_cache_forget_voice", lambda voice_id: None)
    return registry


def test_voice_da_import_truoc_khi_catalog_co_ref_text_duoc_backfill(wire, tmp_path):
    _write_catalog(tmp_path, "vi-VN", [
        {"id": "hoai_my", "ref_text": "Cuộc sống mà bạn đang sống bây giờ..."},
    ])
    wire.add_voice("clone-d0f05071", source_catalog_id="hoai_my", source_lang="vi-VN", ref_text=None)

    main._ensure_voice_ready("clone-d0f05071")

    assert wire.set_ref_text_calls == [("clone-d0f05071", "Cuộc sống mà bạn đang sống bây giờ...")]
    assert wire.samples["clone-d0f05071"][0]["ref_text"] == "Cuộc sống mà bạn đang sống bây giờ..."


def test_khong_ghi_de_ref_text_nguoi_dung_da_tu_sua(wire, tmp_path):
    _write_catalog(tmp_path, "vi-VN", [
        {"id": "hoai_my", "ref_text": "Transcript catalog gốc"},
    ])
    wire.add_voice(
        "clone-d0f05071", source_catalog_id="hoai_my", source_lang="vi-VN",
        ref_text="Transcript người dùng đã tự sửa",
    )

    main._ensure_voice_ready("clone-d0f05071")

    assert wire.set_ref_text_calls == []
    assert wire.samples["clone-d0f05071"][0]["ref_text"] == "Transcript người dùng đã tự sửa"


def test_voice_khong_phai_tu_catalog_khong_bi_dung(wire):
    """Voice người dùng tự clone (không có source_catalog_id) — không có catalog nào để
    tra, phải bỏ qua an toàn, không crash."""
    wire.add_voice("clone-abc123", source_catalog_id=None, source_lang=None)

    voice = main._ensure_voice_ready("clone-abc123")

    assert voice["id"] == "clone-abc123"
    assert wire.set_ref_text_calls == []


def test_catalog_chua_co_ref_text_khong_lam_gi(wire, tmp_path):
    _write_catalog(tmp_path, "vi-VN", [{"id": "hoai_my"}])  # entry chưa có ref_text
    wire.add_voice("clone-d0f05071", source_catalog_id="hoai_my", source_lang="vi-VN", ref_text=None)

    main._ensure_voice_ready("clone-d0f05071")

    assert wire.set_ref_text_calls == []


def test_voice_khong_ton_tai_bao_loi_400(wire):
    monkeypatch_catalog_dir_empty = wire  # không có catalog nào khớp
    with pytest.raises(main.HTTPException) as exc_info:
        main._ensure_voice_ready("khong-ton-tai")
    assert exc_info.value.status_code == 400
