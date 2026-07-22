// Giai đoạn "Bỏ schema Student cố định, chuyển sang CanonicalRecord" (2026-07-22) — xoá hẳn
// bảng `student`/`custom_variable`/`custom_variable_rule` (migration 001). 3 bảng này là dead
// path từ khi Event/DataSource (migration 005) trở thành nguồn thật duy nhất cho danh sách
// người tham dự (data_source_record) và biến điều kiện (event.custom_variables_json, hợp nhất
// ở Giai đoạn 4c) — không còn nơi nào đọc/ghi 3 bảng này. Xoá hẳn thay vì để dead tables, tránh
// nhầm lẫn cho người đọc code (kể cả AI agent) sau này tưởng đây vẫn là nguồn thật.
//
// KHÔNG migrate dữ liệu cũ — bảng `student` là cache runtime (đã xác nhận PK student_code, chỉ
// hỗ trợ 1 ceremony hoạt động tại 1 thời điểm), không phải nguồn lưu trữ lâu dài; dữ liệu thật
// của Event/DataSource nằm ở data_source_record, không bị ảnh hưởng bởi migration này.
export const SQL_009_DROP_STUDENT_SCHEMA = `
DROP TABLE IF EXISTS custom_variable_rule;
DROP TABLE IF EXISTS custom_variable;
DROP TABLE IF EXISTS student;
`;
