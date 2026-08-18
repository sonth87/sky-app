// 2026-08-17 — bảng `tts_story` + `tts_story_item`: timeline nhiều track xâu chuỗi các lần
// sinh audio ĐÃ CÓ (Phase 4 của kế hoạch port voicebox, xem docs/dev/history/2026-08-17-*).
// Port từ voicebox's `services/stories.py` — Story KHÔNG phải kịch bản do LLM chia đoạn, nó
// là timeline kiểu DAW: kéo-thả các đoạn audio đã sinh sẵn vào track, trim/chỉnh volume/vị
// trí, rồi trộn ra 1 file WAV hoàn chỉnh.
//
// Chủ ghi DUY NHẤT là `apps/tts-service/server/stories.py` — Electron/data-service không bao
// giờ ghi bảng `tts_*`, đúng nguyên tắc "một chủ ghi mỗi bảng" (AGENTS.md §2.1).
//
// **Khác voicebox — quyết định kiến trúc quan trọng nhất của bảng này**: voicebox's
// `story_items.generation_id` là FK trỏ tới `generations` — bảng VĨNH VIỄN, chỉ mất khi
// người dùng chủ động xoá. Ở sky-app, nguồn tương đương (`tts_generation_history`, migration
// 019) là NHẬT KÝ CUỘN TỰ XOÁ (`history_store.py`'s `_prune()`: xoá khi vượt 5000 dòng HOẶC
// quá 90 ngày, kèm unlink file WAV), và dòng nguồn 'pregen' (nhiều nhất thực tế) CỐ Ý không
// có file audio (audio thật nằm ở `ttsPregenWavPath` phía Electron, không nhân bản). FK
// thẳng tới đó sẽ tạo tham chiếu treo ngay khi dòng bị prune.
//
// Vì vậy `tts_story_item.audio_file` là BẢN COPY RIÊNG của Story (không FK tới
// `tts_generation_history`) — "thêm vào Story" đọc audio + text/voice_label/duration snapshot
// từ 1 dòng history rồi copy file sang thư mục riêng của Story
// (`VIENEU_STORIES_DIR/<story_id>/`), từ đó độc lập hoàn toàn với vòng đời prune của history.
// Dòng history không có audio (nguồn 'pregen', hoặc dòng lỗi) đơn giản không thêm được vào
// Story — báo lỗi rõ ràng ngay tại API (`stories.py`'s `add_item_from_history`).
//
// `source_text`/`voice_label` là SNAPSHOT lúc thêm — giống `tts_generation_history`'s
// `voice_id`/`voice_label`, hiển thị lại không cần đọc audio hay tra `tts_voice` (voice clone
// nguồn có thể đã bị xoá).
//
// `start_time_ms`/`track`/`trim_start_ms`/`trim_end_ms`/`volume` phục vụ UI canvas kéo-thả
// pixel thật (không phải danh sách) — client tự tính lại vị trí lúc kéo, chỉ gọi API lúc thả.
//
// `ON DELETE CASCADE`: xoá Story thì mọi item của nó tự mất theo (Python còn phải tự xoá
// thư mục audio riêng, CASCADE chỉ lo phần DB).
export const SQL_021_TTS_STORY = `
CREATE TABLE tts_story (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tts_story_item (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES tts_story(id) ON DELETE CASCADE,
  audio_file TEXT NOT NULL,
  source_text TEXT,
  voice_label TEXT,
  duration_ms INTEGER NOT NULL,
  start_time_ms INTEGER NOT NULL DEFAULT 0,
  track INTEGER NOT NULL DEFAULT 0,
  trim_start_ms INTEGER NOT NULL DEFAULT 0,
  trim_end_ms INTEGER NOT NULL DEFAULT 0,
  volume REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_tts_story_item_story_id ON tts_story_item(story_id, track, start_time_ms);
`;
