// Nội dung SQL nhúng trực tiếp dạng string (không đọc file .sql lúc runtime) — bắt buộc vì
// package này chạy trong nhiều môi trường bundle khác nhau (Electron main process bundle
// inline qua Rollup, trình duyệt qua sql.js) nơi filesystem tương đối import.meta.url không
// còn đúng sau khi bundle, và trình duyệt không có filesystem. Giữ 1 file .ts riêng mỗi
// migration (thay vì gộp 1 file lớn) để dễ đối chiếu khi thêm migration mới.
export const SQL_001_CEREMONY_CORE = `
-- Giai đoạn 0 — chỉ phần ceremony hiện có (student/config/session/custom_variable).
-- Bảng layout/event/data_source sẽ thêm ở migration 002_*/003_* (Giai đoạn 1-3), không sửa
-- lại file này khi thêm bảng mới — xem packages/ceremony-db/src/migrations/index.ts.
--
-- Trường nested/lồng nhau (AppConfig.layout_overrides, tts_conditions, idle_image_variants,
-- Ceremony.idle_image_variants) lưu dạng cột TEXT chứa JSON — theo quyết định "giữ JSON blob"
-- ở docs/roadmap/plans/layout-designer/18-luu-tru-sqlite-supabase.md ghi chú tổng hợp #3.

CREATE TABLE IF NOT EXISTS ceremony (
  id INTEGER PRIMARY KEY,
  room_id TEXT NOT NULL DEFAULT 'default',
  room_name TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  graduation_year TEXT NOT NULL,
  date TEXT NOT NULL,
  venue TEXT NOT NULL,
  university_name TEXT NOT NULL,
  ministry_name TEXT NOT NULL,
  title_line1 TEXT NOT NULL,
  title_line2 TEXT NOT NULL,
  logo TEXT NOT NULL,
  backdrops_config TEXT NOT NULL,
  idle_image TEXT,
  idle_image_variants TEXT, -- JSON: Partial<Record<BackdropAspectRatio, string>>
  synced_at TEXT,           -- CeremonyBundle._synced_at
  bundle_version TEXT       -- CeremonyBundle._bundle_version
);

CREATE TABLE IF NOT EXISTS app_config (
  ceremony_id INTEGER PRIMARY KEY REFERENCES ceremony(id) ON DELETE CASCADE,
  ws_port INTEGER NOT NULL,
  http_port INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('auto', 'manual')),
  delay_seconds INTEGER NOT NULL,
  auto_open_browser INTEGER NOT NULL DEFAULT 0, -- boolean 0/1
  kiosk_mode INTEGER NOT NULL DEFAULT 0,
  auto_load_first INTEGER NOT NULL DEFAULT 0,
  slide_display_seconds INTEGER NOT NULL,
  idle_timeout_enabled INTEGER,
  idle_timeout_seconds INTEGER,
  tts_model TEXT,
  tts_speed REAL,
  tts_sentence_prefix TEXT,
  tts_conditions TEXT,      -- JSON: TtsCondition[]
  tts_voice_pool TEXT,      -- JSON: string[]
  layout_overrides TEXT     -- JSON: Record<string, Partial<BackdropTemplate>>
);

CREATE TABLE IF NOT EXISTS student (
  student_code TEXT PRIMARY KEY, -- khóa tự nhiên, dùng tra cứu QR
  ceremony_id INTEGER NOT NULL REFERENCES ceremony(id) ON DELETE CASCADE,
  id TEXT NOT NULL,              -- UUID gốc từ hệ thống nguồn (không phải PK ở đây)
  display_order INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT '',
  date_of_birth TEXT NOT NULL DEFAULT '',
  major_name TEXT NOT NULL DEFAULT '',
  faculty_name TEXT NOT NULL DEFAULT '',
  class_code TEXT NOT NULL DEFAULT '',
  course_code TEXT NOT NULL DEFAULT '',
  phone_number TEXT NOT NULL DEFAULT '',
  identity_number TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  card_code TEXT,
  gpa REAL NOT NULL DEFAULT 0,
  classification TEXT NOT NULL DEFAULT '',
  classification_type INTEGER NOT NULL DEFAULT 0,
  achievement_title TEXT NOT NULL DEFAULT '',
  award_type TEXT NOT NULL DEFAULT '',
  award_type_code TEXT,
  award_content TEXT NOT NULL DEFAULT '',
  presentation_template_type TEXT NOT NULL DEFAULT '',
  presentation_template_type_code TEXT,
  quote TEXT,
  image_file_name TEXT NOT NULL DEFAULT '',
  image_relative_path TEXT NOT NULL DEFAULT '',
  graduation_batch_id TEXT NOT NULL DEFAULT '',
  batch_name TEXT NOT NULL DEFAULT '',
  degree_award_status TEXT NOT NULL DEFAULT '',
  image_base64 TEXT,
  -- Trạng thái vận hành
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered','checked_in','called','on_stage','returned','absent')),
  ts_checkin TEXT,
  ts_called TEXT,
  ts_on_stage TEXT,
  ts_returned TEXT,
  src_on_stage TEXT CHECK (src_on_stage IN ('auto','manual') OR src_on_stage IS NULL),
  staff_presenter TEXT,
  absent INTEGER,
  absent_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_student_ceremony ON student(ceremony_id);
CREATE INDEX IF NOT EXISTS idx_student_display_order ON student(ceremony_id, display_order);
CREATE INDEX IF NOT EXISTS idx_student_identity ON student(identity_number);
CREATE INDEX IF NOT EXISTS idx_student_phone ON student(phone_number);
CREATE INDEX IF NOT EXISTS idx_student_card_code ON student(card_code);

CREATE TABLE IF NOT EXISTS custom_variable (
  id TEXT PRIMARY KEY,
  ceremony_id INTEGER NOT NULL REFERENCES ceremony(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  default_value TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_custom_variable_ceremony ON custom_variable(ceremony_id);

CREATE TABLE IF NOT EXISTS custom_variable_rule (
  id TEXT PRIMARY KEY,
  custom_variable_id TEXT NOT NULL REFERENCES custom_variable(id) ON DELETE CASCADE,
  attr TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('equals','contains','in','gt','lt','gte','lte')),
  val TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_custom_variable_rule_parent ON custom_variable_rule(custom_variable_id);
`;
