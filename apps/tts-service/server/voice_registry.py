"""
voice_registry.py — Quản lý preset voices (VieNeu built-in) và cloned voices (từ WAV).

Storage: JSON file tại VIENEU_REGISTRY_PATH env var hoặc default path cạnh voice-ref/.

Schema voice-registry.json:
{
  "version": 1,
  "voices": {
    "NF": {
      "type": "cloned",
      "label": "Lan Anh",
      "gender": "female",
      "region": "Bắc",
      "ref_file": "nu-bac.wav",
      "hidden": false
    },
    "preset-NgocLan": {
      "type": "preset",
      "label": "Ngọc Lan",
      "gender": "female",
      "region": "Bắc",
      "preset_id": "Ngọc Lan",
      "hidden": true
    }
  }
}

Rules:
- Cloned voices: ref_file là tên file WAV trong ref_dir
- Preset voices: preset_id là tên giọng VieNeu built-in
- hidden=true: ẩn khỏi GET /voices nhưng vẫn hoạt động qua /synthesize (backward compat)
- Preset voices không thể DELETE, chỉ hide
- Khi load: luôn merge PRESET_VOICES từ code → tự nhận preset mới khi VieNeu update

Cloned voice import từ catalog (voice_catalog.py, resources/voice-ref/{lang}/catalog.json):
- Field bổ sung optional trên entry cloned: accent, category (list), tags (list),
  source_catalog_id (id gốc trong catalog), source_lang — dùng để UI filter/hiển thị.
  Cloned voice KHÔNG từ catalog (upload WAV thủ công qua /voices/clone) không có các field này.
- KHÔNG còn danh sách cloned voice mặc định cứng trong code (NF/SF/...) — bộ giọng
  "mặc định hệ thống" giờ là toàn bộ catalog vendor (resources/voice-ref/{lang}/), tự
  sẵn sàng dùng khi chọn synthesize lần đầu (xem main.py's _ensure_voice_ready).
"""
from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path

# 10 preset voices từ VieNeu v3 Turbo model (voices_v3_turbo.json)
PRESET_VOICES: dict[str, dict] = {
    "preset-NgocLan":  {"type": "preset", "label": "Ngọc Lan",  "gender": "female", "region": "Nam", "preset_id": "Ngọc Lan",  "hidden": True},
    "preset-GiaBao":   {"type": "preset", "label": "Gia Bảo",   "gender": "male",   "region": "Nam", "preset_id": "Gia Bảo",   "hidden": True},
    "preset-ThaiSon":  {"type": "preset", "label": "Thái Sơn",  "gender": "male",   "region": "Nam", "preset_id": "Thái Sơn",  "hidden": True},
    "preset-DucTri":   {"type": "preset", "label": "Đức Trí",   "gender": "male",   "region": "Nam", "preset_id": "Đức Trí",   "hidden": True},
    "preset-MyDuyen":  {"type": "preset", "label": "Mỹ Duyên",  "gender": "female", "region": "Nam", "preset_id": "Mỹ Duyên",  "hidden": True},
    "preset-TrucLy":   {"type": "preset", "label": "Trúc Ly",   "gender": "female", "region": "Nam", "preset_id": "Trúc Ly",   "hidden": True},
    "preset-XuanVinh": {"type": "preset", "label": "Xuân Vĩnh", "gender": "male",   "region": "Nam", "preset_id": "Xuân Vĩnh", "hidden": True},
    "preset-TrongHuu": {"type": "preset", "label": "Trọng Hữu", "gender": "male",   "region": "Nam", "preset_id": "Trọng Hữu", "hidden": True},
    "preset-BinhAn":   {"type": "preset", "label": "Bình An",   "gender": "male",   "region": "Nam", "preset_id": "Bình An",   "hidden": True},
    "preset-NgocLinh": {"type": "preset", "label": "Ngọc Linh", "gender": "female", "region": "Nam", "preset_id": "Ngọc Linh", "hidden": True},
}


class VoiceRegistry:
    """Thread-safe voice registry. Persist sang JSON file."""

    def __init__(self, registry_path: Path, ref_dir: Path) -> None:
        self._path = registry_path
        self._ref_dir = ref_dir
        self._lock = threading.RLock()
        self._data: dict = {}
        self._load_or_init()

    def _load_or_init(self) -> None:
        if self._path.exists():
            try:
                with self._path.open(encoding="utf-8") as f:
                    self._data = json.load(f)
                voices = self._data.setdefault("voices", {})
                # Dọn rác từ registry cũ hơn: cloned voice KHÔNG từ catalog (không có
                # source_catalog_id — tức từng thuộc DEFAULT_CLONED_VOICES cứng đã bỏ
                # khỏi code) mà ref_file không còn tồn tại trên đĩa → orphan, xoá luôn.
                # Không đụng cloned voice user tự upload qua /voices/clone còn ref_file thật.
                orphan_ids = [
                    vid for vid, v in voices.items()
                    if v.get("type") == "cloned"
                    and not v.get("source_catalog_id")
                    and not (self._ref_dir / v.get("ref_file", "")).exists()
                ]
                for vid in orphan_ids:
                    del voices[vid]
                # Merge preset voices mới (nếu VieNeu update thêm preset)
                for vid, vdef in PRESET_VOICES.items():
                    if vid not in voices:
                        voices[vid] = dict(vdef)
                self._save()
                return
            except Exception:
                # File corrupt → BACKUP thay vì xoá im lặng (tránh mất cloned voices
                # nếu người dùng có thể cứu file). Rồi init lại mặc định.
                try:
                    import time
                    backup = self._path.with_suffix(f".corrupt-{int(time.time())}.json")
                    self._path.replace(backup)
                except Exception:
                    pass

        # Init mặc định — chỉ preset built-in. "Mặc định hệ thống" giờ là catalog vendor,
        # tự sẵn sàng khi chọn dùng (không cần entry cứng ở đây, xem module docstring).
        voices: dict = {}
        for vid, vdef in PRESET_VOICES.items():
            voices[vid] = dict(vdef)  # preset ẩn mặc định (hidden=True trong PRESET_VOICES)
        self._data = {"version": 1, "voices": voices}
        self._save()

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)
        tmp.replace(self._path)

    # ── Public API ───────────────────────────────────────────────────────────

    def list_voices(self, include_hidden: bool = False) -> list[dict]:
        with self._lock:
            result = []
            for vid, v in self._data.get("voices", {}).items():
                if not include_hidden and v.get("hidden", False):
                    continue
                result.append({"id": vid, **v})
            return result

    def get_voice(self, voice_id: str) -> dict | None:
        with self._lock:
            v = self._data.get("voices", {}).get(voice_id)
            if v is None:
                return None
            return {"id": voice_id, **v}

    def set_hidden(self, voice_id: str, hidden: bool) -> bool:
        with self._lock:
            voices = self._data.get("voices", {})
            if voice_id not in voices:
                return False
            voices[voice_id]["hidden"] = hidden
            self._save()
            return True

    def add_cloned(
        self,
        label: str,
        gender: str,
        region: str,
        ref_file: str,
        voice_id: str | None = None,
        extra: dict | None = None,
    ) -> dict:
        """Thêm cloned voice mới. ref_file là tên file WAV đã lưu trong ref_dir.

        `extra` — field bổ sung optional (accent/category/tags/source_catalog_id/source_lang),
        dùng khi import từ catalog vendor (xem import_from_catalog).
        """
        with self._lock:
            vid = voice_id or f"clone-{uuid.uuid4().hex[:8]}"
            entry = {
                "type": "cloned",
                "label": label,
                "gender": gender,
                "region": region,
                "ref_file": ref_file,
                "hidden": False,
                **(extra or {}),
            }
            self._data.setdefault("voices", {})[vid] = entry
            self._save()
            return {"id": vid, **entry}

    def find_by_source_catalog_id(self, source_catalog_id: str) -> dict | None:
        """Tìm cloned voice đã import từ 1 catalog entry cụ thể (tránh import trùng)."""
        with self._lock:
            for vid, v in self._data.get("voices", {}).items():
                if v.get("source_catalog_id") == source_catalog_id:
                    return {"id": vid, **v}
            return None

    def delete_cloned(self, voice_id: str) -> tuple[bool, str]:
        """
        Xóa cloned voice. Returns (success, error_reason).
        Preset voices không thể xóa.
        """
        with self._lock:
            voices = self._data.get("voices", {})
            if voice_id not in voices:
                return False, "not_found"
            if voices[voice_id].get("type") == "preset":
                return False, "is_preset"

            v = voices.pop(voice_id)
            self._save()

            # ref_file luôn là bản copy riêng trong _ref_dir (upload thủ công hoặc convert
            # từ catalog khi auto-encode) — không còn file mặc định cứng nào cần bảo vệ.
            ref_file = v.get("ref_file", "")
            if ref_file:
                try:
                    (self._ref_dir / ref_file).unlink(missing_ok=True)
                except Exception:
                    pass

            return True, ""

    def get_ref_path(self, voice_id: str) -> Path | None:
        """Trả về đường dẫn tuyệt đối đến WAV ref của cloned voice. Preset trả None."""
        v = self.get_voice(voice_id)
        if v is None or v.get("type") != "cloned":
            return None
        return self._ref_dir / v["ref_file"]

    def get_preset_id(self, voice_id: str) -> str | None:
        """Trả về preset_id của preset voice để truyền vào engine.synthesize_preset()."""
        v = self.get_voice(voice_id)
        if v is None or v.get("type") != "preset":
            return None
        return v.get("preset_id")
