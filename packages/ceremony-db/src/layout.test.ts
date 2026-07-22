import { describe, it, expect, beforeEach } from 'vitest';
import type { LayoutContent } from '@sky-app/slide-shared';
import { BetterSqlite3Executor } from './drivers/better-sqlite3-executor.js';
import { runMigrations } from './migrate.js';
import {
  createLayoutDocument,
  getLayoutDocument,
  getVersion,
  listLayoutDocuments,
  listVersions,
  publish,
  restoreVersion,
  saveDraft,
  updateLayoutDocumentMeta,
} from './queries/layout.js';
import type { SqlExecutor } from './sql-executor.js';

function contentV1(): LayoutContent {
  return {
    variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [] }],
  };
}

function contentV2(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '16:9', w: 16, h: 9 },
        refW: 1920,
        refH: 1080,
        items: [{ id: 'a', type: 'text', box: { x: 0, y: 0, w: 100, h: 40 }, content: '@full_name', fontSize: 20 }],
      },
    ],
  };
}

describe('LayoutStore — versioning (layout_document/layout_draft/layout_version)', () => {
  let executor: SqlExecutor;

  beforeEach(() => {
    executor = new BetterSqlite3Executor(':memory:');
    runMigrations(executor);
  });

  it('createLayoutDocument tạo đúng metadata + draft, chưa có version nào', () => {
    createLayoutDocument(executor, 'l1', 'Layout mẫu', contentV1());
    const doc = getLayoutDocument(executor, 'l1');
    expect(doc).not.toBeNull();
    expect(doc!.name).toBe('Layout mẫu');
    expect(doc!.currentDraft).toEqual(contentV1());
    expect(doc!.publishedVersions).toEqual([]);
  });

  it('layout chưa tồn tại → getLayoutDocument trả null', () => {
    expect(getLayoutDocument(executor, 'khong-ton-tai')).toBeNull();
  });

  it('layout mới tạo chưa có color (undefined) — updateLayoutDocumentMeta ghi màu, đọc lại đúng cả getLayoutDocument lẫn listLayoutDocuments', () => {
    createLayoutDocument(executor, 'l1', 'Layout mẫu', contentV1());
    expect(getLayoutDocument(executor, 'l1')!.color).toBeUndefined();

    updateLayoutDocumentMeta(executor, 'l1', { color: '#ff0000' });

    expect(getLayoutDocument(executor, 'l1')!.color).toBe('#ff0000');
    expect(listLayoutDocuments(executor).find((d) => d.id === 'l1')?.color).toBe('#ff0000');
  });

  it('saveDraft KHÔNG tăng version, KHÔNG tạo version mới (Save ≠ Publish)', () => {
    createLayoutDocument(executor, 'l1', 'Layout mẫu', contentV1());
    saveDraft(executor, 'l1', contentV2());

    const doc = getLayoutDocument(executor, 'l1');
    expect(doc!.currentDraft).toEqual(contentV2());
    expect(doc!.publishedVersions).toEqual([]);
  });

  it('saveDraft nhiều lần liên tiếp vẫn chỉ là draft, ghi đè lần trước', () => {
    createLayoutDocument(executor, 'l1', 'Layout mẫu', contentV1());
    saveDraft(executor, 'l1', contentV2());
    saveDraft(executor, 'l1', contentV1());

    const doc = getLayoutDocument(executor, 'l1');
    expect(doc!.currentDraft).toEqual(contentV1());
    expect(doc!.publishedVersions).toEqual([]);
  });

  it('saveDraft layout KHÔNG tồn tại → throw', () => {
    expect(() => saveDraft(executor, 'khong-ton-tai', contentV1())).toThrow();
  });

  it('publish đóng băng draft thành version 1, draft KHÔNG bị xoá (vẫn sửa tiếp được)', () => {
    createLayoutDocument(executor, 'l1', 'Layout mẫu', contentV1());
    const v1 = publish(executor, 'l1', 'Bản đầu tiên');

    expect(v1.version).toBe(1);
    expect(v1.content).toEqual(contentV1());
    expect(v1.note).toBe('Bản đầu tiên');

    const doc = getLayoutDocument(executor, 'l1');
    expect(doc!.publishedVersions).toHaveLength(1);
    expect(doc!.currentDraft).toEqual(contentV1()); // draft vẫn còn, không bị xoá
  });

  it('publish lần 2 → version tăng lên 2, version 1 giữ nguyên bất biến', () => {
    createLayoutDocument(executor, 'l1', 'Layout mẫu', contentV1());
    publish(executor, 'l1');
    saveDraft(executor, 'l1', contentV2());
    const v2 = publish(executor, 'l1');

    expect(v2.version).toBe(2);
    expect(v2.content).toEqual(contentV2());

    const versions = listVersions(executor, 'l1');
    expect(versions).toHaveLength(2);
    expect(versions[0]!.version).toBe(1);
    expect(versions[0]!.content).toEqual(contentV1()); // version 1 KHÔNG bị đổi bởi publish sau
    expect(versions[1]!.version).toBe(2);
  });

  it('publish layout không có draft (chưa createLayoutDocument) → throw', () => {
    expect(() => publish(executor, 'khong-ton-tai')).toThrow();
  });

  it('getVersion trả đúng version cụ thể, null nếu không tồn tại', () => {
    createLayoutDocument(executor, 'l1', 'Layout mẫu', contentV1());
    publish(executor, 'l1');

    expect(getVersion(executor, 'l1', 1)?.content).toEqual(contentV1());
    expect(getVersion(executor, 'l1', 99)).toBeNull();
  });

  it('restoreVersion copy content của version cũ về draft, KHÔNG xoá lịch sử version', () => {
    createLayoutDocument(executor, 'l1', 'Layout mẫu', contentV1());
    publish(executor, 'l1'); // v1 = contentV1
    saveDraft(executor, 'l1', contentV2());
    publish(executor, 'l1'); // v2 = contentV2
    saveDraft(executor, 'l1', { variants: [] }); // draft hiện tại khác cả v1 lẫn v2

    restoreVersion(executor, 'l1', 1);

    const doc = getLayoutDocument(executor, 'l1');
    expect(doc!.currentDraft).toEqual(contentV1()); // draft giờ = nội dung version 1
    expect(doc!.publishedVersions).toHaveLength(2); // lịch sử KHÔNG bị xoá
  });

  it('restore rồi publish lại → tạo version MỚI (v3), không ghi đè v1 cũ', () => {
    createLayoutDocument(executor, 'l1', 'Layout mẫu', contentV1());
    publish(executor, 'l1'); // v1
    saveDraft(executor, 'l1', contentV2());
    publish(executor, 'l1'); // v2

    restoreVersion(executor, 'l1', 1);
    const v3 = publish(executor, 'l1');

    expect(v3.version).toBe(3);
    expect(v3.content).toEqual(contentV1());
    expect(listVersions(executor, 'l1')).toHaveLength(3);
  });

  it('restoreVersion với version không tồn tại → throw', () => {
    createLayoutDocument(executor, 'l1', 'Layout mẫu', contentV1());
    expect(() => restoreVersion(executor, 'l1', 99)).toThrow();
  });

  it('listLayoutDocuments trả đúng danh sách nhiều layout, latestPublishedVersion đúng', () => {
    createLayoutDocument(executor, 'l1', 'Layout A', contentV1());
    createLayoutDocument(executor, 'l2', 'Layout B', contentV1());
    publish(executor, 'l1');
    publish(executor, 'l1');

    const list = listLayoutDocuments(executor);
    const l1 = list.find((d) => d.id === 'l1')!;
    const l2 = list.find((d) => d.id === 'l2')!;
    expect(l1.latestPublishedVersion).toBe(2);
    expect(l2.latestPublishedVersion).toBeNull();
  });
});
