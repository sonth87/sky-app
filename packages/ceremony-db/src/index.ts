// Entry point CHUNG — chỉ schema/migration/queries, KHÔNG chứa driver cụ thể (tránh kéo
// better-sqlite3 vào bundle trình duyệt hoặc sql.js vào build không cần). Node dùng
// '@sky-app/ceremony-db/node' (BetterSqlite3Executor), trình duyệt dùng
// '@sky-app/ceremony-db/browser' (SqlJsExecutor + IndexedDB) — xem package.json's exports.
export type { SqlExecutor } from './sql-executor.js';
export { runMigrations } from './migrate.js';
export { MIGRATIONS } from './migrations/index.js';

export type { RawStudent } from './seed.js';
export { mapStatus, mapRawStudent, defaultCeremony } from './seed.js';

export { getCeremonyBundle, saveCeremonyBundle } from './queries/ceremony.js';
export { getAppConfig, upsertAppConfig } from './queries/config.js';
export { getCustomVariables, replaceCustomVariables } from './queries/custom-variable.js';
export {
  getStudents,
  findStudentByCode,
  neighborByDisplayOrder,
  replaceStudents,
  clearStudents,
  patchStudent,
} from './queries/student.js';
