"""
history_store.py — Nhật ký MỌI lần gọi /synthesize, lưu trong bảng `tts_generation_history`
của DB dùng chung (`packages/app-db`, migration 019).

Khác `voice_registry.py`: KHÔNG có lớp JSON dự phòng. Mất lịch sử không phải mất dữ liệu
nghiêm trọng (khác mất giọng đã clone) — khi `db.connect()` trả `None` (DB không sẵn sàng,
schema cũ, hoặc chạy độc lập ngoài Electron), `create_history_store()` trả `None` và nơi gọi
(main.py) tự bỏ qua việc ghi log, không có fallback nào khác. Đây là hành vi CHỦ Ý, không phải
thiếu sót.

Audio lưu file WAV riêng trong `audio_dir` (đường dẫn `VIENEU_HISTORY_DIR` do Electron truyền,
xem apps/shell-electron/electron/slide/python-server.ts), DB chỉ lưu TÊN FILE — cùng convention
`tts_voice_sample.ref_file`. Nguồn 'pregen' KHÔNG có file riêng ở đây: audio pregen đã lưu vĩnh
viễn ở `ttsPregenWavPath` phía Electron, nhân bản thêm 1 bản chỉ tốn dung lượng cho đúng nguồn
gọi nhiều nhất (1 sự kiện có thể 500-1000+ sinh viên).

Retention: prune sau MỖI lần ghi — xoá dòng cũ hơn `max_age_days` HOẶC vượt `max_rows` (2 tiêu
chí độc lập, không phải 1 query gộp — xem `_prune()`), kèm unlink file WAV tương ứng.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
import wave
from datetime import datetime, timedelta, timezone
from pathlib import Path

import db as _db

DEFAULT_MAX_ROWS = 5000
DEFAULT_MAX_AGE_DAYS = 90


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_wav(path: Path, pcm_int16, sample_rate: int) -> None:
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(sample_rate)
        f.writeframes(pcm_int16.tobytes())


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    raw_flags = d.pop("quality_flags_json", None)
    d["quality_flags"] = json.loads(raw_flags) if raw_flags else None
    d["has_audio"] = bool(d.get("audio_file"))
    return d


class HistoryStore:
    """KHÔNG tự khoá transaction dài — mỗi thao tác là 1 câu SQL + commit ngay, giống
    `VoiceRegistrySqlite`. `threading.RLock` chỉ chống race TRONG tiến trình này (đơn tiến
    trình uvicorn); an toàn liên-tiến-trình đến từ WAL + `busy_timeout` phía SQLite."""

    def __init__(
        self,
        conn: sqlite3.Connection,
        audio_dir: Path,
        max_rows: int = DEFAULT_MAX_ROWS,
        max_age_days: int = DEFAULT_MAX_AGE_DAYS,
    ) -> None:
        self._conn = conn
        self._audio_dir = audio_dir
        self._lock = threading.RLock()
        self._max_rows = max_rows
        self._max_age_days = max_age_days
        audio_dir.mkdir(parents=True, exist_ok=True)

    def add_entry(
        self,
        *,
        source: str,
        text: str,
        voice_id: str | None = None,
        voice_label: str | None = None,
        speed: float | None = None,
        sample_rate: int | None = None,
        duration_ms: int | None = None,
        engine_id: str | None = None,
        quality_score: float | None = None,
        quality_flags: list[str] | None = None,
        audio_pcm_int16=None,
        error: str | None = None,
    ) -> dict:
        with self._lock:
            entry_id = f"hist-{uuid.uuid4().hex[:12]}"
            audio_file = None
            # pregen đã có bản chính chủ ở ttsPregenDir (Electron) — không nhân bản audio.
            # error != None nghĩa là lượt này thất bại — không có audio để lưu.
            if audio_pcm_int16 is not None and error is None and source != "pregen":
                audio_file = f"{entry_id}.wav"
                _write_wav(self._audio_dir / audio_file, audio_pcm_int16, sample_rate or 24000)

            self._conn.execute(
                """INSERT INTO tts_generation_history
                   (id, source, text, voice_id, voice_label, speed, sample_rate, duration_ms,
                    engine_id, quality_score, quality_flags_json, audio_file, error, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    entry_id, source, text, voice_id, voice_label, speed, sample_rate,
                    duration_ms, engine_id, quality_score,
                    json.dumps(quality_flags, ensure_ascii=False) if quality_flags else None,
                    audio_file, error, _now_iso(),
                ),
            )
            self._conn.commit()
            self._prune()
            return self.get_entry(entry_id)  # type: ignore[return-value]

    def _prune(self) -> None:
        """Xoá dòng cũ hơn max_age_days HOẶC vượt max_rows — 2 tiêu chí ĐỘC LẬP, hợp bằng
        Python thay vì 1 query UNION: SQLite áp ORDER BY/LIMIT cho cả compound query, không
        tách riêng "top N mới nhất" và "quá hạn tuổi" trong 1 câu SQL được."""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=self._max_age_days)).isoformat()
        old = self._conn.execute(
            "SELECT id, audio_file FROM tts_generation_history WHERE created_at < ?", (cutoff,)
        ).fetchall()
        overflow = self._conn.execute(
            "SELECT id, audio_file FROM tts_generation_history "
            "ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?",
            (self._max_rows,),
        ).fetchall()

        to_delete: dict[str, str | None] = {r["id"]: r["audio_file"] for r in (*old, *overflow)}
        if not to_delete:
            return

        self._conn.executemany(
            "DELETE FROM tts_generation_history WHERE id = ?", [(i,) for i in to_delete]
        )
        self._conn.commit()

        for audio_file in to_delete.values():
            if not audio_file:
                continue
            try:
                (self._audio_dir / audio_file).unlink(missing_ok=True)
            except Exception:
                pass

    def get_entry(self, entry_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM tts_generation_history WHERE id = ?", (entry_id,)
            ).fetchone()
            return _row_to_dict(row) if row else None

    def list_entries(self, limit: int = 100, source: str | None = None) -> list[dict]:
        with self._lock:
            if source:
                rows = self._conn.execute(
                    "SELECT * FROM tts_generation_history WHERE source = ? "
                    "ORDER BY created_at DESC, id DESC LIMIT ?",
                    (source, limit),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    "SELECT * FROM tts_generation_history ORDER BY created_at DESC, id DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [_row_to_dict(r) for r in rows]

    def get_audio_path(self, entry_id: str) -> Path | None:
        """None nếu dòng không tồn tại, không có audio (lỗi hoặc nguồn 'pregen'), hoặc file
        đã bị prune/xoá thủ công khỏi đĩa — caller (endpoint HTTP) trả 404 cho mọi trường hợp."""
        with self._lock:
            row = self._conn.execute(
                "SELECT audio_file FROM tts_generation_history WHERE id = ?", (entry_id,)
            ).fetchone()
            if row is None or not row["audio_file"]:
                return None
            path = self._audio_dir / row["audio_file"]
            return path if path.exists() else None

    def delete_entry(self, entry_id: str) -> bool:
        with self._lock:
            row = self._conn.execute(
                "SELECT audio_file FROM tts_generation_history WHERE id = ?", (entry_id,)
            ).fetchone()
            if row is None:
                return False
            self._conn.execute("DELETE FROM tts_generation_history WHERE id = ?", (entry_id,))
            self._conn.commit()
            if row["audio_file"]:
                try:
                    (self._audio_dir / row["audio_file"]).unlink(missing_ok=True)
                except Exception:
                    pass
            return True

    def clear_all(self) -> int:
        with self._lock:
            rows = self._conn.execute(
                "SELECT audio_file FROM tts_generation_history"
            ).fetchall()
            count = self._conn.execute("SELECT COUNT(*) AS c FROM tts_generation_history").fetchone()["c"]
            self._conn.execute("DELETE FROM tts_generation_history")
            self._conn.commit()
            for row in rows:
                if row["audio_file"]:
                    try:
                        (self._audio_dir / row["audio_file"]).unlink(missing_ok=True)
                    except Exception:
                        pass
            return count


def create_history_store(
    audio_dir: Path,
    max_rows: int = DEFAULT_MAX_ROWS,
    max_age_days: int = DEFAULT_MAX_AGE_DAYS,
) -> HistoryStore | None:
    """Điểm vào DUY NHẤT — main.py gọi hàm này, không gọi constructor `HistoryStore` trực
    tiếp (trừ trong test). Trả `None` êm nếu `db.connect()` không sẵn sàng — KHÔNG có fallback
    JSON, caller tự bỏ qua việc ghi lịch sử (xem module docstring)."""
    conn = _db.connect()
    if conn is None:
        return None
    return HistoryStore(conn, audio_dir, max_rows, max_age_days)
