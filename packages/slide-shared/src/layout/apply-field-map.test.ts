// applyFieldMap — nối backdrop trao giải/màn chờ sang LayoutRenderer thật (2026-07-28).

import { describe, expect, it } from 'vitest';
import { applyFieldMap } from './apply-field-map.js';
import type { CanonicalSubject } from './canonical.js';
import type { FieldMapSource } from './event.js';
import type { CustomVariable } from '../types.js';

function subject(overrides: Partial<CanonicalSubject> = {}): CanonicalSubject {
  return {
    id: 's1',
    full_name: 'Nguyễn Văn A',
    subjectType: 'student',
    extra: { gpa: 3.8 },
    ...overrides,
  };
}

describe('applyFieldMap — ghép fieldMap vào record thật cho LayoutRenderer', () => {
  it('raw: lấy giá trị từ field core/extra qua sourceKey', () => {
    const fieldMap: Record<string, FieldMapSource> = { ten: { kind: 'raw', sourceKey: 'full_name' } };
    const result = applyFieldMap(subject(), fieldMap, []);
    expect(result.extra.ten).toBe('Nguyễn Văn A');
  });

  it('computed: lấy giá trị từ CustomVariable đã resolve theo rule', () => {
    const vars: CustomVariable[] = [
      {
        id: 'v1',
        key: 'hang',
        label: 'Hạng',
        default: 'Thường',
        rules: [{ id: 'r1', attr: 'gpa', op: 'gte', val: '3.6', result: 'Xuất sắc' }],
      },
    ];
    const fieldMap: Record<string, FieldMapSource> = { xep_hang: { kind: 'computed', variableKey: 'hang' } };
    const result = applyFieldMap(subject(), fieldMap, vars);
    expect(result.extra.xep_hang).toBe('Xuất sắc');
  });

  it('unmapped: bỏ qua, không thêm key vào extra', () => {
    const fieldMap: Record<string, FieldMapSource> = { khac: { kind: 'unmapped' } };
    const result = applyFieldMap(subject(), fieldMap, []);
    expect(result.extra.khac).toBeUndefined();
  });

  it('sourceKey/variableKey không tồn tại → fail-soft về chuỗi rỗng, không throw', () => {
    const fieldMap: Record<string, FieldMapSource> = {
      a: { kind: 'raw', sourceKey: 'khong_ton_tai' },
      b: { kind: 'computed', variableKey: 'khong_ton_tai' },
    };
    const result = applyFieldMap(subject(), fieldMap, []);
    expect(result.extra.a).toBe('');
    expect(result.extra.b).toBe('');
  });

  it('giữ nguyên field extra gốc không có trong fieldMap', () => {
    const result = applyFieldMap(subject({ extra: { gpa: 3.8, khoa: 'CNTT' } }), {}, []);
    expect(result.extra.khoa).toBe('CNTT');
    expect(result.extra.gpa).toBe(3.8);
  });

  it('không mutate record gốc', () => {
    const record = subject();
    const originalExtra = record.extra;
    applyFieldMap(record, { ten: { kind: 'raw', sourceKey: 'full_name' } }, []);
    expect(record.extra).toBe(originalExtra);
    expect(record.extra.ten).toBeUndefined();
  });
});
