import { ipcMain, app, type BrowserWindow } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isUpdateReadyToInstall, getPendingNativeUpdateInfo } from './update-checker';

/**
 * IPC router — the main-process counterpart to platform-electron's preload
 * bridge (window.sky.invoke). Each channel here corresponds to a method a
 * port adapter in packages/platform-electron/src/adapters/*.ts calls.
 *
 * Channels are prefixed `kernel:` to avoid colliding with electron/slide/ipc.ts's
 * `window.slide` bridge, which uses bare `tts:*`/`display:*` channel names for
 * a completely different (real, Slide-specific) purpose — both bridges are
 * registered in the same ipcMain, so channel names must be globally unique.
 *
 * GĐ3 scope: mock implementations (no real TTS service or secondary
 * BrowserWindow yet — that's GĐ4-5). The point here is proving the
 * preload -> ipcMain.handle round trip works end-to-end, not real behavior.
 */
export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('kernel:tts:speak', async (_event, text: string) => {
    console.log('[mock tts:speak]', text);
  });

  ipcMain.handle('kernel:tts:listVoices', async () => {
    return [{ id: 'mock-voice-1', name: 'Mock Voice' }];
  });

  ipcMain.handle('kernel:display:list', async () => {
    return [];
  });

  ipcMain.handle('kernel:display:open', async () => {
    console.log('[mock display:open] no secondary BrowserWindow yet (GĐ5)');
  });

  ipcMain.handle('kernel:display:close', async () => {});

  ipcMain.handle('kernel:display:isOpen', async () => false);

  ipcMain.handle('kernel:display:setFullscreen', async (_event, fullscreen: boolean) => {
    getMainWindow()?.setFullScreen(fullscreen);
  });

  // Licensing (docs/guides/licensing-entitlement.md) — renderer không có fs
  // trực tiếp (contextIsolation), main lưu license key thô trong userData.
  // packages/licensing verify chữ ký; ở đây chỉ đọc/ghi chuỗi, không parse.
  const licenseFilePath = () => join(app.getPath('userData'), 'license.key');

  ipcMain.handle('kernel:license:read', async () => {
    try {
      return await readFile(licenseFilePath(), 'utf-8');
    } catch {
      return null;
    }
  });

  ipcMain.handle('kernel:license:write', async (_event, licenseKey: string) => {
    const path = licenseFilePath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, licenseKey, 'utf-8');
  });

  // GĐ8 OTA (Loại 2a) — bản native/main-process mới đã tải xong nền, chờ cài
  // khi app thoát (autoUpdater.autoInstallOnAppQuit — xem update-checker.ts).
  ipcMain.handle('kernel:nativeUpdateStatus', async () => {
    return {
      downloaded: isUpdateReadyToInstall(),
      pendingVersion: getPendingNativeUpdateInfo()?.version ?? null,
    };
  });
}
