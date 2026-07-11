import { Menu, app, type MenuItemConstructorOptions } from 'electron';
import { getControlWindow, getBackdropWindow } from './windows';
import { getUseSampleData } from './socket-server';

export type MenuLanguage = 'vi' | 'en';
export type MenuActionId =
  | 'about'
  | 'settings:general'
  | 'settings:tts'
  | 'settings:variable'
  | 'settings:layout'
  | 'settings:api'
  | 'settings:backup'
  | 'data:import'
  | 'data:export'
  | 'data:reset:qr'
  | 'data:reset:students'
  | 'data:reset:cache'
  | 'develop:sampleData'
  | 'develop:apiTest';

const LABELS: Record<MenuLanguage, Record<string, string>> = {
  vi: {
    about: 'Về ứng dụng',
    settings: 'Cài đặt…',
    quit: 'Thoát',
    data: 'Dữ liệu',
    import: 'Import',
    export: 'Export',
    reset: 'Đặt lại',
    resetQr: 'Danh sách quét QR',
    resetStudents: 'Danh sách sinh viên',
    resetCache: 'Cache',
    develop: 'Develop',
    sampleData: 'Dùng dữ liệu mẫu',
    devtoolsControl: 'DevTools — Control',
    devtoolsBackdrop: 'DevTools — Backdrop',
    apiTest: 'Giao diện thử nghiệm API',
    importExportSettings: 'Import/Export Setting…',
    help: 'Trợ giúp',
  },
  en: {
    about: 'About',
    settings: 'Settings…',
    quit: 'Quit',
    data: 'Data',
    import: 'Import',
    export: 'Export',
    reset: 'Reset',
    resetQr: 'QR scan list',
    resetStudents: 'Student list',
    resetCache: 'Cache',
    develop: 'Develop',
    sampleData: 'Use sample data',
    devtoolsControl: 'DevTools — Control',
    devtoolsBackdrop: 'DevTools — Backdrop',
    apiTest: 'API test interface',
    importExportSettings: 'Import/Export Setting…',
    help: 'Help',
  },
};

function sendMenuAction(id: MenuActionId) {
  getControlWindow()?.webContents.send('menu:action', id);
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
    {
      label: l.data,
      submenu: [
        { label: l.import, click: () => sendMenuAction('data:import') },
        { label: l.export, click: () => sendMenuAction('data:export') },
        { type: 'separator' },
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
        {
          label: l.sampleData,
          type: 'checkbox',
          checked: getUseSampleData(),
          click: () => sendMenuAction('develop:sampleData'),
        },
        { type: 'separator' },
        { label: l.devtoolsControl, click: () => getControlWindow()?.webContents.openDevTools() },
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
