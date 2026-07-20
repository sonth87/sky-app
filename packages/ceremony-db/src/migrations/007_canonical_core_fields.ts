// Giai đoạn 4c (mở rộng) — thêm 7 field CORE mới vào CanonicalSubject/data_source_record, theo
// quyết định chốt qua trao đổi 2026-07-20: nền tảng mở rộng phục vụ nhiều loại đối tượng (sinh
// viên/nhân viên/loại khác), không chỉ 4 field core cũ (full_name/image_relative_path/status/
// display_order). TOÀN BỘ optional — ALTER TABLE ADD COLUMN an toàn với SQLite (không breaking
// dữ liệu cũ, row cũ tự nhận NULL cho cột mới), cả better-sqlite3 lẫn sql.js hỗ trợ giống nhau.
//
// identifier_code: mã định danh CHUNG (thay cho gắn cứng "student_code"/"employee_code" theo
// loại đối tượng cụ thể — đúng hướng "không chỉ sinh viên" đã bàn). identity_number: CCCD/CMND.
// title: chức danh/danh hiệu ở tầng Canonical — KHÁC achievement_title của Student legacy (2
// tầng khác nhau, không đụng nhau).
export const SQL_007_CANONICAL_CORE_FIELDS = `
ALTER TABLE data_source_record ADD COLUMN identifier_code TEXT;
ALTER TABLE data_source_record ADD COLUMN identity_number TEXT;
ALTER TABLE data_source_record ADD COLUMN phone TEXT;
ALTER TABLE data_source_record ADD COLUMN email TEXT;
ALTER TABLE data_source_record ADD COLUMN date_of_birth TEXT;
ALTER TABLE data_source_record ADD COLUMN title TEXT;
ALTER TABLE data_source_record ADD COLUMN description TEXT;
`;
