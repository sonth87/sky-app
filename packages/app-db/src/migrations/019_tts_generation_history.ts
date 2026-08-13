// 2026-08-13 — bảng `tts_generation_history`: nhật ký MỌI lần gọi /synthesize (Phase 3 của
// kế hoạch DB dùng chung, xem docs/dev/history/2026-08-12-mot-giong-nhieu-mau-multi-sample.md's
// "Còn phải làm").
//
// Chủ ghi DUY NHẤT là `apps/tts-service/server/history_store.py`, đúng nguyên tắc "một chủ
// ghi mỗi bảng" (AGENTS.md §2.1) — Electron/data-service không bao giờ ghi bảng `tts_*`.
//
// Ghi cho CẢ 4 nguồn gọi /synthesize: Ceremony thật (on-stage), TTS Studio (test thủ công),
// warmup tự động lúc khởi động, và pregen hàng loạt trước buổi lễ (`pregen-queue.ts`) — nguồn
// gọi NHIỀU NHẤT trên thực tế (1 sự kiện có thể 500-1000+ sinh viên). Vì pregen đã lưu audio
// vĩnh viễn riêng ở `ttsPregenWavPath` (Electron), `audio_file` của dòng nguồn 'pregen' LUÔN
// để trống — không nhân bản audio cho nguồn tốn dung lượng nhất, xem history_store.py.
//
// `voice_id`/`voice_label` là snapshot lúc tạo, KHÔNG FK tới `tts_voice` — cố ý: lịch sử phải
// vẫn đọc được sau khi giọng clone đó bị xoá, không muốn CASCADE xoá theo hay NULL hoá silent.
//
// `quality_flags_json` giữ đúng convention `category_json`/`tags_json` đã dùng ở migration 017.
export const SQL_019_TTS_GENERATION_HISTORY = `
CREATE TABLE tts_generation_history (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('ceremony', 'tts_studio', 'warmup', 'pregen', 'web', 'unknown')),
  text TEXT NOT NULL,
  voice_id TEXT,
  voice_label TEXT,
  speed REAL,
  sample_rate INTEGER,
  duration_ms INTEGER,
  engine_id TEXT,
  quality_score INTEGER,
  quality_flags_json TEXT,
  audio_file TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_tts_generation_history_created_at ON tts_generation_history(created_at);
CREATE INDEX idx_tts_generation_history_source_created_at ON tts_generation_history(source, created_at);
`;
