import { ipcMain, type BrowserWindow } from 'electron';

/**
 * IPC router — the main-process counterpart to platform-electron's preload
 * bridge (window.sky.invoke). Each channel here corresponds to a method a
 * port adapter in packages/platform-electron/src/adapters/*.ts calls.
 *
 * GĐ3 scope: mock implementations (no real TTS service or secondary
 * BrowserWindow yet — that's GĐ4-5). The point here is proving the
 * preload -> ipcMain.handle round trip works end-to-end, not real behavior.
 */
export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('tts:speak', async (_event, text: string) => {
    console.log('[mock tts:speak]', text);
  });

  ipcMain.handle('tts:listVoices', async () => {
    return [{ id: 'mock-voice-1', name: 'Mock Voice' }];
  });

  ipcMain.handle('display:list', async () => {
    return [];
  });

  ipcMain.handle('display:open', async () => {
    console.log('[mock display:open] no secondary BrowserWindow yet (GĐ5)');
  });

  ipcMain.handle('display:close', async () => {});

  ipcMain.handle('display:isOpen', async () => false);

  ipcMain.handle('display:setFullscreen', async (_event, fullscreen: boolean) => {
    getMainWindow()?.setFullScreen(fullscreen);
  });
}
