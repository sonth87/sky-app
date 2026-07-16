import type { CeremonyBundle } from '@sky-app/slide-shared';

/**
 * DataPort — import/export/sync dữ liệu của app (vd danh sách sinh viên).
 * Electron: IPC → store local. Web: REST API backend.
 */
export interface SyncProgress {
  processed: number;
  total: number;
}

export interface DataPort<TRecord = unknown> {
  getMeta(): Promise<Record<string, unknown>>;
  sync(opts?: { useSample?: boolean }): Promise<void>;
  exportData(): Promise<TRecord[]>;
  onSyncProgress(handler: (progress: SyncProgress) => void): () => void;
}

/**
 * DataStore — port lưu trữ (tầng dưới DataPort). DataPort là interface phía client
 * (Electron IPC / Web REST) gọi vào app; DataStore là interface phía storage backend
 * (SQLite local, SQLite-WASM trong trình duyệt, Supabase sau này) mà server/main process
 * dùng để đọc/ghi dữ liệu thật. Nhiều adapter cùng implement 1 interface này — xem
 * docs/roadmap/plans/layout-designer/18-luu-tru-sqlite-supabase.md §4.
 */
export interface DataStore {
  getCeremonyBundle(): Promise<CeremonyBundle>;
  saveCeremonyBundle(bundle: CeremonyBundle): Promise<void>;
  // TODO Giai đoạn 1-3: events: EventStore; layouts: LayoutStore; dataSources: DataSourceStore;
}
