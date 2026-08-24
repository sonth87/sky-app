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
- Preset built-in KHÁC (lấy từ `engine.list_presets()`, vd 20 giọng VieNeu 3.3.0) merge ĐỘNG
  lúc runtime qua `merge_presets()` (main.py's lifespan, sau khi engine+registry sẵn sàng) —
  không thể biết trước lúc module import như PRESET_VOICES tĩnh, vì cần engine đã load xong.

- ref_text (optional, chỉ cloned): BẢN CHÉP LỜI của ref_file — audio mẫu đang nói câu gì.
  Engine clone kiểu in-context (Qwen: BẮT BUỘC; VoxCPM: tuỳ chọn, có thì clone chính xác
  hơn) cần nó để căn text↔codec. Nguồn ưu tiên: field này → file .txt cùng tên cạnh WAV
  (quy ước cũ, xem `_ref_text_for()` ở engine_qwen*.py/engine_voxcpm.py). VieNeu/MOSS bỏ qua.

Cloned voice import từ catalog (voice_catalog.py, resources/voice-ref/{lang}/catalog.json):
- Field bổ sung optional trên entry cloned: accent, category (list), tags (list),
  source_catalog_id (id gốc trong catalog), source_lang — dùng để UI filter/hiển thị.
  Cloned voice KHÔNG từ catalog (upload WAV thủ công qua /voices/clone) không có các field này.
- KHÔNG còn danh sách cloned voice mặc định cứng trong code (NF/SF/...) — bộ giọng
  "mặc định hệ thống" giờ là toàn bộ catalog vendor (resources/voice-ref/{lang}/), tự
  sẵn sàng dùng khi chọn synthesize lần đầu (xem main.py's _ensure_voice_ready).

── Hai kho lưu trữ (2026-08-12) ──────────────────────────────────────────────────────────

Module này giờ có HAI cách lưu, cùng API công khai (`list_voices`/`get_voice`/`set_hidden`/
`set_ref_text`/`add_cloned`/`find_by_source_catalog_id`/`delete_cloned`/`get_ref_path`/
`get_preset_id`/`merge_presets`):

  - `VoiceRegistryJson` — class GỐC, không đổi 1 dòng logic nào, chỉ đổi tên từ
    `VoiceRegistry`. Dùng khi chạy độc lập ngoài Electron, `verify_engine.py`, hoặc Electron
    đang chạy bản CŨ HƠN schema mà bản Python này cần (lệch version giữa hai bên đóng gói
    riêng — xem `db.py`'s `REQUIRED_SCHEMA_VERSION`).
  - `VoiceRegistrySqlite` — lưu trong bảng `tts_voice` của DB dùng chung
    (`packages/app-db`, migration 017). Dùng khi Electron đã truyền `SKY_APP_DB_PATH` và
    file đó đã migrate đủ.

`create_voice_registry()` là điểm vào DUY NHẤT nên dùng (main.py gọi hàm này, không gọi
constructor của class nào trực tiếp) — nó tự chọn kho theo `db.connect()`, và nếu chuyển
sang SQL lần đầu thì tự NHẬP MỘT LẦN cloned voice từ file JSON cũ (không đụng gì nếu bảng SQL
đã có cloned voice — tức đã nhập trước đó, hoặc người dùng đã clone giọng mới qua SQL rồi).

Vì sao đáng chuyển: `voice-registry.json` hiện tại đã là file BA người ghi không khoá gì cả —
Electron seed lúc cài, tiến trình Python tier 'bundled', và tier 'ext' (hai tier SỐNG SONG
SONG có chủ đích, xem python-server.ts's docstring) — mỗi lần khởi động còn tự ghi đè lại file
(`_load_or_init` → `_save()`). SQLite WAL + `busy_timeout` an toàn hơn hẳn hiện trạng đó.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

import db as _db

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


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class VoiceRegistryJson:
    """Thread-safe voice registry. Persist sang JSON file.

    Đổi tên từ `VoiceRegistry` (2026-08-12) khi thêm `VoiceRegistrySqlite` — logic bên trong
    KHÔNG đổi 1 dòng nào. Dùng `create_voice_registry()` để lấy instance đúng, không gọi
    constructor lớp này trực tiếp trừ trong test.
    """

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
                entry = {"id": vid, **v}
                for field in self._INTERNAL_STORAGE_FIELDS:
                    entry.pop(field, None)
                result.append(entry)
            return result

    # Field KHÔNG lộ ra qua get_voice()/list_voices() — đây là chi tiết LƯU TRỮ nội bộ
    # (sample đầu tiên cho voice chưa convert, hoặc list sample đã convert), không phải
    # hình dạng API công khai. Loại bỏ ở CẢ HAI kho để get_voice() trả cùng hình dạng bất
    # kể đang chạy JSON hay SQL — SQL đã tách hẳn sample sang bảng riêng nên tự nhiên không
    # có 2 field này trong `tts_voice`; JSON vẫn giữ chúng TRONG _data (đó là nơi lưu thật
    # của sample đầu tiên) nhưng ẩn đi lúc trả về. Muốn audio/transcript của voice phải qua
    # `list_samples()`/`get_ref_path()`.
    _INTERNAL_STORAGE_FIELDS = ("ref_file", "ref_text", "samples")

    def get_voice(self, voice_id: str) -> dict | None:
        with self._lock:
            v = self._data.get("voices", {}).get(voice_id)
            if v is None:
                return None
            entry = {"id": voice_id, **v}
            for field in self._INTERNAL_STORAGE_FIELDS:
                entry.pop(field, None)
            return entry

    def list_samples(self, voice_id: str) -> list[dict]:
        """[{"id", "ref_file", "ref_text"?}, ...] theo thứ tự thêm vào — nhiều mẫu ghép lại
        cho 1 giọng clone (xem audio_dsp.py's combine_voice_samples).

        Voice tạo TRƯỚC tính năng này chỉ có `ref_file`/`ref_text` ngay trên entry, chưa có
        field `samples`. Suy ra 1 "sample ảo" từ đó ngay tại đây thay vì bắt sửa file lúc
        `_load_or_init` — đơn giản hơn, và không đụng cam kết "logic gốc không đổi 1 dòng"
        đã ghi ở Phase 1 cho class này.
        """
        with self._lock:
            v = self._data.get("voices", {}).get(voice_id)
            if v is None or v.get("type") != "cloned":
                return []
            samples = v.get("samples")
            if samples:
                return [dict(s) for s in samples]
            if v.get("ref_file"):
                entry = {"id": f"{voice_id}-primary", "ref_file": v["ref_file"]}
                if v.get("ref_text"):
                    entry["ref_text"] = v["ref_text"]
                return [entry]
            return []

    def add_sample(self, voice_id: str, ref_file: str, ref_text: str | None = None) -> dict:
        """Thêm 1 mẫu audio cho giọng clone ĐÃ CÓ (tạo giọng mới vẫn qua `add_cloned`, mẫu
        đầu tiên của nó nằm ở `ref_file`/`ref_text` trên chính entry — xem `list_samples`)."""
        with self._lock:
            voices = self._data.get("voices", {})
            v = voices.get(voice_id)
            if v is None or v.get("type") != "cloned":
                raise ValueError(f"Voice không tồn tại hoặc không phải giọng clone: {voice_id}")

            # Chuyển hoá 1 lần: voice đang ở dạng cũ (ref_file trực tiếp trên entry, chưa có
            # `samples`) → biến ref_file/ref_text hiện có thành sample đầu tiên trước khi
            # thêm sample mới, để list_samples() sau đó luôn đọc từ MỘT nguồn duy nhất.
            if "samples" not in v and v.get("ref_file"):
                primary = {"id": f"{voice_id}-primary", "ref_file": v.pop("ref_file")}
                old_text = v.pop("ref_text", None)
                if old_text:
                    primary["ref_text"] = old_text
                v["samples"] = [primary]

            samples = v.setdefault("samples", [])
            entry = {"id": f"sample-{uuid.uuid4().hex[:8]}", "ref_file": ref_file}
            text = (ref_text or "").strip()
            if text:
                entry["ref_text"] = text
            samples.append(entry)
            self._save()
            return dict(entry)

    def delete_sample(self, sample_id: str) -> tuple[bool, str]:
        """Xoá 1 mẫu theo id. reason: 'not_found' | 'last_sample' (không cho xoá mẫu CUỐI
        CÙNG — giọng phải có ít nhất 1 mẫu để còn dùng được).

        Không nhận `voice_id` (khác `list_samples`/`add_sample`) — id sample đã DUY NHẤT
        trong toàn registry (`sample-<hex8>` hoặc `<voice_id>-primary`), nên tự dò qua mọi
        voice thay vì bắt caller tự nhớ voice_id nào chứa nó.
        """
        with self._lock:
            for voice_id, v in self._data.get("voices", {}).items():
                if v.get("type") != "cloned":
                    continue
                samples = v.get("samples")
                if not samples:
                    # Dạng cũ: sample "ảo" duy nhất chính là ref_file trên entry.
                    if v.get("ref_file") and f"{voice_id}-primary" == sample_id:
                        return False, "last_sample"
                    continue
                idx = next((i for i, s in enumerate(samples) if s.get("id") == sample_id), None)
                if idx is None:
                    continue
                if len(samples) <= 1:
                    return False, "last_sample"
                samples.pop(idx)
                self._save()
                return True, ""
            return False, "not_found"

    def set_hidden(self, voice_id: str, hidden: bool) -> bool:
        with self._lock:
            voices = self._data.get("voices", {})
            if voice_id not in voices:
                return False
            voices[voice_id]["hidden"] = hidden
            self._save()
            return True

    def set_ref_text(self, voice_id: str, ref_text: str) -> bool:
        """Đặt/sửa bản chép lời của SAMPLE ĐẦU TIÊN. Chuỗi rỗng = xoá field.

        Sau Phase 2 (nhiều mẫu/voice), transcript về bản chất là thuộc tính của TỪNG SAMPLE,
        không phải của voice — nhưng API này vẫn nhận `voice_id` vì UI hiện tại (trước khi
        VoiceCloneModal đổi sang nhiều file) chỉ có đúng 1 ô transcript mỗi voice. Sửa sample
        đầu tiên là hành vi khớp thực tế đang chạy: voice chỉ có 1 sample (đa số) thì đây
        chính là sample đó, y hệt hành vi trước Phase 2.

        ⚠️ Caller PHẢI xoá ref codes đã cache của voice này sau khi gọi
        (`_ref_cache_forget_voice` ở main.py) — embedding cache giữ nguyên dict
        `{wav_path, ref_text}` suốt vòng đời process, không xoá thì transcript cũ
        vẫn được dùng cho tới lần restart tiếp theo.
        """
        with self._lock:
            v = self._data.get("voices", {}).get(voice_id)
            if v is None:
                return False
            text = (ref_text or "").strip()

            samples = v.get("samples")
            if samples:
                if text:
                    samples[0]["ref_text"] = text
                else:
                    samples[0].pop("ref_text", None)
            else:
                # Chưa convert (chưa từng gọi add_sample) — ref_text vẫn nằm thẳng trên
                # entry, đúng vị trí cũ trước Phase 2.
                if text:
                    v["ref_text"] = text
                else:
                    v.pop("ref_text", None)
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
                    ref_path = self._ref_dir / ref_file
                    ref_path.unlink(missing_ok=True)
                    # Sidecar transcript cùng tên (quy ước `_ref_text_for()`): xoá theo,
                    # nếu không thì clone voice mới trùng tên file sẽ nhặt phải bản chép
                    # lời của voice CŨ đã xoá — sai giọng mà không có dấu hiệu gì.
                    ref_path.with_suffix(".txt").unlink(missing_ok=True)
                except Exception:
                    pass

            return True, ""

    def get_ref_path(self, voice_id: str) -> Path | None:
        """Đường dẫn sample ĐẦU TIÊN — dùng cho các chỗ chỉ cần 1 audio nhanh (preview).
        Preset trả None. Voice nhiều sample thật sự (>1) phải qua `list_samples()` + combine,
        xem main.py's `_resolve_voice_ref`."""
        v = self.get_voice(voice_id)
        if v is None or v.get("type") != "cloned":
            return None
        samples = self.list_samples(voice_id)
        if not samples:
            return None
        return self._ref_dir / samples[0]["ref_file"]

    def get_preset_id(self, voice_id: str) -> str | None:
        """Trả về preset_id của preset voice để truyền vào engine.synthesize_preset()."""
        v = self.get_voice(voice_id)
        if v is None or v.get("type") != "preset":
            return None
        return v.get("preset_id")

    def merge_presets(self, entries: list[dict]) -> None:
        """Merge preset voice ĐỘNG — đọc từ `engine.list_presets()` lúc runtime (khác
        `PRESET_VOICES` tĩnh ở module-level, biết được TRƯỚC khi engine load) — vào registry.

        UPSERT theo id: entry mới thì thêm; entry đã có thì GHI ĐÈ lại metadata (label/region/
        accent/category/tags/tagline/description/language/preset_id) — cho phép sửa code (vd
        thêm field mới, sửa mô tả) tự áp dụng lại ở lần restart tiếp theo mà không cần xoá tay
        registry. CHỈ giữ nguyên `hidden` của entry đã có — đó là lựa chọn CỦA NGƯỜI DÙNG, không
        phải dữ liệu nguồn nên không được ghi đè (bug thật gặp lúc thêm field "language": entry
        đã merge trước đó im lặng không bao giờ nhận field mới cho tới khi sửa lại logic này).
        Mỗi dict trong `entries` phải có `id`.
        """
        with self._lock:
            voices = self._data.setdefault("voices", {})
            changed = False
            for e in entries:
                vid = e["id"]
                new_entry = {k: v for k, v in e.items() if k != "id"}
                existing = voices.get(vid)
                if existing is not None:
                    new_entry["hidden"] = existing.get("hidden", new_entry.get("hidden", False))
                if voices.get(vid) != new_entry:
                    voices[vid] = new_entry
                    changed = True
            if changed:
                self._save()


# ── Kho SQL (bảng tts_voice của DB dùng chung) ──────────────────────────────────────────

# Field của `extra` (add_cloned) map thẳng sang cột cùng tên trong bảng tts_voice — liệt kê
# tường minh ở đây (khác VoiceRegistryJson's `**(extra or {})` nhận bất kỳ key nào) vì SQL
# cần biết trước tập cột. Khớp với MỌI call site thật của add_cloned(extra=...) trong
# main.py (_import_catalog_entry, /voices/clone) tại thời điểm viết — thêm field mới vào
# extra ở nơi gọi mà quên thêm vào đây thì field đó lặng lẽ KHÔNG được lưu.
_CLONED_EXTRA_COLUMNS = (
    "ref_text", "accent", "category", "tags", "tagline", "description",
    "source_catalog_id", "source_lang",
)
_JSON_LIST_FIELDS = ("category", "tags")


def _row_to_voice_dict(row: sqlite3.Row) -> dict:
    """Chuyển 1 dòng `tts_voice` thành dict CÙNG HÌNH DẠNG với VoiceRegistryJson's entry:
    bool cho hidden, list đã parse cho category/tags, và KHÔNG có field NULL (JSON gốc chỉ
    có field nào thực sự được set — code gọi dùng `.get()` nên thiếu key ~ giá trị None,
    nhưng giữ đúng hình dạng để dễ so sánh/debug khi cần đối chiếu 2 kho).

    `ref_file`/`ref_text` LUÔN bị loại, kể cả khi cột còn giá trị (dữ liệu backfill từ
    migration 018) — từ Phase 2, 2 cột đó là DI SẢN thuần tuý, không còn là nguồn sự thật.
    Lộ chúng ra đây sẽ tạo hai nguồn có thể LỆCH NHAU: cột cũ đứng yên trong khi
    `tts_voice_sample` đã bị sửa qua `add_sample`/`delete_sample`/`set_ref_text`. Muốn biết
    audio/transcript của 1 voice phải qua `list_samples()`/`get_ref_path()`."""
    d = dict(row)
    d["hidden"] = bool(d.get("hidden"))
    for field in _JSON_LIST_FIELDS:
        raw = d.pop(f"{field}_json", None)
        if raw:
            try:
                d[field] = json.loads(raw)
            except (TypeError, ValueError):
                pass
    d.pop("created_at", None)  # chi tiết lưu trữ, không có trong hình dạng entry cũ
    d.pop("ref_file", None)
    d.pop("ref_text", None)
    return {k: v for k, v in d.items() if v is not None}


class VoiceRegistrySqlite:
    """Cùng API với `VoiceRegistryJson`, lưu trong bảng `tts_voice` của DB dùng chung.

    KHÔNG tự khoá file/transaction dài — mỗi thao tác là 1 câu SQL + commit ngay, để không
    giữ write-lock lâu hơn cần thiết trên file mà tiến trình khác (Electron, tier Python
    kia) cũng đang mở. `threading.RLock` chỉ chống race TRONG tiến trình này, giống
    VoiceRegistryJson — an toàn liên-tiến-trình đến từ WAL + `busy_timeout` phía SQLite.
    """

    def __init__(self, conn: sqlite3.Connection, ref_dir: Path) -> None:
        self._conn = conn
        self._ref_dir = ref_dir
        self._lock = threading.RLock()
        self._ensure_presets()

    def _ensure_presets(self) -> None:
        """`INSERT OR IGNORE` 10 preset voice — tương đương merge preset mới của
        VoiceRegistryJson's `_load_or_init` (tự nhận preset khi VieNeu update, không ghi đè
        preset đã có nếu người dùng lỡ set hidden=False cho nó)."""
        with self._lock:
            now = _now_iso()
            for vid, vdef in PRESET_VOICES.items():
                self._conn.execute(
                    """INSERT OR IGNORE INTO tts_voice
                       (id, type, label, gender, region, preset_id, hidden, created_at)
                       VALUES (?, 'preset', ?, ?, ?, ?, ?, ?)""",
                    (vid, vdef["label"], vdef["gender"], vdef["region"], vdef["preset_id"],
                     1 if vdef["hidden"] else 0, now),
                )
            self._conn.commit()

    def list_voices(self, include_hidden: bool = False) -> list[dict]:
        with self._lock:
            sql = "SELECT * FROM tts_voice" + ("" if include_hidden else " WHERE hidden = 0")
            rows = self._conn.execute(sql).fetchall()
            return [_row_to_voice_dict(r) for r in rows]

    def get_voice(self, voice_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM tts_voice WHERE id = ?", (voice_id,)
            ).fetchone()
            return _row_to_voice_dict(row) if row else None

    def set_hidden(self, voice_id: str, hidden: bool) -> bool:
        with self._lock:
            cur = self._conn.execute(
                "UPDATE tts_voice SET hidden = ? WHERE id = ?", (1 if hidden else 0, voice_id)
            )
            self._conn.commit()
            return cur.rowcount > 0

    def set_ref_text(self, voice_id: str, ref_text: str) -> bool:
        """Sửa transcript của SAMPLE ĐẦU TIÊN (thứ tự `created_at, id`) — xem
        VoiceRegistryJson.set_ref_text cho lý do "voice_id" thay vì "sample_id". Chuỗi rỗng
        = xoá field. Caller vẫn phải tự xoá ref-codes cache sau khi gọi
        (main.py's _ref_cache_forget_voice)."""
        with self._lock:
            first = self._conn.execute(
                "SELECT id FROM tts_voice_sample WHERE voice_id = ? "
                "ORDER BY created_at, id LIMIT 1",
                (voice_id,),
            ).fetchone()
            if first is None:
                return False
            text = (ref_text or "").strip() or None
            self._conn.execute(
                "UPDATE tts_voice_sample SET ref_text = ? WHERE id = ?", (text, first["id"])
            )
            self._conn.commit()
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
        """Tạo voice clone MỚI + sample đầu tiên của nó. Thêm sample thứ 2 trở đi dùng
        `add_sample()` sau khi có `id` trả về ở đây.

        `ref_file` đi thẳng vào `tts_voice_sample`, KHÔNG còn set cột `ref_file`/`ref_text`
        legacy trên `tts_voice` nữa (migration 018) — không có nhánh "sample đầu tiên đặc
        biệt" nào, nó tạo qua đúng cấu trúc mà mọi sample khác dùng.
        """
        with self._lock:
            vid = voice_id or f"clone-{uuid.uuid4().hex[:8]}"
            extra = extra or {}
            category = extra.get("category")
            tags = extra.get("tags")
            now = _now_iso()
            self._conn.execute(
                """INSERT INTO tts_voice
                   (id, type, label, gender, region, hidden, created_at,
                    accent, category_json, tags_json, tagline, description,
                    source_catalog_id, source_lang)
                   VALUES (?, 'cloned', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    vid, label, gender, region, now,
                    extra.get("accent"),
                    json.dumps(category, ensure_ascii=False) if category is not None else None,
                    json.dumps(tags, ensure_ascii=False) if tags is not None else None,
                    extra.get("tagline"), extra.get("description"),
                    extra.get("source_catalog_id"), extra.get("source_lang"),
                ),
            )
            self._conn.execute(
                "INSERT INTO tts_voice_sample (id, voice_id, ref_file, ref_text, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (f"sample-{uuid.uuid4().hex[:8]}", vid, ref_file, extra.get("ref_text"), now),
            )
            self._conn.commit()
            # Đọc lại thay vì tự dựng dict — bảo đảm hình dạng trả về LUÔN khớp get_voice(),
            # không lệch nếu sau này thêm cột mà quên cập nhật cả 2 chỗ.
            return self.get_voice(vid)  # type: ignore[return-value]

    def list_samples(self, voice_id: str) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, ref_file, ref_text FROM tts_voice_sample "
                "WHERE voice_id = ? ORDER BY created_at, id",
                (voice_id,),
            ).fetchall()
            return [{k: v for k, v in dict(r).items() if v is not None} for r in rows]

    def add_sample(self, voice_id: str, ref_file: str, ref_text: str | None = None) -> dict:
        with self._lock:
            exists = self._conn.execute(
                "SELECT 1 FROM tts_voice WHERE id = ? AND type = 'cloned'", (voice_id,)
            ).fetchone()
            if exists is None:
                raise ValueError(f"Voice không tồn tại hoặc không phải giọng clone: {voice_id}")

            sample_id = f"sample-{uuid.uuid4().hex[:8]}"
            text = (ref_text or "").strip() or None
            self._conn.execute(
                "INSERT INTO tts_voice_sample (id, voice_id, ref_file, ref_text, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (sample_id, voice_id, ref_file, text, _now_iso()),
            )
            self._conn.commit()
            entry = {"id": sample_id, "ref_file": ref_file}
            if text:
                entry["ref_text"] = text
            return entry

    def delete_sample(self, sample_id: str) -> tuple[bool, str]:
        """reason: 'not_found' | 'last_sample' (không cho xoá mẫu CUỐI CÙNG của 1 voice)."""
        with self._lock:
            row = self._conn.execute(
                "SELECT voice_id, ref_file FROM tts_voice_sample WHERE id = ?", (sample_id,)
            ).fetchone()
            if row is None:
                return False, "not_found"

            count = self._conn.execute(
                "SELECT COUNT(*) AS c FROM tts_voice_sample WHERE voice_id = ?",
                (row["voice_id"],),
            ).fetchone()["c"]
            if count <= 1:
                return False, "last_sample"

            self._conn.execute("DELETE FROM tts_voice_sample WHERE id = ?", (sample_id,))
            self._conn.commit()

            ref_file = row["ref_file"] or ""
            if ref_file:
                try:
                    ref_path = self._ref_dir / ref_file
                    ref_path.unlink(missing_ok=True)
                    ref_path.with_suffix(".txt").unlink(missing_ok=True)
                except Exception:
                    pass

            return True, ""

    def find_by_source_catalog_id(self, source_catalog_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM tts_voice WHERE source_catalog_id = ?", (source_catalog_id,)
            ).fetchone()
            return _row_to_voice_dict(row) if row else None

    def delete_cloned(self, voice_id: str) -> tuple[bool, str]:
        with self._lock:
            row = self._conn.execute(
                "SELECT type FROM tts_voice WHERE id = ?", (voice_id,)
            ).fetchone()
            if row is None:
                return False, "not_found"
            if row["type"] == "preset":
                return False, "is_preset"

            # Đọc TRƯỚC khi xoá — `ON DELETE CASCADE` (migration 018) tự dọn các dòng
            # `tts_voice_sample` ở tầng DB, nhưng không đụng gì tới file WAV vật lý trên
            # đĩa. Cần biết ref_file của MỌI sample (không chỉ 1 như trước Phase 2) để dọn
            # theo — đọc sau khi DELETE thì CASCADE đã xoá mất các dòng này rồi.
            sample_files = [
                r["ref_file"] for r in self._conn.execute(
                    "SELECT ref_file FROM tts_voice_sample WHERE voice_id = ?", (voice_id,)
                ).fetchall()
            ]

            self._conn.execute("DELETE FROM tts_voice WHERE id = ?", (voice_id,))
            self._conn.commit()

            for ref_file in sample_files:
                if not ref_file:
                    continue
                try:
                    ref_path = self._ref_dir / ref_file
                    ref_path.unlink(missing_ok=True)
                    ref_path.with_suffix(".txt").unlink(missing_ok=True)
                except Exception:
                    pass

            return True, ""

    def get_ref_path(self, voice_id: str) -> Path | None:
        """Đường dẫn sample ĐẦU TIÊN — dùng cho các chỗ chỉ cần 1 audio nhanh (preview).
        Voice nhiều sample thật sự (>1) phải qua `list_samples()` + combine, xem main.py's
        `_resolve_voice_ref`."""
        v = self.get_voice(voice_id)
        if v is None or v.get("type") != "cloned":
            return None
        samples = self.list_samples(voice_id)
        if not samples:
            return None
        return self._ref_dir / samples[0]["ref_file"]

    def get_preset_id(self, voice_id: str) -> str | None:
        v = self.get_voice(voice_id)
        if v is None or v.get("type") != "preset":
            return None
        return v.get("preset_id")

    def merge_presets(self, entries: list[dict]) -> None:
        """Merge preset voice ĐỘNG (xem VoiceRegistryJson.merge_presets — cùng ngữ nghĩa UPSERT,
        ghi đè metadata nhưng GIỮ NGUYÊN `hidden` đã có, không viết đè lựa chọn người dùng).
        Dùng luôn cột accent/category_json/tags_json/tagline/description — migration 017 ghi
        chú các cột này "chỉ 'cloned'" nhưng KHÔNG CHECK constraint ở tầng DB; preset built-in
        cần chúng để filter được giống catalog vendor (yêu cầu tính năng này). Không có cột
        "language" trong bảng — field đó (nếu entries có) bị bỏ qua ở đây, xử lý bằng fallback
        phía frontend (xem TtsStudioApp.tsx's registryItems)."""
        with self._lock:
            now = _now_iso()
            for e in entries:
                category = e.get("category")
                tags = e.get("tags")
                self._conn.execute(
                    """INSERT INTO tts_voice
                       (id, type, label, gender, region, preset_id, hidden, created_at,
                        accent, category_json, tags_json, tagline, description)
                       VALUES (?, 'preset', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(id) DO UPDATE SET
                         label = excluded.label, gender = excluded.gender, region = excluded.region,
                         preset_id = excluded.preset_id, accent = excluded.accent,
                         category_json = excluded.category_json, tags_json = excluded.tags_json,
                         tagline = excluded.tagline, description = excluded.description""",
                    (
                        e["id"], e["label"], e.get("gender"), e.get("region"), e["preset_id"],
                        1 if e.get("hidden") else 0, now,
                        e.get("accent"),
                        json.dumps(category, ensure_ascii=False) if category is not None else None,
                        json.dumps(tags, ensure_ascii=False) if tags is not None else None,
                        e.get("tagline"), e.get("description"),
                    ),
                )
            self._conn.commit()


def _import_json_once(conn: sqlite3.Connection, registry_path: Path) -> None:
    """Nhập cloned voice từ `voice-registry.json` cũ vào bảng SQL, MỘT LẦN duy nhất.

    Điều kiện dừng sớm: bảng đã có ≥1 cloned voice (đã nhập trước đó, hoặc người dùng đã
    clone giọng mới qua SQL trước khi hàm này kịp chạy — không ghi đè). File JSON không tồn
    tại hoặc hỏng → bỏ qua êm, không chặn khởi động vì giọng preset vẫn dùng được.

    Đổi tên file JSON thành `.imported.json` sau khi xong (KHÔNG xoá) — cho phép đối chiếu
    hoặc khôi phục thủ công nếu phát hiện nhập sai, đúng tinh thần
    VoiceRegistryJson's cách xử lý file hỏng (backup, không xoá im lặng).
    """
    if not registry_path.exists():
        return
    already = conn.execute("SELECT 1 FROM tts_voice WHERE type = 'cloned' LIMIT 1").fetchone()
    if already:
        return

    try:
        with registry_path.open(encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return

    cloned = [(vid, v) for vid, v in data.get("voices", {}).items() if v.get("type") == "cloned"]
    if not cloned:
        return

    now = _now_iso()
    for vid, v in cloned:
        category = v.get("category")
        tags = v.get("tags")
        # KHÔNG ghi ref_file/ref_text vào tts_voice — 2 cột đó là DI SẢN từ migration 017,
        # nguồn sự thật cho audio/transcript từ Phase 2 là tts_voice_sample (xem
        # _row_to_voice_dict's docstring). Insert đủ mọi sample của voice này ngay sau đây.
        conn.execute(
            """INSERT OR IGNORE INTO tts_voice
               (id, type, label, gender, region, hidden, created_at,
                accent, category_json, tags_json, tagline, description,
                source_catalog_id, source_lang)
               VALUES (?, 'cloned', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                vid, v.get("label", ""), v.get("gender"), v.get("region"),
                1 if v.get("hidden") else 0, now,
                v.get("accent"),
                json.dumps(category, ensure_ascii=False) if category is not None else None,
                json.dumps(tags, ensure_ascii=False) if tags is not None else None,
                v.get("tagline"), v.get("description"),
                v.get("source_catalog_id"), v.get("source_lang"),
            ),
        )

        # Sample: ưu tiên `samples[]` nếu voice JSON đã convert (đã gọi add_sample() ít
        # nhất 1 lần trước khi Electron kịp migrate DB — hiếm nhưng có thể xảy ra), rơi về
        # ref_file/ref_text trên entry (dạng phổ biến — voice 1 sample, chưa từng convert).
        samples = v.get("samples") or (
            [{"ref_file": v["ref_file"], **({"ref_text": v["ref_text"]} if v.get("ref_text") else {})}]
            if v.get("ref_file") else []
        )
        for s in samples:
            conn.execute(
                "INSERT OR IGNORE INTO tts_voice_sample (id, voice_id, ref_file, ref_text, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    s.get("id") or f"sample-{uuid.uuid4().hex[:8]}",
                    vid, s.get("ref_file"), s.get("ref_text"), now,
                ),
            )
    conn.commit()

    try:
        registry_path.rename(registry_path.with_suffix(".imported.json"))
    except Exception:
        pass  # dữ liệu đã an toàn trong SQL — đổi tên chỉ để dọn dẹp, không chặn nếu lỗi


def create_voice_registry(registry_path: Path, ref_dir: Path):
    """Điểm vào DUY NHẤT để lấy voice registry — main.py gọi hàm này, không gọi constructor
    của VoiceRegistryJson/VoiceRegistrySqlite trực tiếp (trừ trong test).

    Chọn SQL nếu `db.connect()` thành công (Electron đã truyền SKY_APP_DB_PATH và file đã
    migrate đủ — xem db.py), JSON nếu không. Chuyển sang SQL lần đầu thì nhập dữ liệu cũ
    một lần (`_import_json_once`) trước khi trả về, để không mất giọng người dùng đã clone.
    """
    conn = _db.connect()
    if conn is None:
        return VoiceRegistryJson(registry_path, ref_dir)

    _import_json_once(conn, registry_path)
    return VoiceRegistrySqlite(conn, ref_dir)
