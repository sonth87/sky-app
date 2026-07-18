// Lưu blob ảnh trong IndexedDB cho AssetPort WASM fallback (docs/roadmap/plans/layout-designer/
// 06-luu-tru-va-giao-tiep.md §"Ảnh nền & asset": "Web WASM (fallback) → blob trong IndexedDB
// (không có filesystem) → tạo object URL lúc render, key blob (không phải path file)").
//
// DB RIÊNG với ceremony-db's IndexedDB (packages/ceremony-db/src/drivers/indexeddb-persist.ts,
// lưu SQLite file dạng 1 key cố định "main") — object store này cần NHIỀU key (1 ảnh = 1 key),
// khác hẳn use-case "1 blob DB nguyên khối", nên tách DB riêng thay vì dùng chung store cũ.
const DB_NAME = 'layout-asset-blobs';
const STORE_NAME = 'blobs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
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
