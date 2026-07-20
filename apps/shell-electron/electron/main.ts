import { app, BrowserWindow, protocol, dialog, ipcMain } from 'electron';
import { existsSync, cpSync, mkdirSync, readFileSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { extname, join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { registerIpcHandlers } from './ipc.js';
import { loadEnv } from './slide/env.js';
import { checkAndApplyRendererUpdate, resolveActiveRendererDir } from './slide/renderer-updater.js';
import { initUpdateChecker } from './update-checker.js';
import { registerUpdateFilePickerIpc } from './update-file-picker.js';
import { ceremonyDataDir, resolveLocalAsset, sampleAssetsDir, vieneuDir } from './slide/data/paths.js';
import { ceremonyStore } from './slide/data/store.js';
import { sessionStore } from './slide/session-store.js';
import {
  autoLoadFirstIfConfigured,
  getUseSampleData,
  setBackdropAspectRatioListener,
  setCustomVariablesFromEvent,
  startSocketServer,
  stopSocketServer,
} from './slide/socket-server.js';
import { getCurrentActiveEvent } from '@sky-app/ceremony-db/node';
import { startHttpServer, stopHttpServer } from './slide/http-server.js';
import { startPythonServer, stopPythonServer } from './slide/python-server.js';
import { apiLogger } from './slide/api-logger.js';
import { notifyBackdropState, registerIpcHandlers as registerSlideIpcHandlers } from './slide/ipc.js';
import {
  closeBackdropWindow,
  resizeBackdropForAspectRatio,
  setBackdropStateListener,
  setMainWindow,
} from './slide/windows.js';
import { setAppMenu } from './slide/menu.js';

// Built as CJS (package.json has no "type": "module") — __dirname is native here.
let mainWindow: BrowserWindow | null = null;

const DEFAULT_WS_PORT = 8765;
const DEFAULT_HTTP_PORT = 8080;

/** MIME type theo phần mở rộng file — đủ cho ảnh dùng trong backdrop (port từ apps/slide/electron/main.ts). */
function mimeFor(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

function ensureDefaultAssets() {
  const dataDir = ceremonyDataDir();
  mkdirSync(dataDir, { recursive: true });
  const src = sampleAssetsDir();
  if (!existsSync(src)) return;
  const dst = join(dataDir, '_assets');
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true, force: true });
}

/**
 * Bootstrap backend Slide — port từ apps/slide/electron/main.ts's bootstrap(),
 * cùng thứ tự: assets → data → session → WS → HTTP → Python → IPC handlers.
 *
 * Control render trong mainWindow (device-layout + ceremonyModule, từ GĐ5).
 * Backdrop vẫn là BrowserWindow riêng ngoài device-layout (kiosk, màn phụ) —
 * mở qua windows.ts's openBackdropWindow(), gọi từ IPC 'backdrop:toggle'.
 */
async function bootstrapSlideBackend() {
  apiLogger.init();
  ensureDefaultAssets();
  const { cleanupImportStaging } = await import('./slide/data/sync.js');
  cleanupImportStaging();
  if (getUseSampleData()) {
    const { syncBundle } = await import('./slide/data/sync.js');
    const result = await syncBundle({ useSample: true });
    // Sample data thất bại (vd sample-bundle/ thiếu trong bản build) không được để
    // Ceremony trắng trơn nếu đĩa đã có bundle.json thật từ lần import trước — nếu
    // không fallback, ceremonyStore rỗng và Backdrop kẹt "Đang tải…" vĩnh viễn dù dữ
    // liệu thật vẫn còn nguyên (GĐ7.5 audit runtime, không phải bug port).
    if (!result.ok && !ceremonyStore.hasData()) {
      ceremonyStore.loadFromDisk();
    }
  } else {
    ceremonyStore.loadFromDisk();
  }
  sessionStore.init(ceremonyStore.getInitialSession());

  const config = ceremonyStore.getConfig();
  const wsPort = config?.ws_port ?? DEFAULT_WS_PORT;
  const httpPort = config?.http_port ?? DEFAULT_HTTP_PORT;

  await startSocketServer(wsPort);
  // Giai đoạn 4c mở rộng (2026-07-20) — đồng bộ customVariables với Event đang active SẴN trong
  // DB lúc khởi động app (không qua setActive()/save() trong phiên này, VD app tắt/mở lại giữa
  // lễ) — nếu không, socket-server giữ giá trị cũ từ app_config.json (loadAppConfig(), dòng
  // module-level phía trên), lệch với Event thật đang chạy. Fail-soft: lỗi đọc DB không chặn
  // khởi động app, chỉ log — customVariables giữ nguyên giá trị cũ trong trường hợp đó.
  try {
    const active = getCurrentActiveEvent(ceremonyStore.getExecutor());
    if (active) setCustomVariablesFromEvent(active.customVariables);
  } catch (err) {
    console.error('[shell-electron] Failed to sync customVariables from active event on startup:', err);
  }
  await startHttpServer(httpPort);
  startPythonServer(vieneuDir()); // non-blocking: warmup chạy nền

  registerSlideIpcHandlers();
  setAppMenu('vi'); // Renderer gửi lại ngôn ngữ thật (đã lưu) ngay khi mount, xem 'app:setLanguage'.
  // Báo Control mỗi khi Backdrop mở/đóng (kể cả đóng bằng nút X)
  setBackdropStateListener(() => notifyBackdropState());
  // Resize cửa sổ Backdrop (khi đang windowed) theo đúng tỷ lệ vừa chọn ở Control
  setBackdropAspectRatioListener((aspectRatio) => resizeBackdropForAspectRatio(aspectRatio));

  // Tự load SV đầu tiên nếu cấu hình (chỉ khi chưa có SV đang on_stage)
  autoLoadFirstIfConfigured();
}

/**
 * Bản renderer tốt nhất để loadFile — OTA đã tải+verify gần nhất (GĐ8), hoặc
 * fallback dist/index.html gốc đóng gói sẵn nếu chưa từng tải OTA thành công
 * hoặc thư mục bản đó bị thiếu file.
 */
function resolveRendererEntry(): string {
  const activeDir = resolveActiveRendererDir();
  if (activeDir) return join(activeDir, 'index.html');
  return join(__dirname, '../../dist/index.html');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'Sky-App',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(resolveRendererEntry());
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Ceremony's Control UI render TRONG mainWindow (qua device-layout, không
  // phải BrowserWindow riêng — xem docs/dev/history.md GĐ5) nên các event
  // backend→Control (backdrop:state, tts:*-progress, menu:action, ...) phải
  // gửi tới đây thay vì 1 "control window" tách biệt.
  setMainWindow(mainWindow);
}

// Đăng ký custom protocol để renderer load ảnh từ ceremony-data (port từ apps/slide).
protocol.registerSchemesAsPrivileged([
  { scheme: 'ceremony-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'sky-wallpaper', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const wallpaperImportDir = () => join(app.getPath('userData'), 'wallpapers');

app.whenReady().then(() => {
  // Sớm nhất có thể — process.env.RENDERER_MANIFEST_URL (GĐ8 OTA) và mọi biến
  // .env khác phải sẵn sàng trước createMainWindow()/bootstrapSlideBackend().
  loadEnv();

  protocol.handle('ceremony-asset', (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const filePath = resolveLocalAsset(relative);
    try {
      const data = readFileSync(filePath);
      return new Response(data, {
        headers: { 'content-type': mimeFor(filePath), 'cache-control': 'no-store' },
      });
    } catch (err) {
      console.error('ceremony-asset not found:', filePath, err);
      return new Response('Not found', { status: 404 });
    }
  });

  // Serves user-imported wallpapers (docs/guides/... wallpaper picker's
  // "Add a Photo") — copied into userData/wallpapers by kernel:wallpaper:import
  // below, not reachable by a normal http/file:// URL from the renderer.
  protocol.handle('sky-wallpaper', (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const filePath = join(wallpaperImportDir(), relative);
    try {
      const data = readFileSync(filePath);
      return new Response(data, {
        headers: { 'content-type': mimeFor(filePath), 'cache-control': 'no-store' },
      });
    } catch (err) {
      console.error('sky-wallpaper not found:', filePath, err);
      return new Response('Not found', { status: 404 });
    }
  });

  // Wallpaper picker's "Add a Photo" — native file picker, copies the chosen
  // image into userData/wallpapers (durable across app restarts, unlike a
  // reference to wherever the user's original file lives) and returns a
  // WallpaperConfig device-layout can pass to addCustomWallpaper().
  ipcMain.handle('kernel:wallpaper:import', async () => {
    if (!mainWindow) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a Photo',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;

    const sourcePath = filePaths[0];
    const destDir = wallpaperImportDir();
    await mkdir(destDir, { recursive: true });
    const id = `custom-${randomUUID()}`;
    const destName = `${id}${extname(sourcePath)}`;
    await copyFile(sourcePath, join(destDir, destName));

    const url = `sky-wallpaper://local/${destName}`;
    return {
      id,
      name: basename(sourcePath, extname(sourcePath)),
      kind: 'picture',
      url,
      thumbnail: url,
    };
  });

  registerIpcHandlers(() => mainWindow);
  registerUpdateFilePickerIpc(() => mainWindow);
  createMainWindow();

  // GĐ8 OTA (Loại 2a) — electron-updater cần app-update.yml, chỉ có trong
  // bản đã đóng gói qua electron-builder; không chạy (và không nên chạy) ở dev.
  if (app.isPackaged) {
    initUpdateChecker();
  }

  // GĐ8 OTA (Loại 1a) — non-blocking, fire-and-forget. Không chặn app mở:
  // dùng bản đã có sẵn (OTA cũ hoặc dist/ gốc); bản mới tải xong chỉ áp dụng
  // ở lần mở app KẾ TIẾP (resolveRendererEntry() đọc lại current.json).
  const manifestUrl = process.env.RENDERER_MANIFEST_URL;
  if (manifestUrl) {
    checkAndApplyRendererUpdate(manifestUrl, (p) => {
      mainWindow?.webContents.send('renderer-update:progress', p);
    }).catch((err) => {
      console.error('[shell-electron] checkAndApplyRendererUpdate failed:', err);
    });
  }

  bootstrapSlideBackend().catch((err) => {
    console.error('[shell-electron] bootstrapSlideBackend failed:', err);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', (event) => {
  if (mainWindow) {
    event.preventDefault();
    dialog
      .showMessageBox(mainWindow, {
        type: 'question',
        title: 'Xác nhận tắt ứng dụng',
        message: 'Bạn có chắc chắn muốn tắt ứng dụng?',
        buttons: ['Hủy', 'Tắt'],
        defaultId: 0,
        cancelId: 0,
      })
      .then((result) => {
        if (result.response === 1) {
          closeBackdropWindow();
          stopSocketServer();
          stopHttpServer();
          stopPythonServer();
          app.exit(0);
        }
      });
  }
});

app.on('window-all-closed', () => {
  stopSocketServer();
  stopHttpServer();
  stopPythonServer();
  if (process.platform !== 'darwin') app.quit();
});
