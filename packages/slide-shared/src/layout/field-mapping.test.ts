// applyMapping — Giai đoạn 4a kế hoạch Event, theo 05-he-bien-va-adapter.md.

import { describe, expect, it } from 'vitest';
import { applyMapping, detectDuplicateNaturalKeys } from './field-mapping.js';
import type { FieldMappingProfile } from './field-mapping.js';

function profile(overrides: Partial<FieldMappingProfile> = {}): FieldMappingProfile {
  return {
    id: 'p1',
    label: 'Test profile',
    subjectType: 'employee',
    naturalKeyField: 'manv',
    map: {},
    ...overrides,
  };
}

describe('applyMapping — kind: from/concat/const/computed', () => {
  it('kind=from lấy trực tiếp giá trị cột nguồn', () => {
    const result = applyMapping({ ho_ten: 'Nguyễn Văn A' }, profile({ map: { full_name: { kind: 'from', from: 'ho_ten' } } }));
    expect(result.full_name).toBe('Nguyễn Văn A');
  });

  it('kind=concat nối nhiều cột, mặc định cách nhau 1 khoảng trắng', () => {
    const result = applyMapping(
      { ho: 'Nguyễn Văn', ten: 'A' },
      profile({ map: { full_name: { kind: 'concat', parts: ['ho', 'ten'] } } }),
    );
    expect(result.full_name).toBe('Nguyễn Văn A');
  });

  it('kind=concat với sep tuỳ chỉnh', () => {
    const result = applyMapping(
      { a: 'X', b: 'Y' },
      profile({ map: { full_name: { kind: 'concat', parts: ['a', 'b'], sep: '-' } } }),
    );
    expect(result.full_name).toBe('X-Y');
  });

  it('kind=const luôn trả đúng giá trị cố định, không phụ thuộc rawRow', () => {
    const result = applyMapping({}, profile({ map: { award_type: { kind: 'const', value: 'KHENTHUONG' } } }));
    expect(result.extra.award_type).toBe('KHENTHUONG');
  });

  it('kind=computed áp transform lên giá trị lấy từ "from" lồng bên trong', () => {
    expect(applyMapping({ x: '  a b  ' }, profile({ map: { full_name: { kind: 'computed', from: 'x', transform: 'trim' } } })).full_name).toBe('a b');
    expect(applyMapping({ x: 'abc' }, profile({ map: { full_name: { kind: 'computed', from: 'x', transform: 'upper' } } })).full_name).toBe('ABC');
    expect(applyMapping({ x: 'ABC' }, profile({ map: { full_name: { kind: 'computed', from: 'x', transform: 'lower' } } })).full_name).toBe('abc');
    expect(applyMapping({ x: 'nguyễn văn a' }, profile({ map: { full_name: { kind: 'computed', from: 'x', transform: 'titlecase' } } })).full_name).toBe(
      'Nguyễn Văn A',
    );
  });
});

describe('applyMapping — field lõi vs extra', () => {
  it('full_name/image_relative_path/status map vào field lõi CanonicalSubject, KHÔNG rơi vào extra', () => {
    const result = applyMapping(
      { ten: 'A', anh: 'img/a.jpg', trang_thai: 'checked_in' },
      profile({
        map: {
          full_name: { kind: 'from', from: 'ten' },
          image_relative_path: { kind: 'from', from: 'anh' },
          status: { kind: 'from', from: 'trang_thai' },
        },
      }),
    );
    expect(result.full_name).toBe('A');
    expect(result.image_relative_path).toBe('img/a.jpg');
    expect(result.status).toBe('checked_in');
    expect(result.extra).toEqual({});
  });

  it('field mở rộng (không phải lõi) rơi vào extra, giữ đúng key', () => {
    const result = applyMapping(
      { chuc_danh: 'Trưởng phòng', phong: 'CNTT' },
      profile({ map: { chuc_vu: { kind: 'from', from: 'chuc_danh' }, phong_ban: { kind: 'from', from: 'phong' } } }),
    );
    expect(result.extra).toEqual({ chuc_vu: 'Trưởng phòng', phong_ban: 'CNTT' });
  });

  it('image_relative_path/status rỗng → undefined (không phải chuỗi rỗng)', () => {
    const result = applyMapping({}, profile({ map: { image_relative_path: { kind: 'from', from: 'khong-ton-tai' } } }));
    expect(result.image_relative_path).toBeUndefined();
  });

  it('subjectType lấy từ profile, không phải từ rawRow', () => {
    const result = applyMapping({}, profile({ subjectType: 'student' }));
    expect(result.subjectType).toBe('student');
  });
});

describe('applyMapping — fail-soft khi thiếu cột nguồn', () => {
  it('kind=from với cột không tồn tại trong rawRow → chuỗi rỗng, KHÔNG throw', () => {
    expect(() => applyMapping({}, profile({ map: { full_name: { kind: 'from', from: 'khong-ton-tai' } } }))).not.toThrow();
    const result = applyMapping({}, profile({ map: { full_name: { kind: 'from', from: 'khong-ton-tai' } } }));
    expect(result.full_name).toBe('');
  });

  it('kind=concat với 1 phần thiếu → phần đó rỗng, các phần khác vẫn nối đúng', () => {
    const result = applyMapping({ ho: 'Nguyễn' }, profile({ map: { full_name: { kind: 'concat', parts: ['ho', 'ten-khong-ton-tai'] } } }));
    expect(result.full_name).toBe('Nguyễn');
  });
});

describe('detectDuplicateNaturalKeys', () => {
  it('không có trùng → mảng rỗng', () => {
    const rows = [{ masv: 'SV001' }, { masv: 'SV002' }];
    expect(detectDuplicateNaturalKeys(rows, 'masv')).toEqual([]);
  });

  it('2 dòng trùng khoá → 1 nhóm gồm 2 index', () => {
    const rows = [{ masv: 'SV001' }, { masv: 'SV002' }, { masv: 'SV001' }];
    expect(detectDuplicateNaturalKeys(rows, 'masv')).toEqual([[0, 2]]);
  });

  it('3 dòng CÙNG trùng 1 khoá → 1 nhóm duy nhất gồm cả 3 index (không phải 2 cặp riêng rẽ)', () => {
    const rows = [{ masv: 'SV001' }, { masv: 'SV001' }, { masv: 'SV001' }];
    expect(detectDuplicateNaturalKeys(rows, 'masv')).toEqual([[0, 1, 2]]);
  });

  it('nhiều nhóm trùng độc lập → trả đủ từng nhóm', () => {
    const rows = [{ masv: 'A' }, { masv: 'B' }, { masv: 'A' }, { masv: 'B' }];
    expect(detectDuplicateNaturalKeys(rows, 'masv')).toEqual([[0, 2], [1, 3]]);
  });

  it('khoá rỗng ở nhiều dòng → KHÔNG tính là trùng nhau (đó là lỗi thiếu dữ liệu, khác loại lỗi)', () => {
    const rows = [{ masv: '' }, { masv: '' }, { masv: 'SV001' }];
    expect(detectDuplicateNaturalKeys(rows, 'masv')).toEqual([]);
  });
});

describe('applyMapping — field core mở rộng (Giai đoạn 4c, 2026-07-20)', () => {
  it('map đủ 7 field core mới vào đúng field CanonicalSubject, KHÔNG rơi vào extra', () => {
    const result = applyMapping(
      { cccd: '001234567890', dt: '0900000000', mail: 'a@example.com', ngaysinh: '2003-01-01', chucdanh: 'Kỹ sư', mota: 'Ghi chú', ma: 'NV001' },
      profile({
        map: {
          identifier_code: { kind: 'from', from: 'ma' },
          identity_number: { kind: 'from', from: 'cccd' },
          phone: { kind: 'from', from: 'dt' },
          email: { kind: 'from', from: 'mail' },
          date_of_birth: { kind: 'from', from: 'ngaysinh' },
          title: { kind: 'from', from: 'chucdanh' },
          description: { kind: 'from', from: 'mota' },
        },
      }),
    );
    expect(result.identifierCode).toBe('NV001');
    expect(result.identityNumber).toBe('001234567890');
    expect(result.phone).toBe('0900000000');
    expect(result.email).toBe('a@example.com');
    expect(result.dateOfBirth).toBe('2003-01-01');
    expect(result.title).toBe('Kỹ sư');
    expect(result.description).toBe('Ghi chú');
    expect(result.extra).toEqual({});
  });

  it('không map field core mới → undefined, không xuất hiện trong extra', () => {
    const result = applyMapping({ ho_ten: 'A' }, profile({ map: { full_name: { kind: 'from', from: 'ho_ten' } } }));
    expect(result.phone).toBeUndefined();
    expect(result.extra).toEqual({});
  });
});
