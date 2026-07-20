// Lưu blob ảnh trong IndexedDB cho AssetPort WASM fallback (docs/roadmap/plans/layout-designer/
// 06-luu-tru-va-giao-tiep.md §"Ảnh nền & asset": "Web WASM (fallback) → blob trong IndexedDB
// (không có filesystem) → tạo object URL lúc render, key blob (không phải path file)").
//
// DB RIÊNG với ceremony-db's IndexedDB (packages/ceremony-db/src/drivers/indexeddb-persist.ts,
// lưu SQLite file dạng 1 key cố định "main") — object store này cần NHIỀU key (1 ảnh = 1 key),
// khác hẳn use-case "1 blob DB nguyên khối", nên tách DB riêng thay vì dùng chung store cũ.
const DB_NAME = 'layout-asset-blobs';
const STORE_NAME = 'blobs';
// Object store PHỤ lưu metadata (Bước 11 kế hoạch resize/rotate, 2026-07-18 — Media Library) —
// cạnh blob store hiện có, KHÔNG gộp chung (blob store key→Blob, metadata store key→AssetMeta,
// 2 kiểu dữ liệu khác nhau dù cùng key). DB_VERSION bump 1→2 để IndexedDB chạy onupgradeneeded
// tạo thêm store mới cho user đã có DB cũ (v1 chỉ có STORE_NAME).
const METADATA_STORE_NAME = 'metadata';
const DB_VERSION = 2;

export interface AssetBlobMeta {
  relativePath: string;
  name: string;
  sizeBytes: number;
  uploadedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME);
      if (!req.result.objectStoreNames.contains(METADATA_STORE_NAME)) req.result.createObjectStore(METADATA_STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAssetBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadAssetBlob(key: string): Promise<Blob | undefined> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveAssetMeta(meta: AssetBlobMeta): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(METADATA_STORE_NAME, 'readwrite');
      tx.objectStore(METADATA_STORE_NAME).put(meta, meta.relativePath);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Mới nhất trước — cùng thứ tự hiển thị với listAssets() của 2 adapter kia (Electron/Web HTTP). */
export async function listAssetMeta(): Promise<AssetBlobMeta[]> {
  const db = await openDb();
  try {
    const all = await new Promise<AssetBlobMeta[]>((resolve, reject) => {
      const tx = db.transaction(METADATA_STORE_NAME, 'readonly');
      const req = tx.objectStore(METADATA_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result as AssetBlobMeta[]);
      req.onerror = () => reject(req.error);
    });
    return all.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  } finally {
    db.close();
  }
}
