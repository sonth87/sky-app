import type { LayoutPort } from '@sky-app/service-contracts';
import {
  createLayoutDocument,
  getLayoutDocument,
  getVersion,
  listLayoutDocuments,
  listTopVariables,
  listVersions,
  publish,
  recordTokenUsage,
  restoreVersion,
  saveDraft,
} from '@sky-app/ceremony-db/browser';
import { getSharedWasmExecutor, persistSharedWasmExecutor } from '../wasm-executor.js';

export interface SqliteWasmLayoutPortOptions {
  wasmUrl?: string;
}

/**
 * LayoutPort chạy hoàn toàn trong trình duyệt (sql.js + IndexedDB) — dùng khi `data-service`
 * không khả dụng, đối xứng adapters/sqlite-wasm-data.ts. Dùng CHUNG executor với DataPort WASM
 * (wasm-executor.ts) — cùng 1 file .db trong bộ nhớ, tránh mất đồng bộ khi mở nhiều app cùng lúc.
 */
export function createSqliteWasmLayoutPort(opts: SqliteWasmLayoutPortOptions = {}): LayoutPort {
  const { wasmUrl } = opts;
  return {
    async listDocuments() {
      const executor = await getSharedWasmExecutor(wasmUrl);
      return listLayoutDocuments(executor);
    },

    async getDocument(id) {
      const executor = await getSharedWasmExecutor(wasmUrl);
      return getLayoutDocument(executor, id);
    },

    async createDocument(id, name, initialContent, description) {
      const executor = await getSharedWasmExecutor(wasmUrl);
      createLayoutDocument(executor, id, name, initialContent, description);
      await persistSharedWasmExecutor(executor);
    },

    async saveDraft(id, content) {
      const executor = await getSharedWasmExecutor(wasmUrl);
      saveDraft(executor, id, content);
      await persistSharedWasmExecutor(executor);
    },

    async publish(id, note) {
      const executor = await getSharedWasmExecutor(wasmUrl);
      const version = publish(executor, id, note);
      await persistSharedWasmExecutor(executor);
      return version;
    },

    async listVersions(id) {
      const executor = await getSharedWasmExecutor(wasmUrl);
      return listVersions(executor, id);
    },

    async getVersion(id, version) {
      const executor = await getSharedWasmExecutor(wasmUrl);
      return getVersion(executor, id, version);
    },

    async restoreVersion(id, version) {
      const executor = await getSharedWasmExecutor(wasmUrl);
      restoreVersion(executor, id, version);
      await persistSharedWasmExecutor(executor);
    },

    async recordTokenUsage(key) {
      const executor = await getSharedWasmExecutor(wasmUrl);
      recordTokenUsage(executor, key);
      await persistSharedWasmExecutor(executor);
    },

    async listTopVariables(limit) {
      const executor = await getSharedWasmExecutor(wasmUrl);
      return listTopVariables(executor, limit);
    },
  };
}
