// demoCanonicalSubject — Giai đoạn 4b kế hoạch Event (wizard Bước 3: layout picker thumbnail).
// LayoutPickerModal (ceremony) và LayoutLibraryScreen (layout-designer, Giai đoạn 5.1) render
// thumbnail qua LayoutRenderer nhưng có thể CHƯA có DataSource thật (chưa cấu hình Event, hoặc
// đang duyệt/sửa layout độc lập) — record giả CỐ ĐỊNH này đảm bảo thumbnail luôn có gì đó để
// hiển thị, không phụ thuộc dữ liệu thật. Chuyển từ modules/ceremony sang đây (Giai đoạn 5.1,
// 2026-07-30) vì layout-designer cũng cần dùng, và module đó không nên phụ thuộc ngược vào ceremony.

import type { CanonicalSubject } from './canonical.js';

export function demoCanonicalSubject(): CanonicalSubject {
  return {
    id: 'demo-preview',
    displayOrder: 0,
    full_name: 'Nguyễn Văn A',
    image_relative_path: undefined,
    status: 'present',
    subjectType: 'student',
    extra: {
      gpa: '3.8',
      gender: 'Nam',
      major_name: 'Công nghệ thông tin',
      class_name: 'CNTT-K18',
    },
  };
}
