// 2026-08-15 — bảng `stt_history`: nhật ký các lần phiên âm (Speech-to-Text), GĐ 3 của kế
// hoạch STT (xem docs/dev/history/2026-08-14-stt-nen-tang-giai-doan-1.md,
// docs/dev/history/2026-08-14-stt-nut-tu-dong-dien-transcript.md).
//
// Chủ ghi DUY NHẤT là `apps/tts-service/server/stt_history_store.py`, đúng nguyên tắc "một
// chủ ghi mỗi bảng" (AGENTS.md §2.1).
//
// KHÁC `tts_generation_history`: KHÔNG có cột audio_file — lịch sử STT chỉ lưu văn bản đã
// nhận dạng, không lưu lại file audio gốc (giữ nhẹ, tránh lặp lại độ phức tạp dọn-file WAV
// mà lịch sử TTS đã gặp — audio gốc không cần giữ lại để "xem lại kết quả", khác TTS nơi audio
// CHÍNH LÀ kết quả).
//
// `source` phân biệt 3 caller thật của `/stt/transcribe`/`/voices/.../transcribe`: app
// Speech to Text mới ('speech_to_text'), nút mic form thêm mẫu mới trong VoiceCloneModal
// ('voice_clone'), nút mic panel sửa giọng đã có ('voice_clone_edit') — 'unknown' là fallback
// cho client cũ không gửi field này.
export const SQL_020_STT_HISTORY = `
CREATE TABLE stt_history (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('speech_to_text', 'voice_clone', 'voice_clone_edit', 'unknown')),
  text TEXT NOT NULL,
  language TEXT,
  duration_sec REAL,
  engine_id TEXT,
  source_filename TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_stt_history_created_at ON stt_history(created_at);
CREATE INDEX idx_stt_history_source_created_at ON stt_history(source, created_at);
`;
