"""Test đường lấy preset built-in của engine (VieNeu 3.3.0: 20 giọng, không cần ref audio)
ra registry — `engine.list_presets()` → `main._builtin_registry_entries()` → merge vào
registry ở lifespan (xem main.py's docstring "Preset built-in của engine").

Không load model thật (quá nặng cho unit test) — VieneuEngine.list_presets() test qua
instance dựng tay (`__new__`, không gọi `__init__`) với `_model` giả lập.
"""
import main
from engine import VieneuEngine
from slug import slugify


class _FakeModel:
    def __init__(self, preset_voices: dict):
        self._preset_voices = preset_voices


def _make_engine(preset_voices: dict) -> VieneuEngine:
    eng = VieneuEngine.__new__(VieneuEngine)  # bỏ qua __init__ (load model thật)
    eng._model = _FakeModel(preset_voices)
    return eng


# ── slug.slugify ────────────────────────────────────────────────────────────────

def test_slugify_bo_dau_tieng_viet():
    assert slugify("Minh Đức") == "minh-duc"
    assert slugify("Ngọc Trân") == "ngoc-tran"
    assert slugify("Adam") == "adam"


# ── VieneuEngine.list_presets ─────────────────────────────────────────────────────

def test_list_presets_doc_tu_model_preset_voices():
    eng = _make_engine({
        "Minh Đức": {
            "gender": "male", "style": "tin_tuc",
            "description": "Nam · Bắc · Phong cách tin tức",
        },
    })
    out = eng.list_presets()
    assert out == [{
        "preset_id": "Minh Đức", "gender": "male", "region": None, "style": "tin_tuc",
        "description": "Nam · Bắc · Phong cách tin tức",
    }]


def test_list_presets_rong_neu_model_khong_co_preset_voices():
    eng = _make_engine({})
    assert eng.list_presets() == []


def test_list_presets_khong_crash_neu_thieu_attribute():
    eng = VieneuEngine.__new__(VieneuEngine)
    eng._model = object()  # không có _preset_voices attribute
    assert eng.list_presets() == []


# ── main._builtin_registry_entries ────────────────────────────────────────────────

def test_builtin_registry_entries_map_du_field():
    entries = main._builtin_registry_entries([{
        "preset_id": "Minh Đức", "gender": "male", "region": None, "style": "tin_tuc",
        "description": "Nam · Bắc · Phong cách tin tức",
    }])
    assert entries == [{
        "id": "builtin-minh-duc",
        "type": "preset",
        "label": "Minh Đức",
        "gender": "male",
        "region": "Bắc",
        "preset_id": "Minh Đức",
        "hidden": False,
        "language": "Vietnamese",
        "accent": "northern",
        "category": ["news"],
        "tags": [],
        "tagline": "Bắc · Tin tức",
        "description": "Giọng nam miền Bắc, phong cách tin tức.",
    }]


def test_builtin_registry_entries_uu_tien_region_that_neu_co():
    """Nếu engine.list_presets() trả region trực tiếp (lib sửa lại ở bản sau) thì dùng
    luôn, không cần parse description."""
    entries = main._builtin_registry_entries([{
        "preset_id": "X", "gender": "female", "region": "Trung", "style": "tu_nhien",
        "description": "bất kỳ gì, không được dùng vì đã có region",
    }])
    assert entries[0]["region"] == "Trung"
    assert entries[0]["accent"] == "central"


def test_builtin_registry_entries_khong_lap_tu_doc_truyen():
    """style='doc_truyen' → 'Đọc truyện' đã có sẵn chữ "đọc" — description không được lặp
    thành "phong cách đọc đọc truyện" (bug thật gặp lúc implement, xem lịch sử)."""
    entries = main._builtin_registry_entries([{
        "preset_id": "Thái Sơn", "gender": "male", "region": "Nam", "style": "doc_truyen",
        "description": "",
    }])
    assert "đọc đọc" not in entries[0]["description"]
    assert entries[0]["description"] == "Giọng nam miền Nam, phong cách đọc truyện."


def test_builtin_registry_entries_rong_khi_khong_co_preset():
    assert main._builtin_registry_entries([]) == []
