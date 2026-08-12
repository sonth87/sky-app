// GĐ18 (2026-08-06) — tạo bảng layout_component để lưu personal templates (nhóm item tự tạo).
// Mỗi component ghi nhớ N LayoutItem[] dưới dạng JSON, cho phép spawn lại nhóm này vào layout
// khác bằng SpawnKind 'preset' (tái dùng infrastructure GĐ17).
//
// id: UUID hoặc chuỗi tự sinh (dùng cách đã chọn ở các migration cũ, xác nhận khi code)
// name: tên do user đặt cho mẫu
// content_json: JSON.stringify(LayoutItem[]) — items với toạ độ TƯƠNG ĐỐI (anchor 0,0)
// created_at: ISO 8601 timestamp
export const SQL_014_LAYOUT_COMPONENT = `
CREATE TABLE layout_component (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;
