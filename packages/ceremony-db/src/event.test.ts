import { describe, it, expect, beforeEach } from 'vitest';
import type { EventDocument } from '@sky-app/slide-shared';
import { BetterSqlite3Executor } from './drivers/better-sqlite3-executor.js';
import { runMigrations } from './migrate.js';
import { createEvent, getCurrentActiveEvent, getEvent, listEvents, saveEvent, setActiveEvent } from './queries/event.js';
import { getDataSource, getDataSourceRecords, listDataSources } from './queries/data-source.js';
import type { SqlExecutor } from './sql-executor.js';

function draftEvent(overrides: Partial<Omit<EventDocument, 'createdAt' | 'updatedAt'>> = {}): Omit<EventDocument, 'createdAt' | 'updatedAt'> {
  return {
    id: 'ev1',
    name: 'Lễ trao bằng đợt 1',
    status: 'draft',
    customVariables: [],
    layoutRefs: [],
    ...overrides,
  };
}

/** event_layout_ref.layout_document_id có FK trỏ layout_document(id) — test dùng layoutRefs
 * phải tạo trước layout_document giả tương ứng, nếu không sẽ FOREIGN KEY constraint failed. */
function insertLayoutDocument(executor: SqlExecutor, id: string): void {
  executor.run(
    'INSERT INTO layout_document (id, name, description, latest_published_version, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, ?)',
    [id, `Layout ${id}`, '2026-01-01', '2026-01-01'],
  );
}

describe('EventStore — CRUD + setActive (chỉ 1 active tại 1 thời điểm)', () => {
  let executor: SqlExecutor;

  beforeEach(() => {
    executor = new BetterSqlite3Executor(':memory:');
    runMigrations(executor);
  });

  it('createEvent → getEvent trả đúng metadata + layoutRefs rỗng', () => {
    createEvent(executor, draftEvent());
    const ev = getEvent(executor, 'ev1');
    expect(ev).not.toBeNull();
    expect(ev!.name).toBe('Lễ trao bằng đợt 1');
    expect(ev!.status).toBe('draft');
    expect(ev!.layoutRefs).toEqual([]);
    expect(ev!.dataSourceId).toBeUndefined();
  });

  it('createEvent với layoutRefs đầy đủ selector/fieldMap → đọc lại đúng nguyên trạng', () => {
    insertLayoutDocument(executor, 'l1');
    insertLayoutDocument(executor, 'default');
    createEvent(
      executor,
      draftEvent({
        layoutRefs: [
          {
            layoutId: 'l1',
            layoutVersion: 2,
            selector: { groups: [{ rules: [{ attr: 'gpa', op: 'gte', val: '3.6' }] }], priority: 100 },
            fieldMap: { full_name: { kind: 'raw', sourceKey: 'ho_ten' } },
          },
          { layoutId: 'default', layoutVersion: 1, fieldMap: {} },
        ],
      }),
    );
    const ev = getEvent(executor, 'ev1');
    expect(ev!.layoutRefs).toHaveLength(2);
    // ORDER BY priority DESC — ref có priority 100 đứng trước ref priority mặc định (0).
    expect(ev!.layoutRefs[0]!.layoutId).toBe('l1');
    expect(ev!.layoutRefs[0]!.selector?.groups[0]!.rules[0]!.attr).toBe('gpa');
    expect(ev!.layoutRefs[0]!.fieldMap.full_name).toEqual({ kind: 'raw', sourceKey: 'ho_ten' });
    expect(ev!.layoutRefs[1]!.layoutId).toBe('default');
  });

  it('listEvents hiện đúng danh sách, mới nhất trước', () => {
    createEvent(executor, draftEvent({ id: 'ev1', name: 'Đợt 1' }));
    createEvent(executor, draftEvent({ id: 'ev2', name: 'Đợt 2' }));
    const list = listEvents(executor);
    expect(list.map((e) => e.id).sort()).toEqual(['ev1', 'ev2']);
  });

  it('saveEvent cập nhật đúng, layoutRefs cũ bị thay thế hoàn toàn bởi layoutRefs mới', () => {
    insertLayoutDocument(executor, 'old');
    insertLayoutDocument(executor, 'new');
    createEvent(executor, draftEvent({ layoutRefs: [{ layoutId: 'old', layoutVersion: 1, fieldMap: {} }] }));
    const ev = getEvent(executor, 'ev1')!;
    saveEvent(executor, { ...ev, name: 'Đã đổi tên', layoutRefs: [{ layoutId: 'new', layoutVersion: 1, fieldMap: {} }] });
    const updated = getEvent(executor, 'ev1')!;
    expect(updated.name).toBe('Đã đổi tên');
    expect(updated.layoutRefs).toHaveLength(1);
    expect(updated.layoutRefs[0]!.layoutId).toBe('new');
  });

  it('saveEvent với id không tồn tại → throw', () => {
    expect(() => saveEvent(executor, { ...draftEvent({ id: 'khong-ton-tai' }), createdAt: '', updatedAt: '' })).toThrow();
  });

  it('getCurrentActiveEvent trả null khi chưa có event nào active', () => {
    createEvent(executor, draftEvent());
    expect(getCurrentActiveEvent(executor)).toBeNull();
  });

  it('setActiveEvent → getCurrentActiveEvent trả đúng event vừa active', () => {
    createEvent(executor, draftEvent({ id: 'ev1' }));
    setActiveEvent(executor, 'ev1');
    const active = getCurrentActiveEvent(executor);
    expect(active?.id).toBe('ev1');
    expect(active?.status).toBe('active');
  });

  it('setActiveEvent sang event khác → event CŨ hết active (chuyển "scheduled", không phải "draft"), CHỈ 1 active tồn tại', () => {
    createEvent(executor, draftEvent({ id: 'ev1' }));
    createEvent(executor, draftEvent({ id: 'ev2', name: 'Đợt 2' }));
    setActiveEvent(executor, 'ev1');
    setActiveEvent(executor, 'ev2');

    expect(getEvent(executor, 'ev1')!.status).toBe('scheduled');
    expect(getEvent(executor, 'ev2')!.status).toBe('active');
    expect(getCurrentActiveEvent(executor)?.id).toBe('ev2');
  });

  it('setActiveEvent với id không tồn tại → throw, không đổi trạng thái event nào', () => {
    createEvent(executor, draftEvent({ id: 'ev1' }));
    setActiveEvent(executor, 'ev1');
    expect(() => setActiveEvent(executor, 'khong-ton-tai')).toThrow();
    expect(getEvent(executor, 'ev1')!.status).toBe('active');
  });
});

describe('DataSourceStore — đọc DataSource + record (CanonicalSubject/CanonicalGroup)', () => {
  let executor: SqlExecutor;

  beforeEach(() => {
    executor = new BetterSqlite3Executor(':memory:');
    runMigrations(executor);
    executor.run(
      'INSERT INTO data_source (id, label, mode, natural_key_field, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['ds1', 'SV khoá 2026', 'consumable', 'student_code', '2026-01-01', '2026-01-01'],
    );
  });

  it('getDataSource trả null khi không tồn tại', () => {
    expect(getDataSource(executor, 'khong-co')).toBeNull();
  });

  it('getDataSource đọc đúng CanonicalSubject (subjectType khác "group")', () => {
    executor.run(
      'INSERT INTO data_source_record (id, data_source_id, subject_type, full_name, extra_json, natural_key, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['r1', 'ds1', 'student', 'Nguyễn Văn A', JSON.stringify({ gpa: 3.8 }), 'SV001', 0],
    );
    const ds = getDataSource(executor, 'ds1')!;
    expect(ds.mode).toBe('consumable');
    expect(ds.records).toHaveLength(1);
    const record = ds.records[0]!;
    expect(record.subjectType).toBe('student');
    expect(record.full_name).toBe('Nguyễn Văn A');
    expect(record.extra.gpa).toBe(3.8);
  });

  it('getDataSource đọc đúng CanonicalGroup (subjectType="group") kể cả members_json NULL và có giá trị', () => {
    executor.run(
      'INSERT INTO data_source_record (id, data_source_id, subject_type, full_name, extra_json, natural_key, members_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['g1', 'ds1', 'group', 'Phòng CNTT', JSON.stringify({}), 'g1', null],
    );
    executor.run(
      'INSERT INTO data_source_record (id, data_source_id, subject_type, full_name, extra_json, natural_key, members_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['g2', 'ds1', 'group', '5 SV xuất sắc', JSON.stringify({}), 'g2', JSON.stringify([{ id: 'm1', full_name: 'A', subjectType: 'student', extra: {} }])],
    );
    const ds = getDataSource(executor, 'ds1')!;
    const named = ds.records.find((r) => r.id === 'g1')!;
    const listed = ds.records.find((r) => r.id === 'g2')!;
    expect(named.subjectType).toBe('group');
    expect((named as { members?: unknown[] }).members).toBeUndefined();
    expect((listed as { members?: unknown[] }).members).toHaveLength(1);
  });

  it('listDataSources trả đúng recordCount', () => {
    executor.run(
      'INSERT INTO data_source_record (id, data_source_id, subject_type, full_name, extra_json, natural_key) VALUES (?, ?, ?, ?, ?, ?)',
      ['r1', 'ds1', 'student', 'A', '{}', 'k1'],
    );
    executor.run(
      'INSERT INTO data_source_record (id, data_source_id, subject_type, full_name, extra_json, natural_key) VALUES (?, ?, ?, ?, ?, ?)',
      ['r2', 'ds1', 'student', 'B', '{}', 'k2'],
    );
    const list = listDataSources(executor);
    expect(list.find((d) => d.id === 'ds1')?.recordCount).toBe(2);
  });

  it('getDataSourceRecords với excludeConsumedForEvent lọc đúng qua JOIN event_consumed_record (mode=consumable)', () => {
    executor.run(
      'INSERT INTO data_source_record (id, data_source_id, subject_type, full_name, extra_json, natural_key) VALUES (?, ?, ?, ?, ?, ?)',
      ['r1', 'ds1', 'student', 'A', '{}', 'k1'],
    );
    executor.run(
      'INSERT INTO data_source_record (id, data_source_id, subject_type, full_name, extra_json, natural_key) VALUES (?, ?, ?, ?, ?, ?)',
      ['r2', 'ds1', 'student', 'B', '{}', 'k2'],
    );
    executor.run(
      'INSERT INTO event (id, name, status, data_source_id, custom_variables_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['ev1', 'Đợt 1', 'active', 'ds1', '[]', '2026-01-01', '2026-01-01'],
    );
    executor.run('INSERT INTO event_consumed_record (event_id, data_source_record_id, consumed_at) VALUES (?, ?, ?)', [
      'ev1',
      'r1',
      '2026-01-02',
    ]);

    const all = getDataSourceRecords(executor, 'ds1');
    expect(all).toHaveLength(2);

    const filtered = getDataSourceRecords(executor, 'ds1', { excludeConsumedForEvent: 'ev1' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe('r2');
  });

  it('getDataSourceRecords KHÔNG lọc gì khi DataSource.mode="pooled" dù truyền excludeConsumedForEvent', () => {
    executor.run(
      'INSERT INTO data_source (id, label, mode, natural_key_field, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['ds2', 'Nhân viên CNTT', 'pooled', 'ma_nv', '2026-01-01', '2026-01-01'],
    );
    executor.run(
      'INSERT INTO data_source_record (id, data_source_id, subject_type, full_name, extra_json, natural_key) VALUES (?, ?, ?, ?, ?, ?)',
      ['r3', 'ds2', 'employee', 'C', '{}', 'k3'],
    );
    const records = getDataSourceRecords(executor, 'ds2', { excludeConsumedForEvent: 'ev-bat-ky' });
    expect(records).toHaveLength(1);
  });
});
