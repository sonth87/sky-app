import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type { SqlExecutor } from '../sql-executor.js';

let sqlJsModule: SqlJsStatic | null = null;
let sqlJsModulePromise: Promise<SqlJsStatic> | null = null;

/**
 * sql.js mặc định tìm sql-wasm.wasm tương đối vị trí chính file JS đang chạy — trong bundle
 * Vite, module có thể bị di chuyển sang chunk khác khiến đường dẫn tương đối sai. Caller
 * (SqliteWasmAdapter ở packages/platform-web) PHẢI truyền `wasmUrl` trỏ đúng URL public của
 * sql-wasm.wasm (Vite: `import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'`). Không gọi lần
 * nào trước khi có wasmUrl sẽ dùng đường mặc định của sql.js — chỉ đúng trong Node (test/vitest).
 */
async function loadSqlJsModule(wasmUrl?: string): Promise<SqlJsStatic> {
  if (!sqlJsModulePromise) {
    sqlJsModulePromise = initSqlJs(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  }
  sqlJsModule = await sqlJsModulePromise;
  return sqlJsModule;
}

/**
 * Driver SqlExecutor chạy bằng WASM trong trình duyệt (sql.js) — dùng cho `SqliteWasmAdapter`
 * khi `data-service` không khả dụng (xem docs/roadmap/plans/layout-designer/18-*.md §1a).
 * Khởi tạo bất đồng bộ (load WASM module), nhưng executor instance sau khi tạo xong dùng đồng
 * bộ giống BetterSqlite3Executor (đúng theo interface SqlExecutor).
 *
 * KHÔNG tự persist — gọi export() để lấy bytes rồi tự lưu (VD IndexedDB, xem
 * indexeddb-persist.ts), và gọi lại factory này với `initialBytes` để khôi phục.
 */
export class SqlJsExecutor implements SqlExecutor {
  private db: Database;

  private constructor(db: Database) {
    this.db = db;
  }

  static async create(initialBytes?: Uint8Array, wasmUrl?: string): Promise<SqlJsExecutor> {
    const SQL = await loadSqlJsModule(wasmUrl);
    const db = new SQL.Database(initialBytes);
    return new SqlJsExecutor(db);
  }

  exec(sql: string): void {
    this.db.run(sql);
  }

  run(sql: string, params: unknown[] = []): { changes: number } {
    this.db.run(sql, params as (string | number | null | Uint8Array)[]);
    return { changes: this.db.getRowsModified() };
  }

  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const results = this.db.exec(sql, params as (string | number | null | Uint8Array)[]);
    if (results.length === 0) return [];
    const { columns, values } = results[0]!;
    return values.map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj as T;
    });
  }

  transaction<T>(fn: () => T): T {
    this.db.run('BEGIN');
    try {
      const result = fn();
      this.db.run('COMMIT');
      return result;
    } catch (e) {
      this.db.run('ROLLBACK');
      throw e;
    }
  }

  /** Xuất toàn bộ DB thành bytes — dùng để persist (VD ghi vào IndexedDB). */
  export(): Uint8Array {
    return this.db.export();
  }

  close(): void {
    this.db.close();
  }
}
