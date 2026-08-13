import type { LayoutComponentPort, LayoutComponentMeta } from '@sky-app/service-contracts';
import type { LayoutItem } from '@sky-app/slide-shared';

/**
 * WASM/Offline LayoutComponentPort — uses IndexedDB for persistent storage (fallback when
 * data-service not available). Personal templates stored as JSON in local IndexedDB.
 */
export function createWasmLayoutComponentPort(): LayoutComponentPort {
  const dbName = 'sky-app-layout-components';
  const storeName = 'components';

  async function getDb() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      };
    });
  }

  return {
    async list() {
      const db = await getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const items = req.result as LayoutComponentMeta[];
          resolve(items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        };
      });
    },
    async save(name, items) {
      const db = await getDb();
      const id = `comp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const entry: LayoutComponentMeta = {
        id,
        name,
        items,
        createdAt: new Date().toISOString(),
      };
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(entry);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve({ id });
      });
    },
    async delete(id) {
      const db = await getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(id);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve();
      });
    },
  };
}
