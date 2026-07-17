// Entry point Node (Electron main process + data-service) — driver better-sqlite3, native.
// KHÔNG import từ đây trong code chạy trong trình duyệt (kéo theo better-sqlite3 vào bundle
// client, gây lỗi — xem drivers/sql-js-executor.ts / browser.ts cho phía trình duyệt).
export * from './index.js';
export { BetterSqlite3Executor } from './drivers/better-sqlite3-executor.js';
