// canonicalToStudent — Giai đoạn 3 kế hoạch Event, theo docs/roadmap/plans/layout-designer/
// 13-ceremony-mo-rong.md §"Hệ quả kỹ thuật". Bridge CanonicalSubject → Student, fail-soft.

import { describe, expect, it } from 'vitest';
import type { CanonicalSubject } from '@sky-app/slide-shared';
import { canonicalRecordsToStudents, canonicalToStudent } from './canonicalToStudent.js';

function subject(overrides: Partial<CanonicalSubject> = {}): CanonicalSubject {
  return {
    id: 's1',
    full_name: 'Nguyễn Văn A',
    subjectType: 'student',
    extra: {},
    ...overrides,
  };
}

describe('canonicalToStudent — map lõi + extra, fail-soft khi thiếu field', () => {
  it('map đúng field lõi (id, full_name, image_relative_path, status, displayOrder)', () => {
    const record = subject({ displayOrder: 5, image_relative_path: 'img/a.jpg', status: 'checked_in' });
    const student = canonicalToStudent(record, 0);
    expect(student.id).toBe('s1');
    expect(student.student_code).toBe('s1');
    expect(student.display_order).toBe(5);
    expect(student.full_name).toBe('Nguyễn Văn A');
    expect(student.image_relative_path).toBe('img/a.jpg');
    expect(student.status).toBe('checked_in');
  });

  it('displayOrder không có → dùng index truyền vào', () => {
    const student = canonicalToStudent(subject({ displayOrder: undefined }), 3);
    expect(student.display_order).toBe(3);
  });

  it('extra chứa field khớp tên Student → map đúng (string và number)', () => {
    const record = subject({ extra: { gpa: 3.8, gender: 'Nam', major_name: 'CNTT' } });
    const student = canonicalToStudent(record, 0);
    expect(student.gpa).toBe(3.8);
    expect(student.gender).toBe('Nam');
    expect(student.major_name).toBe('CNTT');
  });

  it('extra thiếu field → fail-soft (chuỗi rỗng/0), KHÔNG throw', () => {
    const record = subject({ extra: {} });
    expect(() => canonicalToStudent(record, 0)).not.toThrow();
    const student = canonicalToStudent(record, 0);
    expect(student.gender).toBe('');
    expect(student.gpa).toBe(0);
    expect(student.classification).toBe('');
    expect(student.quote).toBeNull();
  });

  it('extra.gpa là string số → parse đúng; string không phải số → fallback 0', () => {
    expect(canonicalToStudent(subject({ extra: { gpa: '3.5' } }), 0).gpa).toBe(3.5);
    expect(canonicalToStudent(subject({ extra: { gpa: 'không phải số' } }), 0).gpa).toBe(0);
  });

  it('status không có → mặc định "registered"', () => {
    const student = canonicalToStudent(subject({ status: undefined }), 0);
    expect(student.status).toBe('registered');
  });

  it('canonicalRecordsToStudents map đúng thứ tự + index làm display_order fallback', () => {
    const students = canonicalRecordsToStudents([
      subject({ id: 'a', displayOrder: undefined }),
      subject({ id: 'b', displayOrder: undefined }),
    ]);
    expect(students.map((s) => s.id)).toEqual(['a', 'b']);
    expect(students[0]!.display_order).toBe(0);
    expect(students[1]!.display_order).toBe(1);
  });
});

describe('canonicalToStudent — card_code/absent/absent_reason (bug thật phát hiện qua review, 2026-07-19)', () => {
  it('extra.card_code có giá trị → map vào Student.card_code (ControlApp.tsx dùng để tìm SV lúc quẹt thẻ cứng)', () => {
    const student = canonicalToStudent(subject({ extra: { card_code: 'CARD123' } }), 0);
    expect(student.card_code).toBe('CARD123');
  });

  it('extra.card_code KHÔNG có → Student.card_code undefined (không phải chuỗi rỗng, đúng type optional)', () => {
    const student = canonicalToStudent(subject({ extra: {} }), 0);
    expect(student.card_code).toBeUndefined();
  });

  it('extra.card_code là number → ép về string (Student.card_code là string)', () => {
    const student = canonicalToStudent(subject({ extra: { card_code: 12345 } }), 0);
    expect(student.card_code).toBe('12345');
  });

  it('extra.absent="true" → Student.absent=true (ScanInbox.tsx dùng để hiện banner vắng mặt)', () => {
    expect(canonicalToStudent(subject({ extra: { absent: 'true' } }), 0).absent).toBe(true);
  });

  it('extra.absent=1 → Student.absent=true', () => {
    expect(canonicalToStudent(subject({ extra: { absent: 1 } }), 0).absent).toBe(true);
  });

  it('extra.absent không có/khác "true"/1 → Student.absent=false', () => {
    expect(canonicalToStudent(subject({ extra: {} }), 0).absent).toBe(false);
    expect(canonicalToStudent(subject({ extra: { absent: 'false' } }), 0).absent).toBe(false);
    expect(canonicalToStudent(subject({ extra: { absent: 0 } }), 0).absent).toBe(false);
  });

  it('extra.absent_reason có giá trị → map đúng, ScanInbox.tsx hiện được lý do vắng mặt', () => {
    const student = canonicalToStudent(subject({ extra: { absent_reason: 'Ốm' } }), 0);
    expect(student.absent_reason).toBe('Ốm');
  });

  it('extra.absent_reason KHÔNG có → undefined (không phải chuỗi rỗng)', () => {
    expect(canonicalToStudent(subject({ extra: {} }), 0).absent_reason).toBeUndefined();
  });
});

describe('canonicalToStudent — field core mở rộng ƯU TIÊN TRƯỚC extra (Giai đoạn 4c, 2026-07-20)', () => {
  it('có field core mới (identifierCode/phone/email/dateOfBirth/identityNumber) → dùng field core, KHÔNG đọc extra', () => {
    const record = subject({
      identifierCode: 'NV001',
      phone: '0900000000',
      email: 'a@example.com',
      dateOfBirth: '2003-01-01',
      identityNumber: '001234567890',
      extra: { phone_number: 'should-not-be-used', email: 'should-not-be-used', date_of_birth: 'should-not-be-used', identity_number: 'should-not-be-used' },
    });
    const student = canonicalToStudent(record, 0);
    expect(student.student_code).toBe('NV001');
    expect(student.phone_number).toBe('0900000000');
    expect(student.email).toBe('a@example.com');
    expect(student.date_of_birth).toBe('2003-01-01');
    expect(student.identity_number).toBe('001234567890');
  });

  it('KHÔNG có field core mới → fallback đọc extra như trước (không phá dữ liệu Event cũ)', () => {
    const record = subject({ extra: { phone_number: '0911111111', email: 'b@example.com', date_of_birth: '2000-01-01', identity_number: '009999999999' } });
    const student = canonicalToStudent(record, 0);
    expect(student.phone_number).toBe('0911111111');
    expect(student.email).toBe('b@example.com');
    expect(student.date_of_birth).toBe('2000-01-01');
    expect(student.identity_number).toBe('009999999999');
  });

  it('KHÔNG có identifierCode → student_code fallback về record.id (hành vi cũ giữ nguyên)', () => {
    const student = canonicalToStudent(subject({ id: 'SV042' }), 0);
    expect(student.student_code).toBe('SV042');
  });
});
