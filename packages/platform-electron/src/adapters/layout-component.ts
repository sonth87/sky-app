import type { LayoutComponentPort, LayoutComponentMeta } from '@sky-app/service-contracts';
import type { LayoutItem } from '@sky-app/slide-shared';
import '../bridge-types.js';

/**
 * Electron LayoutComponentPort — routes to main process (apps/shell-electron/electron/ipc.ts's
 * kernel:layoutComponent:* channels). Personal templates (mẫu tự tạo từ nhóm item) lưu trong
 * app-db qua IPC.
 */
export function createElectronLayoutComponentPort(): LayoutComponentPort {
  return {
    async list() {
      return (await window.sky.invoke('kernel:layoutComponent:list')) as LayoutComponentMeta[];
    },
    async save(name, items) {
      return (await window.sky.invoke('kernel:layoutComponent:save', name, items)) as { id: string };
    },
    async delete(id) {
      await window.sky.invoke('kernel:layoutComponent:delete', id);
    },
  };
}
