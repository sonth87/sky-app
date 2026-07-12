import { app, BrowserWindow, protocol, dialog, ipcMain } from 'electron';
import { existsSync, cpSync, mkdirSync, readFileSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { extname, join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { registerIpcHandlers } from './ipc.js';
import { ceremonyDataDir, resolveLocalAsset, sampleAssetsDir, vieneuDir } from './slide/data/paths.js';
import { ceremonyStore } from './slide/data/store.js';
import { sessionStore } from './slide/session-store.js';
import { getUseSampleData, startSocketServer, stopSocketServer } from './slide/socket-server.js';
import { startHttpServer, stopHttpServer } from './slide/http-server.js';
import { startPythonServer, stopPythonServer } from './slide/python-server.js';
import { apiLogger } from './slide/api-logger.js';
import { registerIpcHandlers as registerSlideIpcHandlers } from './slide/ipc.js';
import { setMainWindow } from './slide/windows.js';

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
    await syncBundle({ useSample: true });
  } else {
    ceremonyStore.loadFromDisk();
  }
  sessionStore.init(ceremonyStore.getInitialSession());

  const config = ceremonyStore.getConfig();
  const wsPort = config?.ws_port ?? DEFAULT_WS_PORT;
  const httpPort = config?.http_port ?? DEFAULT_HTTP_PORT;

  await startSocketServer(wsPort);
  await startHttpServer(httpPort);
  startPythonServer(vieneuDir()); // non-blocking: warmup chạy nền

  registerSlideIpcHandlers();
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
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
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
  createMainWindow();

  bootstrapSlideBackend().catch((err) => {
    console.error('[shell-electron] bootstrapSlideBackend failed:', err);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  stopSocketServer();
  stopHttpServer();
  stopPythonServer();
  if (process.platform !== 'darwin') app.quit();
});
