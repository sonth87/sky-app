// Giai đoạn 3 — Event/DataSource, theo docs/roadmap/plans/layout-designer/18-luu-tru-sqlite-
// supabase.md §5 (schema sơ bộ) + 10-quan-ly-dot-le-event.md + 13-ceremony-mo-rong.md.
//
// data_source: 1 nguồn dữ liệu người tham dự, 2 chế độ (pooled = dùng chung nhiều Event,
// consumable = tiêu hao, loại trừ dần qua event_consumed_record). natural_key_field/
// data_source_record.natural_key thêm SỚM hơn dự kiến (blueprint để dành GĐ4a re-import) —
// tránh phải ALTER TABLE thêm cột vào bảng đã có dữ liệu; GĐ3 set natural_key = record.id tạm
// khi chưa có wizard import thật.
//
// event: 1 đợt lễ cụ thể. CHỈ 1 event có status='active' tại 1 thời điểm (ràng buộc ở tầng
// query, không phải CHECK constraint SQL — SQLite không hỗ trợ "unique partial index kèm điều
// kiện" đơn giản cho trường hợp này qua CHECK, dùng transaction ở queries/event.ts).
//
// event_layout_ref: layout được dùng trong event, GHIM layout_version cụ thể (không phải "bản
// mới nhất") — theo 21-layout-versioning.md §5, lễ đang chạy ổn định dù designer đang sửa layout.
//
// event_consumed_record: bảng nối — thay cho mảng consumedIds phẳng, SELECT qua JOIN luôn đúng
// "toàn bộ đã dùng của nguồn X" (giải quyết câu hỏi mở ở file 13, xem file 18 §5).
export const SQL_005_EVENT_DATA_SOURCE = `
CREATE TABLE IF NOT EXISTS data_source (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('pooled', 'consumable')),
  natural_key_field TEXT NOT NULL,
  mapping_profile_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_source_record (
  id TEXT PRIMARY KEY,
  data_source_id TEXT NOT NULL REFERENCES data_source(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,
  full_name TEXT NOT NULL,
  image_relative_path TEXT,
  status TEXT,
  display_order INTEGER,
  members_json TEXT,
  extra_json TEXT NOT NULL,
  natural_key TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_data_source_record_source ON data_source_record(data_source_id);

CREATE TABLE IF NOT EXISTS event (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'scheduled', 'active', 'archived')),
  scheduled_at TEXT,
  archived_at TEXT,
  data_source_id TEXT REFERENCES data_source(id),
  cloned_from TEXT,
  custom_variables_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_layout_ref (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  layout_document_id TEXT NOT NULL REFERENCES layout_document(id),
  layout_version INTEGER NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  selector_json TEXT,
  overrides_json TEXT,
  field_map_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_event_layout_ref_event ON event_layout_ref(event_id);

CREATE TABLE IF NOT EXISTS event_consumed_record (
  event_id TEXT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  data_source_record_id TEXT NOT NULL REFERENCES data_source_record(id) ON DELETE CASCADE,
  consumed_at TEXT NOT NULL,
  PRIMARY KEY (event_id, data_source_record_id)
);
`;
