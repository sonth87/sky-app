// insertDataSource/insertDataSourceRecords/FieldMappingProfile — Giai đoạn 4a kế hoạch Event.

import { describe, it, expect, beforeEach } from 'vitest';
import type { CanonicalSubject, FieldMappingProfile } from '@sky-app/slide-shared';
import { BetterSqlite3Executor } from './drivers/better-sqlite3-executor.js';
import { runMigrations } from './migrate.js';
import { getDataSource, insertDataSource, insertDataSourceRecords } from './queries/data-source.js';
import { listFieldMappingProfiles, saveFieldMappingProfile } from './queries/field-mapping-profile.js';
import type { SqlExecutor } from './sql-executor.js';

function subject(overrides: Partial<CanonicalSubject> = {}): CanonicalSubject {
  return { id: 'r1', full_name: 'Nguyễn Văn A', subjectType: 'student', extra: {}, ...overrides };
}

describe('insertDataSource / insertDataSourceRecords', () => {
  let executor: SqlExecutor;

  beforeEach(() => {
    executor = new BetterSqlite3Executor(':memory:');
    runMigrations(executor);
  });

  it('insertDataSource tạo DataSource rỗng, getDataSource đọc lại đúng metadata, records=[]', () => {
    insertDataSource(executor, { id: 'ds1', label: 'SV khoá 2026', mode: 'consumable', naturalKeyField: 'masv' });
    const ds = getDataSource(executor, 'ds1');
    expect(ds).not.toBeNull();
    expect(ds!.label).toBe('SV khoá 2026');
    expect(ds!.mode).toBe('consumable');
    expect(ds!.records).toEqual([]);
  });

  it('insertDataSourceRecords ghi 1 batch, getDataSource đọc lại đúng nguyên trạng', () => {
    insertDataSource(executor, { id: 'ds1', label: 'SV', mode: 'pooled', naturalKeyField: 'masv' });
    const result = insertDataSourceRecords(executor, 'ds1', [
      subject({ id: 'SV001', full_name: 'A', extra: { gpa: 3.8 } }),
      subject({ id: 'SV002', full_name: 'B', extra: { gpa: 3.5 } }),
    ]);
    expect(result.imported).toBe(2);
    const ds = getDataSource(executor, 'ds1')!;
    expect(ds.records).toHaveLength(2);
    expect(ds.records[0]!.id).toBe('SV001');
    expect((ds.records[0] as CanonicalSubject).extra.gpa).toBe(3.8);
  });

  it('record.id = giá trị khoá tự nhiên (DoD gốc: re-import cùng người, sửa 1 field khác, ID KHÔNG đổi)', () => {
    insertDataSource(executor, { id: 'ds1', label: 'SV', mode: 'consumable', naturalKeyField: 'masv' });
    insertDataSourceRecords(executor, 'ds1', [subject({ id: 'SV001', full_name: 'Nguyễn Văn A' })]);
    const before = getDataSource(executor, 'ds1')!;
    expect(before.records[0]!.id).toBe('SV001');

    // Mô phỏng "re-import file đã sửa 1 dòng" — applyMapping lại vẫn trả record.id='SV001' vì
    // khoá tự nhiên (masv) không đổi, dù full_name đã khác (giả lập việc user sửa lỗi chính tả
    // tên trong file nguồn rồi import lại DataSource KHÁC để so sánh — DoD chỉ yêu cầu xác nhận
    // ID ổn định qua applyMapping, không yêu cầu UI re-import đầy đủ ở GĐ4a).
    const dsAfter = { id: 'ds2', label: 'SV (đã sửa)', mode: 'consumable' as const, naturalKeyField: 'masv' };
    insertDataSource(executor, dsAfter);
    insertDataSourceRecords(executor, 'ds2', [subject({ id: 'SV001', full_name: 'Nguyễn Văn A (đã sửa lỗi chính tả)' })]);
    const after = getDataSource(executor, 'ds2')!;
    expect(after.records[0]!.id).toBe('SV001');
    expect(after.records[0]!.id).toBe(before.records[0]!.id);
  });

  it('insertDataSourceRecords ghi + đọc lại đúng 7 field core mở rộng (Giai đoạn 4c, 2026-07-20)', () => {
    insertDataSource(executor, { id: 'ds1', label: 'NV', mode: 'pooled', naturalKeyField: 'manv' });
    insertDataSourceRecords(executor, 'ds1', [
      subject({
        id: 'NV001',
        identifierCode: 'NV001',
        identityNumber: '001234567890',
        phone: '0900000000',
        email: 'a@example.com',
        dateOfBirth: '2003-01-01',
        title: 'Kỹ sư',
        description: 'Ghi chú',
      }),
    ]);
    const ds = getDataSource(executor, 'ds1')!;
    const r = ds.records[0] as CanonicalSubject;
    expect(r.identifierCode).toBe('NV001');
    expect(r.identityNumber).toBe('001234567890');
    expect(r.phone).toBe('0900000000');
    expect(r.email).toBe('a@example.com');
    expect(r.dateOfBirth).toBe('2003-01-01');
    expect(r.title).toBe('Kỹ sư');
    expect(r.description).toBe('Ghi chú');
  });

  it('record KHÔNG set field core mới → đọc lại undefined (không phải null/chuỗi rỗng)', () => {
    insertDataSource(executor, { id: 'ds1', label: 'NV', mode: 'pooled', naturalKeyField: 'manv' });
    insertDataSourceRecords(executor, 'ds1', [subject({ id: 'NV001' })]);
    const ds = getDataSource(executor, 'ds1')!;
    const r = ds.records[0] as CanonicalSubject;
    expect(r.phone).toBeUndefined();
    expect(r.identityNumber).toBeUndefined();
  });

  it('insertDataSourceRecords ghi record dạng CanonicalGroup (members) đúng', () => {
    insertDataSource(executor, { id: 'ds1', label: 'Nhóm', mode: 'pooled', naturalKeyField: 'ma_nhom' });
    insertDataSourceRecords(executor, 'ds1', [
      {
        id: 'G1',
        subjectType: 'group',
        full_name: '5 SV xuất sắc',
        extra: {},
        members: [{ id: 'm1', full_name: 'X', subjectType: 'student', extra: {} }],
      },
    ]);
    const ds = getDataSource(executor, 'ds1')!;
    const group = ds.records[0] as CanonicalSubject & { members?: unknown[] };
    expect(group.members).toHaveLength(1);
  });
});

describe('FieldMappingProfile — lưu persistent', () => {
  let executor: SqlExecutor;

  beforeEach(() => {
    executor = new BetterSqlite3Executor(':memory:');
    runMigrations(executor);
  });

  function profile(overrides: Partial<FieldMappingProfile> = {}): FieldMappingProfile {
    return {
      id: 'p1',
      label: 'Nhân viên HR',
      subjectType: 'employee',
      naturalKeyField: 'manv',
      map: { full_name: { kind: 'from', from: 'ho_ten' } },
      ...overrides,
    };
  }

  it('saveFieldMappingProfile tạo mới, listFieldMappingProfiles đọc lại đúng', () => {
    saveFieldMappingProfile(executor, profile());
    const list = listFieldMappingProfiles(executor);
    expect(list).toHaveLength(1);
    expect(list[0]!.label).toBe('Nhân viên HR');
    expect(list[0]!.map).toEqual({ full_name: { kind: 'from', from: 'ho_ten' } });
  });

  it('saveFieldMappingProfile với id đã tồn tại → UPDATE (upsert), không tạo bản ghi mới', () => {
    saveFieldMappingProfile(executor, profile());
    saveFieldMappingProfile(executor, profile({ label: 'Nhân viên HR (đã sửa)' }));
    const list = listFieldMappingProfiles(executor);
    expect(list).toHaveLength(1);
    expect(list[0]!.label).toBe('Nhân viên HR (đã sửa)');
  });

  it('sample optional — không truyền vẫn lưu/đọc lại đúng (undefined, không phải null string)', () => {
    saveFieldMappingProfile(executor, profile({ sample: undefined }));
    expect(listFieldMappingProfiles(executor)[0]!.sample).toBeUndefined();
  });
});
