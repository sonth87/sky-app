/**
 * Interface tối giản dùng chung cho mọi driver SQLite (better-sqlite3, sql.js).
 * Migration tool và query function chỉ phụ thuộc interface này — không phụ thuộc driver cụ thể,
 * để cùng 1 bộ logic SQL chạy được cả Electron/data-service (native) lẫn trình duyệt (WASM).
 */
export interface SqlExecutor {
  /** DDL hoặc câu lệnh không cần kết quả trả về (CREATE TABLE, PRAGMA...). */
  exec(sql: string): void;
  /** INSERT/UPDATE/DELETE — trả về số dòng bị ảnh hưởng. */
  run(sql: string, params?: unknown[]): { changes: number };
  /** SELECT — trả về mảng dòng kết quả. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  /** Chạy fn trong 1 transaction; rollback nếu fn throw. */
  transaction<T>(fn: () => T): T;
}
