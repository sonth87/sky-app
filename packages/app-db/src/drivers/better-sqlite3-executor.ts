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
    // Chờ tối đa 5s khi file đang bị tiến trình khác khoá, thay vì ném SQLITE_BUSY ngay.
    //
    // Khai TƯỜNG MINH dù better-sqlite3 vốn mặc định đúng 5000ms: từ khi tiến trình Python
    // của tts-service cũng mở file này (xem `db.py`), con số đó không còn là chi tiết nội
    // bộ của một thư viện mà là HỢP ĐỒNG giữa hai runtime khác nhau — Python đặt cùng giá
    // trị ở phía nó. Để mặc định ngầm thì một bản nâng cấp better-sqlite3 có thể đổi nó mà
    // không ai nhận ra, và triệu chứng sẽ là lỗi ghi ngắt quãng lúc hai bên cùng bận.
    this.db.pragma('busy_timeout = 5000');
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
