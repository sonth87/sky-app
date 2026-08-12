// PHỤ LỤC "Event Hub" (2026-07-22) — thêm cột `color` vào layout_document để phân biệt layout
// bằng badge màu ở danh sách Event (module-ceremony). Màu gắn vào CHÍNH layout (không phải
// EventLayoutRef) — 1 layout luôn cùng 1 màu ở MỌI nơi nó được chọn/hiển thị.
//
// Nullable, không DEFAULT — layout cũ chưa có màu vẫn hợp lệ (fallback màu xám trung tính ở UI).
export const SQL_010_LAYOUT_DOCUMENT_COLOR = `
ALTER TABLE layout_document ADD COLUMN color TEXT;
`;
