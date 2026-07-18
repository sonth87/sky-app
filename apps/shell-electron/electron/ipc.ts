import { ipcMain, app, dialog, type BrowserWindow } from 'electron';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isUpdateReadyToInstall, getPendingNativeUpdateInfo } from './update-checker';
import { layoutAssetsDir } from './slide/data/paths';
import type { LayoutContent } from '@sky-app/slide-shared';
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
} from '@sky-app/ceremony-db/node';
import { ceremonyStore } from './slide/data/store';

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
 * Display channels are still mock (no secondary BrowserWindow yet). TTS no
 * longer routes through here — platform-electron's TtsPort adapter now
 * calls window.slide directly (the real Slide-specific bridge), see
 * packages/platform-electron/src/adapters/tts.ts.
 */
export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null) {
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

  // LayoutPort (packages/service-contracts/src/layout.ts) — versioning cho LayoutDocument
  // (docs/roadmap/plans/layout-designer/21-layout-versioning.md). Dùng CHUNG executor với
  // ceremonyStore (ceremonyStore.getExecutor()) — cùng 1 file ceremony.db, tránh mở 2 kết nối
  // SQLite song song tới cùng file (rủi ro lock WAL không cần thiết).
  ipcMain.handle('kernel:layout:listDocuments', async () => {
    return listLayoutDocuments(ceremonyStore.getExecutor());
  });

  ipcMain.handle('kernel:layout:getDocument', async (_event, id: string) => {
    return getLayoutDocument(ceremonyStore.getExecutor(), id);
  });

  ipcMain.handle(
    'kernel:layout:createDocument',
    async (_event, id: string, name: string, initialContent: LayoutContent, description?: string) => {
      createLayoutDocument(ceremonyStore.getExecutor(), id, name, initialContent, description);
    },
  );

  ipcMain.handle('kernel:layout:saveDraft', async (_event, id: string, content: LayoutContent) => {
    saveDraft(ceremonyStore.getExecutor(), id, content);
  });

  ipcMain.handle('kernel:layout:publish', async (_event, id: string, note?: string) => {
    return publish(ceremonyStore.getExecutor(), id, note);
  });

  ipcMain.handle('kernel:layout:listVersions', async (_event, id: string) => {
    return listVersions(ceremonyStore.getExecutor(), id);
  });

  ipcMain.handle('kernel:layout:getVersion', async (_event, id: string, version: number) => {
    return getVersion(ceremonyStore.getExecutor(), id, version);
  });

  ipcMain.handle('kernel:layout:restoreVersion', async (_event, id: string, version: number) => {
    restoreVersion(ceremonyStore.getExecutor(), id, version);
  });

  // variable_registry (09-quy-dinh-variable.md §2.6) — gợi ý autocomplete toàn cục, KHÔNG gắn
  // với 1 layout cụ thể, dùng chung executor với các channel kernel:layout:* ở trên.
  ipcMain.handle('kernel:layout:recordTokenUsage', async (_event, key: string) => {
    recordTokenUsage(ceremonyStore.getExecutor(), key);
  });

  ipcMain.handle('kernel:layout:listTopVariables', async (_event, limit?: number) => {
    return listTopVariables(ceremonyStore.getExecutor(), limit);
  });

  // AssetPort (packages/service-contracts/src/asset.ts) — chọn ảnh cho layout-designer, lưu
  // trong ceremony-data/assets/layout/ (thư mục con riêng, tránh trộn ảnh sinh viên nhập qua
  // ZIP). Tái dùng protocol "ceremony-asset://" đã đăng ký sẵn (main.ts) — KHÔNG tạo protocol
  // mới, vì resolveLocalAsset() đã tự map "assets/..." đúng vào ceremony-data/assets/.
  ipcMain.handle('kernel:layoutAsset:pick', async () => {
    const win = getMainWindow();
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Chọn ảnh',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;

    const sourcePath = filePaths[0]!;
    const destDir = layoutAssetsDir();
    await mkdir(destDir, { recursive: true });
    const destName = `${randomUUID()}${extname(sourcePath)}`;
    await copyFile(sourcePath, join(destDir, destName));

    // resolveLocalAsset() (paths.ts) map "assets/..." → ceremony-data/assets/... — path tương
    // đối lưu vào LayoutItem.src PHẢI khớp đúng định dạng này.
    return { relativePath: `assets/layout/${destName}` };
  });

  ipcMain.handle('kernel:layoutAsset:resolve', async (_event, relativePath: string) => {
    return relativePath ? `ceremony-asset://local/${relativePath}` : '';
  });
}
