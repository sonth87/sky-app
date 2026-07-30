// sampleCanonicalData — dữ liệu mẫu cho menu Develop > "Dùng dữ liệu mẫu" (2026-07-28). Thay thế
// hệ nạp data mẫu cũ (seed.ts/sync.ts, dựa trên schema Student cố định) đã bị xoá hẳn khi bỏ
// Student (22/7) — bản này đi qua ĐÚNG hệ Event/DataSource mới, không hồi sinh code cũ. Id cố
// định để bấm nhiều lần không tạo trùng (xem handleUseSampleData, ControlApp.tsx).
//
// Không có `image_relative_path` — mục tiêu là có ngay data để thử layout theo điều kiện/ghép
// biến, không phải dựng lại pipeline copy ảnh mẫu vào ceremony-data/image/ (phạm vi riêng).

import type { CanonicalSubject } from '@sky-app/slide-shared';

export const SAMPLE_DATA_SOURCE_ID = 'sample-data-source';
export const SAMPLE_EVENT_ID = 'sample-event';

export const SAMPLE_RECORDS: CanonicalSubject[] = [
  { id: 'sample-1', full_name: 'Nguyễn Văn An', subjectType: 'student', extra: { gpa: '3.9', khoa: 'Công nghệ thông tin', gioi_tinh: 'Nam' } },
  { id: 'sample-2', full_name: 'Trần Thị Bình', subjectType: 'student', extra: { gpa: '3.6', khoa: 'Công nghệ thông tin', gioi_tinh: 'Nữ' } },
  { id: 'sample-3', full_name: 'Lê Hoàng Cường', subjectType: 'student', extra: { gpa: '2.8', khoa: 'Kinh tế', gioi_tinh: 'Nam' } },
  { id: 'sample-4', full_name: 'Phạm Thị Dung', subjectType: 'student', extra: { gpa: '3.95', khoa: 'Kinh tế', gioi_tinh: 'Nữ' } },
  { id: 'sample-5', full_name: 'Hoàng Văn Em', subjectType: 'student', extra: { gpa: '3.2', khoa: 'Ngoại ngữ', gioi_tinh: 'Nam' } },
  { id: 'sample-6', full_name: 'Vũ Thị Phương', subjectType: 'student', extra: { gpa: '3.7', khoa: 'Ngoại ngữ', gioi_tinh: 'Nữ' } },
  { id: 'sample-7', full_name: 'Đặng Văn Giang', subjectType: 'student', extra: { gpa: '2.5', khoa: 'Cơ khí', gioi_tinh: 'Nam' } },
  { id: 'sample-8', full_name: 'Bùi Thị Hoa', subjectType: 'student', extra: { gpa: '3.4', khoa: 'Cơ khí', gioi_tinh: 'Nữ' } },
  { id: 'sample-9', full_name: 'Ngô Văn Inh', subjectType: 'student', extra: { gpa: '3.85', khoa: 'Kiến trúc', gioi_tinh: 'Nam' } },
  { id: 'sample-10', full_name: 'Đỗ Thị Kim', subjectType: 'student', extra: { gpa: '3.1', khoa: 'Kiến trúc', gioi_tinh: 'Nữ' } },
];
