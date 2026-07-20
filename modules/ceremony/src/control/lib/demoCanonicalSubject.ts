// demoCanonicalSubject — Giai đoạn 4b kế hoạch Event (wizard Bước 3: layout picker thumbnail).
// LayoutPickerModal render thumbnail qua LayoutRenderer, nhưng lúc cấu hình Bước 3 có thể CHƯA
// có DataSource thật (nhánh "để sau"/"dùng nguồn có sẵn nhưng nguồn rỗng") — record giả CỐ ĐỊNH
// này đảm bảo thumbnail luôn có gì đó để hiển thị, không phụ thuộc dữ liệu thật.

import type { CanonicalSubject } from '@sky-app/slide-shared';

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
