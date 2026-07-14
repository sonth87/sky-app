import type { UpdateActions, UpdateStatus, PickUpdateFileResult, UpdateProgress } from '@sonth87/device-layout';

/**
 * Real implementation of device-layout's UpdateActions — reads OTA renderer
 * status (electron/slide/ipc.ts's 'app:rendererUpdateStatus', GĐ8) + native
 * updater status (electron/ipc.ts's 'kernel:nativeUpdateStatus'), exposes
 * the file-picker IPC (electron/update-file-picker.ts's
 * 'kernel:update:pickFile' — backend kept even though UI hides the button,
 * see docs/dev/versioning.md), and subscribes to download/extract progress
 * (electron/main.ts pushes 'renderer-update:progress' via window.sky.on).
 * Note 'app:rendererUpdateStatus' has no 'kernel:' prefix (registered in
 * electron/slide/ipc.ts, a separate handler set) — still reachable via
 * window.sky.invoke since both share the same ipcMain.
 */
export const updateActions: UpdateActions = {
  async checkUpdate(): Promise<UpdateStatus> {
    const [renderer, native] = await Promise.all([
      window.sky.invoke('app:rendererUpdateStatus') as Promise<{
        runningVersion: string;
        pendingVersion: string | null;
        pendingReleaseNotes: string | null;
      }>,
      window.sky.invoke('kernel:nativeUpdateStatus') as Promise<{
        downloaded: boolean;
        pendingVersion: string | null;
      }>,
    ]);
    return {
      runningRendererVersion: renderer.runningVersion,
      pendingRendererVersion: renderer.pendingVersion,
      pendingReleaseNotes: renderer.pendingReleaseNotes,
      nativeUpdateDownloaded: native.downloaded,
      nativeUpdateVersion: native.pendingVersion,
    };
  },

  async pickUpdateFile(): Promise<PickUpdateFileResult> {
    return window.sky.invoke('kernel:update:pickFile') as Promise<PickUpdateFileResult>;
  },

  onProgress(cb) {
    return window.sky.on('renderer-update:progress', (p) => cb(p as UpdateProgress));
  },
};
