// Giai đoạn 4a — FieldMappingProfile, theo docs/roadmap/plans/layout-designer/
// 05-he-bien-va-adapter.md §"FieldMappingProfile — Adapter" + 18-luu-tru-sqlite-supabase.md §5.
//
// Lưu PERSISTENT (quyết định chốt qua AskUserQuestion 2026-07-19, khác đề xuất "tạm dùng trong
// phiên" ban đầu) — lần import sau (file cùng loại, VD file nhân sự HR) không phải map lại cột
// từ đầu, chọn lại profile cũ qua wizard Bước 2.
//
// map_json giữ dạng JSON blob (Record<string, MappingRule>) — cùng quyết định "JSON blob cho
// phần lồng nhau tự do" đã áp dụng xuyên suốt các bảng khác (001_ceremony_core.ts, 002, 005).
export const SQL_006_FIELD_MAPPING_PROFILE = `
CREATE TABLE IF NOT EXISTS field_mapping_profile (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  natural_key_field TEXT NOT NULL,
  map_json TEXT NOT NULL,
  sample_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;
