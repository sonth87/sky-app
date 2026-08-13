// Entry point trình duyệt (SqliteWasmAdapter ở packages/platform-web) — driver sql.js (WASM)
// + IndexedDB persist. KHÔNG import từ đây trong Electron main process/data-service (Node) —
// dùng './node.js' (BetterSqlite3Executor) cho phía đó.
export * from './index.js';
export { SqlJsExecutor } from './drivers/sql-js-executor.js';
export { loadDbBytes, saveDbBytes } from './drivers/indexeddb-persist.js';
