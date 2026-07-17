/**
 * Persist bytes của SqlJsExecutor vào IndexedDB — sql.js không tự ghi filesystem (không có
 * trong trình duyệt), nên phải tự dump/load toàn bộ DB dạng Uint8Array. Giai đoạn 0 chấp nhận
 * ghi lại toàn bộ DB mỗi lần save (không debounce/incremental) — dữ liệu ceremony hiện tại nhỏ
 * (vài trăm bản ghi), không phải vấn đề hiệu năng ở quy mô này.
 */
const DB_NAME = 'ceremony-db';
const STORE_NAME = 'sqlite-file';
const KEY = 'main';

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadDbBytes(): Promise<Uint8Array | undefined> {
  const db = await openIndexedDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve(req.result as Uint8Array | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveDbBytes(bytes: Uint8Array): Promise<void> {
  const db = await openIndexedDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(bytes, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
