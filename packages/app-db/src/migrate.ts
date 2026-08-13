import type { SqlExecutor } from './sql-executor.js';
import { MIGRATIONS } from './migrations/index.js';

/**
 * Áp dụng tuần tự các migration chưa chạy, mỗi migration trong 1 transaction riêng.
 * An toàn gọi lại nhiều lần (no-op nếu đã ở version mới nhất).
 */
export function runMigrations(executor: SqlExecutor): void {
  executor.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');

  const applied = new Set(
    executor.query<{ version: number }>('SELECT version FROM schema_version').map((r) => r.version),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    executor.transaction(() => {
      executor.exec(migration.sql);
      executor.run('INSERT INTO schema_version (version) VALUES (?)', [migration.version]);
    });
  }
}
