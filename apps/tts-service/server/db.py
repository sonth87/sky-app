"""
db.py — kết nối tới SQLite DÙNG CHUNG với Electron/data-service (`@sky-app/app-db`, file
`sky-app.db`).

Nguyên tắc BẮT BUỘC (xem AGENTS.md §2.1 "Cơ sở dữ liệu dùng chung"):

  1. KHÔNG BAO GIỜ chạy migration ở đây. `migrate.ts` phía TypeScript không có khoá nào và
     dùng `CREATE TABLE` trần (không `IF NOT EXISTS`) — hai tiến trình cùng migrate là hỏng
     DB. Module này CHỈ mở file đã migrate xong và kiểm phiên bản; không tự tạo bảng nào.
  2. Một chủ ghi cho mỗi bảng. Python chỉ đọc/ghi các bảng `tts_*`.
  3. Có thể KHÔNG kết nối được — thiếu env (chạy độc lập ngoài Electron, `verify_engine.py`),
     file chưa tồn tại, hoặc schema cũ hơn bản Python này cần (Electron chưa cập nhật kịp
     migration mới). `connect()` trả `None` trong mọi trường hợp đó; CALLER chịu trách nhiệm
     rơi về chế độ suy giảm (đọc JSON như trước khi có DB dùng chung) — không có gì ở đây
     coi việc không kết nối được là lỗi.

Vì sao đáng làm dù chỉ để lưu 1 bảng nhỏ: `voice-registry.json` HIỆN TẠI đã là file 3 người
ghi không khoá gì cả (Electron seed lúc cài, tiến trình Python tier 'bundled', tier 'ext' —
hai tier sống song song có chủ đích, xem `python-server.ts`'s docstring). Chuyển sang SQLite
WAL + `busy_timeout` là AN TOÀN HƠN hiện trạng, không phải rủi ro mới.

Env:
  SKY_APP_DB_PATH — đường dẫn `sky-app.db`, Electron truyền lúc spawn (python-server.ts).
                    Thiếu biến này (hoặc rỗng) → connect() luôn trả None.
"""
from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path

# Migration TS mới nhất mà bản Python này BIẾT xử lý (bảng tts_generation_history tạo ở
# migration 019 của app-db, xem packages/app-db/src/migrations/019_tts_generation_history.ts).
# Nếu DB thấp hơn số này — Electron đang chạy bản CŨ HƠN bản Python vừa cập nhật, lệch version
# giữa hai phía đóng gói riêng — từ chối dùng SQL thay vì đọc nhầm một bảng chưa tồn tại.
#
# 2026-08-13: bump 17 → 19. Đáng lẽ phải bump lên 18 khi `tts_voice_sample` ra đời (Phase 2)
# nhưng bị bỏ sót — lỗi có sẵn: DB đứng đúng ở v17 + Python bản mới hơn thì `connect()` tưởng
# đủ điều kiện (17 >= 17) nhưng VoiceRegistrySqlite sẽ query nhầm bảng tts_voice_sample chưa
# tồn tại → sqlite3.OperationalError không bắt được, thay vì rơi về JSON êm như thiết kế. Vá
# kèm luôn trong lần bump cho tts_generation_history (Phase 3), không tách riêng.
REQUIRED_SCHEMA_VERSION = 19

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None
_attempted = False  # chỉ thử kết nối 1 LẦN mỗi tiến trình — xem connect()'s docstring


def _db_path() -> Path | None:
    raw = os.environ.get("SKY_APP_DB_PATH", "").strip()
    return Path(raw) if raw else None


def connect() -> sqlite3.Connection | None:
    """Kết nối dùng chung (singleton trong tiến trình), hoặc `None` nếu không dùng được.

    Chỉ thử MỘT LẦN mỗi tiến trình rồi cache kết quả (kể cả thất bại) — an toàn vì mọi
    module gọi hàm này (`voice_registry.py`) chỉ khởi tạo đúng 1 lần lúc `lifespan()` của
    server, không phải mỗi request. Biến môi trường cũng không đổi giữa chừng 1 phiên chạy
    process, nên không có tình huống "lần sau thử lại sẽ khác".
    """
    global _conn, _attempted
    with _lock:
        if _attempted:
            return _conn
        _attempted = True

        path = _db_path()
        if path is None or not path.exists():
            return None

        try:
            conn = sqlite3.connect(str(path), check_same_thread=False)
            conn.row_factory = sqlite3.Row
            # Cùng 3 pragma với BetterSqlite3Executor phía TypeScript
            # (packages/app-db/src/drivers/better-sqlite3-executor.ts) — hai runtime khác
            # nhau mở cùng file, các con số này giờ là HỢP ĐỒNG, không phải mặc định ngầm
            # của riêng thư viện nào.
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("PRAGMA busy_timeout=5000")

            version = conn.execute(
                "SELECT MAX(version) AS v FROM schema_version"
            ).fetchone()["v"]
        except sqlite3.Error:
            # Bảng schema_version chưa tồn tại (Electron chưa mở lần nào — không nên xảy ra
            # vì spawn() luôn sau bootstrap, nhưng không tin tưởng suông), file khoá bởi tiến
            # trình khác quá busy_timeout, hoặc file hỏng. Rơi về JSON, không raise.
            return None

        if version is None or version < REQUIRED_SCHEMA_VERSION:
            conn.close()
            return None

        _conn = conn
        return _conn
