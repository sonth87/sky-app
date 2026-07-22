// Giai đoạn "Màn hình chờ thuộc Event" (2026-07-21) — thêm cột `role` vào event_layout_ref để
// phân biệt layout TRAO GIẢI ('award', chọn theo điều kiện qua resolveLayout) với layout MÀN
// CHỜ ('idle', cố định 1 layout duy nhất, không có selector/điều kiện, không đi qua
// resolveLayout). Trước migration này, layout Mặc định (selector=undefined) và màn chờ
// (cũng selector=undefined) không có cách nào phân biệt trong cùng mảng layoutRefs.
//
// DEFAULT 'award' — mọi event_layout_ref đã có sẵn trước migration này đều là layout trao giải
// (khái niệm màn chờ chưa từng tồn tại), an toàn tuyệt đối với dữ liệu cũ.
export const SQL_008_EVENT_LAYOUT_REF_ROLE = `
ALTER TABLE event_layout_ref ADD COLUMN role TEXT NOT NULL DEFAULT 'award' CHECK (role IN ('award', 'idle'));
`;
