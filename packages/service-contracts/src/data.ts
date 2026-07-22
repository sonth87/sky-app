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
