import { dirname, join as joinPath } from 'node:path';
import { app as electronApp } from 'electron';
import { config as loadDotenv } from 'dotenv';

// electron-vite chỉ tự inject .env vào import.meta.env cho biến có prefix VITE_/MAIN_VITE_,
// KHÔNG đưa vào process.env của main process — nên phải tự nạp .env, sớm nhất có thể.
// Factor ra từ socket-server.ts (GĐ8 OTA) vì main.ts cần process.env.RENDERER_MANIFEST_URL
// sẵn sàng TRƯỚC createMainWindow(), tức trước bootstrapSlideBackend() vốn gọi
// startSocketServer() sau — gọi loadEnv() sớm ở main.ts, guard `loaded` khiến lời gọi lại
// từ socket-server.ts (giữ nguyên vị trí cũ) an toàn, không nạp trùng.
let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  const dotenvCandidates = [
    // Dev: chạy từ thư mục apps/shell-electron
    joinPath(process.cwd(), '.env'),
    // Dev fallback: app path hiện tại
    joinPath(electronApp.getAppPath(), '.env'),
    // Packaged: file .env được bundle vào resources/.env
    process.resourcesPath ? joinPath(process.resourcesPath, '.env') : '',
    // Cho phép đặt .env cạnh file exe/app để override tại máy chạy
    joinPath(dirname(process.execPath), '.env'),
  ].filter(Boolean);

  for (const envPath of dotenvCandidates) {
    loadDotenv({ path: envPath, override: false });
  }
}
