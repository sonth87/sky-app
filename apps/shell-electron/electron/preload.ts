import { contextBridge, ipcRenderer } from 'electron';
import type { SkyBridge } from '@sky-app/platform-electron';
import { registerSlideBridge } from './slide/preload.js';

/**
 * Preload runs in Electron's sandboxed preload world, whose module resolver
 * cannot follow pnpm's `exports`-based package resolution (verified: works
 * fine under plain Node, fails only inside Electron's `preloadRequire`).
 * So the bridge implementation lives here, in-app — only *types* are
 * imported from @sky-app/platform-electron. Same pattern as apps/slide's
 * electron/preload.ts in the source repo (trao-bang-tot-nghiep-2026).
 *
 * ./slide/preload.ts is a relative import within THIS app (not a bare
 * package specifier crossing a workspace boundary), so it bundles inline
 * fine — the GĐ3 preload restriction is specifically about pnpm-symlinked
 * package imports, not local files.
 */
const skyBridge: SkyBridge = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
};

contextBridge.exposeInMainWorld('sky', skyBridge);
registerSlideBridge();
