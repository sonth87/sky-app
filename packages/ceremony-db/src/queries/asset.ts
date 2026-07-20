import type { SqlExecutor } from '../sql-executor.js';
import type { AssetMeta } from '@sky-app/service-contracts';

interface AssetRow {
  relative_path: string;
  name: string;
  size_bytes: number;
  uploaded_at: string;
}

function rowToAsset(row: AssetRow): AssetMeta {
  return { relativePath: row.relative_path, name: row.name, sizeBytes: row.size_bytes, uploadedAt: row.uploaded_at };
}

export function insertAsset(executor: SqlExecutor, meta: AssetMeta): void {
  executor.run('INSERT INTO asset (relative_path, name, size_bytes, uploaded_at) VALUES (?, ?, ?, ?)', [
    meta.relativePath,
    meta.name,
    meta.sizeBytes,
    meta.uploadedAt,
  ]);
}

export function listAssets(executor: SqlExecutor): AssetMeta[] {
  const rows = executor.query<AssetRow>('SELECT relative_path, name, size_bytes, uploaded_at FROM asset ORDER BY uploaded_at DESC');
  return rows.map(rowToAsset);
}
