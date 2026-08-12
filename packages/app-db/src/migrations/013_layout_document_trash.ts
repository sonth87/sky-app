// GĐ6 (2026-08-05) — thêm cột `trashed_at` vào layout_document để soft-delete layouts.
// Layout xoá vào thùng rác (Move to Trash) sẽ set trashed_at = NOW(), không còn hiện ở
// listLayoutDocuments() để ceremony không chọn được, nhưng dữ liệu vẫn lưu cho khôi phục sau.
//
// Nullable, không DEFAULT — layout cũ chưa trash vẫn active (trashed_at IS NULL).
export const SQL_013_LAYOUT_DOCUMENT_TRASH = `
ALTER TABLE layout_document ADD COLUMN trashed_at TEXT;
`;
