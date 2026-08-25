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
  /**
   * Nhóm model để hiển thị theo mục trong màn Quản lý: sinh giọng nói ('tts'),
   * nhận dạng giọng nói ('stt'), hay mô hình ngôn ngữ ('llm').
   * Optional vì server cũ chưa trả field này — thiếu thì coi như 'tts'.
   */
  category?: 'tts' | 'stt' | 'llm';
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
    /** Engine hỗ trợ chỉnh sampling params (temperature/top_k/...) hay không — vắng mặt ở
     *  server cũ, coi như `false`. Khai kèm `sampling_params` (xem `engine.py`'s
     *  `capabilities()` — nguồn thật của dict này, KHÔNG suy đoán). */
    supports_sampling?: boolean;
    sampling_params?: Record<string, { default: number; min: number; max: number; step: number }>;
    /** `true` = 1 giọng clone nói được nhiều ngôn ngữ (vd Qwen — 10 ngôn ngữ, KHÔNG có tiếng
     *  Việt), khác VieNeu (ngôn ngữ gắn theo bộ preset giọng, không cần chọn tách rời). */
    multilingual?: boolean;
    supported_languages?: string[];
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

/** 1 engine STT đăng ký (Phase 1, xem docs/dev/history/2026-08-14-stt-nen-tang-giai-doan-1.md)
 * — mirror hình dạng `TtsEngineInfo` (cùng field passthrough thô từ JSON của Python) nhưng
 * `capabilities` STT-shaped, KHÔNG tái dùng `TtsEngineInfo` vì `supports_clone`/
 * `supports_preset` sai ngữ nghĩa cho STT. */
export interface SttEngineInfo {
  id: string;
  label: string;
  description: string;
  implemented: boolean;
  bundled: boolean;
  install_status: 'installed' | 'partial' | 'missing';
  runtime_kind?: 'onnx-bundled' | 'onnx-ext' | 'torch' | 'mlx';
  category?: 'tts' | 'stt' | 'llm';
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
    /** `null` = đa ngôn ngữ không giới hạn danh sách cụ thể (vd Whisper ~99 ngôn ngữ). */
    languages: string[] | null;
    supports_language_hint: boolean;
  } | null;
}

export interface SttEngines {
  engines: SttEngineInfo[];
  /** engine_id đang giữ ấm, hoặc `null` nếu chưa engine nào được nạp — bình thường trước
   * lần dùng đầu tiên, khác `TtsEngines.current` (luôn có giá trị fallback). */
  current: string | null;
}

export interface EngineInstallProgress {
  engineId: string;
  /** 'canceled' = người dùng bấm Hủy — khác 'paused' (giữ .part để Tiếp tục): cancel() XOÁ
   * hẳn thư mục engine (model + runtime đã cài, nếu có), không resume được nữa. Trước đây
   * dùng chung nhánh 'paused' cho cả 2 (engine-installer.ts's cancel() chỉ abort() rồi im
   * lặng rmSync) khiến UI không phân biệt được "tạm dừng, bấm Tiếp tục được" với "đã xoá
   * sạch, phải tải lại từ đầu" — bug thật 2026-08-11, xem docs/dev/history. */
  phase: 'resolving' | 'downloading' | 'importing' | 'installing-runtime' | 'verifying' | 'done' | 'error' | 'paused' | 'canceled';
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

/** 1 dòng stdout/stderr thô của tiến trình Python — nguồn cho tab "Nhật ký" cuộn realtime
 *  (tham khảo voicebox's ServerTab/LogsPage.tsx). Phát qua IPC event 'tts:log-line', xem
 *  `broadcastLogLine()` ở python-server.ts. `ts` gán ở PHÍA GỬI (Date.now() lúc nhận được
 *  chunk từ child process) — log gốc của uvicorn/Python không tự có timestamp trong text. */
export interface TtsLogLine {
  tier: 'bundled' | 'ext';
  stream: 'stdout' | 'stderr';
  line: string;
  ts: number;
}

/** 1 dòng nhật ký sinh audio (Phase 3, xem apps/tts-service/server/history_store.py) — shape
 *  snake_case NGUYÊN VĂN từ JSON của Python's GET /history, chưa map sang camelCase (việc đó
 *  thuộc về TtsPort adapter ở packages/platform-electron, xem packages/service-contracts's
 *  HistoryEntry). */
export interface TtsHistoryEntry {
  id: string;
  source: 'ceremony' | 'tts_studio' | 'warmup' | 'pregen' | 'web' | 'unknown';
  text: string;
  voice_id?: string;
  voice_label?: string;
  speed?: number;
  sample_rate?: number;
  duration_ms?: number;
  engine_id?: string;
  quality_score?: number;
  quality_flags?: string[];
  has_audio: boolean;
  error?: string;
  created_at: string;
}

/** Story (Phase 4, xem apps/tts-service/server/stories.py) — shape snake_case NGUYÊN VĂN từ
 *  JSON của Python. Mapping sang camelCase (`Story`/`StoryItem` của service-contracts) thuộc
 *  về platform-electron's adapter, giống TtsHistoryEntry ở trên. */
export interface TtsStory {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface TtsStoryItem {
  id: string;
  story_id: string;
  audio_file: string;
  source_text: string | null;
  voice_label: string | null;
  duration_ms: number;
  start_time_ms: number;
  track: number;
  trim_start_ms: number;
  trim_end_ms: number;
  volume: number;
  created_at: string;
  voice_id: string | null;
  engine_id: string | null;
  can_regenerate: boolean;
  active_version_id: string | null;
}

export interface TtsStoryWithItems extends TtsStory {
  items: TtsStoryItem[];
}

/** 1 bản audio đã lưu của 1 item (xem stories.py's regenerate_item). */
export interface TtsStoryItemVersion {
  id: string;
  story_item_id: string;
  duration_ms: number;
  label: string;
  created_at: string;
}

/** Envelope thống nhất cho mọi kênh `story:*` (xem ipc.ts's `storyFetch` helper) —
 *  `StoryPort` (service-contracts) THROW lỗi, nên adapter unwrap `ok:false` thành `throw`
 *  thay vì để caller tự kiểm `.ok` như các API `{ok,error}` cũ (`deleteVoice`...). `status`
 *  (khi có) cho adapter phân biệt 404 — trả `null` — với lỗi thật (mạng/500) — throw. */
export type StoryIpcResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

/** 1 dòng nhật ký phiên âm (GĐ 3, xem apps/tts-service/server/stt_history_store.py) — shape
 *  snake_case NGUYÊN VĂN từ JSON của Python's GET /stt/history. KHÔNG có field audio (khác
 *  `TtsHistoryEntry`'s `has_audio`) — lịch sử STT chỉ lưu văn bản, không lưu lại audio gốc. */
export interface SttHistoryEntry {
  id: string;
  source: 'speech_to_text' | 'voice_clone' | 'voice_clone_edit' | 'unknown';
  text: string;
  language?: string;
  duration_sec?: number;
  engine_id?: string;
  source_filename?: string;
  error?: string;
  created_at: string;
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
    /** Tham số sampling theo engine, vd `{ "qwen-1.7b": { temperature: 0.3 } }`. Sau khi
     *  khối `infer` global bị lọc theo `sampling_params` mà engine tự khai, đây là đường
     *  DUY NHẤT chỉnh sampling của engine không khai (Qwen). */
    engineOverrides?: Record<string, Record<string, unknown>>,
    /** Chuỗi hiệu ứng hậu kỳ đã resolve từ preset (EffectPresetPort). */
    effectsChain?: unknown[],
  ): Promise<{ ok: boolean; buffer?: ArrayBuffer; sampleRate?: number; historyId?: string; error?: string }>;
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
  /** Bảng hiệu ứng hậu kỳ do service TTS khai (`GET /effects`). Rỗng nếu không hỗ trợ. */
  listEffectTypes(): Promise<Array<{ type: string; label: string; description: string; params: Record<string, { default: number; min: number; max: number; step: number; description: string }> }>>;
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
  /** Dòng stdout/stderr thô realtime — nguồn cho tab "Nhật ký" cuộn liên tục. */
  onTtsLogLine(cb: (entry: TtsLogLine) => void): () => void;
  /** Buffer log gần nhất — gọi lúc mount để nạp lại lịch sử trước khi nhận tiếp qua onTtsLogLine. */
  getTtsLogLines(): Promise<TtsLogLine[]>;
  /** Chọn được NHIỀU file cùng lúc — 1 giọng clone được từ nhiều mẫu (ghép lại cho model
   * nhiều ngữ cảnh hơn khi synthesize, xem audio_dsp.py's combine_voice_samples). */
  pickAudioFile(): Promise<{ ok: boolean; filePaths?: string[] }>;
  cloneVoice(payload: {
    /** Mỗi phần tử là 1 sample của voice mới — phần tử ĐẦU là sample chính. */
    samples: Array<{
      filePath: string;
      /** Bản chép lời của sample này — sample ĐẦU bắt buộc khi engine đang chạy cần nó
       * (Qwen); sample sau tuỳ chọn. */
      refText?: string;
    }>;
    label: string;
    gender?: string;
    region?: string;
  }): Promise<{
    ok: boolean;
    voice?: { id: string; label: string; gender: string; region: string; type: string; warnings?: string[] };
    error?: string;
  }>;
  /** Thêm 1 mẫu audio cho voice clone ĐÃ CÓ. */
  addVoiceSample(voiceId: string, filePath: string, refText?: string): Promise<{
    ok: boolean;
    sample?: { id: string; ref_file: string; ref_text?: string; warnings?: string[] };
    error?: string;
  }>;
  /** Xoá 1 mẫu. Server từ chối (400) nếu đó là mẫu CUỐI CÙNG của voice. */
  deleteVoiceSample(voiceId: string, sampleId: string): Promise<{ ok: boolean; error?: string }>;
  /** Danh sách mẫu của 1 voice clone — dùng khi mở lại giọng để sửa. */
  listVoiceSamples(voiceId: string): Promise<Array<{ id: string; ref_file: string; ref_text?: string }>>;
  /** Đặt/sửa `hidden` và/hoặc `refText`. Truyền `undefined` để không đụng tới field đó.
   * `refText` sửa TRANSCRIPT CỦA SAMPLE ĐẦU TIÊN (xem voice_registry.py's set_ref_text) —
   * dùng `addVoiceSample`/`deleteVoiceSample` để quản lý sample thứ 2 trở đi. */
  updateVoice(voiceId: string, hidden?: boolean, refText?: string): Promise<{ ok: boolean; error?: string }>;
  deleteVoice(voiceId: string): Promise<{ ok: boolean; error?: string }>;
  /** Nhật ký sinh audio (Phase 3) — mọi nguồn (ceremony/tts_studio/warmup/pregen), lọc theo
   *  `source` nếu truyền. `ok:false` khi TTS server chưa sẵn sàng/lỗi mạng — PHẢI phân biệt
   *  với mảng rỗng hợp lệ (chưa từng generate) để adapter renderer quyết định có retry hay
   *  không (xem `platform-electron`'s `listHistory`, `TtsStudioApp.tsx`'s effect load lịch sử). */
  listTtsHistory(opts?: { limit?: number; source?: string }): Promise<
    { ok: true; entries: TtsHistoryEntry[] } | { ok: false; error: string }
  >;
  /** URL http://127.0.0.1:<port>/history/<id>/audio — renderer's <audio src> tự fetch, đúng
   *  pattern getTtsPreviewUrl. 404 nếu entry không có audio (lỗi, hoặc nguồn 'pregen'). */
  getTtsHistoryAudioUrl(id: string): Promise<string>;
  deleteTtsHistoryEntry(id: string): Promise<{ ok: boolean; error?: string }>;
  clearTtsHistory(): Promise<{ ok: boolean; error?: string; count?: number }>;

  // ── Stories (Phase 4 — timeline nhiều track, xem apps/tts-service/server/stories.py) ──
  storyList(): Promise<StoryIpcResult<TtsStory[]>>;
  storyCreate(name: string, description?: string): Promise<StoryIpcResult<TtsStory>>;
  storyGet(storyId: string): Promise<StoryIpcResult<TtsStoryWithItems>>;
  storyUpdate(storyId: string, patch: { name?: string; description?: string }): Promise<StoryIpcResult<TtsStory>>;
  storyDelete(storyId: string): Promise<StoryIpcResult<{ ok: boolean }>>;
  storyAddItem(storyId: string, historyEntryId: string, track?: number): Promise<StoryIpcResult<TtsStoryItem>>;
  storyDeleteItem(storyId: string, itemId: string): Promise<StoryIpcResult<{ ok: boolean }>>;
  storyMoveItem(storyId: string, itemId: string, startTimeMs: number, track: number): Promise<StoryIpcResult<TtsStoryItem>>;
  storyTrimItem(storyId: string, itemId: string, trimStartMs: number, trimEndMs: number): Promise<StoryIpcResult<TtsStoryItem>>;
  storySetItemVolume(storyId: string, itemId: string, volume: number): Promise<StoryIpcResult<TtsStoryItem>>;
  storySplitItem(storyId: string, itemId: string, splitTimeMs: number): Promise<StoryIpcResult<{ left: TtsStoryItem; right: TtsStoryItem }>>;
  storyDuplicateItem(storyId: string, itemId: string): Promise<StoryIpcResult<TtsStoryItem>>;
  storyReorderItems(storyId: string, track: number, itemIds: string[]): Promise<StoryIpcResult<TtsStoryItem[]>>;
  /** URL http://127.0.0.1:<port>/stories/<id>/export-audio — đúng pattern getTtsHistoryAudioUrl. */
  storyExportAudioUrl(storyId: string): Promise<string>;
  /** URL http://127.0.0.1:<port>/stories/<id>/items/<item_id>/audio — audio RIÊNG 1 item. */
  storyItemAudioUrl(storyId: string, itemId: string): Promise<string>;
  storyRegenerateItem(storyId: string, itemId: string): Promise<StoryIpcResult<TtsStoryItem>>;
  storyListItemVersions(storyId: string, itemId: string): Promise<StoryIpcResult<TtsStoryItemVersion[]>>;
  storySetItemVersion(storyId: string, itemId: string, versionId: string): Promise<StoryIpcResult<TtsStoryItem>>;

  // ── STT (Phase 1 — nhận dạng giọng nói, xem
  //    docs/dev/history/2026-08-14-stt-nen-tang-giai-doan-1.md) ────────────────────────
  /** Danh sách engine STT đăng ký + engine đang giữ ấm. Cài đặt/tải model: dùng
   * `preflight`/`installStart` (bộ method TTS ở trên) với cùng engine_id — 1 registry
   * dùng chung cho cả TTS/STT, phân biệt qua `category`. */
  sttListEngines(): Promise<SttEngines | null>;
  /** Đổi engine STT đang dùng — đơn giản hơn TTS (chỉ 1 instance giữ ấm, không LRU). */
  sttEngineSwitch(engineId: string): Promise<{ ok: boolean; error?: string }>;
  /** Phiên âm 1 file audio thành text. `language` rỗng = engine tự nhận diện.
   * `engineId` rỗng = dùng engine đang giữ ấm, hoặc lazy-activate mặc định (whisper-base).
   * `source` gắn nhãn lịch sử (GĐ 3) — xem `SttPort.TranscribeOptions.source`'s docstring
   * (service-contracts), kênh này dùng chung bởi nhiều caller. */
  sttTranscribe(
    filePath: string,
    opts?: { language?: string; engineId?: string; source?: string },
  ): Promise<{ ok: boolean; text?: string; language?: string; durationSec?: number; error?: string }>;
  /** Phiên âm 1 mẫu audio ĐÃ CÓ SẴN của 1 voice clone (file đã nằm trên server, không phải
   * file client đang giữ) — dùng cho nút "Tự động điền transcript" ở panel Sửa mẫu. Tra
   * thẳng theo `voiceId`+`sampleId`, KHÔNG upload lại — xem `SttPort.transcribeVoiceSample`'s
   * docstring (service-contracts) cho lý do tách khỏi `sttTranscribe` ở trên. `source` lịch
   * sử ('voice_clone_edit') gắn CỨNG server-side — không cần field ở đây, chỉ 1 caller. */
  sttTranscribeVoiceSample(
    voiceId: string,
    sampleId: string,
    opts?: { language?: string; engineId?: string },
  ): Promise<{ ok: boolean; text?: string; language?: string; durationSec?: number; error?: string }>;
  /** Lịch sử phiên âm (GĐ 3) — lọc theo `source` để mỗi UI chỉ thấy đúng lịch sử của mình. */
  sttListHistory(opts?: { limit?: number; source?: string }): Promise<SttHistoryEntry[]>;
  sttDeleteHistoryEntry(id: string): Promise<{ ok: boolean; error?: string }>;
  sttClearHistory(): Promise<{ ok: boolean; error?: string; count?: number }>;
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
  /** `buffer` là file WAV đầy đủ (44 byte header + PCM). `sampleRate` đọc từ header đó —
   * dùng nó khi phát PCM thô sau khi cắt header, đừng giả định 48000: mỗi engine xuất ở
   * tần số gốc của nó (Qwen 24kHz, VieNeu/MOSS 48kHz). */
  pregenGetAudio(id: string): Promise<{ ok: boolean; buffer?: ArrayBuffer; sampleRate?: number; error?: string }>;
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
