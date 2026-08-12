// Giai đoạn 2.4 — layout versioning (publish/draft/lịch sử version), theo docs/roadmap/plans/
// layout-designer/21-layout-versioning.md §3. 3 bảng: layout_document (metadata) 1-1
// layout_draft (bản đang sửa, CHƯA công bố), 1-N layout_version (bản ĐÃ publish, bất biến).
//
// content_json giữ nguyên cấu trúc LayoutContent (variants[] lồng nhau) dạng JSON blob — cùng
// quyết định "JSON blob cho phần lồng nhau" như 001_ceremony_core.ts.
export const SQL_002_LAYOUT_VERSIONING = `
CREATE TABLE IF NOT EXISTS layout_document (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  latest_published_version INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 1 draft / layout — vùng nháp tách biệt khỏi các version đã publish (file 21 §2 "Vùng nháp
-- riêng"). Sửa/save draft KHÔNG ảnh hưởng Event nào đang dùng version đã publish.
CREATE TABLE IF NOT EXISTS layout_draft (
  layout_document_id TEXT PRIMARY KEY REFERENCES layout_document(id) ON DELETE CASCADE,
  content_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- N version / layout — BẤT BIẾN sau khi publish (không UPDATE/DELETE ngoài migration).
CREATE TABLE IF NOT EXISTS layout_version (
  layout_document_id TEXT NOT NULL REFERENCES layout_document(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  published_at TEXT NOT NULL,
  note TEXT,
  PRIMARY KEY (layout_document_id, version)
);

CREATE INDEX IF NOT EXISTS idx_layout_version_document ON layout_version(layout_document_id);
`;
