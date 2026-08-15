"""
stt_history_store.py — Nhật ký các lần phiên âm (Speech-to-Text), lưu trong bảng
`stt_history` của DB dùng chung (`packages/app-db`, migration 020).

Mirror `history_store.py` (TTS) nhưng ĐƠN GIẢN HƠN — KHÔNG lưu file audio gốc (`stt_history`
không có cột tương đương `audio_file`): kết quả của 1 lần phiên âm CHÍNH LÀ văn bản, không
cần giữ lại audio gốc để "xem lại kết quả" như TTS (nơi audio mới là kết quả). Nhờ vậy không
có `audio_dir`, không `_write_wav`, không logic unlink file lúc prune/xoá.

`source` phân biệt các caller thật của `_transcribe_with_stt()` (main.py): app Speech to Text
('speech_to_text'), nút mic form thêm mẫu mới trong VoiceCloneModal ('voice_clone'), nút mic
panel sửa giọng đã có ('voice_clone_edit'), 'unknown' cho client cũ không gửi field này.

Cùng hành vi CHỦ Ý như `history_store.py`: `db.connect()` trả `None` (DB chưa sẵn sàng) thì
`create_stt_history_store()` trả `None`, KHÔNG có fallback JSON — nơi gọi (main.py) tự bỏ qua
việc ghi log, không làm hỏng response phiên âm thật.

Retention: giống hệt cơ chế `history_store.py`'s `_prune()` — xoá dòng cũ hơn `max_age_days`
HOẶC vượt `max_rows` (2 tiêu chí độc lập, không phải 1 query gộp).
"""
from __future__ import annotations

import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone

import db as _db

DEFAULT_MAX_ROWS = 5000
DEFAULT_MAX_AGE_DAYS = 90


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SttHistoryStore:
    """KHÔNG tự khoá transaction dài — mỗi thao tác là 1 câu SQL + commit ngay, giống
    `HistoryStore`/`VoiceRegistrySqlite`. `threading.RLock` chỉ chống race TRONG tiến trình
    này (đơn tiến trình uvicorn); an toàn liên-tiến-trình đến từ WAL + `busy_timeout` phía
    SQLite."""

    def __init__(
        self,
        conn: sqlite3.Connection,
        max_rows: int = DEFAULT_MAX_ROWS,
        max_age_days: int = DEFAULT_MAX_AGE_DAYS,
    ) -> None:
        self._conn = conn
        self._lock = threading.RLock()
        self._max_rows = max_rows
        self._max_age_days = max_age_days

    def add_entry(
        self,
        *,
        source: str,
        text: str,
        language: str | None = None,
        duration_sec: float | None = None,
        engine_id: str | None = None,
        source_filename: str | None = None,
        error: str | None = None,
    ) -> dict:
        with self._lock:
            entry_id = f"stt-{uuid.uuid4().hex[:12]}"
            self._conn.execute(
                """INSERT INTO stt_history
                   (id, source, text, language, duration_sec, engine_id, source_filename,
                    error, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    entry_id, source, text, language, duration_sec, engine_id,
                    source_filename, error, _now_iso(),
                ),
            )
            self._conn.commit()
            self._prune()
            return self.get_entry(entry_id)  # type: ignore[return-value]

    def _prune(self) -> None:
        """Xoá dòng cũ hơn max_age_days HOẶC vượt max_rows — 2 tiêu chí ĐỘC LẬP, hợp bằng
        Python thay vì 1 query UNION, cùng lý do `history_store.py`'s `_prune()` đã giải
        thích: SQLite áp ORDER BY/LIMIT cho cả compound query, không tách riêng "top N mới
        nhất" và "quá hạn tuổi" trong 1 câu SQL được."""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=self._max_age_days)).isoformat()
        old = self._conn.execute(
            "SELECT id FROM stt_history WHERE created_at < ?", (cutoff,)
        ).fetchall()
        overflow = self._conn.execute(
            "SELECT id FROM stt_history ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?",
            (self._max_rows,),
        ).fetchall()

        to_delete = {r["id"] for r in (*old, *overflow)}
        if not to_delete:
            return

        self._conn.executemany(
            "DELETE FROM stt_history WHERE id = ?", [(i,) for i in to_delete]
        )
        self._conn.commit()

    def get_entry(self, entry_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM stt_history WHERE id = ?", (entry_id,)
            ).fetchone()
            return dict(row) if row else None

    def list_entries(self, limit: int = 100, source: str | None = None) -> list[dict]:
        with self._lock:
            if source:
                rows = self._conn.execute(
                    "SELECT * FROM stt_history WHERE source = ? "
                    "ORDER BY created_at DESC, id DESC LIMIT ?",
                    (source, limit),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    "SELECT * FROM stt_history ORDER BY created_at DESC, id DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [dict(r) for r in rows]

    def delete_entry(self, entry_id: str) -> bool:
        with self._lock:
            row = self._conn.execute(
                "SELECT id FROM stt_history WHERE id = ?", (entry_id,)
            ).fetchone()
            if row is None:
                return False
            self._conn.execute("DELETE FROM stt_history WHERE id = ?", (entry_id,))
            self._conn.commit()
            return True

    def clear_all(self) -> int:
        with self._lock:
            count = self._conn.execute("SELECT COUNT(*) AS c FROM stt_history").fetchone()["c"]
            self._conn.execute("DELETE FROM stt_history")
            self._conn.commit()
            return count


def create_stt_history_store(
    max_rows: int = DEFAULT_MAX_ROWS,
    max_age_days: int = DEFAULT_MAX_AGE_DAYS,
) -> SttHistoryStore | None:
    """Điểm vào DUY NHẤT — main.py gọi hàm này, không gọi constructor `SttHistoryStore` trực
    tiếp (trừ trong test). Trả `None` êm nếu `db.connect()` không sẵn sàng — KHÔNG có fallback
    JSON, caller tự bỏ qua việc ghi lịch sử (xem module docstring)."""
    conn = _db.connect()
    if conn is None:
        return None
    return SttHistoryStore(conn, max_rows, max_age_days)
