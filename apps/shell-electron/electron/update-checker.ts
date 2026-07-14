/**
 * update-checker.ts — GĐ8 OTA Update, Loại 2a (main process/native, bắt buộc
 * cài lại). Dùng electron-updater + GitHub Releases (owner/repo trong
 * electron-builder.yml's publish, hiện là placeholder).
 *
 * Chỉ TẢI NỀN khi có bản mới, KHÔNG tự restart giữa lúc đang dùng —
 * autoInstallOnAppQuit cài đặt khi app.quit()/exit() xảy ra (tương thích sẵn
 * với dialog xác nhận thoát ở main.ts's before-quit, không cần sửa gì thêm).
 * Áp dụng cho use-case "chạy tại chỗ trong buổi lễ, không muốn gián đoạn".
 *
 * macOS: electron-updater/Squirrel.Mac yêu cầu code signing để hoạt động —
 * giới hạn nền tảng Apple, không phải config. Chưa ký (GĐ8 quyết định) nên
 * trên mac auto-update KHÔNG hoạt động đáng tin cậy; dùng phân phối thủ công
 * (.dmg unsigned qua `pnpm dist:mac`) cho tới khi đầu tư Apple Developer cert.
 * Windows (NSIS) hoạt động được không cần signing (chỉ SmartScreen cảnh báo).
 *
 * CHỈ gọi initUpdateChecker() khi app.isPackaged — electron-updater cần
 * app-update.yml chỉ có trong bản đã đóng gói qua electron-builder.
 */
import { autoUpdater } from 'electron-updater';

let updateDownloaded = false;
let updateInfo: { version: string } | null = null;

export function initUpdateChecker(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('[update-checker] update available:', info.version);
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true;
    updateInfo = { version: info.version };
    console.log('[update-checker] downloaded, will install on quit:', info.version);
  });

  autoUpdater.on('error', (err) => {
    // Mạng lỗi/không có release nào = bình thường, không được crash app.
    console.error('[update-checker] error:', err);
  });

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[update-checker] checkForUpdates failed:', err);
  });
}

export function isUpdateReadyToInstall(): boolean {
  return updateDownloaded;
}

export function getPendingNativeUpdateInfo(): { version: string } | null {
  return updateInfo;
}
