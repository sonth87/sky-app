// Entry point CHUNG — chỉ schema/migration/queries, KHÔNG chứa driver cụ thể (tránh kéo
// better-sqlite3 vào bundle trình duyệt hoặc sql.js vào build không cần). Node dùng
// '@sky-app/ceremony-db/node' (BetterSqlite3Executor), trình duyệt dùng
// '@sky-app/ceremony-db/browser' (SqlJsExecutor + IndexedDB) — xem package.json's exports.
export type { SqlExecutor } from './sql-executor.js';
export { runMigrations } from './migrate.js';
export { MIGRATIONS } from './migrations/index.js';

export { defaultCeremony } from './seed.js';

export { getCeremonyWithConfig, getCeremonyRowRaw, saveCeremonyWithConfig } from './queries/ceremony.js';
export { getAppConfig, upsertAppConfig } from './queries/config.js';
export {
  getLayoutDocument,
  listLayoutDocuments,
  createLayoutDocument,
  updateLayoutDocumentMeta,
  saveDraft,
  publish,
  listVersions,
  getVersion,
  restoreVersion,
} from './queries/layout.js';
export { recordTokenUsage, listTopVariables } from './queries/variable-registry.js';
export type { VariableRegistryEntry } from './queries/variable-registry.js';
export { insertAsset, listAssets } from './queries/asset.js';
export {
  getEvent,
  listEvents,
  createEvent,
  saveEvent,
  getCurrentActiveEvent,
  setActiveEvent,
} from './queries/event.js';
export {
  getDataSource,
  listDataSources,
  getDataSourceRecords,
  insertDataSource,
  insertDataSourceRecords,
} from './queries/data-source.js';
export { listFieldMappingProfiles, saveFieldMappingProfile } from './queries/field-mapping-profile.js';
