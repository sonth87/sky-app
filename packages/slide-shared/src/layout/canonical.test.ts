// canonical.ts — Giai đoạn 4c (mở rộng, 2026-07-20): 7 field core mới.

import { describe, expect, it } from 'vitest';
import { resolveCanonicalField, type CanonicalSubject } from './canonical.js';

function subject(overrides: Partial<CanonicalSubject> = {}): CanonicalSubject {
  return {
    id: 's1',
    full_name: 'Nguyễn Văn A',
    subjectType: 'student',
    extra: {},
    ...overrides,
  };
}

describe('resolveCanonicalField — field core mở rộng', () => {
  it('resolve đúng 7 field core mới (không rơi vào extra)', () => {
    const r = subject({
      identifierCode: 'SV001',
      identityNumber: '001234567890',
      phone: '0900000000',
      email: 'a@example.com',
      dateOfBirth: '2003-01-01',
      title: 'Kỹ sư',
      description: 'Ghi chú',
    });
    expect(resolveCanonicalField(r, 'identifier_code')).toBe('SV001');
    expect(resolveCanonicalField(r, 'identity_number')).toBe('001234567890');
    expect(resolveCanonicalField(r, 'phone')).toBe('0900000000');
    expect(resolveCanonicalField(r, 'email')).toBe('a@example.com');
    expect(resolveCanonicalField(r, 'date_of_birth')).toBe('2003-01-01');
    expect(resolveCanonicalField(r, 'title')).toBe('Kỹ sư');
    expect(resolveCanonicalField(r, 'description')).toBe('Ghi chú');
  });

  it('field core mới thiếu (undefined) → trả undefined, KHÔNG rơi vào extra dù extra có key trùng tên', () => {
    const r = subject({ extra: { phone: 'fallback-should-not-be-used' } });
    // phone là field core — accessor đọc record.phone (undefined ở đây), KHÔNG đọc record.extra['phone'].
    expect(resolveCanonicalField(r, 'phone')).toBeUndefined();
  });

  it('field cũ (full_name/image_relative_path/status) vẫn hoạt động đúng như trước', () => {
    const r = subject({ image_relative_path: 'img.png', status: 'present' });
    expect(resolveCanonicalField(r, 'full_name')).toBe('Nguyễn Văn A');
    expect(resolveCanonicalField(r, 'image_relative_path')).toBe('img.png');
    expect(resolveCanonicalField(r, 'status')).toBe('present');
  });

  it('key không phải core → fallback đọc extra như trước', () => {
    const r = subject({ extra: { gpa: 3.8 } });
    expect(resolveCanonicalField(r, 'gpa')).toBe('3.8');
    expect(resolveCanonicalField(r, 'not_exist')).toBeUndefined();
  });
});
