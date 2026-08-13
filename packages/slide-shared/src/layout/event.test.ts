// resolveLayout — Giai đoạn 3 kế hoạch Event, theo 13-ceremony-mo-rong.md §"Trách nhiệm 5".

import { describe, expect, it } from 'vitest';
import { eventToIdleRecord, resolveLayout } from './event.js';
import type { EventDocument, EventLayoutRef } from './event.js';

function ref(overrides: Partial<EventLayoutRef> = {}): EventLayoutRef {
  return {
    layoutId: 'default',
    layoutVersion: 1,
    fieldMap: {},
    ...overrides,
  };
}

describe('resolveLayout — ưu tiên theo priority, AND trong group, OR giữa group', () => {
  it('không có layoutRef nào → trả null', () => {
    expect(resolveLayout({}, [])).toBeNull();
  });

  it('layoutRef không có selector (undefined) → luôn match, dùng làm fallback/mặc định', () => {
    const refs = [ref({ layoutId: 'mac-dinh' })];
    expect(resolveLayout({ gpa: '2.0' }, refs)).toBe('mac-dinh');
  });

  it('selector.groups rỗng → luôn match (tương đương không có selector)', () => {
    const refs = [ref({ layoutId: 'mac-dinh', selector: { groups: [], priority: 0 } })];
    expect(resolveLayout({}, refs)).toBe('mac-dinh');
  });

  it('ví dụ blueprint: GPA>=3.6 VÀ Nam (priority 100) thắng Nam-sinh (priority 50) khi cả 2 match', () => {
    const refs: EventLayoutRef[] = [
      ref({
        layoutId: 'gpa-xuat-sac',
        selector: { groups: [{ rules: [{ attr: 'gpa', op: 'gte', val: '3.6' }] }], priority: 100 },
      }),
      ref({
        layoutId: 'nam-sinh',
        selector: { groups: [{ rules: [{ attr: 'gender', op: 'equals', val: 'Nam' }] }], priority: 50 },
      }),
      ref({ layoutId: 'default', selector: { groups: [{ rules: [] }], priority: 0 } }),
    ];
    // Sinh viên Nam GPA 3.8 — match cả gpa-xuat-sac (100) lẫn nam-sinh (50) → priority cao thắng.
    expect(resolveLayout({ gpa: '3.8', gender: 'Nam' }, refs)).toBe('gpa-xuat-sac');
    // Nữ GPA 2.0 — không match gpa-xuat-sac lẫn nam-sinh → rơi về default.
    expect(resolveLayout({ gpa: '2.0', gender: 'Nữ' }, refs)).toBe('default');
  });

  it('OR giữa 2 group trong CÙNG 1 layoutRef: GPA>=3.6 VÀ (Nam HOẶC đạt giải phụ)', () => {
    const refs: EventLayoutRef[] = [
      ref({
        layoutId: 'ket-hop',
        selector: {
          groups: [
            { rules: [{ attr: 'gpa', op: 'gte', val: '3.6' }, { attr: 'gender', op: 'equals', val: 'Nam' }] },
            { rules: [{ attr: 'gpa', op: 'gte', val: '3.6' }, { attr: 'award', op: 'equals', val: 'phu' }] },
          ],
          priority: 10,
        },
      }),
    ];
    expect(resolveLayout({ gpa: '3.7', gender: 'Nam' }, refs)).toBe('ket-hop');
    expect(resolveLayout({ gpa: '3.7', gender: 'Nữ', award: 'phu' }, refs)).toBe('ket-hop');
    expect(resolveLayout({ gpa: '3.7', gender: 'Nữ', award: 'khac' }, refs)).toBeNull();
  });

  it('record thiếu attr cần thiết → rule đó KHÔNG match (fail-soft, không throw)', () => {
    const refs: EventLayoutRef[] = [
      ref({ layoutId: 'x', selector: { groups: [{ rules: [{ attr: 'gpa', op: 'gte', val: '3.0' }] }] , priority: 1 } }),
    ];
    expect(resolveLayout({}, refs)).toBeNull();
  });

  it('op "in" so khớp theo danh sách phân tách dấu phẩy', () => {
    const refs: EventLayoutRef[] = [
      ref({ layoutId: 'khoa-cntt', selector: { groups: [{ rules: [{ attr: 'major', op: 'in', val: 'CNTT, KTPM, ATTT' }] }], priority: 1 } }),
    ];
    expect(resolveLayout({ major: 'KTPM' }, refs)).toBe('khoa-cntt');
    expect(resolveLayout({ major: 'Kinh tế' }, refs)).toBeNull();
  });
});

function event(overrides: Partial<EventDocument> = {}): EventDocument {
  return {
    id: 'ev1',
    name: 'Test',
    status: 'draft',
    customVariables: [],
    layoutRefs: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

describe('eventToIdleRecord — pseudo-record cho LayoutRenderer khi render màn chờ (2026-07-21)', () => {
  it('map đúng id + full_name (fallback = event.name) + subjectType, extra rỗng', () => {
    const record = eventToIdleRecord(event({ id: 'ev-abc', name: 'Lễ tốt nghiệp Khoá 2026' }));
    expect(record.id).toBe('ev-abc');
    expect(record.full_name).toBe('Lễ tốt nghiệp Khoá 2026');
    expect(record.subjectType).toBe('event');
    expect(record.extra).toEqual({});
  });

  it('event.name rỗng → không throw, full_name rỗng (fail-soft)', () => {
    expect(() => eventToIdleRecord(event({ name: '' }))).not.toThrow();
    expect(eventToIdleRecord(event({ name: '' })).full_name).toBe('');
  });
});
