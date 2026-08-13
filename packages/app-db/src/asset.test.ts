// Test bảng asset — Bước 11 kế hoạch resize/rotate (2026-07-18, Media Library).

import { describe, it, expect, beforeEach } from 'vitest';
import { BetterSqlite3Executor } from './drivers/better-sqlite3-executor.js';
import { runMigrations } from './migrate.js';
import { insertAsset, listAssets } from './queries/asset.js';
import type { SqlExecutor } from './sql-executor.js';
import type { AssetMeta } from '@sky-app/service-contracts';

describe('asset (Media Library)', () => {
  let executor: SqlExecutor;

  beforeEach(() => {
    executor = new BetterSqlite3Executor(':memory:');
    runMigrations(executor);
  });

  function sampleAsset(overrides: Partial<AssetMeta> = {}): AssetMeta {
    return {
      relativePath: 'assets/layout/abc.png',
      name: 'abc.png',
      sizeBytes: 12345,
      uploadedAt: '2026-07-18T10:00:00.000Z',
      ...overrides,
    };
  }

  it('insertAsset rồi listAssets → trả đúng nguyên trạng', () => {
    insertAsset(executor, sampleAsset());

    const list = listAssets(executor);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(sampleAsset());
  });

  it('listAssets sắp theo uploadedAt MỚI NHẤT trước', () => {
    insertAsset(executor, sampleAsset({ relativePath: 'a.png', name: 'a.png', uploadedAt: '2026-07-18T08:00:00.000Z' }));
    insertAsset(executor, sampleAsset({ relativePath: 'b.png', name: 'b.png', uploadedAt: '2026-07-18T10:00:00.000Z' }));
    insertAsset(executor, sampleAsset({ relativePath: 'c.png', name: 'c.png', uploadedAt: '2026-07-18T09:00:00.000Z' }));

    const list = listAssets(executor);
    expect(list.map((a) => a.relativePath)).toEqual(['b.png', 'c.png', 'a.png']);
  });

  it('chưa insert gì → trả mảng rỗng', () => {
    expect(listAssets(executor)).toEqual([]);
  });

  it('relativePath là PRIMARY KEY — insert trùng relativePath → lỗi (không âm thầm ghi đè hay tạo 2 dòng)', () => {
    insertAsset(executor, sampleAsset());
    expect(() => insertAsset(executor, sampleAsset())).toThrow();
  });
});
