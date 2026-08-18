"""
stories.py — timeline nhiều track xâu chuỗi các lần sinh audio ĐÃ CÓ, trộn thành 1 file WAV
hoàn chỉnh. Phase 4 của kế hoạch port voicebox, lưu trong bảng `tts_story`/`tts_story_item`
của DB dùng chung (`packages/app-db`, migration 021).

Port từ voicebox's `services/stories.py` — Story KHÔNG phải kịch bản do LLM chia đoạn, nó là
timeline kiểu DAW: kéo-thả các đoạn audio đã sinh sẵn vào track, trim/chỉnh volume/vị trí, rồi
trộn ra 1 file WAV. UI là canvas kéo-thả pixel thật (không phải danh sách tự sắp xếp) — vì vậy
`move_item` nhận thẳng toạ độ tuyệt đối (`start_time_ms`, `track`) do client tính từ vị trí
con trỏ, khác voicebox's `move_story_item` (chỉ đổi track, tự đặt cuối track đích).

**Khác voicebox — quyết định quan trọng nhất**: `tts_story_item.audio_file` là BẢN COPY RIÊNG
của Story (không FK tới `tts_generation_history`) — bảng đó là nhật ký cuộn tự xoá
(`history_store.py`'s `_prune()`), FK thẳng vào sẽ tạo tham chiếu treo. "Thêm vào Story" đọc
audio từ `HistoryStore.get_audio_path()` rồi COPY sang thư mục riêng của Story, từ đó độc lập
hoàn toàn với vòng đời prune của history. Xem đầy đủ lý do ở
packages/app-db/src/migrations/021_tts_story.ts.

**Hệ quả của việc "item sở hữu file riêng" (khác voicebox's "item tham chiếu file dùng
chung")**: `split_story_item` KHÔNG thể cho 2 row cùng trỏ 1 `audio_file` như voicebox làm
(voicebox an toàn vì file đó do `generation` sở hữu vĩnh viễn, story item chỉ mượn) — ở đây
xoá 1 trong 2 row sẽ unlink file mà row còn lại vẫn đang trỏ tới. Nên `split`/`duplicate` đều
COPY thêm 1 bản file độc lập. Tốn đĩa hơn (nhân đôi dung lượng đoạn bị tách) nhưng đổi lại mỗi
row luôn tự chủ vòng đời file của nó — xoá 1 item không bao giờ ảnh hưởng item khác.

Không có lớp JSON dự phòng — giống `history_store.py`, mất Story không phải mất dữ liệu
nghiêm trọng như mất giọng đã clone. DB không sẵn sàng thì `create_story_store()` trả `None`,
main.py tự bỏ qua toàn bộ route /stories (503).
"""
from __future__ import annotations

import shutil
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf

import db as _db

# Khoảng cách mặc định giữa 2 item liên tiếp khi thêm mới không chỉ định vị trí — port từ
# voicebox's add_item_to_story (hằng số lặp lại 3 chỗ bên đó: add/duplicate/reorder).
DEFAULT_GAP_MS = 200

MIX_SAMPLE_RATE = 24_000  # tần số chung khi trộn — resample mọi item về đây nếu lệch


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def _row_to_story(row: sqlite3.Row) -> dict:
    return dict(row)


def _row_to_item(row: sqlite3.Row) -> dict:
    d = dict(row)
    # `voice_id` vắng mặt (item cũ thêm trước migration 022, hoặc kết quả của Tách — xem
    # split_item's docstring) → không đủ tham số gọi lại /synthesize, ẩn hẳn nút Regenerate ở
    # UI thay vì hiện disabled-mà-không-rõ-vì-sao.
    d["can_regenerate"] = bool(d.get("voice_id"))
    return d


class StoryNotFound(Exception):
    pass


class StoryItemNotFound(Exception):
    pass


class StoryStore:
    """KHÔNG tự khoá transaction dài — mỗi thao tác là 1 câu SQL + commit ngay, giống
    `HistoryStore`. `threading.RLock` chỉ chống race TRONG tiến trình này; an toàn liên-tiến-
    trình đến từ WAL + `busy_timeout` phía SQLite."""

    def __init__(self, conn: sqlite3.Connection, audio_dir: Path) -> None:
        self._conn = conn
        self._audio_dir = audio_dir
        self._lock = threading.RLock()
        audio_dir.mkdir(parents=True, exist_ok=True)

    def _story_dir(self, story_id: str) -> Path:
        return self._audio_dir / story_id

    # ── Story CRUD ────────────────────────────────────────────────────────────

    def create_story(self, name: str, description: str | None = None) -> dict:
        with self._lock:
            story_id = _new_id("story")
            now = _now_iso()
            self._conn.execute(
                "INSERT INTO tts_story (id, name, description, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (story_id, name, description, now, now),
            )
            self._conn.commit()
            return self.get_story(story_id)  # type: ignore[return-value]

    def list_stories(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM tts_story ORDER BY updated_at DESC"
            ).fetchall()
            return [_row_to_story(r) for r in rows]

    def get_story(self, story_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM tts_story WHERE id = ?", (story_id,)
            ).fetchone()
            return _row_to_story(row) if row else None

    def update_story(self, story_id: str, name: str | None = None,
                     description: str | None = None) -> dict | None:
        with self._lock:
            current = self.get_story(story_id)
            if current is None:
                return None
            self._conn.execute(
                "UPDATE tts_story SET name = ?, description = ?, updated_at = ? WHERE id = ?",
                (
                    name if name is not None else current["name"],
                    description if description is not None else current["description"],
                    _now_iso(), story_id,
                ),
            )
            self._conn.commit()
            return self.get_story(story_id)

    def delete_story(self, story_id: str) -> bool:
        with self._lock:
            if self.get_story(story_id) is None:
                return False
            # ON DELETE CASCADE lo phần DB (tts_story_item) — dọn thư mục audio riêng ở đây.
            self._conn.execute("DELETE FROM tts_story WHERE id = ?", (story_id,))
            self._conn.commit()
            shutil.rmtree(self._story_dir(story_id), ignore_errors=True)
            return True

    # ── Item CRUD ─────────────────────────────────────────────────────────────

    def list_items(self, story_id: str) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM tts_story_item WHERE story_id = ? ORDER BY track, start_time_ms",
                (story_id,),
            ).fetchall()
            return [_row_to_item(r) for r in rows]

    def get_item(self, story_id: str, item_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM tts_story_item WHERE story_id = ? AND id = ?",
                (story_id, item_id),
            ).fetchone()
            return _row_to_item(row) if row else None

    def get_item_audio_path(self, story_id: str, item_id: str) -> Path | None:
        """Đúng khuôn `HistoryStore.get_audio_path()` — main.py không tự ráp đường dẫn từ
        `_story_dir()` (private), luôn đi qua đây."""
        item = self.get_item(story_id, item_id)
        if item is None:
            return None
        return self._story_dir(story_id) / item["audio_file"]

    def _next_start_time_ms(self, story_id: str, track: int) -> int:
        """Vị trí mặc định cho item MỚI thêm: cuối item cuối cùng của track đó + khoảng cách
        mặc định — chỉ dùng lúc thêm mới, không dùng khi kéo-thả (đã có vị trí tường minh)."""
        row = self._conn.execute(
            "SELECT MAX(start_time_ms + duration_ms - trim_start_ms - trim_end_ms) AS end_ms "
            "FROM tts_story_item WHERE story_id = ? AND track = ?",
            (story_id, track),
        ).fetchone()
        end_ms = row["end_ms"]
        return 0 if end_ms is None else int(end_ms) + DEFAULT_GAP_MS

    def add_item_from_history(
        self, story_id: str, history_store, history_entry_id: str, track: int = 0,
    ) -> dict:
        """Copy audio của 1 dòng lịch sử sinh audio vào Story, làm 1 item mới.

        Raise `ValueError` (main.py map sang 400) nếu dòng lịch sử không tồn tại hoặc không có
        audio — nguồn 'pregen' (không lưu file trùng, xem history_store.py) hoặc dòng lỗi.
        """
        if self.get_story(story_id) is None:
            raise StoryNotFound(story_id)

        entry = history_store.get_entry(history_entry_id)
        if entry is None:
            raise ValueError(f"Không tìm thấy dòng lịch sử: {history_entry_id}")
        src_path = history_store.get_audio_path(history_entry_id)
        if src_path is None:
            raise ValueError(
                "Dòng lịch sử này không có audio để thêm vào Story — nguồn 'pregen' không lưu "
                "file trùng (đã có sẵn trong hàng loạt tạo trước buổi lễ), hoặc đây là dòng lỗi."
            )

        with self._lock:
            item_id = _new_id("item")
            dest_dir = self._story_dir(story_id)
            dest_dir.mkdir(parents=True, exist_ok=True)
            audio_file = f"{item_id}.wav"
            shutil.copyfile(src_path, dest_dir / audio_file)

            start_time_ms = self._next_start_time_ms(story_id, track)
            self._conn.execute(
                """INSERT INTO tts_story_item
                   (id, story_id, audio_file, source_text, voice_label, duration_ms,
                    start_time_ms, track, trim_start_ms, trim_end_ms, volume, created_at,
                    voice_id, speed, engine_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1.0, ?, ?, ?, ?)""",
                (
                    item_id, story_id, audio_file, entry.get("text"), entry.get("voice_label"),
                    entry.get("duration_ms") or 0, start_time_ms, track, _now_iso(),
                    entry.get("voice_id"), entry.get("speed"), entry.get("engine_id"),
                ),
            )
            self._conn.commit()
            self._touch_story(story_id)
            return self.get_item(story_id, item_id)  # type: ignore[return-value]

    def move_item(self, story_id: str, item_id: str, start_time_ms: int, track: int) -> dict | None:
        """Đặt vị trí TUYỆT ĐỐI — client (canvas kéo-thả) tự tính từ toạ độ con trỏ, khác
        voicebox's move_story_item (chỉ đổi track, tự đặt cuối track đích)."""
        with self._lock:
            if self.get_item(story_id, item_id) is None:
                return None
            self._conn.execute(
                "UPDATE tts_story_item SET start_time_ms = ?, track = ? WHERE story_id = ? AND id = ?",
                (max(0, int(start_time_ms)), int(track), story_id, item_id),
            )
            self._conn.commit()
            self._touch_story(story_id)
            return self.get_item(story_id, item_id)

    def reorder_items(self, story_id: str, track: int, ordered_item_ids: list[str]) -> list[dict]:
        """Sắp lại thứ tự các item TRONG CÙNG 1 track (list dọc sortable, kéo-thả bằng
        `@dnd-kit/sortable`) — tính lại `start_time_ms` tuần tự, cách nhau `DEFAULT_GAP_MS`.
        KHÔNG đổi track — kéo-thả xuyên track vẫn qua `move_item` (canvas), tránh 2 API cùng
        làm 1 việc theo 2 cách khác nhau."""
        with self._lock:
            if self.get_story(story_id) is None:
                raise StoryNotFound(story_id)
            items = {i["id"]: i for i in self.list_items(story_id) if i["track"] == track}
            if set(ordered_item_ids) != set(items.keys()):
                raise ValueError("Danh sách sắp lại không khớp đúng các item hiện có trên track này.")

            cursor_ms = 0
            for item_id in ordered_item_ids:
                item = items[item_id]
                self._conn.execute(
                    "UPDATE tts_story_item SET start_time_ms = ? WHERE story_id = ? AND id = ?",
                    (cursor_ms, story_id, item_id),
                )
                effective_ms = item["duration_ms"] - item["trim_start_ms"] - item["trim_end_ms"]
                cursor_ms += effective_ms + DEFAULT_GAP_MS
            self._conn.commit()
            self._touch_story(story_id)
            return self.list_items(story_id)

    def trim_item(self, story_id: str, item_id: str, trim_start_ms: int, trim_end_ms: int) -> dict:
        with self._lock:
            item = self.get_item(story_id, item_id)
            if item is None:
                raise StoryItemNotFound(item_id)
            trim_start_ms = max(0, int(trim_start_ms))
            trim_end_ms = max(0, int(trim_end_ms))
            if trim_start_ms + trim_end_ms >= item["duration_ms"]:
                raise ValueError("Trim vượt quá độ dài audio — không còn phần nào để nghe.")
            self._conn.execute(
                "UPDATE tts_story_item SET trim_start_ms = ?, trim_end_ms = ? WHERE story_id = ? AND id = ?",
                (trim_start_ms, trim_end_ms, story_id, item_id),
            )
            self._conn.commit()
            self._touch_story(story_id)
            return self.get_item(story_id, item_id)  # type: ignore[return-value]

    def set_volume(self, story_id: str, item_id: str, volume: float) -> dict | None:
        with self._lock:
            if self.get_item(story_id, item_id) is None:
                return None
            volume = max(0.0, min(2.0, float(volume)))
            self._conn.execute(
                "UPDATE tts_story_item SET volume = ? WHERE story_id = ? AND id = ?",
                (volume, story_id, item_id),
            )
            self._conn.commit()
            self._touch_story(story_id)
            return self.get_item(story_id, item_id)

    def duplicate_item(self, story_id: str, item_id: str) -> dict:
        """Copy thêm 1 bản file audio ĐỘC LẬP — xem docstring module, item không chia sẻ file
        với item khác để xoá 1 item không bao giờ ảnh hưởng item còn lại."""
        with self._lock:
            item = self.get_item(story_id, item_id)
            if item is None:
                raise StoryItemNotFound(item_id)

            new_id = _new_id("item")
            story_dir = self._story_dir(story_id)
            new_audio_file = f"{new_id}.wav"
            shutil.copyfile(story_dir / item["audio_file"], story_dir / new_audio_file)

            new_start = self._next_start_time_ms(story_id, item["track"])
            self._conn.execute(
                """INSERT INTO tts_story_item
                   (id, story_id, audio_file, source_text, voice_label, duration_ms,
                    start_time_ms, track, trim_start_ms, trim_end_ms, volume, created_at,
                    voice_id, speed, engine_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    new_id, story_id, new_audio_file, item["source_text"], item["voice_label"],
                    item["duration_ms"], new_start, item["track"],
                    item["trim_start_ms"], item["trim_end_ms"], item["volume"], _now_iso(),
                    item["voice_id"], item["speed"], item["engine_id"],
                ),
            )
            self._conn.commit()
            self._touch_story(story_id)
            return self.get_item(story_id, new_id)  # type: ignore[return-value]

    def split_item(self, story_id: str, item_id: str, split_time_ms: int) -> tuple[dict, dict]:
        """Tách 1 item tại `split_time_ms` (tính từ đầu phần ĐANG NGHE ĐƯỢC, tức sau
        trim_start) thành 2 item liên tiếp — port `split_story_item` của voicebox, ĐỔI phần
        sở hữu file: 2 item KHÔNG chia sẻ `audio_file` (xem docstring module), nên tốn thêm 1
        lần copy so với bản gốc.
        """
        with self._lock:
            item = self.get_item(story_id, item_id)
            if item is None:
                raise StoryItemNotFound(item_id)

            effective_duration_ms = item["duration_ms"] - item["trim_start_ms"] - item["trim_end_ms"]
            split_time_ms = int(split_time_ms)
            if split_time_ms <= 0 or split_time_ms >= effective_duration_ms:
                raise ValueError("Vị trí tách phải nằm trong phần đang nghe được của item.")

            story_dir = self._story_dir(story_id)
            absolute_split_ms = item["trim_start_ms"] + split_time_ms

            # Nửa trái: giữ nguyên id/audio_file/start_time_ms, chỉ tăng trim_end_ms tới
            # đúng điểm tách.
            left_trim_end = item["duration_ms"] - absolute_split_ms
            self._conn.execute(
                "UPDATE tts_story_item SET trim_end_ms = ? WHERE story_id = ? AND id = ?",
                (left_trim_end, story_id, item_id),
            )

            # Nửa phải: item MỚI, file MỚI (copy độc lập) — bắt đầu ngay sau nửa trái trên
            # cùng track, trim_start tính từ điểm tách.
            # KHÔNG mang voice_id/speed/engine_id sang 2 nửa — cả 2 vẫn trỏ nguyên văn bản
            # `source_text` ĐẦY ĐỦ (chỉ audio bị cắt), regenerate 1 nửa sẽ sinh lại NGUYÊN câu
            # gốc chứ không phải riêng nửa đó, hỏng đúng ý người dùng vừa tách. Vô hiệu hoá
            # Regenerate cho cả 2 nửa (giữ nguyên trim của mảnh trái) an toàn hơn là để sai.
            self._conn.execute(
                "UPDATE tts_story_item SET voice_id = NULL, speed = NULL, engine_id = NULL, "
                "active_version_id = NULL WHERE story_id = ? AND id = ?",
                (story_id, item_id),
            )

            right_id = _new_id("item")
            right_audio_file = f"{right_id}.wav"
            shutil.copyfile(story_dir / item["audio_file"], story_dir / right_audio_file)
            right_start_ms = item["start_time_ms"] + split_time_ms
            self._conn.execute(
                """INSERT INTO tts_story_item
                   (id, story_id, audio_file, source_text, voice_label, duration_ms,
                    start_time_ms, track, trim_start_ms, trim_end_ms, volume, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    right_id, story_id, right_audio_file, item["source_text"], item["voice_label"],
                    item["duration_ms"], right_start_ms, item["track"],
                    absolute_split_ms, item["trim_end_ms"], item["volume"], _now_iso(),
                ),
            )
            self._conn.commit()
            self._touch_story(story_id)
            return self.get_item(story_id, item_id), self.get_item(story_id, right_id)  # type: ignore[return-value]

    # ── Regenerate / Versions (Phase 4.5) ───────────────────────────────────────
    #
    # `StoryStore` không biết gì về TTS engine — main.py tự lo việc gọi lại `/synthesize`
    # (dùng `voice_id`/`speed`/`engine_id`/`source_text` snapshot trên item) rồi truyền audio
    # THÀNH PHẨM vào `regenerate_item()`. Tách vậy để store này không phụ thuộc ngược vào
    # `_engine`/`_registry` của main.py — đúng ranh giới module hiện có (store chỉ lo DB+file).

    def list_item_versions(self, story_id: str, item_id: str) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM tts_story_item_version WHERE story_item_id = ? ORDER BY created_at",
                (item_id,),
            ).fetchall()
            return [dict(r) for r in rows]

    def regenerate_item(self, story_id: str, item_id: str, new_audio: np.ndarray, sample_rate: int) -> dict:
        """Lưu audio MỚI (main.py đã tự sinh xong, truyền vào đây) thành 1 version, đặt làm
        bản đang dùng của item. Lần regenerate ĐẦU TIÊN của 1 item tự lưu audio HIỆN TẠI thành
        version "Bản gốc" TRƯỚC khi ghi đè — từ đó `active_version_id` luôn trỏ đúng bản đang
        dùng, không mất bản nào kể cả bản gốc.

        Reset trim về 0/0 — duration bản mới thường khác bản cũ, trim cũ áp lên đó vô nghĩa
        (đúng hành vi voicebox: đổi version reset luôn trim).
        """
        with self._lock:
            item = self.get_item(story_id, item_id)
            if item is None:
                raise StoryItemNotFound(item_id)
            if not item["voice_id"]:
                raise ValueError(
                    "Item này không có đủ thông tin để sinh lại (thêm vào Story trước khi có "
                    "tính năng Regenerate, hoặc là kết quả của thao tác Tách)."
                )

            story_dir = self._story_dir(story_id)
            version_count = self._conn.execute(
                "SELECT COUNT(*) AS n FROM tts_story_item_version WHERE story_item_id = ?", (item_id,)
            ).fetchone()["n"]

            if item["active_version_id"] is None:
                origin_id = _new_id("ver")
                self._conn.execute(
                    """INSERT INTO tts_story_item_version
                       (id, story_item_id, audio_file, duration_ms, label, created_at)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (origin_id, item_id, item["audio_file"], item["duration_ms"], "Bản gốc", _now_iso()),
                )
                version_count += 1

            new_version_id = _new_id("ver")
            new_audio_file = f"{new_version_id}.wav"
            sf.write(str(story_dir / new_audio_file), new_audio, sample_rate)
            new_duration_ms = int(len(new_audio) / sample_rate * 1000)
            self._conn.execute(
                """INSERT INTO tts_story_item_version
                   (id, story_item_id, audio_file, duration_ms, label, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (new_version_id, item_id, new_audio_file, new_duration_ms, f"Bản {version_count + 1}", _now_iso()),
            )
            self._conn.execute(
                """UPDATE tts_story_item
                   SET audio_file = ?, duration_ms = ?, trim_start_ms = 0, trim_end_ms = 0,
                       active_version_id = ?
                   WHERE story_id = ? AND id = ?""",
                (new_audio_file, new_duration_ms, new_version_id, story_id, item_id),
            )
            self._conn.commit()
            self._touch_story(story_id)
            return self.get_item(story_id, item_id)  # type: ignore[return-value]

    def set_item_version(self, story_id: str, item_id: str, version_id: str) -> dict:
        """Chuyển item về dùng 1 version đã lưu — chỉ TRỎ LẠI file đã có sẵn trong thư mục
        Story (version's audio_file độc lập từ lúc tạo, không cần copy byte gì thêm)."""
        with self._lock:
            if self.get_item(story_id, item_id) is None:
                raise StoryItemNotFound(item_id)
            version = self._conn.execute(
                "SELECT * FROM tts_story_item_version WHERE id = ? AND story_item_id = ?",
                (version_id, item_id),
            ).fetchone()
            if version is None:
                raise ValueError(f"Không tìm thấy version: {version_id}")
            self._conn.execute(
                """UPDATE tts_story_item
                   SET audio_file = ?, duration_ms = ?, trim_start_ms = 0, trim_end_ms = 0,
                       active_version_id = ?
                   WHERE story_id = ? AND id = ?""",
                (version["audio_file"], version["duration_ms"], version_id, story_id, item_id),
            )
            self._conn.commit()
            self._touch_story(story_id)
            return self.get_item(story_id, item_id)  # type: ignore[return-value]

    def delete_item(self, story_id: str, item_id: str) -> bool:
        with self._lock:
            item = self.get_item(story_id, item_id)
            if item is None:
                return False
            self._conn.execute(
                "DELETE FROM tts_story_item WHERE story_id = ? AND id = ?", (story_id, item_id)
            )
            self._conn.commit()
            try:
                (self._story_dir(story_id) / item["audio_file"]).unlink(missing_ok=True)
            except Exception:
                pass
            self._touch_story(story_id)
            return True

    def _touch_story(self, story_id: str) -> None:
        self._conn.execute(
            "UPDATE tts_story SET updated_at = ? WHERE id = ?", (_now_iso(), story_id)
        )
        self._conn.commit()

    # ── Trộn ──────────────────────────────────────────────────────────────────

    def export_audio(self, story_id: str, sample_rate: int = MIX_SAMPLE_RATE) -> tuple[np.ndarray, int]:
        """Trộn mọi item của Story thành 1 mảng audio mono float32. Trả kèm `sample_rate` —
        đúng convention trả cặp (audio, sample_rate) mọi engine trong repo đang dùng, thay vì
        để caller tự biết/import hằng số riêng của module này.

        Port gần nguyên văn voicebox's `export_story_audio`: buffer zeros theo tổng độ dài →
        mỗi item cắt theo trim, nhân volume, cộng vào buffer đúng vị trí `start_time_ms` → chỉ
        peak-normalize khi VƯỢT 1.0 (không normalize vô điều kiện — giữ nguyên cân bằng
        volume người dùng đã tự chỉnh giữa các item).

        Item đọc lỗi (file thiếu/hỏng) bị BỎ QUA thay vì làm hỏng cả lần trộn — cùng cách
        voicebox xử lý (`except Exception: continue`).
        """
        items = self.list_items(story_id)
        if not items:
            return np.zeros(0, dtype=np.float32), sample_rate

        story_dir = self._story_dir(story_id)
        placed: list[tuple[int, np.ndarray]] = []  # (start_sample, audio)
        max_end_sample = 0

        for item in items:
            try:
                audio, sr = sf.read(str(story_dir / item["audio_file"]), dtype="float32", always_2d=False)
                if audio.ndim > 1:
                    audio = audio.mean(axis=1)
                if sr != sample_rate:
                    import soxr
                    audio = soxr.resample(audio, sr, sample_rate).astype(np.float32)

                trim_start_samples = int(item["trim_start_ms"] / 1000 * sample_rate)
                trim_end_samples = int(item["trim_end_ms"] / 1000 * sample_rate)
                end_idx = len(audio) - trim_end_samples
                if trim_start_samples >= end_idx:
                    continue
                audio = audio[trim_start_samples:end_idx] * float(item["volume"])

                start_sample = int(item["start_time_ms"] / 1000 * sample_rate)
                placed.append((start_sample, audio))
                max_end_sample = max(max_end_sample, start_sample + len(audio))
            except Exception:
                continue

        if not placed:
            return np.zeros(0, dtype=np.float32), sample_rate

        final_audio = np.zeros(max_end_sample, dtype=np.float32)
        for start_sample, audio in placed:
            end_sample = min(start_sample + len(audio), max_end_sample)
            final_audio[start_sample:end_sample] += audio[: end_sample - start_sample]

        peak = float(np.abs(final_audio).max()) if final_audio.size else 0.0
        if peak > 1.0:
            final_audio = final_audio / peak

        return final_audio, sample_rate


def create_story_store(audio_dir: Path) -> StoryStore | None:
    """Điểm vào DUY NHẤT — main.py gọi hàm này, không gọi constructor `StoryStore` trực tiếp
    (trừ trong test). Trả `None` êm nếu `db.connect()` không sẵn sàng."""
    conn = _db.connect()
    if conn is None:
        return None
    return StoryStore(conn, audio_dir)
