import Database from 'better-sqlite3';
import type { SqlExecutor } from '../sql-executor.js';

/**
 * Driver SqlExecutor cho Electron (main process) và data-service (Node) — native, đồng bộ.
 * journal_mode=WAL giảm rủi ro corrupt nếu crash giữa lúc ghi (thay cho việc tự chế
 * staging+commit ở tầng filesystem như trước — xem file 18 §2 "vấn đề thật của cách cũ").
 */
export class BetterSqlite3Executor implements SqlExecutor {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params: unknown[] = []): { changes: number } {
    const result = this.db.prepare(sql).run(...params);
    return { changes: result.changes };
  }

  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }
}
