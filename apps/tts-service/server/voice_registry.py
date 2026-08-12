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
`get_preset_id`):

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

    def set_ref_text(self, voice_id: str, ref_text: str) -> bool:
        """Đặt/sửa bản chép lời của audio mẫu. Chuỗi rỗng = xoá field.

        ⚠️ Caller PHẢI xoá ref codes đã cache của voice này sau khi gọi
        (`_ref_cache_forget_voice` ở main.py) — embedding cache giữ nguyên dict
        `{wav_path, ref_text}` suốt vòng đời process, không xoá thì transcript cũ
        vẫn được dùng cho tới lần restart tiếp theo.
        """
        with self._lock:
            voices = self._data.get("voices", {})
            if voice_id not in voices:
                return False
            text = (ref_text or "").strip()
            if text:
                voices[voice_id]["ref_text"] = text
            else:
                voices[voice_id].pop("ref_text", None)
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
    nhưng giữ đúng hình dạng để dễ so sánh/debug khi cần đối chiếu 2 kho)."""
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
        """Xem VoiceRegistryJson.set_ref_text — cùng hợp đồng: chuỗi rỗng = xoá field, caller
        vẫn phải tự xoá ref-codes cache sau khi gọi (main.py's _ref_cache_forget_voice)."""
        with self._lock:
            text = (ref_text or "").strip() or None
            cur = self._conn.execute(
                "UPDATE tts_voice SET ref_text = ? WHERE id = ?", (text, voice_id)
            )
            self._conn.commit()
            return cur.rowcount > 0

    def add_cloned(
        self,
        label: str,
        gender: str,
        region: str,
        ref_file: str,
        voice_id: str | None = None,
        extra: dict | None = None,
    ) -> dict:
        with self._lock:
            vid = voice_id or f"clone-{uuid.uuid4().hex[:8]}"
            extra = extra or {}
            category = extra.get("category")
            tags = extra.get("tags")
            self._conn.execute(
                """INSERT INTO tts_voice
                   (id, type, label, gender, region, ref_file, hidden, created_at,
                    ref_text, accent, category_json, tags_json, tagline, description,
                    source_catalog_id, source_lang)
                   VALUES (?, 'cloned', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    vid, label, gender, region, ref_file, _now_iso(),
                    extra.get("ref_text"), extra.get("accent"),
                    json.dumps(category, ensure_ascii=False) if category is not None else None,
                    json.dumps(tags, ensure_ascii=False) if tags is not None else None,
                    extra.get("tagline"), extra.get("description"),
                    extra.get("source_catalog_id"), extra.get("source_lang"),
                ),
            )
            self._conn.commit()
            # Đọc lại thay vì tự dựng dict — bảo đảm hình dạng trả về LUÔN khớp get_voice(),
            # không lệch nếu sau này thêm cột mà quên cập nhật cả 2 chỗ.
            return self.get_voice(vid)  # type: ignore[return-value]

    def find_by_source_catalog_id(self, source_catalog_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM tts_voice WHERE source_catalog_id = ?", (source_catalog_id,)
            ).fetchone()
            return _row_to_voice_dict(row) if row else None

    def delete_cloned(self, voice_id: str) -> tuple[bool, str]:
        with self._lock:
            row = self._conn.execute(
                "SELECT type, ref_file FROM tts_voice WHERE id = ?", (voice_id,)
            ).fetchone()
            if row is None:
                return False, "not_found"
            if row["type"] == "preset":
                return False, "is_preset"

            self._conn.execute("DELETE FROM tts_voice WHERE id = ?", (voice_id,))
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

    def get_ref_path(self, voice_id: str) -> Path | None:
        v = self.get_voice(voice_id)
        if v is None or v.get("type") != "cloned":
            return None
        return self._ref_dir / v["ref_file"]

    def get_preset_id(self, voice_id: str) -> str | None:
        v = self.get_voice(voice_id)
        if v is None or v.get("type") != "preset":
            return None
        return v.get("preset_id")


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
        conn.execute(
            """INSERT OR IGNORE INTO tts_voice
               (id, type, label, gender, region, ref_file, hidden, created_at,
                ref_text, accent, category_json, tags_json, tagline, description,
                source_catalog_id, source_lang)
               VALUES (?, 'cloned', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                vid, v.get("label", ""), v.get("gender"), v.get("region"),
                v.get("ref_file"), 1 if v.get("hidden") else 0, now,
                v.get("ref_text"), v.get("accent"),
                json.dumps(category, ensure_ascii=False) if category is not None else None,
                json.dumps(tags, ensure_ascii=False) if tags is not None else None,
                v.get("tagline"), v.get("description"),
                v.get("source_catalog_id"), v.get("source_lang"),
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
