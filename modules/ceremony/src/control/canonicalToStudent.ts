// Bridge CanonicalSubject/CanonicalGroup → Student — Giai đoạn 3 kế hoạch Event, theo
// docs/roadmap/plans/layout-designer/13-ceremony-mo-rong.md §"Hệ quả kỹ thuật". Dashboard cũ
// (StudentPanels, ScanInbox...) đọc Student[] qua useControlStore — Event cung cấp
// CanonicalSubject[]/CanonicalGroup[] (từ DataSourcePort.getRecords) — cần map để dashboard cũ
// KHÔNG phải viết lại.
//
// Fail-soft tuyệt đối: field Student không có tương ứng trực tiếp trong CanonicalSubject.extra
// → chuỗi rỗng/0/null mặc định, KHÔNG throw. Đây là chuyển đổi 1 CHIỀU chỉ phục vụ hiển thị
// trong dashboard cũ — không ghi ngược lại DataSource.

import type { CanonicalGroup, CanonicalSubject, Student } from '@sky-app/slide-shared';

function extraString(extra: Record<string, string | number>, key: string): string {
  const v = extra[key];
  return v == null ? '' : String(v);
}

function extraNumber(extra: Record<string, string | number>, key: string): number {
  const v = extra[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * 1 CanonicalSubject → 1 Student. CanonicalGroup (tập thể) hiện KHÔNG map trực tiếp — dashboard
 * cũ (StudentPanels...) không có khái niệm "nhóm", chỉ hiển thị được cá nhân; nhóm hiển thị dạng
 * "1 record danh nghĩa" bằng cách coi full_name của nhóm như 1 subject (không liệt kê members),
 * đủ để dashboard hoạt động không vỡ ở Giai đoạn 3 (backdrop thật cho nhóm/loop thuộc Giai đoạn 4d).
 */
export function canonicalToStudent(record: CanonicalSubject | CanonicalGroup, index: number): Student {
  const extra = record.extra;
  return {
    id: record.id,
    // Field core mở rộng (Giai đoạn 4c, 2026-07-20) ƯU TIÊN TRƯỚC extra — không phá dữ liệu đã
    // nhập qua extra trước khi có field core này (Event cũ tạo trước giai đoạn này vẫn đúng).
    student_code: record.identifierCode ?? record.id,
    display_order: record.displayOrder ?? index,
    full_name: record.full_name,
    gender: extraString(extra, 'gender'),
    date_of_birth: record.dateOfBirth ?? extraString(extra, 'date_of_birth'),
    major_name: extraString(extra, 'major_name'),
    faculty_name: extraString(extra, 'faculty_name'),
    class_code: extraString(extra, 'class_code'),
    course_code: extraString(extra, 'course_code'),
    phone_number: record.phone ?? extraString(extra, 'phone_number'),
    identity_number: record.identityNumber ?? extraString(extra, 'identity_number'),
    email: record.email ?? extraString(extra, 'email'),
    card_code: extra.card_code == null ? undefined : String(extra.card_code),
    gpa: extraNumber(extra, 'gpa'),
    classification: extraString(extra, 'classification'),
    classification_type: extraNumber(extra, 'classification_type'),
    achievement_title: extraString(extra, 'achievement_title'),
    award_type: extraString(extra, 'award_type'),
    award_type_code: null,
    award_content: extraString(extra, 'award_content'),
    presentation_template_type: extraString(extra, 'presentation_template_type'),
    presentation_template_type_code: null,
    quote: extraString(extra, 'quote') || null,
    image_file_name: '',
    image_relative_path: record.image_relative_path ?? '',
    graduation_batch_id: '',
    batch_name: '',
    degree_award_status: '',

    status: (record.status as Student['status']) ?? 'registered',
    ts_checkin: null,
    ts_called: null,
    ts_on_stage: null,
    ts_returned: null,
    src_on_stage: null,
    staff_presenter: null,
    // extra chỉ nhận string|number (CanonicalSubject.extra) — không có boolean thật, "vắng mặt"
    // biểu diễn qua string "true"/"1" hoặc number khác 0 (tuỳ FieldMappingProfile map thế nào).
    absent: extra.absent === 'true' || extra.absent === 1,
    absent_reason: extra.absent_reason == null ? undefined : String(extra.absent_reason),
  };
}

export function canonicalRecordsToStudents(records: Array<CanonicalSubject | CanonicalGroup>): Student[] {
  return records.map((r, i) => canonicalToStudent(r, i));
}
