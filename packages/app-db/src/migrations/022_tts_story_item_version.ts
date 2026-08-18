// 2026-08-18 — "Regenerate" cho Story item: sinh lại 1 đoạn ngay trong Story, giữ các bản cũ
// (versions/takes) để chọn lại — port ý tưởng từ voicebox's version picker, nhưng gắn khác chỗ.
//
// **Khác voicebox — vì sao gắn version vào `tts_story_item` chứ không vào generation**:
// voicebox gắn version vào `generations` (bảng vĩnh viễn). Ở sky-app, `tts_story_item` CỐ Ý
// tách khỏi vòng đời `tts_generation_history` (nhật ký cuộn tự xoá, xem migration 021's
// docstring) — item sở hữu bản audio riêng. Vì vậy version cũng phải là con của STORY ITEM,
// không phải của generation, để giữ đúng nguyên tắc đó: xoá Story item thì mọi version của nó
// tự mất theo (CASCADE), không phụ thuộc gì vào lịch sử sinh audio.
//
// `tts_story_item` cần thêm `voice_id`/`speed`/`engine_id` (snapshot lúc thêm, đọc từ dòng
// `tts_generation_history` — bảng đó đã có sẵn 3 field này từ migration 019) để "Regenerate" có
// đủ tham số gọi lại `/synthesize`. Item thêm TRƯỚC migration này sẽ có 3 cột NULL — không
// regenerate được, chấp nhận được vì đó là item cũ (UI ẩn hẳn nút, xem `can_regenerate`).
//
// GIỚI HẠN ĐÃ BIẾT: `tts_generation_history` không lưu `effects_chain` đã áp dụng lúc sinh (migration
// 019 không có cột này) — "Regenerate" chỉ tái tạo đúng text+voice+speed+engine, KHÔNG áp lại
// hiệu ứng hậu kỳ gốc nếu có. Không mở rộng phạm vi migration này để vá lỗ hổng đó.
// `tts_story_item.active_version_id`: NULL = item đang dùng bản audio "gốc" của chính nó (chưa
// regenerate lần nào, chưa có version row nào tồn tại). Khi regenerate LẦN ĐẦU, `stories.py`
// tự lưu audio hiện tại thành 1 version "Bản gốc" TRƯỚC khi ghi đè — từ đó `active_version_id`
// luôn trỏ đúng bản đang dùng trong số các version đã có, không bao giờ mất bản nào.
// `ON DELETE SET NULL` (không CASCADE) — xoá 1 version không được kéo theo xoá luôn item.
export const SQL_022_TTS_STORY_ITEM_VERSION = `
ALTER TABLE tts_story_item ADD COLUMN voice_id TEXT;
ALTER TABLE tts_story_item ADD COLUMN speed REAL;
ALTER TABLE tts_story_item ADD COLUMN engine_id TEXT;

CREATE TABLE tts_story_item_version (
  id TEXT PRIMARY KEY,
  story_item_id TEXT NOT NULL REFERENCES tts_story_item(id) ON DELETE CASCADE,
  audio_file TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_tts_story_item_version_story_item_id ON tts_story_item_version(story_item_id, created_at);

ALTER TABLE tts_story_item ADD COLUMN active_version_id TEXT REFERENCES tts_story_item_version(id) ON DELETE SET NULL;
`;
