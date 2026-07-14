/**
 * Nhãn tiếng Việt và bảng màu cho trạng thái sinh viên.
 * Xem DESIGN.md Phụ lục A.
 */
import type { StudentStatus } from './types.js';

/** Nhãn hiển thị tiếng Việt cho từng trạng thái */
export const STATUS_LABELS_VI: Record<StudentStatus, string> = {
  registered: 'Đã đăng ký',
  checked_in: 'Đã check-in',
  called: 'Đã gọi',
  on_stage: 'Trên sân khấu',
  returned: 'Đã nhận bằng',
  absent: 'Vắng mặt',
};

/** Màu gợi ý cho badge trạng thái (hex). Đồng bộ giữa Portal và Slide. */
export const STATUS_COLORS: Record<StudentStatus, { bg: string; text: string; label: string }> = {
  registered: { bg: '#e5e7eb', text: '#374151', label: 'Xám' },
  checked_in: { bg: '#dbeafe', text: '#1e40af', label: 'Xanh dương nhạt' },
  called: { bg: '#fef3c7', text: '#92400e', label: 'Vàng' },
  on_stage: { bg: '#fed7aa', text: '#9a3412', label: 'Cam đậm' },
  returned: { bg: '#dcfce7', text: '#166534', label: 'Xanh lá' },
  absent: { bg: '#fee2e2', text: '#991b1b', label: 'Đỏ' },
};

/** Thứ tự sắp xếp trạng thái (cho lọc/hiển thị) */
export const STATUS_ORDER: StudentStatus[] = [
  'registered',
  'checked_in',
  'called',
  'on_stage',
  'returned',
  'absent',
];

export function getStatusLabel(status: StudentStatus): string {
  return STATUS_LABELS_VI[status] ?? status;
}
