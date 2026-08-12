// Thêm cột `color` vào `event` để phân biệt nhanh Event này với Event khác trong danh sách
// (2026-07-29) — cùng tinh thần cột `layout_document.color` (migration 010), nhưng tách biệt
// hoàn toàn: màu Event gắn vào CHÍNH Event, không liên quan tới màu của layout đang gán cho nó.
//
// Nullable, không DEFAULT — Event cũ chưa có màu vẫn hợp lệ (fallback không hiện chấm màu ở UI).
export const SQL_011_EVENT_COLOR = `
ALTER TABLE event ADD COLUMN color TEXT;
`;
