import { ipcMain, dialog, app } from 'electron';
import { rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, readdirSync, createWriteStream, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, basename } from 'node:path';
import type { ZipArchive as ZipArchiveType } from 'archiver';
import { ceremonyStore } from './data/store';
import { syncBundle, commitImport, cancelImport, isIoBusy } from './data/sync';
import { ceremonyDataDir, autoPlayJsonPath, piperBinPath, piperModelPath, ttsPregenWavPath, ttsPregenDir, PHOTO_DIR_NAMES, ttsPregenManifestPath, vieneuDir, resolveLocalAsset } from './data/paths';
import { runVieneu, warmupVieneu } from './vieneu-tts';
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
import { getIO, getUseSampleData, setUseSampleData, getTtsPregenConfig, getApiEnvironment, setApiEnvironment, getApiIntegrations, setApiIntegrations, hasDefaultApiIntegrations, resetApiIntegrationsToDefault, getBackdropAspectRatio } from './socket-server';
import { sessionStore } from './session-store';
import { apiLogger } from './api-logger';
import { setAppMenu, refreshAppMenu, type MenuLanguage } from './menu';

/** Báo cho Control biết trạng thái Backdrop (mở/đóng) đã thay đổi */
export function notifyBackdropState() {
  const open = isBackdropOpen();
  const fullscreen = open ? (getBackdropWindow()?.isKiosk() || getBackdropWindow()?.isFullScreen() || false) : false;
  getMainWindow()?.webContents.send('backdrop:state', { open, fullscreen });
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
    getIO()?.emit('state:full', {
      session: sessionStore.get(),
      onStage: sessionStore.get().current_on_stage_msv
        ? (ceremonyStore.findByMsv(sessionStore.get().current_on_stage_msv!) ?? null)
        : null,
      pending: sessionStore.get().pending_msv
        ? (ceremonyStore.findByMsv(sessionStore.get().pending_msv!) ?? null)
        : null,
    });
  }

  // Làm mới / import dữ liệu — push progress qua event data:progress về renderer.
  // Import file local trả pendingConfirm (chưa commit) → KHÔNG broadcast tới khi confirm.
  ipcMain.handle('data:sync', async (e, payload?: { url?: string; zipPath?: string }) => {
    const result = await syncBundle(payload, (p) => {
      e.sender.send('data:progress', p);
    });
    if (!result.pendingConfirm) {
      broadcastFullState();
    }
    return result;
  });

  // Bước 2 của import: user đã xác nhận preview → commit staging vào ceremony-data.
  ipcMain.handle('data:confirmImport', async (e) => {
    const result = commitImport((p) => e.sender.send('data:progress', p));
    if (result.ok) broadcastFullState();
    return result;
  });

  // Huỷ import đang chờ xác nhận → dọn staging.
  ipcMain.handle('data:cancelImport', () => {
    cancelImport();
    return { ok: true };
  });

  // Lấy kích thước file (để renderer cảnh báo trước khi import).
  ipcMain.handle('data:statFile', (_e, filePath: string) => {
    try {
      return { size: statSync(filePath).size };
    } catch {
      return { size: 0 };
    }
  });

  // Mở dialog chọn file ZIP để import
  ipcMain.handle('data:openFile', async () => {
    const win = getMainWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Chọn file bundle (.zip)',
      filters: [{ name: 'Bundle ZIP', extensions: ['zip'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
  });

  // Xuất file dữ liệu ZIP (streaming — không giữ toàn bộ trong RAM) gồm students.json, image/, voice/
  ipcMain.handle('data:export', async (e) => {
    const emitExport = (step: string, pct: number) => e.sender.send('data:progress', { step, pct });
    if (getUseSampleData()) {
      return { ok: false, message: 'Không được phép xuất dữ liệu mẫu (sample data).' };
    }
    // V2 — chống chạy đồng thời với import/refresh.
    if (isIoBusy()) {
      return { ok: false, message: 'Đang có thao tác dữ liệu khác chạy — vui lòng đợi hoàn tất.' };
    }
    const win = getMainWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win ?? undefined!, {
      title: 'Xuất file dữ liệu (.zip)',
      defaultPath: `ceremony-bundle-${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
    });
    if (canceled || !filePath) return { ok: false, message: 'Đã hủy xuất file' };

    const dataDir = ceremonyDataDir();
    const students = ceremonyStore.getStudents();
    if (!students || students.length === 0) {
      return { ok: false, message: 'Không có dữ liệu sinh viên để xuất' };
    }

    // Map sinh viên về RawStudent shape
    const rawStudents = students.map((s) => ({
      id: s.id,
      graduation_batch_id: s.graduation_batch_id,
      batch_name: s.batch_name || '',
      display_order: s.display_order,
      student_code: s.student_code,
      full_name: s.full_name,
      date_of_birth: s.date_of_birth,
      major_name: s.major_name,
      faculty_name: s.faculty_name,
      class_code: s.class_code,
      course_code: s.course_code,
      phone_number: s.phone_number,
      identity_number: s.identity_number,
      email: s.email || '',
      gpa: s.gpa,
      classification: s.classification,
      classification_type: s.classification_type || 0,
      achievement_title: s.achievement_title || '',
      award_type: s.award_type || '',
      award_type_code: s.award_type_code || null,
      award_content: s.award_content || '',
      quote: s.quote || null,
      image_file_name: s.image_file_name,
      image_relative_path: s.image_relative_path,
      presentation_template_type: s.presentation_template_type || '',
      presentation_template_type_code: s.presentation_template_type_code || null,
      registration_status: s.status === 'on_stage' ? 'on_stage' : s.status === 'returned' ? 'received_hardcopy' : s.status === 'checked_in' ? 'checked_in' : s.status === 'called' ? 'called' : s.status === 'absent' ? 'absent' : 'registered',
      degree_award_status: s.degree_award_status || '',
    }));

    // V7 — serialize JSON riêng, bắt lỗi String.MAX_LENGTH rõ ràng.
    let studentsJson: string;
    try {
      studentsJson = JSON.stringify(rawStudents, null, 2);
    } catch (err) {
      return { ok: false, message: `Không thể tạo students.json (dữ liệu quá lớn?): ${err instanceof Error ? err.message : String(err)}` };
    }

    // V6 — archiver ghi streaming trực tiếp ra file, RAM hằng số.
    // archiver@8 là ESM-only — main process là CJS nên phải dùng dynamic import() thay vì require().
    const { ZipArchive } = await import('archiver');
    return await new Promise<{ ok: boolean; message: string }>((resolve) => {
      const output = createWriteStream(filePath);
      const zip: ZipArchiveType = new ZipArchive({ zlib: { level: 1 } }); // level thấp: ảnh/wav đã nén, ưu tiên tốc độ
      let settled = false;
      const done = (r: { ok: boolean; message: string }) => { if (!settled) { settled = true; resolve(r); } };

      output.on('close', () => { emitExport('Hoàn tất', 100); done({ ok: true, message: 'Xuất file thành công!' }); });
      zip.on('warning', (w: Error) => console.warn('[export] archiver warning:', w));
      zip.on('error', (err: Error) => { console.error('[export] archiver error:', err); done({ ok: false, message: `Lỗi ghi file: ${err.message}` }); });
      // Progress theo tổng bytes đã xử lý.
      zip.on('progress', (p: { entries: { total: number; processed: number } }) => {
        const pct = p.entries.total > 0 ? Math.round((p.entries.processed / p.entries.total) * 90) : 0;
        emitExport('Đang ghi file…', Math.min(90, pct));
      });

      zip.pipe(output);

      emitExport('Chuẩn bị dữ liệu…', 3);
      zip.append(studentsJson, { name: 'students.json' });

      // Ảnh: chỉ thêm ảnh thực sự tồn tại, tránh trùng tên.
      let photoDirName = 'image';
      for (const d of PHOTO_DIR_NAMES) {
        if (existsSync(join(dataDir, d))) { photoDirName = d; break; }
      }
      const photoPath = join(dataDir, photoDirName);
      const addedImages = new Set<string>();
      for (const s of students) {
        const candidates: string[] = [];
        if (s.image_relative_path) candidates.push(resolveLocalAsset(s.image_relative_path));
        if (s.image_file_name) candidates.push(join(photoPath, s.image_file_name));
        for (const file of candidates) {
          if (existsSync(file)) {
            const zipName = s.image_file_name || basename(file);
            if (addedImages.has(zipName)) break;
            addedImages.add(zipName);
            zip.file(file, { name: `image/${zipName}` });
            break;
          }
        }
      }

      // Voice: wav tồn tại + manifest đã lọc.
      const batchId = students[0]?.graduation_batch_id || 'default';
      const voicePath = ttsPregenDir(batchId);
      const manifestPath = ttsPregenManifestPath(batchId);
      if (existsSync(voicePath)) {
        for (const s of students) {
          const safeCode = s.student_code.replace(/[^a-zA-Z0-9_-]/g, '_');
          const wavFile = join(voicePath, `${safeCode}.wav`);
          if (existsSync(wavFile)) {
            zip.file(wavFile, { name: `voice/${safeCode}.wav` });
          }
        }
        if (existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
            const filteredStudents: Record<string, unknown> = {};
            for (const s of students) {
              const safeCode = s.student_code.replace(/[^a-zA-Z0-9_-]/g, '_');
              const wavFile = join(voicePath, `${safeCode}.wav`);
              if (existsSync(wavFile) && manifest.students?.[s.student_code]) {
                filteredStudents[s.student_code] = manifest.students[s.student_code];
              }
            }
            zip.append(JSON.stringify({ ...manifest, students: filteredStudents }, null, 2), { name: 'voice/manifest.json' });
          } catch {
            zip.file(manifestPath, { name: 'voice/manifest.json' });
          }
        }
      }

      emitExport('Đang ghi file…', 10);
      zip.finalize().catch((err) => done({ ok: false, message: `Lỗi hoàn tất zip: ${err instanceof Error ? err.message : String(err)}` }));
    });
  });

  // Config: dùng data sample hay data thật
  ipcMain.handle('config:getUseSampleData', () => getUseSampleData());
  ipcMain.handle('config:setUseSampleData', async (e, val: boolean) => {
    setUseSampleData(val);
    refreshAppMenu(); // Cập nhật checkbox "Dùng dữ liệu mẫu" trong menu Develop
    // Load lại dữ liệu theo mode mới
    const result = await syncBundle({ useSample: val }, (p) => e.sender.send('data:progress', p));
    getIO()?.emit('state:full', {
      session: sessionStore.get(),
      onStage: sessionStore.get().current_on_stage_msv
        ? (ceremonyStore.findByMsv(sessionStore.get().current_on_stage_msv!) ?? null)
        : null,
      pending: sessionStore.get().pending_msv
        ? (ceremonyStore.findByMsv(sessionStore.get().pending_msv!) ?? null)
        : null,
    });
    return result;
  });

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

  // Lấy thông tin meta để renderer hiển thị (cổng socket, ceremony, danh sách SV)
  ipcMain.handle('data:meta', () => ({
    config: ceremonyStore.getConfig(),
    ceremony: ceremonyStore.getCeremony(),
    students: ceremonyStore.getStudents(),
    syncedAt: ceremonyStore.getBundle()?._synced_at ?? null,
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
      ceremonyStore.clearStudents();
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
              const sampleRate = 48000;
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
        _saveRealtimeWav(studentCode, text.trim(), model, spd, cached.buffer);
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
      // quality_* chỉ có ở runVieneu (VieNeu); runPiper không trả — bỏ qua an toàn.
      const q = result as { quality_score?: number; quality_flags?: string[] };
      _saveRealtimeWav(studentCode, text.trim(), model, spd, result.buffer, {
        quality_score: q.quality_score,
        quality_flags: q.quality_flags,
      });
    }

    return result;
  });

  function _saveRealtimeWav(
    studentCode: string,
    text: string,
    voice: string,
    speed: number,
    pcm: Buffer,
    quality?: { quality_score?: number; quality_flags?: string[] },
  ) {
    try {
      const batchId = getPregenBatchId();
      const wavPath = ttsPregenWavPath(batchId, studentCode);
      const manifestPath = ttsPregenManifestPath(batchId);

      // Build WAV header
      const sampleRate = 48000;
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
      stopPythonServer();
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

  // Lấy pip_packages runtime của engine từ /engines.
  async function getEngineRuntimePackages(engineId: string): Promise<string[]> {
    const port = getPythonPort();
    if (!port) return [];
    try {
      const res = await fetch(`http://127.0.0.1:${port}/engines`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return [];
      const data = await res.json();
      const e = (data.engines ?? []).find((x: { id: string }) => x.id === engineId);
      return e?.install?.runtime?.pip_packages ?? [];
    } catch {
      return [];
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
    const pipPkgs = await getEngineRuntimePackages(engineId);
    const inst = getInstaller(engineId, (p) => {
      getMainWindow()?.webContents.send('tts:engine-install-progress', p);
    });
    // Runtime: bản dev dùng venv python (pip --target). Packaged (không venv) → null
    // → installRuntime báo cần embeddable (đã ghi nợ). Cài runtime sau khi tải model.
    inst.setRuntimeInstall(pipPkgs, app.isPackaged ? null : getPythonPath());
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
    const repo = await getEngineModelRepo(engineId);
    if (!repo) return { ok: false, error: 'Engine không có nguồn model HF' };
    const inst = getInstaller(engineId, (p) => {
      getMainWindow()?.webContents.send('tts:engine-install-progress', p);
    });
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

  // Dry-run kiểm engine load được (sau khi tải, TRƯỚC khi cho đổi).
  ipcMain.handle('tts:engine-verify', async (_e, { engineId }: { engineId: string }) => {
    const { getInstaller } = await import('./engine-installer');
    const { getServerDir, getPythonPath } = await import('./python-server');
    const { ttsEngineDir } = await import('./data/paths');
    const serverDir = getServerDir();
    if (!serverDir) return { ok: false, error: 'Không tìm thấy code server (bản đóng gói chưa hỗ trợ verify engine mở rộng — cần bản dev).' };

    const { join } = await import('node:path');
    const { existsSync } = await import('node:fs');
    // Runtime của engine: python trong runtime/, site-packages là target đã pip install.
    const engineRuntime = join(ttsEngineDir(engineId), 'runtime');
    const sitePackages = join(engineRuntime, 'site-packages');
    // Chọn python: runtime tự chứa nếu có, không thì venv dev (đủ để verify engine bundled/nhẹ).
    const runtimePy = process.platform === 'win32'
      ? join(engineRuntime, 'python.exe')
      : join(engineRuntime, 'bin', 'python');
    const pythonBin = existsSync(runtimePy) ? runtimePy : getPythonPath();

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

  // Đổi engine đang dùng: guard on-stage → verify → ghi config → restart → health →
  // rollback VieNeu nếu engine mới không lên. (VieNeu bundled thì bỏ verify.)
  ipcMain.handle('tts:engine-switch', async (_e, { engineId }: { engineId: string }) => {
    const { isOnStage } = await import('./engine-installer');
    if (isOnStage()) {
      return { ok: false, error: 'Đang có sinh viên trên sân khấu — không đổi engine lúc này.' };
    }

    const port = getPythonPort();
    if (!port) return { ok: false, error: 'TTS server chưa sẵn sàng' };

    // Engine mở rộng: verify load được trước khi đổi (VieNeu bundled bỏ qua).
    if (engineId !== 'vieneu') {
      const { getInstaller } = await import('./engine-installer');
      const { getServerDir, getPythonPath } = await import('./python-server');
      const { ttsEngineDir, ttsEnginesDir, vieneuDir } = await import('./data/paths');
      const { join } = await import('node:path');
      const { existsSync } = await import('node:fs');
      const serverDir = getServerDir();
      if (!serverDir) return { ok: false, error: 'Bản đóng gói chưa hỗ trợ engine mở rộng (cần bản dev).' };
      const engineRuntime = join(ttsEngineDir(engineId), 'runtime');
      const runtimePy = process.platform === 'win32'
        ? join(engineRuntime, 'python.exe') : join(engineRuntime, 'bin', 'python');
      const pythonBin = existsSync(runtimePy) ? runtimePy : getPythonPath();
      const inst = getInstaller(engineId, () => {});
      const v = await inst.verify(pythonBin, serverDir, join(engineRuntime, 'site-packages'), {
        HF_HOME: vieneuDir(), HF_HUB_OFFLINE: '1', VIENEU_ENGINES_DIR: ttsEnginesDir(),
      });
      if (!v.ok) return { ok: false, error: `Engine không load được: ${v.error ?? 'lỗi'}` };
    }

    // Ghi config.engine qua server (PUT /config), rồi restart.
    try {
      await fetch(`http://127.0.0.1:${port}/config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: engineId }), signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      return { ok: false, error: `Không ghi được config: ${err instanceof Error ? err.message : String(err)}` };
    }

    // Restart để áp engine mới.
    try {
      stopPythonServer();
      await startPythonServer(vieneuDir());
    } catch (err) {
      // Restart lỗi → rollback config về vieneu + restart lại.
      await rollbackToVieneu();
      return { ok: false, error: `Khởi động engine thất bại, đã quay lại VieNeu: ${err instanceof Error ? err.message : String(err)}` };
    }

    // Kiểm health sau restart: engine mới phải trả /engines current đúng.
    const healthy = await verifyEngineActive(engineId);
    if (!healthy) {
      await rollbackToVieneu();
      return { ok: false, error: 'Engine mới không phản hồi sau khi khởi động — đã quay lại VieNeu.' };
    }
    return { ok: true };
  });

  async function rollbackToVieneu() {
    const port = getPythonPort();
    try {
      if (port) {
        await fetch(`http://127.0.0.1:${port}/config`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ engine: 'vieneu' }), signal: AbortSignal.timeout(5000),
        }).catch(() => {});
      }
      // Ghi thẳng config file phòng khi server chết (không PUT được).
      const { vieneuConfigPath } = await import('./data/paths');
      const p = vieneuConfigPath();
      if (existsSync(p)) {
        const cfg = JSON.parse(readFileSync(p, 'utf-8'));
        cfg.engine = 'vieneu';
        writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf-8');
      }
      stopPythonServer();
      const { vieneuDir } = await import('./data/paths');
      await startPythonServer(vieneuDir());
    } catch (err) {
      console.error('[tts:engine-switch] rollback failed:', err);
    }
  }

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

  // Cài thư viện tăng tốc (onnxruntime-gpu) theo nhu cầu — CHỈ bản dev (có venv+pip).
  // Bản đóng gói dùng PyInstaller binary, không có pip → báo rõ không hỗ trợ.
  ipcMain.handle('tts:install-accel', async (_e, { packageName }: { packageName: string }) => {
    if (app.isPackaged) {
      return {
        ok: false,
        error: 'Bản cài đặt sẵn không hỗ trợ tải thêm thư viện tăng tốc. Cần chạy từ mã nguồn (dev) để cài onnxruntime-gpu.',
      };
    }
    // Whitelist package để tránh chạy pip install tuỳ ý.
    const ALLOWED = new Set(['onnxruntime-gpu', 'onnxruntime-directml']);
    if (!ALLOWED.has(packageName)) {
      return { ok: false, error: `Gói không hợp lệ: ${packageName}` };
    }
    const py = getPythonPath();
    return await new Promise<{ ok: boolean; error?: string; log?: string }>((resolve) => {
      const proc = spawn(py, ['-m', 'pip', 'install', packageName], { windowsHide: true });
      let out = '';
      proc.stdout?.on('data', (d) => { out += d.toString(); });
      proc.stderr?.on('data', (d) => { out += d.toString(); });
      proc.on('error', (err) => resolve({ ok: false, error: err.message, log: out }));
      proc.on('close', (code) => {
        if (code === 0) resolve({ ok: true, log: out });
        else resolve({ ok: false, error: `pip install thoát code ${code}`, log: out.slice(-2000) });
      });
    });
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
  ipcMain.handle('tts:clone-voice', async (_e, { filePath, label, gender, region }: {
    filePath: string; label: string; gender?: string; region?: string;
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

  // Ẩn/hiện giọng (PUT /voices/{id})
  ipcMain.handle('tts:update-voice', async (_e, { voiceId, hidden }: { voiceId: string; hidden: boolean }) => {
    const port = getPythonPort();
    if (!port) return { ok: false, error: 'TTS server chưa sẵn sàng' };
    try {
      const res = await fetch(`http://127.0.0.1:${port}/voices/${encodeURIComponent(voiceId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden }),
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

  function getPregenBatchId(): string {
    // Dùng graduation_batch_id của lô dữ liệu hiện tại, fallback về 'default'
    const students = ceremonyStore.getStudents();
    return students?.[0]?.graduation_batch_id || 'default';
  }

  ipcMain.handle('tts:pregen-start', async (_e, payload: {
    regenerate?: boolean;
    config: { template: string; ttsModel: string; ttsSpeed: number; ttsConditions?: any[] };
  }) => {
    const students = ceremonyStore.getStudents();
    if (!students || students.length === 0) {
      return { ok: false, error: 'Chưa có dữ liệu sinh viên' };
    }
    const batchId = getPregenBatchId();

    // Tạo queue mới nếu batchId đổi hoặc config đổi (giọng/tốc độ/template)
    if (!pregenQueue || pregenQueue.getBatchId() !== batchId || pregenQueue.configChanged(payload.config)) {
      pregenQueue = new PreGenQueue(batchId, students, payload.config, (status: PreGenStatus) => {
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
    if (!pregenQueue) {
      const students = ceremonyStore.getStudents();
      if (!students || students.length === 0) return null;
      const batchId = getPregenBatchId();
      const config = getTtsPregenConfig();
      pregenQueue = new PreGenQueue(batchId, students, config, (status: PreGenStatus) => {
        getMainWindow()?.webContents.send('tts:pregen-progress', status);
      });
    }
    return pregenQueue.getStatus();
  });

  ipcMain.handle('tts:pregen-requeue', (_e, { studentCode }: { studentCode: string }) => {
    if (!pregenQueue) return { ok: false, error: 'Không có queue đang chạy' };
    const result = pregenQueue.requeueOne(studentCode);
    return { ok: result };
  });

  ipcMain.handle('tts:pregen-get-audio', (_e, { studentCode }: { studentCode: string }) => {
    const batchId = getPregenBatchId();
    const wavPath = ttsPregenWavPath(batchId, studentCode);
    console.log(`[TTS PreGen] get-audio batchId=${batchId} studentCode=${studentCode} wavPath=${wavPath} exists=${existsSync(wavPath)}`);
    if (!existsSync(wavPath)) {
      return { ok: false, error: 'File WAV chưa được tạo' };
    }
    try {
      const buffer = readFileSync(wavPath);
      console.log(`[TTS PreGen] get-audio ok studentCode=${studentCode} bytes=${buffer.length}`);
      return { ok: true, buffer };
    } catch (err) {
      console.error(`[TTS PreGen] get-audio error studentCode=${studentCode} wavPath=${wavPath}`, err);
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
