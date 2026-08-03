// buildEventBundle / applyEventBundle — Giai đoạn 5.3 (Export/Import Loại 2). Test theo mô hình
// "2 máy": executor `source` mô phỏng máy đã có sẵn Event/layout/data thật, executor `target`
// mô phỏng máy đích trống (hoặc đã có sẵn 1 phần) — build ở source, apply ở target, xác nhận
// khôi phục đúng qua lại giữa 2 SQLite in-memory độc lập.

import { describe, it, expect, beforeEach } from 'vitest';
import type { CanonicalSubject, LayoutContent } from '@sky-app/slide-shared';
import { BetterSqlite3Executor } from './drivers/better-sqlite3-executor.js';
import { runMigrations } from './migrate.js';
import { createLayoutDocument, getLayoutDocument, publish, updateLayoutDocumentMeta } from './queries/layout.js';
import { createEvent, getEvent } from './queries/event.js';
import { getDataSource, insertDataSource, insertDataSourceRecords, insertConsumedRecords, listConsumedRecordIds } from './queries/data-source.js';
import { saveFieldMappingProfile } from './queries/field-mapping-profile.js';
import { buildEventBundle, applyEventBundle } from './queries/event-bundle.js';
import type { SqlExecutor } from './sql-executor.js';

function content(text: string): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '16:9', w: 16, h: 9 },
        refW: 1920,
        refH: 1080,
        background: { kind: 'image', src: 'bg/nen.jpg' },
        items: [{ id: 'a', type: 'text', box: { x: 0, y: 0, w: 100, h: 40 }, content: text, fontSize: 20 }],
      },
    ],
  };
}

function subject(overrides: Partial<CanonicalSubject> = {}): CanonicalSubject {
  return { id: 'SV001', full_name: 'Nguyễn Văn A', subjectType: 'student', extra: {}, image_relative_path: 'avatar/sv001.jpg', ...overrides };
}

function freshExecutor(): SqlExecutor {
  const executor = new BetterSqlite3Executor(':memory:');
  runMigrations(executor);
  return executor;
}

describe('buildEventBundle', () => {
  let source: SqlExecutor;

  beforeEach(() => {
    source = freshExecutor();
    createLayoutDocument(source, 'lay1', 'Layout A', content('@full_name'), 'Mô tả');
    updateLayoutDocumentMeta(source, 'lay1', { color: '#ff0000', category: 'Trao bằng', tags: ['2026'] });
    publish(source, 'lay1'); // version 1
  });

  it('eventId không tồn tại → trả null', () => {
    expect(buildEventBundle(source, 'khong-ton-tai', { includeData: true })).toBeNull();
  });

  it('gom đúng event + referencedLayouts (metadata đầy đủ) + assets từ background', () => {
    createEvent(source, {
      id: 'ev1',
      name: 'Đợt 1',
      status: 'draft',
      customVariables: [],
      layoutRefs: [{ layoutId: 'lay1', layoutVersion: 1, fieldMap: {}, role: 'award' }],
    });

    const bundle = buildEventBundle(source, 'ev1', { includeData: false })!;
    expect(bundle.event.id).toBe('ev1');
    expect(bundle.referencedLayouts).toHaveLength(1);
    expect(bundle.referencedLayouts[0]).toMatchObject({
      layoutId: 'lay1', layoutVersion: 1, name: 'Layout A', color: '#ff0000', category: 'Trao bằng', tags: ['2026'],
    });
    expect(bundle.assets).toContain('bg/nen.jpg');
  });

  it('nhiều layoutRefs cùng layoutId+version → chỉ gom 1 lần (dedup)', () => {
    createEvent(source, {
      id: 'ev1',
      name: 'Đợt 1',
      status: 'draft',
      customVariables: [],
      layoutRefs: [
        { layoutId: 'lay1', layoutVersion: 1, fieldMap: {}, role: 'award' },
        { layoutId: 'lay1', layoutVersion: 1, fieldMap: {}, role: 'idle' },
      ],
    });

    const bundle = buildEventBundle(source, 'ev1', { includeData: false })!;
    expect(bundle.referencedLayouts).toHaveLength(1);
  });

  it('includeData=false → KHÔNG gom dataSource/mappingProfile/consumedRecordIds dù event có dataSourceId', () => {
    insertDataSource(source, { id: 'ds1', label: 'SV', mode: 'consumable', naturalKeyField: 'masv' });
    insertDataSourceRecords(source, 'ds1', [subject()]);
    createEvent(source, {
      id: 'ev1', name: 'Đợt 1', status: 'draft', customVariables: [], layoutRefs: [], dataSourceId: 'ds1',
    });

    const bundle = buildEventBundle(source, 'ev1', { includeData: false })!;
    expect(bundle.dataSource).toBeUndefined();
    expect(bundle.mappingProfile).toBeUndefined();
    expect(bundle.consumedRecordIds).toEqual([]);
  });

  it('includeData=true → gom đủ dataSource (kèm records) + mappingProfile + consumedRecordIds + asset ảnh record', () => {
    insertDataSource(source, { id: 'ds1', label: 'SV', mode: 'consumable', naturalKeyField: 'masv', mappingProfileId: 'mp1' });
    insertDataSourceRecords(source, 'ds1', [subject()]);
    saveFieldMappingProfile(source, { id: 'mp1', label: 'Mẫu SV', subjectType: 'student', naturalKeyField: 'masv', map: { full_name: { kind: 'from', from: 'ho_ten' } } });
    createEvent(source, { id: 'ev1', name: 'Đợt 1', status: 'draft', customVariables: [], layoutRefs: [], dataSourceId: 'ds1' });
    insertConsumedRecords(source, 'ev1', ['ds1::SV001'], '2026-08-03T00:00:00.000Z');

    const bundle = buildEventBundle(source, 'ev1', { includeData: true })!;
    expect(bundle.dataSource?.records).toHaveLength(1);
    expect(bundle.mappingProfile?.id).toBe('mp1');
    expect(bundle.consumedRecordIds).toEqual(['ds1::SV001']);
    expect(bundle.assets).toContain('avatar/sv001.jpg');
  });
});

describe('applyEventBundle', () => {
  let source: SqlExecutor;
  let target: SqlExecutor;

  beforeEach(() => {
    source = freshExecutor();
    target = freshExecutor();
    createLayoutDocument(source, 'lay1', 'Layout A', content('@full_name'), 'Mô tả');
    updateLayoutDocumentMeta(source, 'lay1', { color: '#ff0000', category: 'Trao bằng', tags: ['2026'] });
    publish(source, 'lay1');
    publish(source, 'lay1'); // publish 2 lần → layoutVersion=2 lúc gán ref, để test remap thật sự đổi số
    createEvent(source, {
      id: 'ev1',
      name: 'Đợt 1',
      status: 'active', // cố tình active để test applyEventBundle luôn ép về draft
      customVariables: [],
      layoutRefs: [{ layoutId: 'lay1', layoutVersion: 2, fieldMap: {}, role: 'award' }],
    });
  });

  it('máy đích trống → tạo mới layout (publish 1 lần → version 1) + remap layoutVersion trong Event, Event giữ nguyên id (không trùng)', () => {
    const bundle = buildEventBundle(source, 'ev1', { includeData: false })!;
    const result = applyEventBundle(target, bundle);

    expect(result.renamed).toBe(false);
    expect(result.eventId).toBe('ev1');
    expect(result.layoutsCreated).toEqual(['lay1']);

    const importedEvent = getEvent(target, 'ev1')!;
    expect(importedEvent.layoutRefs[0]!.layoutVersion).toBe(1); // remap từ 2 (nguồn) → 1 (đích, mới publish lần đầu)
    expect(importedEvent.status).toBe('draft'); // KHÔNG copy 'active' từ nguồn

    const importedLayout = getLayoutDocument(target, 'lay1')!;
    expect(importedLayout.name).toBe('Layout A');
    expect(importedLayout.color).toBe('#ff0000');
    expect(importedLayout.category).toBe('Trao bằng');
    expect(importedLayout.tags).toEqual(['2026']);
  });

  it('layout ĐÃ tồn tại ở máy đích → bỏ qua, không tạo lại, không remap version (giữ nguyên layoutVersion gốc — có thể sai nếu máy đích khác version, giới hạn đã biết)', () => {
    createLayoutDocument(target, 'lay1', 'Layout A đã có sẵn', content('cũ'));
    publish(target, 'lay1');

    const bundle = buildEventBundle(source, 'ev1', { includeData: false })!;
    const result = applyEventBundle(target, bundle);

    expect(result.layoutsCreated).toEqual([]);
    expect(getLayoutDocument(target, 'lay1')!.name).toBe('Layout A đã có sẵn'); // KHÔNG bị ghi đè
  });

  it('Event id đã tồn tại ở máy đích → sinh id MỚI, không ghi đè Event cũ', () => {
    createEvent(target, { id: 'ev1', name: 'Event đã có ở máy đích', status: 'draft', customVariables: [], layoutRefs: [] });

    const bundle = buildEventBundle(source, 'ev1', { includeData: false })!;
    const result = applyEventBundle(target, bundle);

    expect(result.renamed).toBe(true);
    expect(result.eventId).not.toBe('ev1');
    expect(getEvent(target, 'ev1')!.name).toBe('Event đã có ở máy đích'); // Event cũ còn nguyên
    expect(getEvent(target, result.eventId)!.name).toBe('Đợt 1'); // Event mới nhập vào id khác
  });

  it('bundle KHÔNG kèm dataSource (export includeData=false) → Event import KHÔNG gán dataSourceId dù event gốc có', () => {
    insertDataSource(source, { id: 'ds1', label: 'SV', mode: 'pooled', naturalKeyField: 'masv' });
    insertDataSourceRecords(source, 'ds1', [subject()]);
    createEvent(source, { id: 'ev2', name: 'Đợt 2', status: 'draft', customVariables: [], layoutRefs: [], dataSourceId: 'ds1' });

    const bundle = buildEventBundle(source, 'ev2', { includeData: false })!;
    expect(bundle.dataSource).toBeUndefined();
    const result = applyEventBundle(target, bundle);

    expect(result.dataSourceImported).toBe(false);
    expect(getEvent(target, result.eventId)!.dataSourceId).toBeUndefined();
  });

  it('bundle CÓ dataSource, máy đích chưa có → import đủ records + mappingProfile + consumedRecordIds', () => {
    insertDataSource(source, { id: 'ds1', label: 'SV', mode: 'consumable', naturalKeyField: 'masv', mappingProfileId: 'mp1' });
    insertDataSourceRecords(source, 'ds1', [subject()]);
    saveFieldMappingProfile(source, { id: 'mp1', label: 'Mẫu', subjectType: 'student', naturalKeyField: 'masv', map: {} });
    createEvent(source, { id: 'ev2', name: 'Đợt 2', status: 'draft', customVariables: [], layoutRefs: [], dataSourceId: 'ds1' });
    insertConsumedRecords(source, 'ev2', ['ds1::SV001'], '2026-08-03T00:00:00.000Z');

    const bundle = buildEventBundle(source, 'ev2', { includeData: true })!;
    const result = applyEventBundle(target, bundle);

    expect(result.dataSourceImported).toBe(true);
    expect(getEvent(target, result.eventId)!.dataSourceId).toBe('ds1');
    expect(listConsumedRecordIds(target, result.eventId)).toEqual(['ds1::SV001']);
  });

  it('DataSource cùng id ĐÃ tồn tại ở máy đích → bỏ qua, không insert lại (tránh lỗi UNIQUE)', () => {
    insertDataSource(source, { id: 'ds1', label: 'SV nguồn', mode: 'pooled', naturalKeyField: 'masv' });
    insertDataSourceRecords(source, 'ds1', [subject()]);
    createEvent(source, { id: 'ev2', name: 'Đợt 2', status: 'draft', customVariables: [], layoutRefs: [], dataSourceId: 'ds1' });

    insertDataSource(target, { id: 'ds1', label: 'SV đích (khác)', mode: 'pooled', naturalKeyField: 'masv' });

    const bundle = buildEventBundle(source, 'ev2', { includeData: true })!;
    const result = applyEventBundle(target, bundle);

    expect(result.dataSourceImported).toBe(false);
    expect(getDataSource(target, 'ds1')!.label).toBe('SV đích (khác)'); // giữ nguyên, không bị ghi đè
  });
});
