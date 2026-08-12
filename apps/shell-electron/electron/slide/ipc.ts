import { ipcMain, dialog, app, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, readdirSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, basename } from 'node:path';
import { ceremonyStore } from './data/store';
import { ceremonyDataDir, autoPlayJsonPath, piperBinPath, piperModelPath, ttsPregenWavPath, ttsPregenDir, ttsPregenManifestPath, vieneuDir } from './data/paths';
import { runVieneu, warmupVieneu } from './vieneu-tts';
import { synthesizeTtsStudio } from './tts-studio';
import { getTtsDebugInfo, getPythonStatus, getPythonPort, stopPythonServer, startPythonServer, getPythonPath } from './python-server';
import { PreGenQueue } from './pregen-queue';
import type { PreGenStatus, ManifestEntry } from './pregen-queue';
import {
  closeBackdropWindow,
  getBackdropWindow,
  getMainWindow,
  isBackdropOpen,
  listDisplays,
  moveBackdropToDisplay,
  openBackdropWindow,
  setBackdropFullscreen,
} from './windows';
import { getIO, getTtsPregenConfig, getApiEnvironment, setApiEnvironment, getApiIntegrations, setApiIntegrations, hasDefaultApiIntegrations, resetApiIntegrationsToDefault, getBackdropAspectRatio } from './socket-server';
import { sessionStore } from './session-store';
import { apiLogger } from './api-logger';
import { setAppMenu, refreshAppMenu, type MenuLanguage } from './menu';
import { readCurrentState as readCurrentRendererState, getPendingUpdateInfo } from './renderer-updater';
import { getCurrentActiveEvent } from '@sky-app/app-db/node';

/** Báo cho Control biết trạng thái Backdrop (mở/đóng) đã thay đổi */
export function notifyBackdropState() {
  const open = isBackdropOpen();
  const fullscreen = open ? (getBackdropWindow()?.isKiosk() || getBackdropWindow()?.isFullScreen() || false) : false;
  getMainWindow()?.webContents.send('backdrop:state', { open, fullscreen });
}

/**
 * Tần số lấy mẫu đọc từ header của 1 file WAV chuẩn (PCM 44 byte): UInt32LE tại offset 24.
 *
 * Cần vì file WAV đã cache trên đĩa có thể do BẤT KỲ engine nào sinh ra ở lần chạy trước —
 * Qwen xuất 24kHz, VieNeu/MOSS 48kHz. Đọc từ chính file là cách duy nhất luôn đúng, kể cả
 * với file đã tồn tại từ bản app cũ (trước khi manifest ghi thêm tần số).
 *
 * Trả 48000 nếu buffer quá ngắn hoặc giá trị đọc được vô lý — mọi file sinh trước 2026-08-11
 * đều là 48kHz nên đó là phỏng đoán an toàn nhất.
 */
function readWavSampleRate(wav: Buffer): number {
  if (wav.length < 28) return 48000;
  const sr = wav.readUInt32LE(24);
  return sr >= 8000 && sr <= 192000 ? sr : 48000;
}

function runPiper(text: string, modelName?: string, speed?: number): Promise<{ ok: boolean; buffer?: Buffer; error?: string }> {
  return new Promise((resolve) => {
    const binPath = piperBinPath();
    const config = ceremonyStore.getConfig();
    let modelPath = piperModelPath(modelName || config?.tts_model);

    if (!existsSync(binPath)) {
      resolve({ ok: false, error: `Không tìm thấy piper binary: ${binPath}` });
      return;
    }
    if (!existsSync(modelPath)) {
      console.warn(`[Piper] Không tìm thấy model: ${modelPath}. Sử dụng model mặc định.`);
      modelPath = piperModelPath('vi_VN-nu-tre.onnx');
      if (!existsSync(modelPath)) {
        modelPath = piperModelPath('vi_VN-vais1000-medium.onnx');
      }
    }
    if (!existsSync(modelPath)) {
      resolve({ ok: false, error: `Không tìm thấy bất kỳ model nào tại: ${modelPath}` });
      return;
    }

    // Trên macOS/Linux, đảm bảo file binary có quyền thực thi
    if (process.platform !== 'win32') {
      try {
        chmodSync(binPath, 0o755);
      } catch (err) {
        console.error('[Piper] Lỗi cấp quyền thực thi:', err);
      }
    }

    const ttsSpeed = speed || config?.tts_speed || 1.0;
    const lengthScale = String(1.0 / ttsSpeed);

    const chunks: Buffer[] = [];
    const proc = spawn(binPath, ['--model', modelPath, '--length_scale', lengthScale, '--output_raw'], {
      windowsHide: true,
    });

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on('data', (data) => {
      console.log('[Piper stderr]', data.toString().trim());
    });

    proc.on('close', (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve({ ok: true, buffer: Buffer.concat(chunks) });
      } else {
        resolve({ ok: false, error: `piper exited with code ${code}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    proc.stdin.write(text, 'utf-8');
    proc.stdin.end();
  });
}

/**
 * IPC channels giữa renderer (Control) và main.
 * Dùng cho thao tác cần quyền hệ thống: sync dữ liệu, chọn màn hình.
 */
export function registerIpcHandlers() {
  // Broadcast full state để Control/Backdrop cập nhật sau khi dữ liệu đổi.
  function broadcastFullState() {
    const session = sessionStore.get();
    const toData = (id: string | null) => {
      if (!id) return null;
      const record = ceremonyStore.findById(id);
      if (!record) return null;
      return { record, runtimeState: ceremonyStore.getRuntimeState(record.id) };
    };
    getIO()?.emit('state:full', {
      session,
      onStage: toData(session.current_on_stage_id),
      pending: toData(session.pending_id),
    });
  }

  // Cấu hình API tích hợp
  ipcMain.handle('config:getApiEnvironment', () => getApiEnvironment());
  ipcMain.handle('config:setApiEnvironment', (_e, env) => {
    setApiEnvironment(env);
    return getApiEnvironment();
  });
  ipcMain.handle('config:getApiIntegrations', () => getApiIntegrations());
  ipcMain.handle('config:setApiIntegrations', (_e, val) => {
    setApiIntegrations(val);
    return getApiIntegrations();
  });
  ipcMain.handle('config:hasDefaultApiIntegrations', () => hasDefaultApiIntegrations());
  ipcMain.handle('config:resetApiIntegrationsToDefault', () => resetApiIntegrationsToDefault());
  ipcMain.handle('logs:submit', async () => {
    return apiLogger.triggerCustomApi('submit_log', null);
  });

  // Lấy thông tin meta để renderer hiển thị (cổng socket, ceremony, danh sách người tham dự)
  ipcMain.handle('data:meta', () => ({
    config: ceremonyStore.getConfig(),
    ceremony: ceremonyStore.getCeremony(),
    records: ceremonyStore.getRecords(),
    hasData: ceremonyStore.hasData(),
    apiEnvironment: getApiEnvironment(),
  }));

  ipcMain.handle('config:update', (_e, patch: Partial<any>) => {
    ceremonyStore.updateConfig(patch);
    return ceremonyStore.getConfig();
  });

  // Màn hình
  ipcMain.handle('display:list', () => listDisplays());
  ipcMain.handle('display:move', (_e, payload: { displayId: number; kiosk: boolean }) => {
    moveBackdropToDisplay(payload.displayId, payload.kiosk);
    return { ok: true };
  });
  ipcMain.handle('display:fullscreen', (_e, payload: { enabled: boolean }) => {
    setBackdropFullscreen(payload.enabled);
    return { ok: true };
  });

  // Mở DevTools của Control window
  ipcMain.handle('debug:openDevTools', () => {
    getMainWindow()?.webContents.openDevTools();
  });

  // Mở DevTools của Backdrop window
  ipcMain.handle('debug:openBackdropDevTools', () => {
    getBackdropWindow()?.webContents.openDevTools();
  });

  // Bật/tắt cửa sổ Backdrop (phần hiển thị trên màn hình lớn)
  ipcMain.handle('backdrop:isOpen', () => isBackdropOpen());
  ipcMain.handle('backdrop:isFullscreen', () => {
    const win = getBackdropWindow();
    return win ? (win.isKiosk() || win.isFullScreen()) : false;
  });
  ipcMain.handle('backdrop:toggle', () => {
    if (isBackdropOpen()) {
      closeBackdropWindow();
    } else {
      const kiosk = ceremonyStore.getConfig()?.kiosk_mode ?? false;
      openBackdropWindow({ kiosk, aspectRatio: getBackdropAspectRatio() });
    }
    notifyBackdropState();
    apiLogger.triggerCustomApi('backdrop_toggle', null).catch((err) => {
      console.error('[Ipc] Error triggering custom backdrop_toggle API:', err);
    });
    return { open: isBackdropOpen() };
  });

  // Reset dữ liệu (xóa toàn bộ ceremony-data)
  ipcMain.handle('data:reset', async () => {
    try {
      const dataDir = ceremonyDataDir();
      rmSync(dataDir, { recursive: true, force: true });
      return { ok: true, message: 'Dữ liệu đã được xóa. Vui lòng khởi động lại app.' };
    } catch (err) {
      return { ok: false, message: `Lỗi xóa dữ liệu: ${err}` };
    }
  });

  // Xóa dữ liệu sinh viên (reset ceremony data nhưng giữ config, không cần khởi động lại app)
  ipcMain.handle('data:resetStudents', async () => {
    try {
      ceremonyStore.clearRecords();
      sessionStore.clear();
      getIO()?.emit('state:full', {
        session: sessionStore.get(),
        onStage: null,
        pending: null,
      });
      return { ok: true, message: 'Dữ liệu sinh viên đã được xóa.' };
    } catch (err) {
      return { ok: false, message: `Lỗi xóa dữ liệu sinh viên: ${err}` };
    }
  });

  // Xóa dữ liệu quét (clear session data)
  ipcMain.handle('data:clearScans', async () => {
    try {
      sessionStore.clear();
      // Broadcast state update
      getIO()?.emit('state:full', {
        session: sessionStore.get(),
        onStage: null,
        pending: null,
      });
      return { ok: true, message: 'Dữ liệu quét đã được xóa.' };
    } catch (err) {
      return { ok: false, message: `Lỗi xóa dữ liệu quét: ${err}` };
    }
  });

  // Lấy version app
  ipcMain.handle('app:version', () => {
    return { version: app.getVersion() };
  });

  // GĐ8 OTA (Loại 1a) — bản renderer đang chạy + bản mới hơn (nếu vừa tải
  // xong trong phiên này) đang chờ áp dụng ở lần mở app kế tiếp.
  ipcMain.handle('app:rendererUpdateStatus', () => {
    const pending = getPendingUpdateInfo();
    return {
      runningVersion: readCurrentRendererState()?.version ?? 'bundled',
      pendingVersion: pending?.bundleVersion ?? null,
      pendingReleaseNotes: pending?.releaseNotes ?? null,
    };
  });

  // Renderer báo đổi ngôn ngữ → rebuild native menu theo ngôn ngữ mới
  ipcMain.handle('app:setLanguage', (_e, language: MenuLanguage) => {
    setAppMenu(language);
  });

  // Thống kê tài nguyên hệ thống (RAM/CPU của process Electron)
  ipcMain.handle('system:stats', async () => {
    const mem = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    // Tổng RAM hệ thống
    const os = await import('node:os');
    const totalRam = os.totalmem();
    const freeRam = os.freemem();
    return {
      // RAM app (RSS = tổng bộ nhớ process đang giữ)
      appRamMb: Math.round(mem.rss / 1024 / 1024),
      totalRamMb: Math.round(totalRam / 1024 / 1024),
      usedRamMb: Math.round((totalRam - freeRam) / 1024 / 1024),
      // CPU microseconds kể từ lần gọi trước — dùng để tính % xấp xỉ
      cpuUserMs: Math.round(cpuUsage.user / 1000),
      cpuSystemMs: Math.round(cpuUsage.system / 1000),
    };
  });

  // Lưu trạng thái autoplay (scannedCodes + playedCodes + currentCode + delaySeconds) để khôi phục sau restart
  ipcMain.handle('autoplay:save', (_e, state: {
    scannedCodes: string[];
    playedCodes: string[];
    currentCode: string | null;
    delaySeconds: number;
  }) => {
    try {
      mkdirSync(ceremonyDataDir(), { recursive: true });
      writeFileSync(autoPlayJsonPath(), JSON.stringify(state, null, 2), 'utf-8');
      return { ok: true };
    } catch (err) {
      return { ok: false, message: String(err) };
    }
  });

  // Đọc trạng thái autoplay từ disk
  ipcMain.handle('autoplay:load', () => {
    try {
      const p = autoPlayJsonPath();
      if (!existsSync(p)) return null;
      return JSON.parse(readFileSync(p, 'utf-8'));
    } catch {
      return null;
    }
  });

  // Clear cache (localStorage, sessionStorage, IndexedDB, service worker cache)
  ipcMain.handle('data:clearCache', async () => {
    try {
      const win = getMainWindow();
      if (win) {
        await win.webContents.session.clearCache();
        await win.webContents.session.clearStorageData({
          storages: ['localstorage', 'indexdb', 'cachestorage'],
        });
      }
      const backdropWin = getBackdropWindow();
      if (backdropWin) {
        await backdropWin.webContents.session.clearCache();
        await backdropWin.webContents.session.clearStorageData({
          storages: ['localstorage', 'indexdb', 'cachestorage'],
        });
      }
      return { ok: true, message: 'Cache đã được xóa.' };
    } catch (err) {
      return { ok: false, message: `Lỗi xóa cache: ${err}` };
    }
  });

  // TTS audio cache: key = `${model}|${text}|${speed}` → kết quả synthesize
  const ttsCache = new Map<string, { ok: boolean; buffer?: Buffer; sampleRate?: number; error?: string }>();

  // Activity log: track từng lần speak/presynth để debug
  type TtsLogEntry = {
    time: string; action: 'speak' | 'presynth' | 'warmup';
    text: string; model: string; ok: boolean; durationMs: number; error?: string; cacheHit?: boolean;
  };
  const ttsActivityLog: TtsLogEntry[] = [];
  function pushTtsLog(entry: TtsLogEntry) {
    ttsActivityLog.push(entry);
    if (ttsActivityLog.length > 500) ttsActivityLog.shift();
  }

  function ttsKey(text: string, model: string, speed: number) {
    return `${model}|${text}|${speed.toFixed(2)}`;
  }

  // Pre-synthesize một text, lưu vào cache để gọi speak() sẽ trả về ngay
  async function preSynthesizeTts(text: string, model: string, speed: number) {
    const key = ttsKey(text, model, speed);
    if (ttsCache.has(key)) return;
    const t0 = Date.now();
    try {
      let result;
      if (model.startsWith('vieneu-')) {
        result = await runVieneu(text.trim(), model.replace('vieneu-', ''), speed);
      } else {
        result = await runPiper(text.trim(), model, speed);
      }
      pushTtsLog({ time: new Date().toLocaleTimeString('vi-VN'), action: 'presynth', text, model, ok: result.ok, durationMs: Date.now() - t0, error: result.error });
      if (result.ok) ttsCache.set(key, result);
    } catch (err) {
      pushTtsLog({ time: new Date().toLocaleTimeString('vi-VN'), action: 'presynth', text, model, ok: false, durationMs: Date.now() - t0, error: String(err) });
    }
  }

  // Phát TTS: nhận text, trả về PCM buffer
  // modelName bắt đầu bằng 'vieneu-' → dùng VieNeu-TTS ONNX engine (48kHz)
  // modelName khác (vd 'vi_VN-vais1000-medium.onnx') → dùng Piper binary (22050Hz)
  ipcMain.handle('tts:speak', async (_e, { text, modelName, speed, studentCode }: {
    text: string; modelName?: string; speed?: number; studentCode?: string;
  }) => {
    if (!text?.trim()) return { ok: false, error: 'Empty text' };
    const model = modelName || 'vieneu-NF';
    const spd = speed ?? 1.0;
    const key = ttsKey(text.trim(), model, spd);
    const t0 = Date.now();

    // 1. Check WAV file cache trên disk (pregen hoặc realtime đã lưu trước đó)
    if (studentCode) {
      const batchId = getPregenBatchId();
      const wavPath = ttsPregenWavPath(batchId, studentCode);
      const manifestPath = ttsPregenManifestPath(batchId);
      if (existsSync(wavPath) && existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
          const entry: ManifestEntry = manifest?.students?.[studentCode];
          if (entry?.status === 'done') {
            const isPregen = entry.type === 'pregen';
            const isRealtimeMatch = entry.type === 'realtime'
              && entry.text === text.trim()
              && entry.voice === model
              && Math.abs((entry.speed ?? 1) - spd) < 0.001;

            if (isPregen || isRealtimeMatch) {
              const wav = readFileSync(wavPath);
              // Trả về PCM (bỏ WAV header 44 bytes)
              const pcm = wav.slice(44);
              // Đọc tần số từ CHÍNH header của file, không giả định 48000: file cache có
              // thể do engine khác sinh ra (Qwen 24kHz) ở lần chạy trước. Đọc từ file là
              // cách duy nhất luôn đúng, kể cả với file đã nằm sẵn trên đĩa từ bản cũ.
              const sampleRate = readWavSampleRate(wav);
              pushTtsLog({ time: new Date().toLocaleTimeString('vi-VN'), action: 'speak', text, model, ok: true, durationMs: Date.now() - t0, cacheHit: true });
              return { ok: true, buffer: pcm, sampleRate };
            }
          }
        } catch { /* manifest corrupt → fall through */ }
      }
    }

    // 2. Check in-memory cache (pre-synthesize)
    const cached = ttsCache.get(key);
    if (cached) {
      ttsCache.delete(key);
      pushTtsLog({ time: new Date().toLocaleTimeString('vi-VN'), action: 'speak', text, model, ok: true, durationMs: Date.now() - t0, cacheHit: true });
      // Lưu xuống disk nếu có studentCode
      if (studentCode && cached.buffer) {
        _saveRealtimeWav(studentCode, text.trim(), model, spd, cached.buffer, undefined, cached.sampleRate);
      }
      return cached;
    }

    // 3. Gen mới
    let result;
    if (model.startsWith('vieneu-')) {
      const speakerId = model.replace('vieneu-', '');
      result = await runVieneu(text.trim(), speakerId, spd);
    } else {
      result = await runPiper(text.trim(), model, speed);
    }
    pushTtsLog({ time: new Date().toLocaleTimeString('vi-VN'), action: 'speak', text, model, ok: result.ok, durationMs: Date.now() - t0, cacheHit: false, error: result.error });

    // Lưu WAV + metadata realtime xuống disk
    if (result.ok && result.buffer && studentCode) {
      // quality_* và sampleRate chỉ có ở runVieneu (VieNeu); runPiper không trả — bỏ qua
      // an toàn. runPiper luôn xuất 48kHz nên mặc định của _saveRealtimeWav là đúng cho nó.
      const q = result as { quality_score?: number; quality_flags?: string[]; sampleRate?: number };
      _saveRealtimeWav(studentCode, text.trim(), model, spd, result.buffer, {
        quality_score: q.quality_score,
        quality_flags: q.quality_flags,
      }, q.sampleRate);
    }

    return result;
  });

  // Bảng hiệu ứng hậu kỳ do service TTS khai. Renderer KHÔNG fetch thẳng port Python
  // (port động, và quy tắc Ports & Adapters của repo cấm gọi mạng trực tiếp từ renderer).
  ipcMain.handle('tts:list-effect-types', async () => {
    const port = getPythonPort();
    if (!port) return [];
    try {
      const res = await fetch(`http://127.0.0.1:${port}/effects`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      const data = (await res.json()) as { available?: boolean; effects?: unknown[] };
      // `available: false` = service chạy nhưng thiếu pedalboard → không có hiệu ứng nào.
      return data.available ? (data.effects ?? []) : [];
    } catch {
      return [];
    }
  });

  // ── TTS Studio (app riêng, gọi thẳng /synthesize, không cache/log/pregen) ────
  // Tách biệt hoàn toàn khỏi hệ tts:* của Ceremony ở trên.
  ipcMain.handle('tts-studio:synthesize', async (_e, { text, voiceId, speed, effectsChain, engine_overrides }: {
    text: string; voiceId?: string; speed?: number; effectsChain?: unknown[];
    engine_overrides?: Record<string, Record<string, unknown>>;
  }) => {
    if (!text?.trim()) return { ok: false, error: 'Empty text' };
    // 'NF' (giọng placeholder cũ) đã bị xoá khỏi voice-registry.json 2026-08-04 — Giang
    // (clone-d0f05071) là giọng mặc định mới khi voiceId trống.
    return synthesizeTtsStudio(text.trim(), voiceId || 'clone-d0f05071', speed ?? 1.0, effectsChain, engine_overrides);
  });

  function _saveRealtimeWav(
    studentCode: string,
    text: string,
    voice: string,
    speed: number,
    pcm: Buffer,
    quality?: { quality_score?: number; quality_flags?: string[] },
    // Tần số thật của PCM, do server báo qua X-Sample-Rate. Mỗi engine xuất ở tần số gốc
    // của nó (Qwen 24kHz, VieNeu/MOSS 48kHz) — ghi sai vào WAV header thì file phát
    // nhanh/chậm gấp đôi mà không có lỗi nào, vì dữ liệu PCM vẫn đúng.
    sampleRateHz = 48000,
  ) {
    try {
      const batchId = getPregenBatchId();
      const wavPath = ttsPregenWavPath(batchId, studentCode);
      const manifestPath = ttsPregenManifestPath(batchId);

      // Build WAV header
      const sampleRate = sampleRateHz;
      const header = Buffer.alloc(44);
      header.write('RIFF', 0, 'ascii');
      header.writeUInt32LE(36 + pcm.byteLength, 4);
      header.write('WAVE', 8, 'ascii');
      header.write('fmt ', 12, 'ascii');
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(1, 22);
      header.writeUInt32LE(sampleRate, 24);
      header.writeUInt32LE(sampleRate * 2, 28);
      header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34);
      header.write('data', 36, 'ascii');
      header.writeUInt32LE(pcm.byteLength, 40);
      mkdirSync(ttsPregenDir(batchId), { recursive: true });
      writeFileSync(wavPath, Buffer.concat([header, pcm]));

      // Update manifest
      let manifest: any = { batch_id: batchId, config_hash: '', students: {} };
      if (existsSync(manifestPath)) {
        try { manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')); } catch { /* ignore */ }
      }
      manifest.students ??= {};
      manifest.students[studentCode] = {
        status: 'done',
        type: 'realtime',
        text,
        voice,
        speed,
        duration_ms: Math.round((pcm.byteLength / 2 / sampleRate) * 1000),
        generated_at: new Date().toISOString(),
        ...(quality?.quality_score !== undefined && { quality_score: quality.quality_score }),
        ...(quality?.quality_flags !== undefined && { quality_flags: quality.quality_flags }),
      };
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[tts:speak] Failed to save realtime WAV:', err);
    }
  }

  // Pre-synthesize audio khi sinh viên được đưa lên stage (trước khi Backdrop gọi speak)
  ipcMain.handle('tts:presynthesize', async (_e, { texts, modelName, speeds }: { texts: string[]; modelName: string; speeds: number[] }) => {
    for (let i = 0; i < texts.length; i++) {
      preSynthesizeTts(texts[i], modelName, speeds[i] ?? 1.0);
    }
    return { ok: true };
  });

  // Pre-warm: synthesize text ngắn để VieNeu load model vào RAM (lần đầu mới chậm)
  ipcMain.handle('tts:warmup', async () => {
    const config = ceremonyStore.getConfig();
    const model = config?.tts_model || 'vieneu-NF';
    if (model.startsWith('vieneu-')) {
      const speakerId = model.replace('vieneu-', '');
      await warmupVieneu(speakerId);
    } else {
      const result = await runPiper('xin chào', model, config?.tts_speed);
      if (!result.ok) {
        getMainWindow()?.webContents.send('python:status', { status: 'error', detail: `Warmup Piper thất bại: ${result.error ?? 'unknown error'}` });
      }
    }
    return { ok: true };
  });

  ipcMain.handle('tts:debug', async () => {
    const info = await getTtsDebugInfo();
    return { ...info, cacheSize: ttsCache.size, activityLog: [...ttsActivityLog].reverse() };
  });

  // Restart Python/VieNeu TTS server
  ipcMain.handle('tts:restart', async () => {
    try {
      await stopPythonServer();
      await startPythonServer(vieneuDir());
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Trả về trạng thái hiện tại của TTS engine (để renderer poll khi vừa mount)
  ipcMain.handle('tts:get-status', () => {
    return getPythonStatus();
  });

  // Trả về URL preview WAV mẫu bundled qua Python server
  ipcMain.handle('tts:preview-url', (_e, { speakerId }: { speakerId: string }) => {
    const id = speakerId.replace(/^vieneu-/, '');
    return `http://127.0.0.1:${getPythonPort()}/preview/${id}`;
  });

  // Lấy danh sách voices từ TTS server (thay thế VOICE_CATALOG hardcode)
  ipcMain.handle('tts:list-voices', async () => {
    const port = getPythonPort();
    if (!port) return [];
    try {
      const res = await fetch(`http://127.0.0.1:${port}/voices`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  });

  // URL nghe thử audio gốc của 1 catalog entry — tương tự tts:preview-url, không fetch
  // (chỉ build URL cho <audio> src trỏ thẳng vào python server local).
  ipcMain.handle('tts:catalog-audio-url', (_e, { lang, entryId }: { lang: string; entryId: string }) => {
    return `http://127.0.0.1:${getPythonPort()}/voices/catalog/${encodeURIComponent(lang)}/${encodeURIComponent(entryId)}/audio`;
  });

  // Thư viện voice mẫu 'hệ thống' (resources/voice-ref/{lang}/catalog.json) — khác /voices
  // (registry runtime): danh sách để search/preview/chọn. Không cần bước import riêng:
  // chọn 1 voice ở đây rồi synthesize là server tự encode ngầm (xem main.py's
  // _ensure_voice_ready), voice đó tự xuất hiện qua tts:list-voices từ đó về sau.
  ipcMain.handle('tts:list-voice-catalog', async (_e, lang?: string) => {
    const port = getPythonPort();
    if (!port) return [];
    try {
      const url = lang
        ? `http://127.0.0.1:${port}/voices/catalog?lang=${encodeURIComponent(lang)}`
        : `http://127.0.0.1:${port}/voices/catalog`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  });

  // ── Advanced config (temperature/top_k/... + device + engine) ────────────────
  ipcMain.handle('tts:get-config', async () => {
    const port = getPythonPort();
    if (!port) return null;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/config`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  });

  ipcMain.handle('tts:set-config', async (_e, partial: Record<string, unknown>) => {
    const port = getPythonPort();
    if (!port) return { ok: false, error: 'TTS server chưa sẵn sàng' };
    try {
      const res = await fetch(`http://127.0.0.1:${port}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
      return { ok: true, config: await res.json() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Báo cáo provider/thiết bị khả dụng (cho UI switch CPU/GPU)
  ipcMain.handle('tts:capabilities', async () => {
    const port = getPythonPort();
    if (!port) return null;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/capabilities`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  });

  // Liệt kê engine TTS đăng ký (multi-engine)
  ipcMain.handle('tts:list-engines', async () => {
    const port = getPythonPort();
    if (!port) return null;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/engines`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  });

  // Kiểm điều kiện trước khi tải engine mở rộng (đĩa/RAM/GPU/on-stage).
  ipcMain.handle('tts:engine-preflight', async (_e, { engineId }: { engineId: string }) => {
    const { preflight } = await import('./engine-installer');
    return await preflight(engineId);
  });

  // Lấy repo HF của engine từ /engines (để tải model).
  async function getEngineModelRepo(engineId: string): Promise<string | null> {
    const port = getPythonPort();
    if (!port) return null;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/engines`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return null;
      const data = await res.json();
      const e = (data.engines ?? []).find((x: { id: string }) => x.id === engineId);
      return e?.install?.model?.repo ?? null;
    } catch {
      return null;
    }
  }

  // Lấy pip_packages + runtime_kind của engine từ /engines. `runtime_kind` quyết định NƠI
  // installRuntime() ghi (dùng chung theo kind — xem ttsRuntimeDir, GĐ C); thiếu field này
  // (server cũ) → 'torch' (coi là nặng, an toàn hơn đoán nhầm 'onnx-ext').
  async function getEngineRuntimeMeta(engineId: string): Promise<{ pipPackages: string[]; runtimeKind: string }> {
    const port = getPythonPort();
    if (!port) return { pipPackages: [], runtimeKind: 'torch' };
    try {
      const res = await fetch(`http://127.0.0.1:${port}/engines`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return { pipPackages: [], runtimeKind: 'torch' };
      const data = await res.json();
      const e = (data.engines ?? []).find((x: { id: string }) => x.id === engineId);
      return {
        pipPackages: e?.install?.runtime?.pip_packages ?? [],
        runtimeKind: typeof e?.runtime_kind === 'string' && e.runtime_kind ? e.runtime_kind : 'torch',
      };
    } catch {
      return { pipPackages: [], runtimeKind: 'torch' };
    }
  }

  // Bắt đầu/tiếp tục tải model + cài runtime engine mở rộng. Progress qua event.
  ipcMain.handle('tts:engine-install-start', async (_e, { engineId }: { engineId: string }) => {
    const { getInstaller, preflight } = await import('./engine-installer');
    const { getPythonPath } = await import('./python-server');
    const pf = await preflight(engineId);
    if (!pf.ok) return { ok: false, error: pf.blocks.join(' '), preflight: pf };
    const repo = await getEngineModelRepo(engineId);
    if (!repo) return { ok: false, error: 'Engine không có nguồn model HF' };
    const { pipPackages, runtimeKind } = await getEngineRuntimeMeta(engineId);
    const inst = getInstaller(engineId, (p) => {
      getMainWindow()?.webContents.send('tts:engine-install-progress', p);
    });
    // Đã có 1 lượt tải đang chạy dở cho engine này (VD renderer vừa reload, UI chưa kịp nhận
    // progress event nào nên vẫn hiện nút "Tải model") → getInstaller() ở trên đã gắn lại
    // callback theo cửa sổ hiện tại rồi, CHỈ cần dừng ở đây — gọi downloadFromHf() lần nữa sẽ
    // chạy 2 vòng tải chồng lên nhau, cùng ghi 1 file .part → hỏng file (bug thật 2026-08-03).
    if (inst.isBusy()) return { ok: true };
    // Runtime: bản dev dùng venv python (pip --target) cho nhanh. Packaged → null để
    // installRuntime tự tải Python relocatable về runtime dùng chung (python-runtime.ts).
    inst.setRuntimeInstall(pipPackages, app.isPackaged ? null : getPythonPath(), runtimeKind);
    // Không await — chạy nền, báo tiến độ qua event.
    inst.downloadFromHf(repo);
    return { ok: true };
  });

  ipcMain.handle('tts:engine-install-pause', async (_e, { engineId }: { engineId: string }) => {
    const { getActiveInstaller } = await import('./engine-installer');
    getActiveInstaller(engineId)?.pause();
    return { ok: true };
  });

  ipcMain.handle('tts:engine-install-resume', async (_e, { engineId }: { engineId: string }) => {
    const { getInstaller } = await import('./engine-installer');
    const { getPythonPath } = await import('./python-server');
    const repo = await getEngineModelRepo(engineId);
    if (!repo) return { ok: false, error: 'Engine không có nguồn model HF' };
    const { pipPackages, runtimeKind } = await getEngineRuntimeMeta(engineId);
    const inst = getInstaller(engineId, (p) => {
      getMainWindow()?.webContents.send('tts:engine-install-progress', p);
    });
    if (inst.isBusy()) return { ok: true }; // tránh chạy chồng 2 vòng tải, giống tts:engine-install-start
    // Bug thật 2026-08-04: handler này trước đây KHÔNG gọi setRuntimeInstall() như
    // tts:engine-install-start — resume 1 lượt tải dở (đặc biệt sau khi app restart, instance
    // mới tinh nên _pipPackages=null) thì downloadFromHf() tải xong phần MODEL (writeManifest
    // 'model_ready') nhưng KHÔNG BAO GIỜ chạy installRuntime() → manifest không bao giờ lên
    // 'installed' → UI mãi hiện "Tải dở"/nút Tiếp tục dù file đã tải xong hoàn toàn trên đĩa.
    inst.setRuntimeInstall(pipPackages, app.isPackaged ? null : getPythonPath(), runtimeKind);
    inst.downloadFromHf(repo);  // resume từ install-state.json
    return { ok: true };
  });

  ipcMain.handle('tts:engine-install-cancel', async (_e, { engineId }: { engineId: string }) => {
    const { getActiveInstaller } = await import('./engine-installer');
    getActiveInstaller(engineId)?.cancel();
    return { ok: true };
  });

  // Import model từ thư mục/USB (không cần mạng).
  ipcMain.handle('tts:engine-import-local', async (_e, { engineId }: { engineId: string }) => {
    const { getInstaller } = await import('./engine-installer');
    const win = getMainWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Chọn thư mục chứa model đã tải sẵn',
      properties: ['openDirectory'],
    });
    if (canceled || filePaths.length === 0) return { ok: false };
    const inst = getInstaller(engineId, (p) => {
      getMainWindow()?.webContents.send('tts:engine-install-progress', p);
    });
    inst.importFromLocal(filePaths[0]);
    return { ok: true };
  });

  // Export model đã tải ra USB (chép sang máy khác).
  ipcMain.handle('tts:engine-export-local', async (_e, { engineId }: { engineId: string }) => {
    const { getInstaller } = await import('./engine-installer');
    const win = getMainWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Chọn thư mục để export model (chép sang USB)',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || filePaths.length === 0) return { ok: false };
    const inst = getInstaller(engineId, () => {});
    return await inst.exportToLocal(filePaths[0]);
  });

  // Xoá engine đã cài (giải phóng đĩa). Chặn nếu đang dùng.
  ipcMain.handle('tts:engine-delete', async (_e, { engineId }: { engineId: string }) => {
    const port = getPythonPort();
    if (port) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/engines`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const d = await res.json();
          if (d.current === engineId) return { ok: false, error: 'Không thể xoá engine đang dùng. Đổi sang engine khác trước.' };
        }
      } catch { /* ignore */ }
    }
    const { getInstaller } = await import('./engine-installer');
    return getInstaller(engineId, () => {}).deleteInstall();
  });

  // Dung lượng engine đang chiếm (cho màn chuẩn bị).
  ipcMain.handle('tts:engine-disk-usage', async (_e, { engineId }: { engineId: string }) => {
    const { getInstaller } = await import('./engine-installer');
    return { bytes: getInstaller(engineId, () => {}).diskUsage() };
  });

  /**
   * Dung lượng runtime DÙNG CHUNG theo kind (GĐ C) — tách khỏi `tts:engine-disk-usage` vì
   * từ giờ nó không còn nằm trong thư mục riêng của engine nào cả. UI dùng để hiện rõ
   * "torch dùng chung ~2.5GB — cho VoxCPM", tránh hiểu lầm xoá 1 engine là hết ngay số đó
   * (chỉ hết khi engine CUỐI CÙNG dùng kind đó bị xoá — xem cleanupOrphanedRuntimeIfUnused).
   */
  ipcMain.handle('tts:runtime-disk-usage', async () => {
    const { sharedRuntimeInfo } = await import('./engine-installer');
    const kinds = ['torch', 'onnx-ext', 'onnx-accel', 'mlx'];
    return kinds
      .map((kind) => ({ kind, ...sharedRuntimeInfo(kind) }))
      .filter((r) => r.bytes > 0 || r.engineIds.length > 0);
  });

  // Thư mục lưu engine/model đã tải — hiện đường dẫn trong UI để người vận hành biết
  // dữ liệu nặng nằm ở đâu (dọn đĩa, sao chép sang máy khác, gửi log khi cần hỗ trợ).
  ipcMain.handle('tts:engines-dir', async () => {
    const { ttsEnginesDir } = await import('./data/paths');
    return { path: ttsEnginesDir() };
  });

  // Mở thư mục đó bằng Finder/Explorer của hệ điều hành.
  ipcMain.handle('tts:open-engines-dir', async () => {
    const { ttsEnginesDir } = await import('./data/paths');
    const { mkdirSync } = await import('node:fs');
    const dir = ttsEnginesDir();
    try {
      // Chưa tải engine nào thì thư mục chưa tồn tại — tạo trước, nếu không shell.openPath
      // trả lỗi khó hiểu thay vì mở ra một thư mục rỗng như người dùng mong đợi.
      mkdirSync(dir, { recursive: true });
      const err = await shell.openPath(dir);   // '' nếu thành công
      return err ? { ok: false, error: err } : { ok: true, path: dir };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  /**
   * Nhả RAM của một engine đang giữ ấm — GIỮ NGUYÊN dữ liệu đã tải trên đĩa.
   *
   * Hai trường hợp khác nhau:
   *  - Engine nằm trong tiến trình đang phục vụ → POST /engines/unload (nhả trong process).
   *  - Engine là chủ của nhóm 'ext' đang chạy nền nhưng KHÔNG phục vụ → tắt hẳn tiến
   *    trình đó, vì cả tiến trình chỉ tồn tại để chạy engine này (torch chiếm vài GB).
   */
  ipcMain.handle('tts:engine-unload', async (_e, { engineId }: { engineId: string }) => {
    const { getActiveTier, getTierEngineId, stopTier, isTierRunning } = await import('./python-server');

    if (getActiveTier() !== 'ext' && getTierEngineId('ext') === engineId && isTierRunning('ext')) {
      await stopTier('ext');
      return { ok: true, freedProcess: true };
    }

    const port = getPythonPort();
    if (!port) return { ok: false, error: 'TTS server chưa sẵn sàng' };
    try {
      const res = await fetch(`http://127.0.0.1:${port}/engines/unload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine_id: engineId }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = body?.detail;
        return { ok: false, error: String((typeof detail === 'object' ? detail?.error : detail) ?? `HTTP ${res.status}`) };
      }
      return { ok: true, freedProcess: false, unloaded: !!body?.unloaded };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // Dry-run kiểm engine load được (sau khi tải, TRƯỚC khi cho đổi).
  ipcMain.handle('tts:engine-verify', async (_e, { engineId }: { engineId: string }) => {
    const { getInstaller, resolveEngineRuntimeLocation } = await import('./engine-installer');
    const { getServerDir, getPythonPath } = await import('./python-server');
    const serverDir = getServerDir();
    if (!serverDir) return { ok: false, error: 'Không tìm thấy code server (bản đóng gói chưa hỗ trợ verify engine mở rộng — cần bản dev).' };

    const { resolveRuntimePython } = await import('./python-runtime');
    // Runtime dùng chung theo kind (GĐ C) hoặc vị trí riêng cũ nếu engine cài từ trước đó
    // — resolveEngineRuntimeLocation() tự dò, xem comment ở nơi khai báo.
    const { runtimeDir: engineRuntime, sitePackages } = resolveEngineRuntimeLocation(engineId);
    // Chọn python: runtime tự chứa nếu có, không thì venv dev (đủ để verify engine bundled/nhẹ).
    // Dùng chung resolver với python-server.ts — trước đây chỗ này tự ghép `runtime/bin/python`,
    // lệch với đường ensurePythonRuntime() thật sự tạo nên bản đóng gói luôn verify bằng
    // system Python (không có torch) và báo engine hỏng dù engine hoàn toàn bình thường.
    const pythonBin = resolveRuntimePython(engineRuntime) ?? getPythonPath();

    const inst = getInstaller(engineId, (p) => {
      getMainWindow()?.webContents.send('tts:engine-install-progress', p);
    });
    const { vieneuDir } = await import('./data/paths');
    return await inst.verify(pythonBin, serverDir, sitePackages, {
      HF_HOME: vieneuDir(),
      HF_HUB_OFFLINE: '1',
      VIENEU_ENGINES_DIR: (await import('./data/paths')).ttsEnginesDir(),
    });
  });

  /**
   * Thử đổi engine NGAY trong process Python đang chạy (POST /engines/switch).
   *
   * Đây là đường nhanh thêm ở GĐ A: nếu process hiện tại có sẵn runtime cho engine đích
   * thì không cần verify, không cần restart, và engine đã từng nạp thì đổi là tức thì.
   * Đường cũ (verify + stop/start) nạp model tới 3 LẦN cho 1 lần đổi — đo thực tế VoxCPM
   * ~118s mỗi lần nạp.
   *
   * Trả `{ ok: true }` khi đổi xong; `{ ok: false }` (không kèm fatal) nghĩa là "process
   * này không làm được, hãy đi đường cũ"; `{ ok: false, fatal: true }` là lỗi thật, đi
   * đường cũ cũng vô ích nên báo thẳng cho người dùng.
   */
  async function tryFastSwitch(
    port: number,
    engineId: string,
  ): Promise<{ ok: boolean; fatal?: boolean; error?: string }> {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/engines/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine_id: engineId }),
        // Rộng tay như HEALTH_TIMEOUT_MS: nếu server đang thật sự nạp model thì CHỜ vẫn
        // lợi hơn bỏ cuộc — đường cũ cũng phải nạp đúng model đó, cộng thêm spawn process.
        // Trường hợp không nạp được (thiếu runtime) trả 409 ngay, không tốn thời gian.
        signal: AbortSignal.timeout(300_000),
      });

      if (res.ok) {
        const body = await res.json().catch(() => null);
        console.log(`[tts:engine-switch] fast switch -> ${engineId} `
          + `elapsed=${body?.elapsed_ms ?? '?'}ms reused=${body?.reused ?? '?'}`);
        return { ok: true };
      }

      // 409 = process này không có runtime cho engine đó (vd engine torch trong process
      // ONNX). Không phải lỗi — đi đường cũ để spawn runtime riêng của engine.
      if (res.status === 409) {
        console.log(`[tts:engine-switch] '${engineId}' không nạp được trong process hiện tại — dùng đường restart.`);
        return { ok: false };
      }

      const body = await res.json().catch(() => null);
      const detail = body?.detail;
      const msg = (typeof detail === 'object' ? detail?.error : detail) ?? `HTTP ${res.status}`;
      return { ok: false, fatal: true, error: String(msg) };
    } catch (err) {
      // Server cũ chưa có endpoint này, hoặc mất kết nối → im lặng lùi về đường cũ.
      console.log(`[tts:engine-switch] fast switch không dùng được (${err instanceof Error ? err.message : String(err)}) — dùng đường restart.`);
      return { ok: false };
    }
  }

  // Đổi engine đang dùng: guard on-stage → THỬ ĐỔI TẠI CHỖ → (nếu không được) verify →
  // ghi config → restart → health → rollback VieNeu nếu engine mới không lên.
  ipcMain.handle('tts:engine-switch', async (_e, { engineId }: { engineId: string }) => {
    const { isOnStage } = await import('./engine-installer');
    if (isOnStage()) {
      return { ok: false, error: 'Đang có sinh viên trên sân khấu — không đổi engine lúc này.' };
    }

    const port = getPythonPort();
    if (!port) return { ok: false, error: 'TTS server chưa sẵn sàng' };

    // ── Đường nhanh: đổi tại chỗ, không restart ────────────────────────────────
    // Python tự ghi config.engine khi đổi thành công nên không cần PUT /config ở đây.
    const fast = await tryFastSwitch(port, engineId);
    if (fast.ok) return { ok: true };
    if (fast.fatal) return { ok: false, error: `Engine không load được: ${fast.error}` };

    // ── Đường nhóm riêng: engine cần runtime của chính nó ─────────────────────
    // Blue-green (GĐ B): dựng tiến trình mới trên port trống TRONG KHI tiến trình hiện
    // tại VẪN phục vụ bình thường. Hai điểm được lợi so với cơ chế stop→start cũ:
    //   1. Bỏ hẳn bước verify dry-run — health-check của tiến trình mới CHÍNH LÀ verify,
    //      nên model chỉ nạp MỘT lần thay vì ba.
    //   2. Không cần rollback: tiến trình cũ chưa hề bị đụng tới, hỏng thì chỉ việc
    //      không chuyển sang, người dùng vẫn đọc được bằng engine đang dùng.
    // Tiến trình cũ được GIỮ SỐNG, nên đổi ngược lại về engine cũ sau này là tức thì.
    const { vieneuDir } = await import('./data/paths');
    const { ensureTierForEngine, setActiveTier, getActiveTier, markTierEngine } = await import('./python-server');

    const prevTier = getActiveTier();
    const ensured = await ensureTierForEngine(engineId, vieneuDir());
    if (!ensured.ok) {
      return {
        ok: false,
        error: `Khởi động engine thất bại (vẫn đang dùng engine cũ): ${ensured.error ?? 'không rõ nguyên nhân'}`,
      };
    }

    setActiveTier(ensured.tier);

    // Tiến trình vừa dựng đã mang đúng engine (spawn kèm VIENEU_ENGINE). Nhưng nếu nhóm
    // đó ĐANG SẴN chạy từ trước và phục vụ engine khác thì phải bảo nó đổi — đây là lượt
    // đổi tại chỗ, tức thì nếu engine đã giữ ấm.
    const afterSwitch = await tryFastSwitch(getPythonPort(), engineId);
    if (!afterSwitch.ok && afterSwitch.fatal) {
      setActiveTier(prevTier);   // nhóm cũ vẫn sống → quay lại là tức thì
      return { ok: false, error: `Engine không load được: ${afterSwitch.error}` };
    }
    // Switch tại chỗ thành công (không respawn) → ghi nhận tier NAY thật sự phục vụ
    // engine nào, để lượt đổi tiếp theo (vd sang 1 engine torch khác) biết đúng trạng
    // thái thay vì tưởng tier vẫn còn phục vụ engine lúc spawn ban đầu.
    if (afterSwitch.ok) markTierEngine(ensured.tier, engineId);

    // Xác nhận nhóm đang phục vụ đúng engine yêu cầu (vòng đầu khớp là trả ngay).
    const healthy = await verifyEngineActive(engineId);
    if (!healthy) {
      setActiveTier(prevTier);
      return { ok: false, error: 'Engine mới không phản hồi — vẫn đang dùng engine cũ.' };
    }
    return { ok: true };
  });

  async function verifyEngineActive(engineId: string): Promise<boolean> {
    const port = getPythonPort();
    if (!port) return false;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/engines`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const d = await res.json();
          if (d.current === engineId) return true;
        }
      } catch { /* chưa lên, thử lại */ }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
  }

  /**
   * Cài thư viện tăng tốc phần cứng (onnxruntime-gpu / -directml) theo nhu cầu.
   *
   * Hai đường khác hẳn nhau:
   *  - DEV: có venv sẵn → pip install thẳng vào venv đó, xong là dùng được.
   *  - ĐÓNG GÓI: VieNeu chạy bằng binary PyInstaller đã đóng băng onnxruntime CPU, cài
   *    thêm gói ra ngoài KHÔNG tác động tới nó. Nên phải dựng một runtime Python rời
   *    (tải về) rồi cài TRỌN BỘ dependency server + gói tăng tốc vào đó; sau đó
   *    python-server.ts sẽ spawn main.py bằng runtime này khi người dùng chọn GPU
   *    (xem resolveAccelSpawn).
   */
  ipcMain.handle('tts:install-accel', async (_e, { packageName }: { packageName: string }) => {
    // Whitelist package để tránh chạy pip install tuỳ ý.
    const ALLOWED = new Set(['onnxruntime-gpu', 'onnxruntime-directml']);
    if (!ALLOWED.has(packageName)) {
      return { ok: false, error: `Gói không hợp lệ: ${packageName}` };
    }

    const runPip = (py: string, args: string[]) =>
      new Promise<{ ok: boolean; error?: string; log?: string }>((resolve) => {
        const proc = spawn(py, args, { windowsHide: true });
        let out = '';
        proc.stdout?.on('data', (d) => { out += d.toString(); });
        proc.stderr?.on('data', (d) => { out += d.toString(); });
        proc.on('error', (err) => resolve({ ok: false, error: err.message, log: out }));
        proc.on('close', (code) => {
          if (code === 0) resolve({ ok: true, log: out.slice(-2000) });
          else resolve({ ok: false, error: `pip install thoát code ${code}`, log: out.slice(-2000) });
        });
      });

    if (!app.isPackaged) {
      return await runPip(getPythonPath(), ['-m', 'pip', 'install', packageName]);
    }

    // ── Bản đóng gói: dựng runtime riêng ─────────────────────────────────────
    // GĐ C (2026-08-11): dùng chung cơ chế `ttsRuntimeDir` với engine mở rộng thay vì
    // thư mục `tts-accel` tách biệt trước đây — cùng 1 kind ('onnx-accel') là cùng chỗ,
    // không tạo thêm 1 bản Python + site-packages riêng nữa.
    const { ttsRuntimeDir } = await import('./data/paths');
    const { ensurePythonRuntime } = await import('./python-runtime');
    const { getServerDir } = await import('./python-server');

    const serverDir = getServerDir();
    if (!serverDir) {
      return { ok: false, error: 'Không tìm thấy mã nguồn server (python-backend) trong bản cài đặt.' };
    }
    const runtimeRoot = ttsRuntimeDir('onnx-accel');
    const sitePackages = join(runtimeRoot, 'site-packages');

    let py: string;
    try {
      py = await ensurePythonRuntime(runtimeRoot, new AbortController().signal);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    // Trọn bộ dependency server + gói tăng tốc, cùng một lần pip để giải phụ thuộc
    // một lượt (tránh onnxruntime CPU được kéo về rồi ghi đè bản GPU).
    const reqFile = join(serverDir, 'requirements.txt');
    const pipArgs = ['-m', 'pip', 'install', '--no-cache-dir', '--target', sitePackages];
    if (existsSync(reqFile)) pipArgs.push('-r', reqFile);
    pipArgs.push(packageName);

    const res = await runPip(py, pipArgs);
    if (!res.ok) return res;
    return { ok: true, log: res.log };
  });

  // ── Clone voice ──────────────────────────────────────────────────────────────
  // Mở dialog chọn file audio (WAV) để clone giọng
  ipcMain.handle('tts:pick-audio-file', async () => {
    const win = getMainWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Chọn file audio để clone giọng',
      properties: ['openFile'],
      filters: [{ name: 'Audio WAV', extensions: ['wav'] }],
    });
    if (canceled || filePaths.length === 0) return { ok: false };
    return { ok: true, filePath: filePaths[0] };
  });

  // Clone giọng từ file WAV: gửi multipart tới Python /voices/clone
  ipcMain.handle('tts:clone-voice', async (_e, { filePath, label, gender, region, refText }: {
    filePath: string; label: string; gender?: string; region?: string; refText?: string;
  }) => {
    const port = getPythonPort();
    if (!port) return { ok: false, error: 'TTS server chưa sẵn sàng' };
    if (!existsSync(filePath)) return { ok: false, error: 'File không tồn tại' };
    try {
      const buf = readFileSync(filePath);
      const form = new FormData();
      form.append('file', new Blob([buf], { type: 'audio/wav' }), basename(filePath));
      form.append('label', label);
      form.append('gender', gender ?? 'female');
      form.append('region', region ?? 'Bắc');
      // Bản chép lời của audio mẫu. Luôn gửi (kể cả rỗng) để server tự quyết định theo
      // engine đang chạy — server mới biết engine nào bắt buộc, renderer không nên đoán.
      form.append('ref_text', refText ?? '');
      const res = await fetch(`http://127.0.0.1:${port}/voices/clone`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
      return { ok: true, voice: await res.json() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Ẩn/hiện giọng và/hoặc sửa bản chép lời (PUT /voices/{id})
  ipcMain.handle('tts:update-voice', async (_e, { voiceId, hidden, refText }: {
    voiceId: string; hidden?: boolean; refText?: string;
  }) => {
    const port = getPythonPort();
    if (!port) return { ok: false, error: 'TTS server chưa sẵn sàng' };
    // Chỉ gửi field được truyền — server phân biệt "không đụng tới" (vắng mặt) với
    // "xoá đi" (chuỗi rỗng), nên gửi thừa `refText: undefined` sẽ thành xoá ngoài ý muốn.
    const body: Record<string, unknown> = {};
    if (hidden !== undefined) body.hidden = hidden;
    if (refText !== undefined) body.ref_text = refText;
    if (Object.keys(body).length === 0) return { ok: false, error: 'Không có gì để cập nhật' };
    try {
      const res = await fetch(`http://127.0.0.1:${port}/voices/${encodeURIComponent(voiceId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
      return { ok: true, voice: await res.json() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Xoá giọng clone (DELETE /voices/{id})
  ipcMain.handle('tts:delete-voice', async (_e, { voiceId }: { voiceId: string }) => {
    const port = getPythonPort();
    if (!port) return { ok: false, error: 'TTS server chưa sẵn sàng' };
    try {
      const res = await fetch(`http://127.0.0.1:${port}/voices/${encodeURIComponent(voiceId)}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Kiểm tra VieNeu-TTS model đã được download về resources/vieneu chưa
  ipcMain.handle('tts:model-status', () => {
    const hubDir = join(vieneuDir(), 'hub');
    const modelDir = join(hubDir, 'models--pnnbao-ump--VieNeu-TTS-v3-Turbo');
    // Kiểm tra file ONNX chính (prefill) — nếu có thì model đã sẵn sàng
    const snapshotsDir = join(modelDir, 'snapshots');
    let downloaded = false;
    if (existsSync(snapshotsDir)) {
      try {
        const snapshots = readdirSync(snapshotsDir);
        for (const snap of snapshots) {
          if (existsSync(join(snapshotsDir, snap, 'onnx', 'vieneu_prefill.onnx'))) {
            downloaded = true;
            break;
          }
        }
      } catch { /* ignore */ }
    }
    return { downloaded };
  });

  // Liệt kê danh sách model giọng đọc (.onnx) có sẵn trong resources/piper
  ipcMain.handle('tts:list-models', async () => {
    try {
      const piperDir = app.isPackaged
        ? join(process.resourcesPath, 'piper')
        : join(app.getAppPath(), 'resources', 'piper');
      if (!existsSync(piperDir)) return [];
      const files = readdirSync(piperDir);
      return files.filter(f => f.endsWith('.onnx'));
    } catch (err) {
      console.error('[Piper] Lỗi đọc danh sách model:', err);
      return [];
    }
  });

  // ── TTS Pre-Generation ──────────────────────────────────────────────────────
  let pregenQueue: PreGenQueue | null = null;

  /** Batch cache voice pregen giờ gắn với Event active (giai đoạn "bỏ Student", 2026-07-22) —
   * trước đây dùng graduation_batch_id (field đặc thù sinh viên, không có trong CanonicalRecord
   * core), giờ mỗi Event có 1 thư mục cache riêng, đúng bản chất "pregen gắn với 1 đợt lễ cụ
   * thể", không phải thuộc tính dữ liệu người tham dự. */
  function getPregenBatchId(): string {
    const active = getCurrentActiveEvent(ceremonyStore.getExecutor());
    return active?.id ?? 'default';
  }

  ipcMain.handle('tts:pregen-start', async (_e, payload: {
    regenerate?: boolean;
    config: { template: string; ttsModel: string; ttsSpeed: number; ttsConditions?: any[] };
  }) => {
    const records = ceremonyStore.getRecords();
    if (!records || records.length === 0) {
      return { ok: false, error: 'Chưa có dữ liệu người tham dự' };
    }
    const batchId = getPregenBatchId();

    // Tạo queue mới nếu batchId đổi, config đổi (giọng/tốc độ/template), hoặc số
    // lượng record đổi (re-import cùng Event — sửa/nạp lại dữ liệu) — nếu không, queue cũ
    // (đang giữ danh sách cũ trong bộ nhớ) tiếp tục báo total theo số cũ dù dữ liệu đã đổi.
    if (
      !pregenQueue ||
      pregenQueue.getBatchId() !== batchId ||
      pregenQueue.configChanged(payload.config) ||
      pregenQueue.getStatus().total !== records.length
    ) {
      pregenQueue = new PreGenQueue(batchId, records, payload.config, (status: PreGenStatus) => {
        getMainWindow()?.webContents.send('tts:pregen-progress', status);
      });
    }

    await pregenQueue.start(payload.regenerate ?? false);
    const status = pregenQueue.getStatus();
    return { ok: true, total: status.total, pending: status.pending };
  });

  ipcMain.handle('tts:pregen-pause', () => {
    pregenQueue?.pause();
    return { ok: true };
  });

  ipcMain.handle('tts:pregen-resume', () => {
    pregenQueue?.resume();
    return { ok: true };
  });

  ipcMain.handle('tts:pregen-cancel', () => {
    pregenQueue?.cancel();
    return { ok: true };
  });

  ipcMain.handle('tts:pregen-status', () => {
    const records = ceremonyStore.getRecords();
    if (!pregenQueue || (records && records.length > 0 && pregenQueue.getStatus().total !== records.length)) {
      if (!records || records.length === 0) return pregenQueue?.getStatus() ?? null;
      const batchId = getPregenBatchId();
      const config = getTtsPregenConfig();
      pregenQueue = new PreGenQueue(batchId, records, config, (status: PreGenStatus) => {
        getMainWindow()?.webContents.send('tts:pregen-progress', status);
      });
    }
    return pregenQueue.getStatus();
  });

  ipcMain.handle('tts:pregen-requeue', (_e, { id }: { id: string }) => {
    if (!pregenQueue) return { ok: false, error: 'Không có queue đang chạy' };
    const result = pregenQueue.requeueOne(id);
    return { ok: result };
  });

  ipcMain.handle('tts:pregen-get-audio', (_e, { id }: { id: string }) => {
    const batchId = getPregenBatchId();
    const wavPath = ttsPregenWavPath(batchId, id);
    console.log(`[TTS PreGen] get-audio batchId=${batchId} id=${id} wavPath=${wavPath} exists=${existsSync(wavPath)}`);
    if (!existsSync(wavPath)) {
      return { ok: false, error: 'File WAV chưa được tạo' };
    }
    try {
      const buffer = readFileSync(wavPath);
      // Trả kèm tần số đọc từ header — renderer bỏ 44 byte header rồi phát PCM thô nên
      // KHÔNG tự biết được tần số. Trước đây nó hardcode 48000, sai gấp đôi tốc độ với
      // file do Qwen (24kHz) sinh ra.
      const sampleRate = readWavSampleRate(buffer);
      console.log(`[TTS PreGen] get-audio ok id=${id} bytes=${buffer.length} sr=${sampleRate}`);
      return { ok: true, buffer, sampleRate };
    } catch (err) {
      console.error(`[TTS PreGen] get-audio error id=${id} wavPath=${wavPath}`, err);
      return { ok: false, error: String(err) };
    }
  });

  // ---- Logs & API updates ----
  ipcMain.handle('logs:get', () => {
    return apiLogger.getLogs();
  });

  ipcMain.handle('logs:retry', (_e, logId: string) => {
    return apiLogger.retrySingleLog(logId);
  });

  ipcMain.handle('logs:retryAll', () => {
    return apiLogger.retryAllFailed(false);
  });

  ipcMain.handle('logs:export', () => {
    return apiLogger.exportLogsToTxt();
  });

  ipcMain.handle('logs:clear', () => {
    return apiLogger.clearLogs();
  });

  ipcMain.handle('logs:testApi', () => {
    return apiLogger.triggerTestApiCall();
  });

  ipcMain.handle('api:request', async (_e, { url, method, headers, body }) => {
    try {
      const response = await fetch(url, {
        method: method || 'POST',
        headers: headers || {},
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });

      const text = await response.text().catch(() => '');
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        // body không phải JSON hợp lệ — giữ nguyên text
      }

      const resHeaders: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        resHeaders[key] = val;
      });

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: resHeaders,
        body: json || text,
      };
    } catch (err: any) {
      return {
        ok: false,
        status: 0,
        statusText: err.message || String(err),
        headers: {},
        body: String(err),
      };
    }
  });
}
