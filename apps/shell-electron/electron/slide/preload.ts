import { contextBridge, ipcRenderer } from 'electron';
import type { ApiIntegration } from '@sky-app/slide-shared';
import type {
  ApiEnvironment,
  SlideApi,
  SlideMeta,
  SyncResult,
  SyncProgress,
  DisplayInfo,
  TtsConfig,
  TtsEngines,
  EngineInstallProgress,
  TtsEnginePreflight,
  TtsCapabilities,
  PreGenStatus,
} from '@sky-app/slide-shared';

// Re-export for the few call-sites elsewhere in electron/slide/* that still
// `import type {...} from './preload'` — types now live in @sky-app/slide-shared
// (modules/ceremony, a renderer package, cannot import 'electron' from here).
export type {
  ApiEnvironment,
  SlideApi,
  SlideMeta,
  InvalidStudent,
  ImportPreview,
  SyncResult,
  SyncProgress,
  DisplayInfo,
  TtsConfig,
  TtsEngineInfo,
  TtsEngines,
  EngineInstallProgress,
  TtsEnginePreflight,
  TtsCapabilities,
  PreGenStatus,
} from '@sky-app/slide-shared';

const api: SlideApi = {
  getMeta: (): Promise<SlideMeta> => ipcRenderer.invoke('data:meta'),
  syncData: (payload?: { url?: string; zipPath?: string }): Promise<SyncResult> =>
    ipcRenderer.invoke('data:sync', payload),
  openBundleFile: (): Promise<string | null> => ipcRenderer.invoke('data:openFile'),
  statBundleFile: (filePath: string): Promise<{ size: number }> => ipcRenderer.invoke('data:statFile', filePath),
  confirmImport: (): Promise<SyncResult> => ipcRenderer.invoke('data:confirmImport'),
  cancelImport: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('data:cancelImport'),
  exportData: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('data:export'),
  onSyncProgress: (cb: (p: SyncProgress) => void): (() => void) => {
    const handler = (_e: unknown, p: SyncProgress) => cb(p);
    ipcRenderer.on('data:progress', handler);
    return () => ipcRenderer.removeListener('data:progress', handler);
  },
  updateConfig: (patch: Partial<any>): Promise<any> => ipcRenderer.invoke('config:update', patch),
  getApiEnvironment: (): Promise<ApiEnvironment> => ipcRenderer.invoke('config:getApiEnvironment'),
  setApiEnvironment: (env: ApiEnvironment): Promise<ApiEnvironment> => ipcRenderer.invoke('config:setApiEnvironment', env),
  getApiIntegrations: (): Promise<ApiIntegration[]> => ipcRenderer.invoke('config:getApiIntegrations'),
  setApiIntegrations: (val: ApiIntegration[]): Promise<ApiIntegration[]> => ipcRenderer.invoke('config:setApiIntegrations', val),
  hasDefaultApiIntegrations: (): Promise<boolean> => ipcRenderer.invoke('config:hasDefaultApiIntegrations'),
  resetApiIntegrationsToDefault: (): Promise<ApiIntegration[]> => ipcRenderer.invoke('config:resetApiIntegrationsToDefault'),
  submitLogs: (): Promise<boolean> => ipcRenderer.invoke('logs:submit'),
  listDisplays: (): Promise<DisplayInfo[]> => ipcRenderer.invoke('display:list'),
  moveBackdrop: (displayId: number, kiosk: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('display:move', { displayId, kiosk }),
  setBackdropFullscreen: (enabled: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('display:fullscreen', { enabled }),
  /**
   * Resolve asset tương đối thành URL custom-protocol để renderer hiển thị.
   * Luôn dùng host cố định "local" để mọi asset (kể cả "bg.png" không có "/")
   * nằm trong pathname — tránh việc URL parser hiểu nhầm tên file thành host.
   */
  assetUrl: (relativePath: string): string =>
    relativePath ? `ceremony-asset://local/${relativePath}` : '',
  // ---- Backdrop (phần hiển thị trên màn hình lớn) ----
  isBackdropOpen: (): Promise<boolean> => ipcRenderer.invoke('backdrop:isOpen'),
  isBackdropFullscreen: (): Promise<boolean> => ipcRenderer.invoke('backdrop:isFullscreen'),
  toggleBackdrop: (): Promise<{ open: boolean }> => ipcRenderer.invoke('backdrop:toggle'),
  openDevTools: (): Promise<void> => ipcRenderer.invoke('debug:openDevTools'),
  openBackdropDevTools: (): Promise<void> => ipcRenderer.invoke('debug:openBackdropDevTools'),
  resetData: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('data:reset'),
  resetStudents: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('data:resetStudents'),
  clearScans: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('data:clearScans'),
  clearCache: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('data:clearCache'),
  getAppVersion: (): Promise<{ version: string }> => ipcRenderer.invoke('app:version'),
  setAppLanguage: (language: 'vi' | 'en'): Promise<void> => ipcRenderer.invoke('app:setLanguage', language),
  /** Lắng nghe action từ native menu (App/Data/Develop). Trả về hàm hủy đăng ký. */
  onMenuAction: (cb: (id: string) => void): (() => void) => {
    const handler = (_e: unknown, id: string) => cb(id);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },
  getUseSampleData: (): Promise<boolean> => ipcRenderer.invoke('config:getUseSampleData'),
  setUseSampleData: (val: boolean): Promise<SyncResult> => ipcRenderer.invoke('config:setUseSampleData', val),
  saveAutoPlay: (state: {
    scannedCodes: string[];
    playedCodes: string[];
    currentCode: string | null;
    delaySeconds: number;
  }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('autoplay:save', state),
  loadAutoPlay: (): Promise<{
    scannedCodes: string[];
    playedCodes: string[];
    currentCode: string | null;
    delaySeconds: number;
  } | null> =>
    ipcRenderer.invoke('autoplay:load'),
  /** Lắng nghe trạng thái Python/TTS engine (starting | ready | error). */
  onPythonStatus: (cb: (payload: { status: 'starting' | 'ready' | 'error'; detail: string }) => void): (() => void) => {
    const handler = (_e: unknown, payload: { status: 'starting' | 'ready' | 'error'; detail: string }) => cb(payload);
    ipcRenderer.on('python:status', handler);
    return () => ipcRenderer.removeListener('python:status', handler);
  },
  /** Lắng nghe khi Backdrop mở/đóng và trạng thái fullscreen. Trả về hàm hủy đăng ký. */
  onBackdropState: (cb: (payload: { open: boolean; fullscreen: boolean }) => void): (() => void) => {
    const handler = (_e: unknown, payload: { open: boolean; fullscreen: boolean }) => cb(payload);
    ipcRenderer.on('backdrop:state', handler);
    return () => ipcRenderer.removeListener('backdrop:state', handler);
  },
  // ---- Text to Speech (TTS) ----
  speak: (text: string, modelName?: string, speed?: number, studentCode?: string): Promise<{ ok: boolean; buffer?: ArrayBuffer; sampleRate?: number; error?: string }> =>
    ipcRenderer.invoke('tts:speak', { text, modelName, speed, studentCode }).then((res) => {
      if (res.ok && res.buffer) {
        // Chuyển Buffer (Node.js/Uint8Array) → ArrayBuffer
        return {
          ok: true,
          sampleRate: res.sampleRate ?? 24000,
          buffer: res.buffer.buffer.slice(
            res.buffer.byteOffset,
            res.buffer.byteOffset + res.buffer.byteLength
          )
        };
      }
      return { ok: res.ok, error: res.error };
    }),
  // tts-studio: channel riêng, KHÔNG cache/log/pregen (khác tts:speak dùng bởi Ceremony).
  synthesizeTts: (text: string, voiceId?: string, speed?: number): Promise<{ ok: boolean; buffer?: ArrayBuffer; sampleRate?: number; error?: string }> =>
    ipcRenderer.invoke('tts-studio:synthesize', { text, voiceId, speed }).then((res) => {
      if (res.ok && res.buffer) {
        return {
          ok: true,
          sampleRate: res.sampleRate ?? 48000,
          buffer: res.buffer.buffer.slice(
            res.buffer.byteOffset,
            res.buffer.byteOffset + res.buffer.byteLength
          )
        };
      }
      return { ok: res.ok, error: res.error };
    }),
  warmupTts: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('tts:warmup'),
  getTtsDebug: (): Promise<{
    port: number; processAlive: boolean; processPid: number | null;
    executableUsed: string; lastStartupError: string | null;
    lastExitCode: number | null; healthOk: boolean | null;
    recentStderr: string[]; cacheSize: number;
    activityLog: { time: string; action: string; text: string; model: string; ok: boolean; durationMs: number; error?: string; cacheHit?: boolean }[];
  }> => ipcRenderer.invoke('tts:debug'),
  preSynthesizeTts: (texts: string[], modelName: string, speeds: number[]): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('tts:presynthesize', { texts, modelName, speeds }),
  restartTts: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('tts:restart'),
  getTtsModelStatus: (): Promise<{ downloaded: boolean }> =>
    ipcRenderer.invoke('tts:model-status'),
  /** Trả về URL http://127.0.0.1:<port>/preview/<speakerId> để phát WAV mẫu bundled */
  getTtsStatus: (): Promise<{ status: 'starting' | 'ready' | 'error'; detail: string }> =>
    ipcRenderer.invoke('tts:get-status'),
  getTtsPreviewUrl: (speakerId: string): Promise<string> =>
    ipcRenderer.invoke('tts:preview-url', { speakerId }),
  listVoices: (): Promise<Array<{ id: string; label: string; gender: string; region: string; type: string; hidden: boolean }>> =>
    ipcRenderer.invoke('tts:list-voices'),
  // ---- Advanced config + capabilities ----
  getTtsConfig: (): Promise<TtsConfig | null> =>
    ipcRenderer.invoke('tts:get-config'),
  setTtsConfig: (partial: Partial<TtsConfig>): Promise<{ ok: boolean; config?: TtsConfig; error?: string }> =>
    ipcRenderer.invoke('tts:set-config', partial),
  getTtsCapabilities: (): Promise<TtsCapabilities | null> =>
    ipcRenderer.invoke('tts:capabilities'),
  installAccel: (packageName: string): Promise<{ ok: boolean; error?: string; log?: string }> =>
    ipcRenderer.invoke('tts:install-accel', { packageName }),
  listEngines: (): Promise<TtsEngines | null> =>
    ipcRenderer.invoke('tts:list-engines'),
  enginePreflight: (engineId: string): Promise<TtsEnginePreflight> =>
    ipcRenderer.invoke('tts:engine-preflight', { engineId }),
  engineInstallStart: (engineId: string): Promise<{ ok: boolean; error?: string; preflight?: TtsEnginePreflight }> =>
    ipcRenderer.invoke('tts:engine-install-start', { engineId }),
  engineInstallPause: (engineId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('tts:engine-install-pause', { engineId }),
  engineInstallResume: (engineId: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('tts:engine-install-resume', { engineId }),
  engineInstallCancel: (engineId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('tts:engine-install-cancel', { engineId }),
  engineImportLocal: (engineId: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('tts:engine-import-local', { engineId }),
  engineVerify: (engineId: string): Promise<{ ok: boolean; error?: string; capabilities?: unknown }> =>
    ipcRenderer.invoke('tts:engine-verify', { engineId }),
  engineSwitch: (engineId: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('tts:engine-switch', { engineId }),
  engineExportLocal: (engineId: string): Promise<{ ok: boolean; error?: string; count?: number }> =>
    ipcRenderer.invoke('tts:engine-export-local', { engineId }),
  engineDelete: (engineId: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('tts:engine-delete', { engineId }),
  engineDiskUsage: (engineId: string): Promise<{ bytes: number }> =>
    ipcRenderer.invoke('tts:engine-disk-usage', { engineId }),
  onEngineInstallProgress: (cb: (p: EngineInstallProgress) => void): (() => void) => {
    const handler = (_e: unknown, p: EngineInstallProgress) => cb(p);
    ipcRenderer.on('tts:engine-install-progress', handler);
    return () => ipcRenderer.removeListener('tts:engine-install-progress', handler);
  },
  // ---- Clone voice ----
  pickAudioFile: (): Promise<{ ok: boolean; filePath?: string }> =>
    ipcRenderer.invoke('tts:pick-audio-file'),
  cloneVoice: (payload: { filePath: string; label: string; gender?: string; region?: string }): Promise<{
    ok: boolean;
    voice?: { id: string; label: string; gender: string; region: string; type: string; warnings?: string[] };
    error?: string;
  }> => ipcRenderer.invoke('tts:clone-voice', payload),
  updateVoice: (voiceId: string, hidden: boolean): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('tts:update-voice', { voiceId, hidden }),
  deleteVoice: (voiceId: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('tts:delete-voice', { voiceId }),
  getSystemStats: (): Promise<{
    appRamMb: number;
    totalRamMb: number;
    usedRamMb: number;
    cpuUserMs: number;
    cpuSystemMs: number;
  }> => ipcRenderer.invoke('system:stats'),
  listTtsModels: (): Promise<string[]> =>
    ipcRenderer.invoke('tts:list-models'),

  // ---- TTS Pre-Generation ----
  pregenStart: (payload: {
    regenerate?: boolean;
    config: { template: string; ttsModel: string; ttsSpeed: number; ttsConditions?: any[] };
  }): Promise<{ ok: boolean; total?: number; pending?: number; error?: string }> =>
    ipcRenderer.invoke('tts:pregen-start', payload),
  pregenPause: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('tts:pregen-pause'),
  pregenResume: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('tts:pregen-resume'),
  pregenCancel: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('tts:pregen-cancel'),
  pregenGetStatus: (): Promise<import('./pregen-queue').PreGenStatus | null> =>
    ipcRenderer.invoke('tts:pregen-status'),
  pregenRequeue: (studentCode: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('tts:pregen-requeue', { studentCode }),
  pregenGetAudio: (studentCode: string): Promise<{ ok: boolean; buffer?: ArrayBuffer; error?: string }> =>
    ipcRenderer.invoke('tts:pregen-get-audio', { studentCode }).then((res) => {
      if (res.ok && res.buffer) {
        return {
          ok: true,
          buffer: res.buffer.buffer.slice(
            res.buffer.byteOffset,
            res.buffer.byteOffset + res.buffer.byteLength,
          ) as ArrayBuffer,
        };
      }
      return { ok: false, error: res.error };
    }),
  onPregenProgress: (cb: (status: import('./pregen-queue').PreGenStatus) => void): (() => void) => {
    const handler = (_e: unknown, status: import('./pregen-queue').PreGenStatus) => cb(status);
    ipcRenderer.on('tts:pregen-progress', handler);
    return () => ipcRenderer.removeListener('tts:pregen-progress', handler);
  },
  // ---- Logs & API updates ----
  getLogs: (): Promise<any[]> => ipcRenderer.invoke('logs:get'),
  retryLog: (logId: string): Promise<void> => ipcRenderer.invoke('logs:retry', logId),
  retryAllFailed: (): Promise<void> => ipcRenderer.invoke('logs:retryAll'),
  exportLogs: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('logs:export'),
  clearLogs: (): Promise<void> => ipcRenderer.invoke('logs:clear'),
  testApiCall: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('logs:testApi'),
  apiRequest: (payload: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  }): Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: any;
  }> => ipcRenderer.invoke('api:request', payload),
  onLogsChanged: (cb: (logs: any[]) => void): (() => void) => {
    const handler = (_e: unknown, logs: any[]) => cb(logs);
    ipcRenderer.on('logs:changed', handler);
    return () => ipcRenderer.removeListener('logs:changed', handler);
  },
};

/**
 * Gọi từ electron/preload.ts (entry preload chính của app) — giữ bridge
 * `window.slide` tách biệt với `window.sky` (kernel), theo chiến lược port
 * ở docs/guides/ports-and-adapters.md §"Trường hợp đặc biệt: Ceremony
 * window.slide": giữ nguyên bridge cũ để 117 call-site trong modules/ceremony
 * (GĐ5) chạy không đổi, bọc dần thành TtsPort/DataPort sau.
 */
export function registerSlideBridge(): void {
  contextBridge.exposeInMainWorld('slide', api);
}
