import { join } from 'node:path';
import { BrowserWindow, screen, dialog } from 'electron';

const isDev = !!process.env['ELECTRON_RENDERER_URL'];
const preloadPath = join(__dirname, '../preload/preload.js');

let controlWindow: BrowserWindow | null = null;
let backdropWindow: BrowserWindow | null = null;

// Callback gọi khi trạng thái Backdrop thay đổi (mở/đóng) — main đăng ký để báo Control.
let onBackdropStateChange: (() => void) | null = null;
export function setBackdropStateListener(fn: () => void) {
  onBackdropStateChange = fn;
}

function loadRenderer(win: BrowserWindow, htmlName: 'control' | 'backdrop') {
  if (isDev) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${htmlName}.html`);
  } else {
    win.loadFile(join(__dirname, `../../dist/${htmlName}.html`));
  }
}

export function createControlWindow(): BrowserWindow {
  controlWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'Control — Trao bằng',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loadRenderer(controlWindow, 'control');

  // Confirm trước khi đóng window
  controlWindow.on('close', (event) => {
    event.preventDefault();
    dialog
      .showMessageBox(controlWindow!, {
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
          controlWindow?.destroy();
        }
      });
  });

  controlWindow.on('closed', () => {
    closeBackdropWindow();
    controlWindow = null;
  });
  return controlWindow;
}

/**
 * Tạo cửa sổ Backdrop dạng cửa sổ thường (không fullscreen/kiosk ngay).
 * Người dùng kéo sang màn bất kỳ rồi tự bấm fullscreen hoặc dùng DisplayPicker.
 * Nếu có màn ngoài thì đặt vị trí ban đầu ở màn đó cho tiện.
 * `aspectRatio`: tỷ lệ khung hình đã chọn trước đó (từ socket-server) — kích thước
 * cửa sổ ban đầu khớp tỷ lệ này ngay từ lúc mở, tránh hiện méo/sai tỷ lệ.
 */
export function createBackdropWindow(_opts: { kiosk: boolean; aspectRatio?: '16:9' | '25:9' }): BrowserWindow {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const external = displays.find((d) => d.id !== primary.id);
  const target = external ?? primary;

  // Mở kích thước vừa phải (không chiếm toàn màn) để dễ kéo/di chuyển, khớp đúng tỷ lệ đã chọn.
  const ratio = _opts.aspectRatio === '25:9' ? 25 / 9 : 16 / 9;
  let W = Math.round(target.bounds.width * 0.8);
  let H = Math.round(W / ratio);
  if (H > target.bounds.height * 0.8) {
    H = Math.round(target.bounds.height * 0.8);
    W = Math.round(H * ratio);
  }

  backdropWindow = new BrowserWindow({
    x: target.bounds.x + Math.round((target.bounds.width - W) / 2),
    y: target.bounds.y + Math.round((target.bounds.height - H) / 2),
    width: W,
    height: H,
    title: 'Backdrop — Slide trao bằng',
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loadRenderer(backdropWindow, 'backdrop');
  // Tạo với show:false để tránh nháy trắng; hiện ra khi nội dung sẵn sàng.
  backdropWindow.once('ready-to-show', () => {
    backdropWindow?.show();
    onBackdropStateChange?.();
  });
  backdropWindow.on('closed', () => {
    backdropWindow = null;
    // Báo Control khi backdrop bị đóng (kể cả khi đóng bằng nút X của cửa sổ)
    onBackdropStateChange?.();
  });
  // Lắng nghe sự kiện fullscreen từ OS (nút xanh lá hoặc phím tắt của OS) để sync về Control
  backdropWindow.on('enter-full-screen', () => {
    onBackdropStateChange?.();
  });
  backdropWindow.on('leave-full-screen', () => {
    onBackdropStateChange?.();
  });

  // Lắng nghe phím Escape để thoát fullscreen/kiosk
  backdropWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') {
      setBackdropFullscreen(false);
      event.preventDefault();
    }
  });

  return backdropWindow;
}

/** Danh sách màn hình để Control cho người dùng chọn (DisplayPicker) */
export function listDisplays() {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    label: `${d.size.width}×${d.size.height}${d.id === primary.id ? ' (chính)' : ''}`,
    bounds: d.bounds,
  }));
}

/** Di chuyển Backdrop sang màn hình khác theo id (không tự fullscreen) */
export function moveBackdropToDisplay(displayId: number, kiosk: boolean) {
  if (!backdropWindow) return;
  const display = screen.getAllDisplays().find((d) => d.id === displayId);
  if (!display) return;
  // Thoát fullscreen/kiosk trước khi setBounds (setBounds bị ignore khi đang fullscreen)
  backdropWindow.setKiosk(false);
  backdropWindow.setFullScreen(false);
  backdropWindow.setBounds(display.bounds, true);
  if (kiosk) {
    setTimeout(() => {
      if (!backdropWindow) return;
      backdropWindow.setKiosk(true);
      onBackdropStateChange?.();
    }, 150);
  } else {
    onBackdropStateChange?.();
  }
  backdropWindow.focus();
}

/**
 * Resize cửa sổ Backdrop theo đúng tỷ lệ khung hình vừa chọn (giữ tâm cửa sổ cố định).
 * Chỉ áp dụng khi đang ở chế độ windowed — fullscreen/kiosk đã tự khớp màn hình vật lý,
 * không cần resize (setBounds bị Electron bỏ qua khi đang fullscreen).
 */
export function resizeBackdropForAspectRatio(aspectRatio: '16:9' | '25:9') {
  if (!backdropWindow) return;
  if (backdropWindow.isKiosk() || backdropWindow.isFullScreen()) return;

  const bounds = backdropWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const ratio = aspectRatio === '25:9' ? 25 / 9 : 16 / 9;

  // Giữ nguyên chiều rộng hiện tại, tính lại chiều cao theo tỷ lệ mới (không vượt quá màn hình chứa cửa sổ).
  const maxW = display.workArea.width;
  const maxH = display.workArea.height;
  let width = bounds.width;
  let height = Math.round(width / ratio);
  if (height > maxH) {
    height = maxH;
    width = Math.round(height * ratio);
  }
  if (width > maxW) {
    width = maxW;
    height = Math.round(width / ratio);
  }

  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  backdropWindow.setBounds({
    x: Math.round(centerX - width / 2),
    y: Math.round(centerY - height / 2),
    width,
    height,
  });
}

/** Bật/tắt fullscreen cho cửa sổ Backdrop */
export function setBackdropFullscreen(enabled: boolean) {
  if (!backdropWindow) return;
  if (enabled) {
    // Sử dụng kiosk mode để ẩn hoàn toàn tiêu đề cửa sổ (title bar) và menu bar
    backdropWindow.setKiosk(true);
  } else {
    backdropWindow.setKiosk(false);
    backdropWindow.setFullScreen(false);
  }
  onBackdropStateChange?.();
}

/** Đóng cửa sổ Backdrop (tắt phần hiển thị trên màn hình lớn) */
export function closeBackdropWindow() {
  if (backdropWindow) {
    backdropWindow.setKiosk(false);
    backdropWindow.setFullScreen(false);
    backdropWindow.close();
    backdropWindow = null;
  }
}

/** Mở lại cửa sổ Backdrop nếu đang đóng */
export function openBackdropWindow(opts: { kiosk: boolean; aspectRatio?: '16:9' | '25:9' }) {
  if (!backdropWindow) {
    createBackdropWindow(opts);
  } else {
    backdropWindow.show();
  }
  return backdropWindow;
}

/** Backdrop đang mở hay không */
export function isBackdropOpen(): boolean {
  return backdropWindow != null;
}

export function getControlWindow() {
  return controlWindow;
}
export function getBackdropWindow() {
  return backdropWindow;
}
