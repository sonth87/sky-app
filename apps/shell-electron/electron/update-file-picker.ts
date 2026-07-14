/**
 * update-file-picker.ts — GĐ8 OTA Update, "update qua file" (offline, không
 * server/manifest — user tự chọn 1 file .zip/.dmg/.exe nhận thủ công, ví dụ
 * qua USB, cho máy không có mạng).
 *
 * .zip (renderer bundle, cùng format scripts/build-renderer-bundle.mjs sinh
 * ra) → applyRendererZip() thẳng, KHÔNG so sánh version (khác OTA tự động —
 * user đã chủ động chọn, luôn ghi đè current.json).
 * .dmg/.exe (installer đầy đủ) → shell.openPath() giao cho OS's installer UI
 * tiếp quản (giống double-click) — Electron không tự "cài" 1 file bất kỳ.
 */
import { ipcMain, dialog, shell, type BrowserWindow } from 'electron';
import { extname, basename } from 'node:path';
import { applyRendererZip } from './slide/renderer-updater';

export interface PickUpdateFileResult {
  ok: boolean;
  kind: 'renderer-zip' | 'installer' | 'cancelled';
  bundleVersion?: string;
  fileName?: string;
  error?: string;
}

export function registerUpdateFilePickerIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('kernel:update:pickFile', async (): Promise<PickUpdateFileResult> => {
    const win = getMainWindow();
    if (!win) return { ok: false, kind: 'cancelled', error: 'no window' };

    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Chọn file cập nhật',
      filters: [{ name: 'Update files', extensions: ['zip', 'dmg', 'exe'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return { ok: false, kind: 'cancelled' };

    const filePath = filePaths[0];
    const ext = extname(filePath).toLowerCase();

    if (ext === '.zip') {
      const bundleVersion = `local-${basename(filePath, ext)}`;
      const result = await applyRendererZip(filePath, bundleVersion);
      return result.ok
        ? { ok: true, kind: 'renderer-zip', bundleVersion: result.bundleVersion, fileName: basename(filePath) }
        : { ok: false, kind: 'renderer-zip', error: result.error };
    }

    if (ext === '.dmg' || ext === '.exe') {
      const openError = await shell.openPath(filePath); // '' nếu thành công
      return openError
        ? { ok: false, kind: 'installer', error: openError }
        : { ok: true, kind: 'installer', fileName: basename(filePath) };
    }

    return { ok: false, kind: 'cancelled', error: `Định dạng không hỗ trợ: ${ext}` };
  });
}
