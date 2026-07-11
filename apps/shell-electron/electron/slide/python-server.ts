import { spawn, ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, chmodSync, mkdirSync, readdirSync, copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { vieneuRefDir, vieneuRegistryPath, vieneuConfigPath, ttsEnginesDir, ttsEngineDir } from './data/paths';
const DEBUG_LOG_FILE = join(app.getPath('userData'), 'tts-debug.log');
const DEFAULT_PORT = 8089;
const MAX_PORT_TRIES = 20;
const HEALTH_POLL_INTERVAL_MS = 500;
const HEALTH_TIMEOUT_MS = 120_000; // 120s - VieNeu ONNX model load có thể mất 30-60s

let pythonProcess: ChildProcess | null = null;
let actualPort = DEFAULT_PORT;
let lastStartupError: string | null = null;
let lastExitCode: number | null = null;
let executableUsed: string = '';
const recentStderr: string[] = []; // rolling buffer, tối đa 40 dòng
let currentStatus: PythonStatus = 'starting';
let currentStatusDetail = '';

export type PythonStatus = 'starting' | 'ready' | 'error';

/** Tìm port trống phía Electron (dự phòng nếu Python không in ra port) */
async function findFreePort(preferred: number): Promise<number> {
  const net = await import('node:net');
  for (let p = preferred; p < preferred + MAX_PORT_TRIES; p++) {
    const free = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => { srv.close(); resolve(true); });
      srv.listen(p, '127.0.0.1');
    });
    if (free) return p;
  }
  return preferred;
}

function pushStatus(status: PythonStatus, detail?: string) {
  currentStatus = status;
  currentStatusDetail = detail ?? '';
  const payload = { status, detail: detail ?? '' };
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send('python:status', payload);
  });
}

function writeDebugLog(line: string) {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    appendFileSync(DEBUG_LOG_FILE, `${new Date().toISOString()} ${line}\n`, 'utf8');
  } catch (err) {
    console.warn('[Python Server] Failed to write debug log:', err);
  }
}

/** Walk up từ dir cho đến khi tìm thấy pnpm-workspace.yaml — monorepo root */
function findMonoRoot(dir: string): string {
  let current = dir;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = join(current, '..');
    if (parent === current) break;
    current = parent;
  }
  return dir;
}

/**
 * Thư mục chứa code server Python (main.py, engine_registry.py, verify_engine.py).
 * Dev: apps/tts-service/server. Packaged: cạnh binary (python-backend nếu có) — bản
 * đóng gói dùng binary PyInstaller nên verify engine mở rộng chỉ chạy được ở bản dev
 * (cần Python script + runtime). Trả '' nếu không tìm thấy.
 */
export function getServerDir(): string {
  if (app.isPackaged) {
    const cand = join(process.resourcesPath, 'python-backend');
    return existsSync(cand) ? cand : '';
  }
  const monoRoot = findMonoRoot(__dirname);
  const cand = join(monoRoot, 'apps/tts-service/server');
  return existsSync(cand) ? cand : '';
}

export function getPythonPath(): string {
  const isWin = process.platform === 'win32';
  const venvName = isWin ? 'Scripts/python.exe' : 'bin/python';
  const monoRoot = findMonoRoot(__dirname);
  const pathsToTry = [
    join(monoRoot, 'apps/tts-service/venv', venvName),
    join(monoRoot, 'apps/slide/python-backend/venv', venvName),
    join(process.cwd(), 'apps/tts-service/venv', venvName),
    join(process.cwd(), 'apps/slide/python-backend/venv', venvName),
    join(process.cwd(), 'python-backend/venv', venvName),
    join(app.getAppPath(), 'python-backend', 'venv', venvName),
    join(app.getAppPath(), '../../python-backend/venv', venvName),
  ];
  for (const p of pathsToTry) {
    if (existsSync(p)) {
      console.log(`[Python Server] venv found: ${p}`);
      writeDebugLog(`[Python Server] venv found: ${p}`);
      return p;
    }
  }
  console.warn('[Python Server] venv not found, using system Python');
  writeDebugLog('[Python Server] venv not found, using system Python');
  return isWin ? 'python' : 'python3';
}

function getExecutablePath(): string {
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'vieneu-server.exe' : 'vieneu-server';
  if (app.isPackaged) return join(process.resourcesPath, binName);
  return join(app.getAppPath(), 'resources', binName);
}

/**
 * Seed thư mục voice ghi được trong userData từ bundle (lần đầu / bổ sung file thiếu).
 * - Copy các ref WAV mặc định từ bundledRefDir sang userRefDir nếu chưa có.
 * - Copy voice-registry.json mẫu (nếu bundle có) sang userData nếu chưa tồn tại.
 * Idempotent: chỉ copy file còn thiếu, KHÔNG ghi đè (giữ giọng clone người dùng tạo).
 */
function seedUserVoiceDir(
  bundledRefDir: string,
  resourcesPath: string,
  userRefDir: string,
  userRegistryPath: string,
): void {
  try {
    mkdirSync(userRefDir, { recursive: true });
    if (existsSync(bundledRefDir)) {
      for (const f of readdirSync(bundledRefDir)) {
        if (!f.toLowerCase().endsWith('.wav')) continue;
        const dst = join(userRefDir, f);
        if (!existsSync(dst)) {
          copyFileSync(join(bundledRefDir, f), dst);
        }
      }
    }
    // Registry: chỉ seed nếu userData chưa có. Nếu bundle không kèm registry mẫu thì
    // để Python tự khởi tạo mặc định (VoiceRegistry._load_or_init).
    if (!existsSync(userRegistryPath)) {
      const bundledRegistry = join(resourcesPath, 'voice-registry.json');
      if (existsSync(bundledRegistry)) {
        copyFileSync(bundledRegistry, userRegistryPath);
      }
    }
    console.log(`[Python Server] seeded user voice dir: ${userRefDir}`);
    writeDebugLog(`[Python Server] seeded user voice dir: ${userRefDir}`);
  } catch (err) {
    console.warn('[Python Server] seedUserVoiceDir failed:', err);
    writeDebugLog(`[Python Server] seedUserVoiceDir failed: ${String(err)}`);
  }
}

/** Đọc phần device (providers/threads) từ config.json. Lỗi/thiếu → mặc định CPU auto. */
function readDeviceConfig(configPath: string): { providers: string; threads: number; engine: string } {
  try {
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
      const dev = cfg?.device ?? {};
      return {
        providers: typeof dev.providers === 'string' ? dev.providers : '',
        threads: Number.isFinite(dev.threads) ? Math.max(0, Math.floor(dev.threads)) : 0,
        engine: typeof cfg?.engine === 'string' ? cfg.engine : 'vieneu',
      };
    }
  } catch (err) {
    console.warn('[Python Server] readDeviceConfig failed:', err);
  }
  return { providers: '', threads: 0, engine: 'vieneu' };
}

/**
 * Nếu engine đang chọn là engine MỞ RỘNG đã cài (có runtime tự chứa), trả cmd/args
 * để spawn bằng runtime đó (main.py engine-agnostic + VIENEU_ENGINE + PYTHONPATH torch).
 * Trả null nếu là VieNeu bundled hoặc engine chưa có runtime → dùng đường spawn mặc định.
 */
function resolveExtensionEngineSpawn(engineId: string): { cmd: string; args: string[]; sitePackages: string } | null {
  if (!engineId || engineId === 'vieneu') return null;
  const serverDir = getServerDir();
  if (!serverDir) return null;
  const runtimeDir = join(ttsEngineDir(engineId), 'runtime');
  const sitePackages = join(runtimeDir, 'site-packages');
  const mainPy = join(serverDir, 'main.py');
  if (!existsSync(mainPy) || !existsSync(sitePackages)) return null;
  // Python để chạy engine:
  //  - Packaged: Python embeddable tự chứa (runtime/bin/python | python.exe).
  //  - Dev: không có embeddable → dùng venv app + PYTHONPATH tới site-packages đã pip --target.
  const embeddablePy = process.platform === 'win32'
    ? join(runtimeDir, 'python.exe')
    : join(runtimeDir, 'bin', 'python');
  const cmd = existsSync(embeddablePy) ? embeddablePy : getPythonPath();
  return { cmd, args: [mainPy], sitePackages };
}

function logPackagedResources() {
  const resourcesPath = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
  const refDir = join(resourcesPath, 'voice-ref');
  const previewDir = join(resourcesPath, 'voice-previews');
  console.log(`[Python Server] app.isPackaged=${app.isPackaged}`);
  console.log(`[Python Server] process.resourcesPath=${process.resourcesPath}`);
  console.log(`[Python Server] resourcesPath=${resourcesPath}`);
  console.log(`[Python Server] expected VIENEU_REF_DIR=${refDir}`);
  console.log(`[Python Server] expected VIENEU_PREVIEW_DIR=${previewDir}`);
  console.log(`[Python Server] refDir exists=${existsSync(refDir)}`);
  console.log(`[Python Server] previewDir exists=${existsSync(previewDir)}`);
  writeDebugLog(`[Python Server] app.isPackaged=${app.isPackaged}`);
  writeDebugLog(`[Python Server] process.resourcesPath=${process.resourcesPath}`);
  writeDebugLog(`[Python Server] resourcesPath=${resourcesPath}`);
  writeDebugLog(`[Python Server] expected VIENEU_REF_DIR=${refDir}`);
  writeDebugLog(`[Python Server] expected VIENEU_PREVIEW_DIR=${previewDir}`);
  writeDebugLog(`[Python Server] refDir exists=${existsSync(refDir)}`);
  writeDebugLog(`[Python Server] previewDir exists=${existsSync(previewDir)}`);
  try {
    if (existsSync(resourcesPath)) {
      console.log(`[Python Server] resources entries=${readdirSync(resourcesPath).join(', ')}`);
      writeDebugLog(`[Python Server] resources entries=${readdirSync(resourcesPath).join(', ')}`);
    }
  } catch (err) {
    console.warn('[Python Server] Failed to list resources entries:', err);
    writeDebugLog(`[Python Server] Failed to list resources entries: ${String(err)}`);
  }
}

/** Poll GET /health cho đến khi ok hoặc timeout */
function waitForHealth(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    const poll = () => {
      if (Date.now() > deadline) { resolve(false); return; }
      fetch(`http://127.0.0.1:${port}/health`)
        .then((r) => { if (r.ok) resolve(true); else setTimeout(poll, HEALTH_POLL_INTERVAL_MS); })
        .catch(() => setTimeout(poll, HEALTH_POLL_INTERVAL_MS));
    };
    poll();
  });
}

/** Warmup thật sự: gọi /synthesize với text ngắn để load ONNX vào RAM */
async function warmupSessions(port: number): Promise<void> {
  const speakers = ['NF', 'NF2', 'SF', 'NM1', 'SM'];

  for (const speaker of speakers) {
    try {
      console.log(`[Python Server] Warming up speaker ${speaker}...`);
      const response = await fetch(`http://127.0.0.1:${port}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'xin chào', speaker_id: speaker, speed: 1.0 }),
        signal: AbortSignal.timeout(60000), // 60s timeout — VieNeu lần đầu tải model vào RAM
      });

      if (!response.ok) {
        console.warn(`[Python Server] Warmup for ${speaker} returned status ${response.status}`);
        return; // Stop if one fails
      }

      // Consume response body to ensure it's fully downloaded
      await response.arrayBuffer();
      console.log(`[Python Server] Warmup ${speaker} done`);
    } catch (e) {
      console.warn(`[Python Server] Warmup for ${speaker} failed:`, e);
      return; // Stop on first error
    }
  }

  console.log('[Python Server] All speakers warmed up - ONNX models ready in RAM');
}

export function getPythonPort(): number {
  return actualPort;
}

export function getPythonStatus(): { status: PythonStatus; detail: string } {
  return { status: currentStatus, detail: currentStatusDetail };
}

const MAX_STARTUP_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export async function startPythonServer(vieneuModelDir: string): Promise<void> {
  for (let attempt = 1; attempt <= MAX_STARTUP_RETRIES; attempt++) {
    try {
      console.log(`[Python Server] Attempt ${attempt}/${MAX_STARTUP_RETRIES}`);
      await startPythonServerOnce(vieneuModelDir);
      return; // Success
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Python Server] Attempt ${attempt} failed: ${msg}`);
      if (attempt < MAX_STARTUP_RETRIES) {
        pushStatus('starting', `Khởi động TTS engine (lần ${attempt + 1}/${MAX_STARTUP_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        pushStatus('error', `TTS engine không thể khởi động sau ${MAX_STARTUP_RETRIES} lần thử`);
        throw err;
      }
    }
  }
}

async function startPythonServerOnce(vieneuModelDir: string): Promise<void> {
  const isPackaged = app.isPackaged;
  let cmd = '';
  let args: string[] = [];

  // Tìm port trống trước
  const preferredPort = parseInt(process.env.VIENEU_PORT ?? String(DEFAULT_PORT), 10);
  actualPort = await findFreePort(preferredPort);

  if (isPackaged) {
    const exePath = getExecutablePath();
    if (existsSync(exePath)) {
      cmd = exePath;
      if (process.platform !== 'win32') {
        try { chmodSync(exePath, 0o755); } catch {}
      }
    } else {
      cmd = getPythonPath();
      const scriptPaths = [
        join(process.resourcesPath, 'python-backend', 'main.py'),
        join(process.resourcesPath, 'main.py'),
      ];
      args = [scriptPaths.find(existsSync) ?? scriptPaths[0]];
    }
  } else {
    cmd = getPythonPath();
    const monoRoot = findMonoRoot(__dirname);
    const scriptPaths = [
      join(monoRoot, 'apps/tts-service/server/main.py'),
      join(process.cwd(), 'apps/tts-service/server/main.py'),
      join(app.getAppPath(), 'python-backend', 'main.py'),
      join(process.cwd(), 'apps/slide/python-backend/main.py'),
      join(process.cwd(), 'python-backend/main.py'),
    ];
    args = [scriptPaths.find(existsSync) ?? scriptPaths[0]];
  }

  executableUsed = `${cmd}${args.length ? ' ' + args.join(' ') : ''}`;
  lastStartupError = null;
  console.log(`[Python Server] Khởi chạy port=${actualPort}: ${cmd} ${args.join(' ')}`);
  logPackagedResources();

  try {
    const resourcesPath = isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
    const bundledRefDir = join(resourcesPath, 'voice-ref');
    const previewDir = join(resourcesPath, 'voice-previews');
    const logFilePath = join(app.getPath('userData'), 'tts-debug.log');

    // Ref clone + registry ghi vào userData (không phải bundle read-only). Seed 6 ref
    // mặc định từ bundle sang userData lần đầu để giọng preset hoạt động.
    const userRefDir = vieneuRefDir();
    const userRegistryPath = vieneuRegistryPath();
    const userConfigPath = vieneuConfigPath();
    seedUserVoiceDir(bundledRefDir, resourcesPath, userRefDir, userRegistryPath);

    // Device settings (provider/thread) + engine đang chọn → truyền qua env khi spawn.
    const device = readDeviceConfig(userConfigPath);

    // Engine MỞ RỘNG đã cài (runtime tự chứa) → spawn bằng runtime đó thay vì binary VieNeu.
    // VieNeu (mặc định) hoặc engine chưa có runtime → giữ cmd/args mặc định ở trên.
    const ext = resolveExtensionEngineSpawn(device.engine);
    let extraEnv: Record<string, string> = {};
    if (ext) {
      cmd = ext.cmd;
      args = ext.args;
      extraEnv = {
        VIENEU_ENGINE: device.engine,
        PYTHONPATH: [ext.sitePackages, getServerDir(), process.env.PYTHONPATH ?? '']
          .filter(Boolean).join(process.platform === 'win32' ? ';' : ':'),
      };
      console.log(`[Python Server] Engine mở rộng '${device.engine}' → spawn runtime ${cmd}`);
    }

    pythonProcess = spawn(cmd, args, {
      stdio: 'pipe',
      windowsHide: true,
      env: {
        ...process.env,
        VIENEU_PORT: String(actualPort),
        HF_HOME: vieneuModelDir,
        HF_HUB_OFFLINE: '1',
        RESOURCES_PATH: resourcesPath,
        VIENEU_PREVIEW_DIR: previewDir,
        VIENEU_REF_DIR: userRefDir,
        VIENEU_REGISTRY_PATH: userRegistryPath,
        VIENEU_CONFIG_PATH: userConfigPath,
        VIENEU_ENGINES_DIR: ttsEnginesDir(),
        VIENEU_ONNX_PROVIDERS: device.providers,
        VIENEU_ONNX_THREADS: String(device.threads),
        LOG_FILE_PATH: logFilePath,
        ...extraEnv,
      },
    });
    console.log(`[Python Server] spawn env RESOURCES_PATH=${resourcesPath}`);
    console.log(`[Python Server] spawn env VIENEU_REF_DIR=${userRefDir}`);
    console.log(`[Python Server] spawn env VIENEU_REGISTRY_PATH=${userRegistryPath}`);
    console.log(`[Python Server] spawn env VIENEU_PREVIEW_DIR=${previewDir}`);
    console.log(`[Python Server] spawn env LOG_FILE_PATH=${logFilePath}`);

    // Đọc port thực từ stdout ("VIENEU_PORT=XXXX")
    pythonProcess.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      console.log(`[Python Server stdout] ${line}`);
      
      // Ghi log stdout vào rolling buffer
      recentStderr.push(`[${new Date().toLocaleTimeString('vi-VN')}] [stdout] ${line}`);
      if (recentStderr.length > 60) recentStderr.shift();

      const m = line.match(/^VIENEU_PORT=(\d+)/);
      if (m) actualPort = parseInt(m[1], 10);

      // Cập nhật trạng thái chi tiết thời gian thực khi đang khởi chạy
      if (currentStatus === 'starting') {
        const lastLine = line.split('\n').pop()?.trim() ?? line;
        if (lastLine && !lastLine.startsWith('VIENEU_PORT=')) {
          pushStatus('starting', lastLine.replace(/^\[VieNeu Python\]\s*/, ''));
        }
      }
    });
    pythonProcess.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      console.warn(`[Python Server stderr] ${line}`);
      
      // Ghi log stderr vào rolling buffer
      recentStderr.push(`[${new Date().toLocaleTimeString('vi-VN')}] [stderr] ${line}`);
      if (recentStderr.length > 60) recentStderr.shift();

      // Cập nhật trạng thái chi tiết thời gian thực khi đang khởi chạy
      if (currentStatus === 'starting') {
        const lastLine = line.split('\n').pop()?.trim() ?? line;
        if (lastLine) {
          pushStatus('starting', lastLine);
        }
      }
    });
    pythonProcess.on('error', (err) => {
      console.error('[Python Server] Lỗi:', err);
      lastStartupError = err.message;
      pushStatus('error', err.message);
    });
    pythonProcess.on('close', (code) => {
      console.log(`[Python Server] Thoát code=${code}`);
      lastExitCode = code;
      pythonProcess = null;
      if (code !== 0) pushStatus('error', `Process thoát với code ${code}`);
    });

    // Poll health
    const ok = await waitForHealth(actualPort);
    if (!ok) {
      pushStatus('error', `Không thể kết nối tới TTS engine sau ${HEALTH_TIMEOUT_MS / 1000}s`);
      return;
    }

    // Warmup ONNX sessions ngay sau khi server ready
    await warmupSessions(actualPort);
    pushStatus('ready', `TTS engine sẵn sàng (port ${actualPort})`);
  } catch (err) {
    // Re-throw để retry mechanism ở startPythonServer() xử lý
    throw err;
  }
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
}

export async function getTtsDebugInfo(): Promise<TtsDebugInfo> {
  let healthOk: boolean | null = null;
  try {
    const r = await fetch(`http://127.0.0.1:${actualPort}/health`, { signal: AbortSignal.timeout(3000) });
    healthOk = r.ok;
  } catch {
    healthOk = false;
  }
  return {
    port: actualPort,
    processAlive: pythonProcess !== null,
    processPid: pythonProcess?.pid ?? null,
    executableUsed,
    lastStartupError,
    lastExitCode,
    healthOk,
    recentStderr: [...recentStderr],
  };
}

export function stopPythonServer() {
  if (pythonProcess) {
    console.log('[Python Server] Đang tắt...');
    // SIGKILL không hợp lệ trên Windows — dùng kill() không argument (TerminateProcess)
    if (!pythonProcess.kill('SIGTERM')) pythonProcess.kill();
    pythonProcess = null;
  }
}
