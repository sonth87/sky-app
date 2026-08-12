// 2026-08-12 — bảng `tts_voice`: giọng đọc TTS (preset dựng sẵn + giọng đã clone).
//
// Chủ ghi DUY NHẤT của bảng này là tiến trình Python của tts-service (xem
// apps/tts-service/server/voice_registry.py, apps/tts-service/server/db.py) — Electron/
// data-service không bao giờ ghi bảng `tts_*`, đúng quy tắc "một chủ ghi mỗi bảng"
// (AGENTS.md §2.1). Migration này CHỈ tạo schema; seed 10 preset voice do Python tự đảm bảo
// lúc khởi động (giữ đúng hành vi cũ của `_load_or_init()` — tự merge preset mới khi VieNeu
// update, không phải việc của migration TypeScript).
//
// Cột phản ánh đúng shape JSON đã dùng nhiều tháng qua (`voice-registry.json`, xem docstring
// cũ ở đầu `voice_registry.py`) — đổi kho lưu trữ, không đổi mô hình dữ liệu. Bản ghép nhiều
// mẫu cho 1 giọng (`tts_voice_sample`) là tính năng THÊM sau, không phải phần của đổi kho
// lưu trữ này — xem kế hoạch Phase 2.
//
// `category`/`tags` giữ dạng JSON trong cột TEXT, đúng convention `tags_json` đã dùng ở
// `layout_document` (migration 012) — không tách bảng con cho một list ngắn, hiếm khi query.
export const SQL_017_TTS_VOICE = `
CREATE TABLE tts_voice (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('cloned', 'preset')),
  label TEXT NOT NULL,
  gender TEXT,
  region TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  -- Chỉ 'cloned':
  ref_file TEXT,
  ref_text TEXT,
  accent TEXT,
  category_json TEXT,
  tags_json TEXT,
  tagline TEXT,
  description TEXT,
  source_catalog_id TEXT,
  source_lang TEXT,
  -- Chỉ 'preset':
  preset_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_tts_voice_source_catalog_id ON tts_voice(source_catalog_id)
  WHERE source_catalog_id IS NOT NULL;
`;
