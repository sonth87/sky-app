import type { ApiIntegration, AppConfig, Ceremony } from './types.js';
import type { CanonicalRecord } from './layout/canonical.js';

/**
 * Types + interface cho bridge `window.slide` (Electron preload, port từ
 * apps/slide/electron/preload.ts). Tách riêng từ implementation (vẫn ở
 * apps/shell-electron/electron/slide/preload.ts, dùng `satisfies SlideApi`)
 * để modules/ceremony (renderer, không thể import 'electron') có type mà
 * không cần đoán lại — copy nguyên xi type signature của từng method trong
 * `const api = {...}` gốc, không viết lại tay từ đầu.
 */
export type ApiEnvironment = 'prod' | 'test';

export interface SlideMeta {
  config: AppConfig | null;
  ceremony: Ceremony | null;
  records: CanonicalRecord[];
  hasData: boolean;
  apiEnvironment: ApiEnvironment;
}

export interface DisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface TtsConfig {
  infer: {
    temperature: number;
    top_k: number;
    top_p: number;
    repetition_penalty: number;
    max_new_frames: number | null;
  };
  device: { providers: string; threads: number };
  engine: string;
}

export interface TtsEngineInfo {
  id: string;
  label: string;
  description: string;
  implemented: boolean;
  bundled: boolean;
  install_status: 'installed' | 'partial' | 'missing';
  requirements: {
    min_ram_gb?: number;
    recommended_ram_gb?: number;
    needs_gpu?: boolean;
    disk_headroom_factor?: number;
  } | null;
  capabilities: {
    id: string;
    label: string;
    sample_rate: number;
    supports_clone: boolean;
    supports_preset: boolean;
    supports_emotion: boolean;
  } | null;
}

export interface TtsEngines {
  engines: TtsEngineInfo[];
  current: string;
  current_capabilities: TtsEngineInfo['capabilities'] | null;
}

export interface EngineInstallProgress {
  engineId: string;
  phase: 'resolving' | 'downloading' | 'importing' | 'installing-runtime' | 'verifying' | 'done' | 'error' | 'paused';
  filesTotal: number;
  filesDone: number;
  bytesReceived: number;
  bytesTotal: number;
  bytesPerSec: number;
  currentFile: string;
  error?: string;
}

export interface TtsEnginePreflight {
  ok: boolean;
  blocks: string[];
  warnings: string[];
  info: {
    totalRamGb: number;
    freeDiskGb: number | null;
    requiredDiskGb: number;
    engineTotalMb: number;
  };
}

export interface TtsCapabilities {
  providers: Array<{ id: string; label: string; kind: string; available: boolean; works: boolean; supported?: boolean }>;
  cpu_count: number;
  current_providers: string[];
  current_threads: number;
  engine: string;
}

/** Khớp nguyên xi apps/shell-electron/electron/slide/pregen-queue.ts */
export type PreGenStudentStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface PreGenStatus {
  total: number;
  done: number;
  failed: number;
  pending: number;
  suspect: number; // số file done nhưng có quality_flags
  running: boolean;
  paused: boolean;
  configChanged: boolean;
  currentId: string | null;
  records: Record<string, PreGenStudentStatus>;
  quality: Record<string, string[]>; // id -> flags (chỉ file bị flag)
}

export interface SlideApi {
  getMeta(): Promise<SlideMeta>;
  updateConfig(patch: Partial<unknown>): Promise<unknown>;
  getApiEnvironment(): Promise<ApiEnvironment>;
  setApiEnvironment(env: ApiEnvironment): Promise<ApiEnvironment>;
  getApiIntegrations(): Promise<ApiIntegration[]>;
  setApiIntegrations(val: ApiIntegration[]): Promise<ApiIntegration[]>;
  hasDefaultApiIntegrations(): Promise<boolean>;
  resetApiIntegrationsToDefault(): Promise<ApiIntegration[]>;
  submitLogs(): Promise<boolean>;
  listDisplays(): Promise<DisplayInfo[]>;
  moveBackdrop(displayId: number, kiosk: boolean): Promise<{ ok: boolean }>;
  setBackdropFullscreen(enabled: boolean): Promise<{ ok: boolean }>;
  assetUrl(relativePath: string): string;
  isBackdropOpen(): Promise<boolean>;
  isBackdropFullscreen(): Promise<boolean>;
  toggleBackdrop(): Promise<{ open: boolean }>;
  openDevTools(): Promise<void>;
  openBackdropDevTools(): Promise<void>;
  resetData(): Promise<{ ok: boolean; message: string }>;
  resetStudents(): Promise<{ ok: boolean; message: string }>;
  clearScans(): Promise<{ ok: boolean; message: string }>;
  clearCache(): Promise<{ ok: boolean; message: string }>;
  getAppVersion(): Promise<{ version: string }>;
  setAppLanguage(language: 'vi' | 'en'): Promise<void>;
  onMenuAction(cb: (id: string) => void): () => void;
  saveAutoPlay(state: {
    scannedCodes: string[];
    playedCodes: string[];
    currentCode: string | null;
    delaySeconds: number;
  }): Promise<{ ok: boolean }>;
  loadAutoPlay(): Promise<{
    scannedCodes: string[];
    playedCodes: string[];
    currentCode: string | null;
    delaySeconds: number;
  } | null>;
  onPythonStatus(cb: (payload: { status: 'starting' | 'ready' | 'error'; detail: string }) => void): () => void;
  onBackdropState(cb: (payload: { open: boolean; fullscreen: boolean }) => void): () => void;
  speak(
    text: string,
    modelName?: string,
    speed?: number,
    studentCode?: string,
  ): Promise<{ ok: boolean; buffer?: ArrayBuffer; sampleRate?: number; error?: string }>;
  /** Sinh audio KHÔNG cache/log/pregen — dùng bởi tts-studio (app tách biệt Ceremony), không nhận studentCode. */
  synthesizeTts(
    text: string,
    voiceId?: string,
    speed?: number,
  ): Promise<{ ok: boolean; buffer?: ArrayBuffer; sampleRate?: number; error?: string }>;
  warmupTts(): Promise<{ ok: boolean }>;
  getTtsDebug(): Promise<{
    port: number;
    processAlive: boolean;
    processPid: number | null;
    executableUsed: string;
    lastStartupError: string | null;
    lastExitCode: number | null;
    healthOk: boolean | null;
    recentStderr: string[];
    cacheSize: number;
    activityLog: {
      time: string;
      action: string;
      text: string;
      model: string;
      ok: boolean;
      durationMs: number;
      error?: string;
      cacheHit?: boolean;
    }[];
  }>;
  preSynthesizeTts(texts: string[], modelName: string, speeds: number[]): Promise<{ ok: boolean }>;
  restartTts(): Promise<{ ok: boolean; error?: string }>;
  getTtsModelStatus(): Promise<{ downloaded: boolean }>;
  getTtsStatus(): Promise<{ status: 'starting' | 'ready' | 'error'; detail: string }>;
  getTtsPreviewUrl(speakerId: string): Promise<string>;
  listVoices(): Promise<Array<{ id: string; label: string; gender: string; region: string; type: string; hidden: boolean }>>;
  getTtsConfig(): Promise<TtsConfig | null>;
  setTtsConfig(partial: Partial<TtsConfig>): Promise<{ ok: boolean; config?: TtsConfig; error?: string }>;
  getTtsCapabilities(): Promise<TtsCapabilities | null>;
  installAccel(packageName: string): Promise<{ ok: boolean; error?: string; log?: string }>;
  listEngines(): Promise<TtsEngines | null>;
  enginePreflight(engineId: string): Promise<TtsEnginePreflight>;
  engineInstallStart(engineId: string): Promise<{ ok: boolean; error?: string; preflight?: TtsEnginePreflight }>;
  engineInstallPause(engineId: string): Promise<{ ok: boolean }>;
  engineInstallResume(engineId: string): Promise<{ ok: boolean; error?: string }>;
  engineInstallCancel(engineId: string): Promise<{ ok: boolean }>;
  engineImportLocal(engineId: string): Promise<{ ok: boolean; error?: string }>;
  engineVerify(engineId: string): Promise<{ ok: boolean; error?: string; capabilities?: unknown }>;
  engineSwitch(engineId: string): Promise<{ ok: boolean; error?: string }>;
  engineExportLocal(engineId: string): Promise<{ ok: boolean; error?: string; count?: number }>;
  engineDelete(engineId: string): Promise<{ ok: boolean; error?: string }>;
  engineDiskUsage(engineId: string): Promise<{ bytes: number }>;
  onEngineInstallProgress(cb: (p: EngineInstallProgress) => void): () => void;
  pickAudioFile(): Promise<{ ok: boolean; filePath?: string }>;
  cloneVoice(payload: { filePath: string; label: string; gender?: string; region?: string }): Promise<{
    ok: boolean;
    voice?: { id: string; label: string; gender: string; region: string; type: string; warnings?: string[] };
    error?: string;
  }>;
  updateVoice(voiceId: string, hidden: boolean): Promise<{ ok: boolean; error?: string }>;
  deleteVoice(voiceId: string): Promise<{ ok: boolean; error?: string }>;
  getSystemStats(): Promise<{
    appRamMb: number;
    totalRamMb: number;
    usedRamMb: number;
    cpuUserMs: number;
    cpuSystemMs: number;
  }>;
  listTtsModels(): Promise<string[]>;
  pregenStart(payload: {
    regenerate?: boolean;
    config: { template: string; ttsModel: string; ttsSpeed: number; ttsConditions?: unknown[] };
  }): Promise<{ ok: boolean; total?: number; pending?: number; error?: string }>;
  pregenPause(): Promise<{ ok: boolean }>;
  pregenResume(): Promise<{ ok: boolean }>;
  pregenCancel(): Promise<{ ok: boolean }>;
  pregenGetStatus(): Promise<PreGenStatus | null>;
  pregenRequeue(id: string): Promise<{ ok: boolean; error?: string }>;
  pregenGetAudio(id: string): Promise<{ ok: boolean; buffer?: ArrayBuffer; error?: string }>;
  onPregenProgress(cb: (status: PreGenStatus) => void): () => void;
  getLogs(): Promise<unknown[]>;
  retryLog(logId: string): Promise<void>;
  retryAllFailed(): Promise<void>;
  exportLogs(): Promise<{ ok: boolean; message: string }>;
  clearLogs(): Promise<void>;
  testApiCall(): Promise<{ ok: boolean; message: string }>;
  apiRequest(payload: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: unknown;
  }>;
  onLogsChanged(cb: (logs: unknown[]) => void): () => void;
}
