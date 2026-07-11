import type { DisplayPort } from '@sky-app/service-contracts';
import '../bridge-types.js';

/**
 * Electron DisplayPort — routes to main process window management
 * (apps/shell-electron/electron/ipc.ts). This is the clearest example of a
 * capability web genuinely cannot provide: a real secondary BrowserWindow.
 */
export function createElectronDisplayPort(): DisplayPort {
  return {
    async listDisplays() {
      return (await window.sky.invoke('display:list')) as Awaited<ReturnType<DisplayPort['listDisplays']>>;
    },
    async open(displayId) {
      await window.sky.invoke('display:open', displayId);
    },
    async close() {
      await window.sky.invoke('display:close');
    },
    async isOpen() {
      return (await window.sky.invoke('display:isOpen')) as boolean;
    },
    async setFullscreen(fullscreen) {
      await window.sky.invoke('display:setFullscreen', fullscreen);
    },
  };
}
