// 2026-08-12 — bảng `tts_voice_sample`: NHIỀU file audio mẫu cho 1 giọng clone.
//
// Vấn đề đang giải quyết: engine clone kiểu in-context (Qwen/VoxCPM) chỉ có 1 file mẫu
// ~4 giây cho model rất ít ngữ cảnh về giọng. voicebox (app TTS tham chiếu,
// /Users/skyline/TEST/voicebox-main) cho phép ghép nhiều mẫu — port từ đó
// (`backend/database/models.py`'s `ProfileSample`, `backend/services/profiles.py`'s
// `create_voice_prompt_for_profile`).
//
// **Nguồn sự thật DUY NHẤT cho sample của MỌI voice, kể cả voice chỉ có 1 sample** — không
// giữ song song 2 chỗ lưu trữ (1 trên `tts_voice`, phần còn lại ở đây). Cột
// `ref_file`/`ref_text` trên `tts_voice` (từ migration 017) giờ là DI SẢN: giữ nguyên
// không xoá (để dữ liệu backfill bên dưới còn đối chiếu được nếu cần), nhưng Python KHÔNG
// đọc/ghi chúng nữa — mọi voice mới tạo từ nay đều CHỈ ghi vào bảng này, kể cả sample đầu
// tiên. Xem `apps/tts-service/server/voice_registry.py`.
//
// `ON DELETE CASCADE` — xoá voice thì mọi sample của nó tự mất theo, đúng vòng đời (sample
// không có ý nghĩa gì tách khỏi voice sở hữu nó). Cần `PRAGMA foreign_keys=ON` ở MỌI driver
// mở file này (xem AGENTS.md §2.1) — viết migration này mới lộ ra `SqlJsExecutor` (đường
// web) thiếu dòng đó dù `BetterSqlite3Executor` (Electron) đã có từ trước; đã bổ sung cùng
// lúc (`drivers/sql-js-executor.ts`), ảnh hưởng ngược tới toàn bộ 18 bảng có FK, không
// riêng bảng này.
//
// Backfill: mọi cloned voice ĐÃ CÓ ref_file (từ trước migration này) được chuyển thành 1
// dòng sample ở đây — không mất giọng đã clone khi nâng cấp. `randomblob`/`hex` sinh id
// ngẫu nhiên ngay trong SQL (SQLite built-in), không cần code ngoài chạy sau migration.
export const SQL_018_TTS_VOICE_SAMPLE = `
CREATE TABLE tts_voice_sample (
  id TEXT PRIMARY KEY,
  voice_id TEXT NOT NULL REFERENCES tts_voice(id) ON DELETE CASCADE,
  ref_file TEXT NOT NULL,
  ref_text TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_tts_voice_sample_voice_id ON tts_voice_sample(voice_id);

INSERT INTO tts_voice_sample (id, voice_id, ref_file, ref_text, created_at)
SELECT 'sample-' || lower(hex(randomblob(8))), id, ref_file, ref_text, created_at
FROM tts_voice
WHERE type = 'cloned' AND ref_file IS NOT NULL;
`;
