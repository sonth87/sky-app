import type { LayoutPort } from '@sky-app/service-contracts';
import '../bridge-types.js';

/**
 * Electron LayoutPort — routes to main process (apps/shell-electron/electron/ipc.ts's
 * kernel:layout:* channels), dùng chung ceremonyStore's SQLite executor.
 */
export function createElectronLayoutPort(): LayoutPort {
  return {
    async listDocuments() {
      return (await window.sky.invoke('kernel:layout:listDocuments')) as Awaited<ReturnType<LayoutPort['listDocuments']>>;
    },
    async getDocument(id) {
      return (await window.sky.invoke('kernel:layout:getDocument', id)) as Awaited<ReturnType<LayoutPort['getDocument']>>;
    },
    async createDocument(id, name, initialContent, description) {
      await window.sky.invoke('kernel:layout:createDocument', id, name, initialContent, description);
    },
    async updateDocumentMeta(id, patch) {
      await window.sky.invoke('kernel:layout:updateDocumentMeta', id, patch);
    },
    async saveDraft(id, content) {
      await window.sky.invoke('kernel:layout:saveDraft', id, content);
    },
    async publish(id, note) {
      return (await window.sky.invoke('kernel:layout:publish', id, note)) as Awaited<ReturnType<LayoutPort['publish']>>;
    },
    async listVersions(id) {
      return (await window.sky.invoke('kernel:layout:listVersions', id)) as Awaited<ReturnType<LayoutPort['listVersions']>>;
    },
    async getVersion(id, version) {
      return (await window.sky.invoke('kernel:layout:getVersion', id, version)) as Awaited<ReturnType<LayoutPort['getVersion']>>;
    },
    async restoreVersion(id, version) {
      await window.sky.invoke('kernel:layout:restoreVersion', id, version);
    },
    async recordTokenUsage(key) {
      await window.sky.invoke('kernel:layout:recordTokenUsage', key);
    },
    async listTopVariables(limit) {
      return (await window.sky.invoke('kernel:layout:listTopVariables', limit)) as Awaited<ReturnType<LayoutPort['listTopVariables']>>;
    },
  };
}
