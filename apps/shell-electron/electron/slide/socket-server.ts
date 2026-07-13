import { createServer, type Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { loadEnv } from './env';

// .env đã được nạp sớm ở main.ts's app.whenReady() (GĐ8 OTA — cần
// process.env.RENDERER_MANIFEST_URL sẵn sàng trước createMainWindow()).
// loadEnv() có guard idempotent nên gọi lại ở đây vẫn an toàn (phòng
// trường hợp module này được import độc lập, ví dụ test).
loadEnv();
import type {
  ApiIntegration,
  BackdropAspectRatio,
  ClientToServerEvents,
  FullStatePayload,
  OperatingMode,
  ServerToClientEvents,
  Student,
  StudentStatus,
} from '@sky-app/slide-shared';
import { SocketErrorCode } from '@sky-app/slide-shared';
import { ceremonyStore } from './data/store';
import { sessionStore } from './session-store';
import { apiLogger } from './api-logger';

type IO = SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
export type ApiEnvironment = 'prod' | 'test';

let io: IO | null = null;
let httpServer: HttpServer | null = null;

// Timer cho auto-delay (chờ trước khi lên).
// Giữ tham chiếu để hủy khi có quét/lệnh mới — tránh chồng chéo.
let autoShowTimer: ReturnType<typeof setTimeout> | null = null;

// Timer về màn chờ khi không có SV mới được play trong N giây (cả auto+manual).
// Reset mỗi khi có 1 SV mới lên sân khấu (showStudent) — xem resetIdleTimer().
let idleTimer: ReturnType<typeof setTimeout> | null = null;
// Lưu lại để đồng bộ cho client vừa connect/reload (state:request) — xem resetIdleTimer()/clearIdleTimer().
let idleTimerStartedAt: string | null = null;
let idleTimerTotalSeconds = 0;

// Chống quét trùng/quá nhanh (DESIGN §7.3): bỏ qua cùng MSSV trong cửa sổ ngắn.
const SCAN_DEBOUNCE_MS = 500;
let lastScanAt = 0;
let lastScanMsv: string | null = null;

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { appConfigJsonPath } from './data/paths';

// ... other imports stay the same ...

// Bật/tắt confetti khi chuyển slide (đồng bộ tới Backdrop). Mặc định bật.
let confettiEnabled = true;
// Lặp lại confetti sau mỗi 8 giây. Mặc định bật.
let confettiRepeat = true;
// Chế độ bắn bổ sung nhẹ khi lặp lại. Mặc định tắt.
let confettiBurst = false;
// Số lượng hạt confetti. Mặc định 'high'.
let confettiAmount = 'high';
// Tốc độ rơi confetti. Mặc định 'normal'.
let confettiSpeed = 'normal';
// Kiểu bắn confetti. Mặc định 'standard'.
let confettiType = 'standard';
// Kiểu ribbon. Mặc định 'wave'.
let confettiRibbon = 'wave';
// Preset màu sắc. Mặc định 'gold'.
let confettiColorStyle = 'gold';
// Hình dạng hạt. Mặc định 'star'.
let confettiShape = 'star';
// Thời gian sống/thời gian tồn tại của hạt confetti. Mặc định 'normal'.
let confettiTicks = 'normal';
// Cấu hình nâng cao của Ribbon
let ribbonConfig = {
  waveCount: 6,
  waveLength: 65,
  waveWidth: 2.5,
  waveDistance: 5,
  classicCount: 10,
  classicMin: 28,
  classicMax: 87,
};
// Cấu hình kích cỡ và tỷ lệ hạt confetti
let confettiSizeConfig = {
  scale: 1.0,
  small: 25,
  medium: 60,
  large: 15,
};
// Bật/tắt TTS khi chuyển slide (đồng bộ tới Backdrop). Mặc định bật.
let ttsEnabled = true;
let ttsModel = 'vieneu-NF';
let ttsSpeed = 1.0;
let ttsDelay = 1.5;
let ttsSentencePrefix = '';
let ttsTemplate = '';
let ttsPlayMode: 'realtime' | 'pregen' | 'pregen-fallback' = 'pregen-fallback';
let ttsConditions: any[] = [];
let customVariables: any[] = [];
let ttsVoicePool: string[] = ['vieneu-NF', 'vieneu-NM1'];
// Hội trường đang trao bằng: 0 - Quảng trường, 1 - HTL-GD1, 2 - HT1-GD2, 3 - HT2-GD2
let awardLocationCode = 0;
// Dùng data sample thay vì data thật. Mặc định bật (lần đầu chạy chưa có data thật).
let useSampleData = true;
let layoutOverrides: Record<string, any> = {};
// Tỷ lệ màn hình đang chiếu backdrop. Mặc định 16:9 (giữ hành vi cũ khi chưa cấu hình).
let backdropAspectRatio: BackdropAspectRatio = '16:9';

// Cấu hình API mặc định lấy từ biến môi trường DEFAULT_API_CONFIG (.env, xem .env.example) —
// một mảng JSON đúng format ApiIntegration[] (giống hệt file export/import trong UI), để không
// hardcode secret/URL rải rác trong code. Dùng làm giá trị khởi tạo lần đầu chạy; sau khi người
// dùng chỉnh qua UI thì giá trị lưu trong app-config.json sẽ ghi đè (xem loadAppConfig).
function loadDefaultApiIntegrations(env: ApiEnvironment): ApiIntegration[] {
  const envKey = env === 'test' ? 'DEFAULT_API_CONFIG_TEST' : 'DEFAULT_API_CONFIG_PROD';
  const raw = process.env[envKey] ?? (env === 'prod' ? process.env['DEFAULT_API_CONFIG'] : undefined);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`[SocketServer] Failed to parse ${envKey} env var:`, e);
    return [];
  }
}

let apiEnvironment: ApiEnvironment = 'prod';
let apiIntegrationsByEnv: Record<ApiEnvironment, ApiIntegration[]> = {
  prod: loadDefaultApiIntegrations('prod'),
  test: loadDefaultApiIntegrations('test'),
};

// Callback gọi khi tỷ lệ màn hình backdrop thay đổi — main đăng ký để resize cửa sổ Backdrop (windows.ts).
let onBackdropAspectRatioChange: ((aspectRatio: BackdropAspectRatio) => void) | null = null;
export function setBackdropAspectRatioListener(fn: (aspectRatio: BackdropAspectRatio) => void) {
  onBackdropAspectRatioChange = fn;
}

function loadAppConfig() {
  try {
    const p = appConfigJsonPath();
    if (existsSync(p)) {
      const data = JSON.parse(readFileSync(p, 'utf-8'));
      if (typeof data.confettiEnabled === 'boolean') confettiEnabled = data.confettiEnabled;
      if (typeof data.confettiRepeat === 'boolean') confettiRepeat = data.confettiRepeat;
      if (typeof data.confettiBurst === 'boolean') confettiBurst = data.confettiBurst;
      if (typeof data.confettiAmount === 'string') confettiAmount = data.confettiAmount;
      if (typeof data.confettiSpeed === 'string') confettiSpeed = data.confettiSpeed;
      if (typeof data.confettiType === 'string') confettiType = data.confettiType;
      if (typeof data.confettiRibbon === 'string') confettiRibbon = data.confettiRibbon;
      if (typeof data.confettiColorStyle === 'string') confettiColorStyle = data.confettiColorStyle;
      if (typeof data.confettiShape === 'string') confettiShape = data.confettiShape;
      if (typeof data.confettiTicks === 'string') confettiTicks = data.confettiTicks;
      if (typeof data.ribbonConfig === 'object') ribbonConfig = { ...ribbonConfig, ...data.ribbonConfig };
      if (typeof data.confettiSizeConfig === 'object') confettiSizeConfig = { ...confettiSizeConfig, ...data.confettiSizeConfig };
      if (typeof data.ttsEnabled === 'boolean') ttsEnabled = data.ttsEnabled;
      if (typeof data.ttsModel === 'string') ttsModel = data.ttsModel;
      if (typeof data.ttsSpeed === 'number') ttsSpeed = data.ttsSpeed;
      if (typeof data.ttsDelay === 'number') ttsDelay = data.ttsDelay;
      if (typeof data.ttsSentencePrefix === 'string') ttsSentencePrefix = data.ttsSentencePrefix;
      if (typeof data.ttsTemplate === 'string') ttsTemplate = data.ttsTemplate;
      if (data.ttsPlayMode === 'realtime' || data.ttsPlayMode === 'pregen' || data.ttsPlayMode === 'pregen-fallback') ttsPlayMode = data.ttsPlayMode;
      if (Array.isArray(data.ttsConditions)) ttsConditions = data.ttsConditions;
      if (Array.isArray(data.customVariables)) customVariables = data.customVariables;
      if (Array.isArray(data.ttsVoicePool)) ttsVoicePool = data.ttsVoicePool;
      if (typeof data.useSampleData === 'boolean') useSampleData = data.useSampleData;
      if (typeof data.layoutOverrides === 'object') layoutOverrides = data.layoutOverrides;
      if (data.backdropAspectRatio === '16:9' || data.backdropAspectRatio === '25:9') backdropAspectRatio = data.backdropAspectRatio;
      if (typeof data.awardLocationCode === 'number') awardLocationCode = data.awardLocationCode;
      // Luôn khởi động ở PROD để tránh giữ nhầm môi trường từ phiên trước.
      apiEnvironment = 'prod';
      if (typeof data.apiIntegrationsByEnv === 'object' && data.apiIntegrationsByEnv) {
        const next = { ...apiIntegrationsByEnv };
        if (Array.isArray(data.apiIntegrationsByEnv.prod) && data.apiIntegrationsByEnv.prod.length > 0) {
          next.prod = data.apiIntegrationsByEnv.prod;
        }
        if (Array.isArray(data.apiIntegrationsByEnv.test) && data.apiIntegrationsByEnv.test.length > 0) {
          next.test = data.apiIntegrationsByEnv.test;
        }
        apiIntegrationsByEnv = next;
      } else if (Array.isArray(data.apiIntegrations) && data.apiIntegrations.length > 0) {
        // Tương thích ngược với app-config cũ chỉ có 1 bộ config API.
        apiIntegrationsByEnv = {
          ...apiIntegrationsByEnv,
          prod: data.apiIntegrations,
        };
      }
    }
  } catch (e) {
    console.error('[SocketServer] Failed to load app config:', e);
  }
}

function saveAppConfig() {
  try {
    const data = {
      confettiEnabled,
      confettiRepeat,
      confettiBurst,
      confettiAmount,
      confettiSpeed,
      confettiType,
      confettiRibbon,
      confettiColorStyle,
      confettiShape,
      confettiTicks,
      ribbonConfig,
      confettiSizeConfig,
      ttsEnabled,
      ttsModel,
      ttsSpeed,
      ttsDelay,
      ttsSentencePrefix,
      ttsTemplate,
      ttsPlayMode,
      ttsConditions,
      customVariables,
      ttsVoicePool,
      useSampleData,
      layoutOverrides,
      backdropAspectRatio,
      awardLocationCode,
      apiIntegrationsByEnv,
    };
    writeFileSync(appConfigJsonPath(), JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[SocketServer] Failed to save app config:', e);
  }
}

export function getUseSampleData(): boolean { return useSampleData; }

export function setUseSampleData(val: boolean): void {
  useSampleData = val;
  saveAppConfig();
}

export function getAwardLocationCode(): number { return awardLocationCode; }

export function getBackdropAspectRatio(): BackdropAspectRatio { return backdropAspectRatio; }

export function getApiEnvironment(): ApiEnvironment {
  return apiEnvironment;
}

export function setApiEnvironment(env: ApiEnvironment): void {
  apiEnvironment = env;
  saveAppConfig();
}

export function getApiIntegrations(env: ApiEnvironment = apiEnvironment): ApiIntegration[] {
  return apiIntegrationsByEnv[env] ?? [];
}

export function setApiIntegrations(val: ApiIntegration[], env: ApiEnvironment = apiEnvironment): void {
  apiIntegrationsByEnv = {
    ...apiIntegrationsByEnv,
    [env]: val,
  };
  saveAppConfig();
}

export function hasDefaultApiIntegrations(env: ApiEnvironment = apiEnvironment): boolean {
  return loadDefaultApiIntegrations(env).length > 0;
}

export function resetApiIntegrationsToDefault(env: ApiEnvironment = apiEnvironment): ApiIntegration[] {
  const defaults = loadDefaultApiIntegrations(env);
  apiIntegrationsByEnv = {
    ...apiIntegrationsByEnv,
    [env]: defaults,
  };
  saveAppConfig();
  return apiIntegrationsByEnv[env] ?? [];
}

export function getTtsPregenConfig() {
  return {
    template: ttsTemplate,
    ttsModel: ttsModel,
    ttsSpeed: ttsSpeed,
    ttsConditions: ttsConditions,
    customVariables: customVariables,
  };
}

// Gọi load config lúc bắt đầu
loadAppConfig();

function now(): string {
  return new Date().toISOString();
}

function clearAutoShow() {
  if (autoShowTimer) {
    clearTimeout(autoShowTimer);
    autoShowTimer = null;
  }
}

function clearIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
    idleTimerStartedAt = null;
    idleTimerTotalSeconds = 0;
    io?.emit('event:idleTimer', { active: false, totalSeconds: 0, startedAt: null });
  }
}

/** Đặt lại đếm ngược "về màn chờ nếu không có SV mới" — gọi mỗi khi có SV mới lên sân khấu. */
function resetIdleTimer(msv: string) {
  clearIdleTimer();
  const cfg = ceremonyStore.getConfig();
  if (!cfg?.idle_timeout_enabled) return;
  const secs = cfg.idle_timeout_seconds ?? 0;
  if (secs <= 0) return;
  idleTimerStartedAt = now();
  idleTimerTotalSeconds = secs;
  io?.emit('event:idleTimer', { active: true, totalSeconds: secs, startedAt: idleTimerStartedAt });
  idleTimer = setTimeout(() => {
    // Chỉ về màn chờ nếu vẫn đúng SV này (không bị thay bởi SV khác trong lúc chờ)
    if (sessionStore.get().current_on_stage_msv === msv) {
      clearStage();
    }
  }, secs * 1000);
}

function buildFullState(): FullStatePayload {
  const session = sessionStore.get();
  return {
    session,
    onStage: session.current_on_stage_msv
      ? (ceremonyStore.findByMsv(session.current_on_stage_msv) ?? null)
      : null,
    pending: session.pending_msv
      ? (ceremonyStore.findByMsv(session.pending_msv) ?? null)
      : null,
  };
}

/** Chuyển SV đang on_stage hiện tại → returned, ghi sync_queue. */
function retireOnStage(msv: string) {
  ceremonyStore.patchStudent(msv, { status: 'returned', ts_returned: now() });
  const session = sessionStore.get();
  // Thêm vào sync_queue để (giai đoạn sau) đồng bộ ngược về backend
  const queue = session.sync_queue.includes(msv)
    ? session.sync_queue
    : [...session.sync_queue, msv];
  sessionStore.update({ sync_queue: queue });
}

/** Đưa 1 SV lên backdrop. SV cũ (nếu có) → returned. */
function showStudent(msv: string, source: 'auto' | 'manual', opts?: { silent?: boolean }) {
  if (!io) return;
  const student = ceremonyStore.findByMsv(msv);
  if (!student) {
    io.emit('event:error', {
      code: SocketErrorCode.STUDENT_NOT_FOUND,
      message: `Không tìm thấy MSSV ${msv}`,
    });
    return;
  }

  // Idempotent: quét/Play trùng SV đang on_stage → không làm gì (tránh nhấp nháy).
  const session = sessionStore.get();
  if (session.current_on_stage_msv === msv) {
    return;
  }

  if (student.absent || student.status === 'absent') {
    io.emit('event:error', {
      code: SocketErrorCode.STUDENT_ABSENT,
      message: `Sinh viên ${student.full_name} đã được đánh dấu vắng mặt`,
    });
    // vẫn cho phép override (nếu là lệnh thủ công có chủ đích): tiếp tục hiển thị
  }

  // Lệnh hiển thị mới → hủy mọi timer auto đang chờ
  clearAutoShow();
  clearIdleTimer();

  // SV đang on_stage → returned
  if (session.current_on_stage_msv && session.current_on_stage_msv !== msv) {
    retireOnStage(session.current_on_stage_msv);
  }

  ceremonyStore.patchStudent(msv, {
    status: 'on_stage',
    ts_on_stage: now(),
    src_on_stage: source,
  });

  sessionStore.update({ current_on_stage_msv: msv, pending_msv: null });
  sessionStore.incBroadcast();

  const updated = ceremonyStore.findByMsv(msv) ?? null;
  io.emit('state:onStage', { student: updated });
  io.emit('state:pending', { student: null });

  if (updated) {
    apiLogger.triggerApiCall(updated);
    if (source === 'manual') {
      apiLogger.logPlay(updated);
    }
  }

  // Về màn chờ nếu không có SV mới trong N giây — áp dụng cả auto+manual (mặc định TẮT).
  if (!opts?.silent) {
    resetIdleTimer(msv);
  }
}

function clearStage() {
  if (!io) return;
  clearAutoShow();
  clearIdleTimer();
  const session = sessionStore.get();
  const wasOnStage = session.current_on_stage_msv !== null;
  if (session.current_on_stage_msv) {
    retireOnStage(session.current_on_stage_msv);
  }
  sessionStore.update({ current_on_stage_msv: null });
  io.emit('state:onStage', { student: null });
  apiLogger.logClear();
  if (wasOnStage) {
    apiLogger.triggerPauseApiCall();
  }
}

function setPending(msv: string) {
  if (!io) return;
  const student = ceremonyStore.findByMsv(msv);
  if (!student) {
    io.emit('event:error', {
      code: SocketErrorCode.STUDENT_NOT_FOUND,
      message: `Không tìm thấy MSSV ${msv}`,
    });
    return;
  }
  sessionStore.update({ pending_msv: msv });
  io.emit('state:pending', { student });
}

/** Xử lý 1 lần quét QR (từ HTTP hoặc socket) theo mode hiện tại */
export function handleScan(msv: string): { ok: boolean; student?: Student; code?: string } {
  console.log('[SocketServer] === handleScan START ===');
  try {
    if (msv && msv.includes('|')) {
      const parts = msv.split('|');
      const first = parts.find((p) => p.trim());
      if (first) {
        msv = first.trim();
      }
    }
    console.log('[SocketServer] handleScan called with msv:', msv);
    if (!io) {
      console.log('[SocketServer] IO not initialized');
      return { ok: false, code: SocketErrorCode.INTERNAL };
    }

    // Debounce quét trùng/quá nhanh (DESIGN §7.3)
    const t = Date.now();
    if (msv === lastScanMsv && t - lastScanAt < SCAN_DEBOUNCE_MS) {
      console.log('[SocketServer] Debounce - ignoring duplicate scan');
      return { ok: true, student: ceremonyStore.findByMsv(msv) };
    }
    lastScanAt = t;
    lastScanMsv = msv;

    const student = ceremonyStore.findByMsv(msv);
    if (!student) {
      console.log('[SocketServer] Student not found:', msv);
      io.emit('event:error', {
        code: SocketErrorCode.STUDENT_NOT_FOUND,
        message: `Không tìm thấy MSSV ${msv}`,
      });
      return { ok: false, code: SocketErrorCode.STUDENT_NOT_FOUND };
    }
    console.log('[SocketServer] Found student:', student.full_name);
    console.log('[SocketServer] === About to check on_stage ===');

    // Quét trùng SV đang on_stage → bỏ qua (idempotent), không nhấp nháy
    console.log('[SocketServer] About to get sessionStore...');
    const currentOnStage = sessionStore.get().current_on_stage_msv;
    console.log('[SocketServer] Current on_stage msv:', currentOnStage, 'vs scanned:', msv);
    if (currentOnStage === msv) {
      console.log('[SocketServer] Idempotent - same student on stage, but still logging scan');
      // Vẫn log lần quét để Control app thêm vào danh sách "Đã quét QR"
      const updated = ceremonyStore.findByMsv(msv) ?? student;
      io.emit('event:scanned', { student: updated, ts: now() });
      return { ok: true, student };
    }

    console.log('[SocketServer] Patching student status to called...');
    ceremonyStore.patchStudent(msv, { status: 'called', ts_called: now() });
    console.log('[SocketServer] Student patched. Updating session...');
    sessionStore.update({ last_scan_msv: msv, last_scan_ts: now() });
    console.log('[SocketServer] Session updated.');

    const updated = ceremonyStore.findByMsv(msv)!;
    console.log('[SocketServer] Emitting event:scanned for:', updated.full_name);
    apiLogger.logScan(updated);
    apiLogger.triggerCustomApi('qr_scan', updated).catch((err) => {
      console.error('[SocketServer] Error triggering custom qr_scan API:', err);
    });
    io.emit('event:scanned', { student: updated, ts: now() });

    const mode = sessionStore.get().mode;
    if (mode === 'auto') {
      // Hủy timer auto-show cũ (nếu SV trước chưa kịp lên) — SV mới thay thế
      clearAutoShow();
      const delay = ceremonyStore.getConfig()?.delay_seconds ?? 0;
      if (delay > 0) {
        autoShowTimer = setTimeout(() => showStudent(msv, 'auto'), delay * 1000);
      } else {
        showStudent(msv, 'auto');
      }
    } else {
      setPending(msv);
    }

    return { ok: true, student: updated };
  } catch (err) {
    console.error('[SocketServer] ERROR in handleScan:', err);
    if (io) {
      io.emit('event:error', {
        code: SocketErrorCode.INTERNAL,
        message: `Server error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return { ok: false, code: SocketErrorCode.INTERNAL };
  }
}

/** Tự load SV đầu tiên (theo stt) khi khởi động nếu config.auto_load_first */
export function autoLoadFirstIfConfigured() {
  const cfg = ceremonyStore.getConfig();
  if (!cfg?.auto_load_first) return;
  // Chỉ load khi chưa có SV nào đang on_stage (tránh đè state phục hồi sau crash)
  if (sessionStore.get().current_on_stage_msv) return;
  const first = ceremonyStore.neighborByStt(null, 1);
  if (first) {
    // silent: không auto-hide ngay khi mới mở
    showStudent(first.student_code, 'auto', { silent: true });
  }
}

export function startSocketServer(port: number): Promise<void> {
  console.log('[SocketServer] Starting on port', port);
  const config = ceremonyStore.getConfig();
  if (config?.tts_model) {
    ttsModel = config.tts_model;
  }
  if (config?.tts_speed) {
    ttsSpeed = config.tts_speed;
  }
  if (config?.tts_sentence_prefix) {
    ttsSentencePrefix = config.tts_sentence_prefix;
  }
  return new Promise((resolve, reject) => {
    httpServer = createServer();
    io = new SocketIOServer(httpServer, {
      cors: { origin: '*' },
    });

    io.on('connection', (socket) => {
      console.log('[SocketServer] Client connected:', socket.id);
      // Đồng bộ ngay khi client connect / reload — config trước, state:full sau cùng
      // để khi handleStudent chạy thì tất cả refs (model, prefix...) đã được set
      socket.emit('event:confetti', { enabled: confettiEnabled });
      socket.emit('event:confettiRepeat', { repeat: confettiRepeat });
      socket.emit('event:confettiBurst', { burst: confettiBurst });
      socket.emit('event:confettiAmount', { amount: confettiAmount });
      socket.emit('event:confettiSpeed', { speed: confettiSpeed });
      socket.emit('event:confettiType', { confettiType });
      socket.emit('event:confettiRibbon', { ribbon: confettiRibbon });
      socket.emit('event:confettiColorStyle', { colorStyle: confettiColorStyle });
      socket.emit('event:confettiShape', { shape: confettiShape });
      socket.emit('event:confettiTicks', { ticks: confettiTicks });
      socket.emit('event:ribbonConfig', { config: ribbonConfig });
      socket.emit('event:confettiSizeConfig', { config: confettiSizeConfig });
      socket.emit('event:tts', { enabled: ttsEnabled });
      socket.emit('event:ttsModel', { model: ttsModel });
      socket.emit('event:ttsSpeed', { speed: ttsSpeed });
      socket.emit('event:ttsDelay', { delay: ttsDelay });
      socket.emit('event:ttsSentencePrefix', { prefix: ttsSentencePrefix });
      socket.emit('event:ttsTemplate', { template: ttsTemplate });
      socket.emit('event:ttsPlayMode', { playMode: ttsPlayMode });
      socket.emit('event:ttsConditions', { conditions: ttsConditions });
      socket.emit('event:customVariables', { variables: customVariables });
      socket.emit('event:ttsVoicePool', { voicePool: ttsVoicePool });
      socket.emit('event:layoutOverrides', { overrides: layoutOverrides });
      socket.emit('event:awardLocation', { code: awardLocationCode });
      socket.emit('event:backdropAspectRatio', { aspectRatio: backdropAspectRatio });
      socket.emit('event:idleTimer', {
        active: idleTimer !== null,
        totalSeconds: idleTimerTotalSeconds,
        startedAt: idleTimerStartedAt,
      });

      // Remove all existing listeners to avoid duplicates
      socket.removeAllListeners();

      // Re-register after clear (except built-in events) — config trước, state:full sau
      socket.emit('event:confetti', { enabled: confettiEnabled });
      socket.emit('event:confettiRepeat', { repeat: confettiRepeat });
      socket.emit('event:confettiBurst', { burst: confettiBurst });
      socket.emit('event:confettiAmount', { amount: confettiAmount });
      socket.emit('event:confettiSpeed', { speed: confettiSpeed });
      socket.emit('event:confettiType', { confettiType });
      socket.emit('event:confettiRibbon', { ribbon: confettiRibbon });
      socket.emit('event:confettiColorStyle', { colorStyle: confettiColorStyle });
      socket.emit('event:confettiShape', { shape: confettiShape });
      socket.emit('event:confettiTicks', { ticks: confettiTicks });
      socket.emit('event:ribbonConfig', { config: ribbonConfig });
      socket.emit('event:confettiSizeConfig', { config: confettiSizeConfig });
      socket.emit('event:tts', { enabled: ttsEnabled });
      socket.emit('event:ttsModel', { model: ttsModel });
      socket.emit('event:ttsSpeed', { speed: ttsSpeed });
      socket.emit('event:ttsDelay', { delay: ttsDelay });
      socket.emit('event:ttsSentencePrefix', { prefix: ttsSentencePrefix });
      socket.emit('event:ttsTemplate', { template: ttsTemplate });
      socket.emit('event:ttsPlayMode', { playMode: ttsPlayMode });
      socket.emit('event:ttsConditions', { conditions: ttsConditions });
      socket.emit('event:customVariables', { variables: customVariables });
      socket.emit('event:ttsVoicePool', { voicePool: ttsVoicePool });
      socket.emit('event:layoutOverrides', { overrides: layoutOverrides });
      socket.emit('event:awardLocation', { code: awardLocationCode });
      socket.emit('event:backdropAspectRatio', { aspectRatio: backdropAspectRatio });
      socket.emit('event:idleTimer', {
        active: idleTimer !== null,
        totalSeconds: idleTimerTotalSeconds,
        startedAt: idleTimerStartedAt,
      });
      socket.emit('state:full', buildFullState());

      socket.on('state:request', () => {
        socket.emit('event:confetti', { enabled: confettiEnabled });
        socket.emit('event:confettiRepeat', { repeat: confettiRepeat });
        socket.emit('event:confettiBurst', { burst: confettiBurst });
        socket.emit('event:confettiAmount', { amount: confettiAmount });
        socket.emit('event:confettiSpeed', { speed: confettiSpeed });
        socket.emit('event:confettiType', { confettiType });
        socket.emit('event:confettiRibbon', { ribbon: confettiRibbon });
        socket.emit('event:confettiColorStyle', { colorStyle: confettiColorStyle });
        socket.emit('event:confettiShape', { shape: confettiShape });
        socket.emit('event:confettiTicks', { ticks: confettiTicks });
        socket.emit('event:ribbonConfig', { config: ribbonConfig });
        socket.emit('event:confettiSizeConfig', { config: confettiSizeConfig });
        socket.emit('event:tts', { enabled: ttsEnabled });
        socket.emit('event:ttsModel', { model: ttsModel });
        socket.emit('event:ttsSpeed', { speed: ttsSpeed });
        socket.emit('event:ttsDelay', { delay: ttsDelay });
        socket.emit('event:ttsSentencePrefix', { prefix: ttsSentencePrefix });
        socket.emit('event:ttsTemplate', { template: ttsTemplate });
        socket.emit('event:ttsPlayMode', { playMode: ttsPlayMode });
        socket.emit('event:ttsConditions', { conditions: ttsConditions });
        socket.emit('event:customVariables', { variables: customVariables });
        socket.emit('event:ttsVoicePool', { voicePool: ttsVoicePool });
        socket.emit('event:layoutOverrides', { overrides: layoutOverrides });
        socket.emit('event:awardLocation', { code: awardLocationCode });
        socket.emit('event:backdropAspectRatio', { aspectRatio: backdropAspectRatio });
      socket.emit('event:idleTimer', {
        active: idleTimer !== null,
        totalSeconds: idleTimerTotalSeconds,
        startedAt: idleTimerStartedAt,
      });
        socket.emit('state:full', buildFullState());
      });

      socket.on('cmd:show', ({ student_code, source }) => showStudent(student_code, source));
      socket.on('cmd:clear', () => clearStage());
      socket.on('cmd:preview', ({ student_code }) => setPending(student_code));
      socket.on('cmd:confirmScan', ({ student_code }) => showStudent(student_code, 'manual'));
      socket.on('scan:qr', ({ student_code }) => {
        console.log('[SocketServer] === scan:qr callback START, student_code:', student_code);
        try {
          console.log('[SocketServer] Received scan:qr event:', student_code);
          console.log('[SocketServer] About to call handleScan()...');
          const result = handleScan(student_code);
          console.log('[SocketServer] handleScan result:', result.ok);
        } catch (err) {
          console.error('[SocketServer] ERROR in scan:qr handler:', err);
        }
      });

      socket.on('cmd:next', () => {
        const cur = sessionStore.get().current_on_stage_msv;
        const next = ceremonyStore.neighborByStt(cur, 1);
        if (next) showStudent(next.student_code, 'manual');
      });
      socket.on('cmd:prev', () => {
        const cur = sessionStore.get().current_on_stage_msv;
        const prev = ceremonyStore.neighborByStt(cur, -1);
        if (prev) showStudent(prev.student_code, 'manual');
      });

      socket.on('cmd:setMode', ({ mode }: { mode: OperatingMode }) => {
        // Hủy timer auto-show còn treo từ mode cũ (vd đang chờ delay_seconds ở auto)
        // và reset debounce quét — tránh trạng thái cũ kẹt sang mode mới.
        clearAutoShow();
        lastScanMsv = null;
        lastScanAt = 0;
        sessionStore.setMode(mode);
        io?.emit('event:mode', { mode });
      });

      socket.on('cmd:setAwardLocation', ({ code }) => {
        awardLocationCode = code;
        saveAppConfig();
        io?.emit('event:awardLocation', { code });
        apiLogger.logChangeLocation(code);
      });

      socket.on('cmd:setBackdropAspectRatio', ({ aspectRatio }) => {
        backdropAspectRatio = aspectRatio;
        io?.emit('event:backdropAspectRatio', { aspectRatio });
        saveAppConfig();
        onBackdropAspectRatioChange?.(aspectRatio);
      });

      socket.on('cmd:setStatus', ({ student_code, status }: { student_code: string; status: StudentStatus }) => {
        ceremonyStore.patchStudent(student_code, { status });
        io?.emit('state:full', buildFullState());
      });

      socket.on('cmd:setConfetti', ({ enabled }) => {
        confettiEnabled = enabled;
        io?.emit('event:confetti', { enabled });
        saveAppConfig();
      });

      socket.on('cmd:setConfettiRepeat', ({ repeat }) => {
        confettiRepeat = repeat;
        io?.emit('event:confettiRepeat', { repeat });
        saveAppConfig();
      });

      socket.on('cmd:setConfettiBurst', ({ burst }) => {
        confettiBurst = burst;
        io?.emit('event:confettiBurst', { burst });
        saveAppConfig();
      });

      socket.on('cmd:setConfettiAmount', ({ amount }) => {
        confettiAmount = amount;
        io?.emit('event:confettiAmount', { amount });
        saveAppConfig();
      });

      socket.on('cmd:setConfettiSpeed', ({ speed }) => {
        confettiSpeed = speed;
        io?.emit('event:confettiSpeed', { speed });
        saveAppConfig();
      });

      socket.on('cmd:setConfettiType', ({ confettiType: type }) => {
        confettiType = type;
        io?.emit('event:confettiType', { confettiType: type });
        saveAppConfig();
      });

      socket.on('cmd:setConfettiRibbon', ({ ribbon }) => {
        confettiRibbon = ribbon;
        io?.emit('event:confettiRibbon', { ribbon });
        saveAppConfig();
      });

      socket.on('cmd:setConfettiColorStyle', ({ colorStyle }) => {
        confettiColorStyle = colorStyle;
        io?.emit('event:confettiColorStyle', { colorStyle });
        saveAppConfig();
      });

      socket.on('cmd:setConfettiShape', ({ shape }) => {
        confettiShape = shape;
        io?.emit('event:confettiShape', { shape });
        saveAppConfig();
      });

      socket.on('cmd:setConfettiTicks', ({ ticks }) => {
        confettiTicks = ticks;
        io?.emit('event:confettiTicks', { ticks });
        saveAppConfig();
      });

      socket.on('cmd:setRibbonConfig', ({ config }) => {
        ribbonConfig = { ...ribbonConfig, ...config };
        io?.emit('event:ribbonConfig', { config: ribbonConfig });
        saveAppConfig();
      });

      socket.on('cmd:setConfettiSizeConfig', ({ config }) => {
        confettiSizeConfig = { ...confettiSizeConfig, ...config };
        io?.emit('event:confettiSizeConfig', { config: confettiSizeConfig });
        saveAppConfig();
      });

      socket.on('cmd:setTts', ({ enabled }) => {
        ttsEnabled = enabled;
        io?.emit('event:tts', { enabled });
        saveAppConfig();
      });

      socket.on('cmd:setTtsModel', ({ model }) => {
        ttsModel = model;
        io?.emit('event:ttsModel', { model });
        saveAppConfig();
      });

      socket.on('cmd:setTtsSpeed', ({ speed }) => {
        ttsSpeed = speed;
        io?.emit('event:ttsSpeed', { speed });
        saveAppConfig();
      });

      socket.on('cmd:setTtsDelay', ({ delay }) => {
        ttsDelay = delay;
        io?.emit('event:ttsDelay', { delay });
        saveAppConfig();
      });


      socket.on('cmd:setTtsSentencePrefix', ({ prefix }) => {
        ttsSentencePrefix = prefix;
        io?.emit('event:ttsSentencePrefix', { prefix });
        saveAppConfig();
      });

      socket.on('cmd:setTtsTemplate', ({ template }) => {
        ttsTemplate = template;
        io?.emit('event:ttsTemplate', { template });
        saveAppConfig();
      });

      socket.on('cmd:setTtsPlayMode', ({ playMode }) => {
        ttsPlayMode = playMode;
        io?.emit('event:ttsPlayMode', { playMode });
        saveAppConfig();
      });

      socket.on('cmd:setTtsConditions', ({ conditions }) => {
        ttsConditions = conditions;
        io?.emit('event:ttsConditions', { conditions });
        saveAppConfig();
      });

      socket.on('cmd:setCustomVariables', ({ variables }) => {
        customVariables = variables;
        io?.emit('event:customVariables', { variables });
        saveAppConfig();
      });

      socket.on('cmd:setTtsVoicePool', ({ voicePool }) => {
        ttsVoicePool = voicePool;
        io?.emit('event:ttsVoicePool', { voicePool });
        saveAppConfig();
      });

      socket.on('cmd:setLayoutOverrides', ({ overrides }) => {
        layoutOverrides = overrides;
        io?.emit('event:layoutOverrides', { overrides });
        saveAppConfig();
      });
    });

    httpServer.on('error', reject);
    httpServer.listen(port, () => {
      console.log('[SocketServer] Listening on port', port);
      resolve();
    });
  });
}

export function getIO(): IO | null {
  return io;
}

export function stopSocketServer() {
  clearAutoShow();
  clearIdleTimer();
  io?.close();
  httpServer?.close();
  io = null;
  httpServer = null;
}
