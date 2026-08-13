// Bước 11 kế hoạch resize/rotate (2026-07-18) — Media Library, metadata ảnh đã lưu qua
// AssetPort.pickAndSaveImage() (packages/service-contracts/src/asset.ts). CHỈ dùng bởi 2 adapter
// có SQLite thật (Electron/data-service qua ceremony-db) — WASM adapter lưu metadata riêng trong
// IndexedDB (asset-blob-store.ts), không đi qua bảng này.
//
// Ảnh upload TRƯỚC migration này sẽ KHÔNG có mặt trong bảng (không backfill/quét file mồ côi —
// giới hạn đã chốt trong plan, chấp nhận được vì Media Library chỉ cần liệt kê ảnh MỚI trở đi).
export const SQL_004_ASSET_LIBRARY = `
CREATE TABLE IF NOT EXISTS asset (
  relative_path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_uploaded_at ON asset(uploaded_at DESC);
`;
