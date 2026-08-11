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

/** Trạng thái tiến trình local tts-service — chỉ Electron biết được (đọc trực tiếp từ
 * subprocess đã spawn), khác health check HTTP thuần (getTtsService/health) vốn không
 * phân biệt được "đang khởi động" với "không kết nối được". */
export interface TtsProcessStatus {
  status: 'starting' | 'ready' | 'error';
  detail: string;
}

export interface TtsDebugInfo {
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
  /**
   * Loại runtime engine cần. Quyết định engine nào ở chung được một tiến trình:
   * 'onnx-bundled'/'onnx-ext' nhẹ và đổi qua lại gần như tức thì; 'torch' nặng vài GB,
   * chạy trong tiến trình riêng. Optional vì server cũ chưa trả field này.
   */
  runtime_kind?: 'onnx-bundled' | 'onnx-ext' | 'torch' | 'mlx';
  /** Repo nguồn của model (HF) — hiện link "xem nguồn" trong bảng chi tiết engine. */
  install?: {
    model?: { source?: string; repo?: string; total_mb?: number };
    runtime?: { python_version?: string; pip_packages?: string[] };
  } | null;
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
  /**
   * Engine đang được GIỮ ẤM trong RAM của tiến trình đang phục vụ (cũ nhất trước). Đổi
   * sang một trong số này là tức thì — không phải nạp lại model. Optional vì server cũ
   * chưa trả field này.
   */
  loaded?: string[];
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
  /** Log dòng lệnh (pip install...) tích luỹ cho phase 'installing-runtime'. Cắt về N dòng gần
   * nhất phía nguồn (engine-installer.ts's LOG_BUFFER_MAX) để tránh phình payload IPC. */
  logLines?: string[];
  /** % ƯỚC LƯỢNG cho phase 'installing-runtime' — pip không báo tổng dung lượng/tiến độ chính
   * xác khi chạy ngầm (không phải TTY) nên KHÔNG dùng bytesReceived/bytesTotal được. Suy ra từ
   * số dòng "Collecting <tên gói>" xuất hiện trong log so với số gói top-level cần cài
   * (engine-installer.ts's installRuntime) — không chính xác 100% vì còn phụ thuộc kéo theo,
   * nên chặn ở 95 cho tới khi phase chuyển 'done'. */
  installPct?: number;
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

/** 1 entry trong thư viện voice mẫu vendor (resources/voice-ref/{lang}/catalog.json). */
export interface VoiceCatalogEntry {
  id: string;
  name: string;
  lang: string;
  language: string;
  gender: 'female' | 'male';
  age: string;
  accent: string;
  category: string[];
  tagline: string;
  description: string;
  tags: string[];
  file: string;
  clonable: boolean;
  source: 'vendor';
  /** true nếu entry này đã được import vào registry runtime (voice-registry.json). */
  imported: boolean;
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
  onPythonStatus(cb: (payload: TtsProcessStatus) => void): () => void;
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
  getTtsDebug(): Promise<TtsDebugInfo>;
  preSynthesizeTts(texts: string[], modelName: string, speeds: number[]): Promise<{ ok: boolean }>;
  restartTts(): Promise<{ ok: boolean; error?: string }>;
  getTtsModelStatus(): Promise<{ downloaded: boolean }>;
  getTtsStatus(): Promise<TtsProcessStatus>;
  getTtsPreviewUrl(speakerId: string): Promise<string>;
  listVoices(): Promise<
    Array<{
      id: string;
      label: string;
      gender: string;
      region: string;
      type: string;
      hidden: boolean;
      accent?: string;
      category?: string[];
      tags?: string[];
      source_catalog_id?: string;
      /** vd "vi-VN"/"en-US" — chỉ có khi voice import từ catalog vendor (xem
       * voice_registry.py's add_cloned extra); dùng để suy ra Voice.language đúng thay
       * vì lẫn với `region` (nhãn vùng miền tiếng Việt, khác khái niệm ngôn ngữ). */
      source_lang?: string;
    }>
  >;
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
  /** Dung lượng runtime DÙNG CHUNG theo kind (GĐ C) — không thuộc engine cụ thể nào. */
  runtimeDiskUsage(): Promise<Array<{ kind: string; bytes: number; engineIds: string[] }>>;
  /** Thư mục lưu engine/model đã tải (hiện cho người vận hành biết dữ liệu nặng nằm ở đâu). */
  ttsEnginesDir(): Promise<{ path: string }>;
  /** Mở thư mục đó bằng Finder/Explorer. */
  openTtsEnginesDir(): Promise<{ ok: boolean; path?: string; error?: string }>;
  /** Nhả RAM của engine đang giữ ấm, GIỮ NGUYÊN dữ liệu đã tải trên đĩa. */
  engineUnload(engineId: string): Promise<{ ok: boolean; error?: string; freedProcess?: boolean; unloaded?: boolean }>;
  onEngineInstallProgress(cb: (p: EngineInstallProgress) => void): () => void;
  pickAudioFile(): Promise<{ ok: boolean; filePath?: string }>;
  cloneVoice(payload: { filePath: string; label: string; gender?: string; region?: string }): Promise<{
    ok: boolean;
    voice?: { id: string; label: string; gender: string; region: string; type: string; warnings?: string[] };
    error?: string;
  }>;
  updateVoice(voiceId: string, hidden: boolean): Promise<{ ok: boolean; error?: string }>;
  deleteVoice(voiceId: string): Promise<{ ok: boolean; error?: string }>;
  /** Thư viện voice mẫu 'hệ thống' (resources/voice-ref/{lang}/catalog.json) — search/preview
   * trước khi chọn dùng. Không cần bước import riêng: chọn synthesize lần đầu server tự
   * encode ngầm, voice đó tự xuất hiện trong listVoices() từ đó về sau. */
  listVoiceCatalog(lang?: string): Promise<VoiceCatalogEntry[]>;
  /** URL nghe thử audio gốc của 1 catalog entry — dùng khi voice CHƯA từng được chọn
   * dùng (chưa có trong registry nên chưa có /preview qua engine). */
  getCatalogAudioUrl(lang: string, entryId: string): Promise<string>;
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
