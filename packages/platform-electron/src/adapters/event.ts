import type { EventPort } from '@sky-app/service-contracts';
import '../bridge-types.js';

/**
 * Electron EventPort — routes to main process (apps/shell-electron/electron/ipc.ts's
 * kernel:event:* channels), dùng chung ceremonyStore's SQLite executor.
 */
export function createElectronEventPort(): EventPort {
  return {
    async list() {
      return (await window.sky.invoke('kernel:event:list')) as Awaited<ReturnType<EventPort['list']>>;
    },
    async get(id) {
      return (await window.sky.invoke('kernel:event:get', id)) as Awaited<ReturnType<EventPort['get']>>;
    },
    async create(doc) {
      await window.sky.invoke('kernel:event:create', doc);
    },
    async save(doc) {
      await window.sky.invoke('kernel:event:save', doc);
    },
    async getCurrentActive() {
      return (await window.sky.invoke('kernel:event:getCurrentActive')) as Awaited<ReturnType<EventPort['getCurrentActive']>>;
    },
    async setActive(id) {
      await window.sky.invoke('kernel:event:setActive', id);
    },
  };
}
