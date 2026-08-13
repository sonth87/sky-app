import { describe, it, expect, beforeEach } from 'vitest';
import { BetterSqlite3Executor } from './drivers/better-sqlite3-executor.js';
import { runMigrations } from './migrate.js';
import { listTopVariables, recordTokenUsage } from './queries/variable-registry.js';
import type { SqlExecutor } from './sql-executor.js';

describe('variable_registry', () => {
  let executor: SqlExecutor;

  beforeEach(() => {
    executor = new BetterSqlite3Executor(':memory:');
    runMigrations(executor);
  });

  it('key mới → INSERT với usage_count = 1', () => {
    recordTokenUsage(executor, 'full_name');
    const list = listTopVariables(executor);
    expect(list).toHaveLength(1);
    expect(list[0]!.key).toBe('full_name');
    expect(list[0]!.usageCount).toBe(1);
    expect(list[0]!.firstUsedAt).toBe(list[0]!.lastUsedAt);
  });

  it('key đã có → UPDATE usage_count +1, KHÔNG tạo dòng trùng', () => {
    recordTokenUsage(executor, 'full_name');
    recordTokenUsage(executor, 'full_name');
    recordTokenUsage(executor, 'full_name');

    const list = listTopVariables(executor);
    expect(list).toHaveLength(1);
    expect(list[0]!.usageCount).toBe(3);
  });

  it('listTopVariables sắp theo usage_count GIẢM DẦN', () => {
    recordTokenUsage(executor, 'ho_ten'); // 1 lần
    recordTokenUsage(executor, 'danh_hieu');
    recordTokenUsage(executor, 'danh_hieu'); // 2 lần
    recordTokenUsage(executor, 'chuc_vu');
    recordTokenUsage(executor, 'chuc_vu');
    recordTokenUsage(executor, 'chuc_vu'); // 3 lần

    const list = listTopVariables(executor);
    expect(list.map((v) => v.key)).toEqual(['chuc_vu', 'danh_hieu', 'ho_ten']);
  });

  it('limit giới hạn đúng số lượng trả về', () => {
    recordTokenUsage(executor, 'a');
    recordTokenUsage(executor, 'b');
    recordTokenUsage(executor, 'c');

    const list = listTopVariables(executor, 2);
    expect(list).toHaveLength(2);
  });

  it('chưa ghi nhận token nào → trả mảng rỗng', () => {
    expect(listTopVariables(executor)).toEqual([]);
  });
});
