// Giai đoạn 5.2 (2026-07-31) — thêm `category`/`tags` vào layout_document, dùng cho panel
// "Thông tin layout" (LayoutInfoModal) + tìm/lọc trong Layout Library khi số lượng layout tăng.
//
// `category`: nullable, không DEFAULT — giống `color` (010), layout cũ/chưa phân loại vẫn hợp lệ.
// `tags`: lưu JSON array phẳng trên chính row (KHÔNG dùng bảng join riêng — tag không có FK/thứ
// tự/cột phụ, khác event_layout_ref), theo đúng tiền lệ `custom_variables_json` (005). NOT NULL
// DEFAULT '[]' để tầng query luôn JSON.parse ra được mảng hợp lệ, không cần xử lý NULL riêng.
export const SQL_012_LAYOUT_DOCUMENT_CATEGORY_TAGS = `
ALTER TABLE layout_document ADD COLUMN category TEXT;
ALTER TABLE layout_document ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
`;
