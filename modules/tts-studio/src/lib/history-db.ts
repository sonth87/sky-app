export interface HistoryEntry {
  id: string;
  text: string;
  voiceId: string;
  voiceLabel: string;
  speed: number;
  sampleRate: number;
  createdAt: number;
  audioBlob: Blob;
  durationMs: number;
}

const DB_NAME = 'tts-studio';
const DB_VERSION = 1;
const STORE_NAME = 'history';
const MAX_ENTRIES = 30;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putHistoryEntry(entry: HistoryEntry): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await pruneOldEntries(db);
  db.close();
}

export async function getAllHistoryEntries(): Promise<HistoryEntry[]> {
  const db = await openDb();
  const entries = await new Promise<HistoryEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as HistoryEntry[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return entries.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getHistoryEntry(id: string): Promise<HistoryEntry | undefined> {
  const db = await openDb();
  const entry = await new Promise<HistoryEntry | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result as HistoryEntry | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return entry;
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Giữ tối đa MAX_ENTRIES bản ghi — xoá bản cũ nhất (theo createdAt) khi vượt. */
async function pruneOldEntries(db: IDBDatabase): Promise<void> {
  const ids = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('createdAt');
    const result: string[] = [];
    const req = index.openCursor(null, 'prev'); // mới nhất trước
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        result.push((cursor.value as HistoryEntry).id);
        cursor.continue();
      } else {
        resolve(result);
      }
    };
    req.onerror = () => reject(req.error);
  });

  const staleIds = ids.slice(MAX_ENTRIES);
  if (staleIds.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const id of staleIds) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
