import { Menu, app, type MenuItemConstructorOptions, type WebContents } from 'electron';
import { getMainWindow, getBackdropWindow } from './windows';

export type MenuLanguage = 'vi' | 'en';
export type MenuActionId =
  | 'about'
  | 'settings:general'
  | 'settings:tts'
  | 'settings:variable'
  | 'settings:layout'
  | 'settings:api'
  | 'settings:backup'
  | 'data:reset:qr'
  | 'data:reset:students'
  | 'data:reset:cache'
  | 'develop:apiTest';

const LABELS: Record<MenuLanguage, Record<string, string>> = {
  vi: {
    about: 'Về ứng dụng',
    settings: 'Cài đặt…',
    quit: 'Thoát',
    data: 'Dữ liệu',
    reset: 'Đặt lại',
    resetQr: 'Danh sách quét QR',
    resetStudents: 'Danh sách người tham dự',
    resetCache: 'Cache',
    develop: 'Develop',
    devtoolsControl: 'DevTools — Control',
    devtoolsBackdrop: 'DevTools — Backdrop',
    apiTest: 'Giao diện thử nghiệm API',
    importExportSettings: 'Import/Export Setting…',
    help: 'Trợ giúp',
    edit: 'Sửa',
    undo: 'Hoàn tác',
    redo: 'Làm lại',
    cut: 'Cắt',
    copy: 'Sao chép',
    paste: 'Dán',
    selectAll: 'Chọn tất cả',
  },
  en: {
    about: 'About',
    settings: 'Settings…',
    quit: 'Quit',
    data: 'Data',
    reset: 'Reset',
    resetQr: 'QR scan list',
    resetStudents: 'Attendee list',
    resetCache: 'Cache',
    develop: 'Develop',
    devtoolsControl: 'DevTools — Control',
    devtoolsBackdrop: 'DevTools — Backdrop',
    apiTest: 'API test interface',
    importExportSettings: 'Import/Export Setting…',
    help: 'Help',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
  },
};

function sendMenuAction(id: MenuActionId) {
  getMainWindow()?.webContents.send('menu:action', id);
}

export function buildAppMenu(language: MenuLanguage) {
  const l = LABELS[language];
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.getName(),
      submenu: [
        { label: l.about, click: () => sendMenuAction('about') },
        { type: 'separator' },
        { label: l.settings, accelerator: 'CmdOrCtrl+,', click: () => sendMenuAction('settings:general') },
        { type: 'separator' },
        { label: l.quit, accelerator: isMac ? 'Cmd+Q' : 'Ctrl+Q', role: 'quit' },
      ],
    },
    // Menu Edit chuẩn — KHÔNG THỂ THIẾU. Menu template tùy chỉnh (Menu.setApplicationMenu) thay
    // thế toàn bộ menu mặc định của Electron/macOS; accelerator Cmd+C/V/X/A/Z chỉ hoạt động khi
    // có menu item mang đúng role tương ứng (đây là cách Electron/Chromium map phím tắt →
    // document.execCommand/clipboard trên macOS) — thiếu submenu này khiến COPY/PASTE KHÔNG HOẠT
    // ĐỘNG Ở BẤT KỲ ĐÂU trong toàn app, kể cả DevTools (bug thật user báo, 2026-07-23).
    {
      label: l.edit,
      submenu: [
        { label: l.undo, role: 'undo' },
        { label: l.redo, role: 'redo' },
        { type: 'separator' },
        { label: l.cut, role: 'cut' },
        { label: l.copy, role: 'copy' },
        { label: l.paste, role: 'paste' },
        { label: l.selectAll, role: 'selectAll' },
      ],
    },
    {
      label: l.data,
      submenu: [
        {
          label: l.reset,
          submenu: [
            { label: l.resetQr, click: () => sendMenuAction('data:reset:qr') },
            { label: l.resetStudents, click: () => sendMenuAction('data:reset:students') },
            { label: l.resetCache, click: () => sendMenuAction('data:reset:cache') },
          ],
        },
      ],
    },
    {
      label: l.develop,
      submenu: [
        { label: l.devtoolsControl, click: () => getMainWindow()?.webContents.openDevTools() },
        { label: l.devtoolsBackdrop, click: () => getBackdropWindow()?.webContents.openDevTools() },
        { label: l.apiTest, click: () => sendMenuAction('develop:apiTest') },
        { type: 'separator' },
        { label: l.importExportSettings, click: () => sendMenuAction('settings:backup') },
      ],
    },
    {
      label: l.help,
      submenu: [],
    },
  ];

  return Menu.buildFromTemplate(template);
}

let currentLanguage: MenuLanguage = 'vi';

export function setAppMenu(language: MenuLanguage) {
  currentLanguage = language;
  Menu.setApplicationMenu(buildAppMenu(language));
}

/** Rebuild menu với ngôn ngữ hiện tại — dùng khi 1 giá trị hiển thị trong menu (vd checkbox) đổi ở nơi khác. */
export function refreshAppMenu() {
  Menu.setApplicationMenu(buildAppMenu(currentLanguage));
}

/**
 * Context menu (chuột phải) cho Copy/Paste/Cut/Select All — BỔ SUNG cho menu Edit ở
 * buildAppMenu() (accelerator Cmd+C/V/X/A), không thay thế. Nhiều người dùng quen bôi đen chọn
 * rồi chuột-phải hơn nhớ phím tắt (feedback thật, 2026-07-23) — Electron KHÔNG tự có context
 * menu mặc định (khác trình duyệt thường), phải tự đăng ký 'context-menu' trên từng webContents.
 *
 * Dùng `params.editFlags` (Chromium tính sẵn theo đúng ngữ cảnh DOM tại điểm click — input rỗng
 * sẽ không có canCopy/canCut) để CHỈ hiện mục còn dùng được, và chỉ hiện menu khi thật sự đang ở
 * vùng có thể sửa/copy (`isEditable` hoặc có `selectionText`) — tránh menu thừa khi chuột phải
 * vào nút bấm/label tĩnh không có gì để copy/paste.
 */
export function attachEditContextMenu(webContents: WebContents) {
  webContents.on('context-menu', (_event, params) => {
    // DEBUG TẠM — xoá sau khi xác định nguyên nhân context menu không hiện (2026-07-23).
    console.log('[context-menu debug]', { isEditable: params.isEditable, selectionText: params.selectionText, editFlags: params.editFlags });
    const l = LABELS[currentLanguage];
    if (!params.isEditable && !params.selectionText) return;

    const template: MenuItemConstructorOptions[] = [];
    if (params.isEditable) {
      template.push(
        { label: l.undo, role: 'undo', enabled: params.editFlags.canUndo },
        { label: l.redo, role: 'redo', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { label: l.cut, role: 'cut', enabled: params.editFlags.canCut },
      );
    }
    template.push({ label: l.copy, role: 'copy', enabled: params.editFlags.canCopy });
    if (params.isEditable) {
      template.push({ label: l.paste, role: 'paste', enabled: params.editFlags.canPaste });
    }
    template.push({ type: 'separator' }, { label: l.selectAll, role: 'selectAll', enabled: params.editFlags.canSelectAll });

    Menu.buildFromTemplate(template).popup();
  });
}
