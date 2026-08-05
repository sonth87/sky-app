import { spawn, ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, chmodSync, mkdirSync, readdirSync, copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { vieneuRefDir, vieneuRegistryPath, vieneuConfigPath, ttsEnginesDir, ttsEngineDir, ttsAccelDir } from './data/paths';
const DEBUG_LOG_FILE = join(app.getPath('userData'), 'tts-debug.log');
const DEFAULT_PORT = 8089;
const MAX_PORT_TRIES = 20;
const HEALTH_POLL_INTERVAL_MS = 500;
// 300s: VieNeu ONNX (bundled) load trong 30-60s, nhưng engine mở rộng nặng (vd VoxCPM —
// torch, model ~4.5GB) đo thực tế đã hết 118s CHỈ để đọc file safetensors từ đĩa (I/O-bound,
// không phải CPU) — gần sát ngưỡng cũ 120s, chỉ cần máy bận thêm chút (Electron + service cũ
// còn chạy song song lúc restart) là vượt ngưỡng. Bug thật 2026-08-05: đổi sang VoxCPM báo lỗi
// timeout dù engine load được, chỉ là chậm hơn khoảng đệm cho phép.
const HEALTH_TIMEOUT_MS = 300_000;

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

/**
 * Dev-only: `apps/tts-service/resources/voice-ref` (nguồn thật — nơi dev thêm voice/ngôn
 * ngữ mới), thay vì `apps/shell-electron/resources/voice-ref` (bản copy chỉ đồng bộ thủ
 * công qua `apps/tts-service/build.sh`). Trỏ thẳng vào đây để thêm voice/thư mục ngôn ngữ
 * mới dưới tts-service ăn ngay lúc dev, không cần chạy build.sh hay copy tay. `null` nếu
 * không tìm thấy (packaged build, hoặc checkout thiếu apps/tts-service) — caller tự fallback
 * về resources/voice-ref như trước.
 */
function getDevVoiceRefDir(): string | null {
  if (app.isPackaged) return null;
  const monoRoot = findMonoRoot(__dirname);
  const cand = join(monoRoot, 'apps/tts-service/resources/voice-ref');
  return existsSync(cand) ? cand : null;
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

/**
 * Runtime tăng tốc (GPU) cho engine VieNeu bundled — chỉ dùng ở bản ĐÓNG GÓI.
 *
 * Bản đóng gói vốn chạy VieNeu bằng binary PyInstaller đã đóng băng onnxruntime CPU,
 * nên không thể bật GPU cho nó. Khi người dùng cài gói tăng tốc, ta dựng một Python
 * rời có onnxruntime-gpu/directml + trọn bộ dependency server (xem ttsAccelDir) và
 * chạy main.py bằng nó thay cho binary.
 *
 * Trả null khi: chạy dev (venv đã có sẵn, cài thẳng vào đó), chưa cài tăng tốc, hoặc
 * người dùng đang chọn CPU — lúc đó giữ binary PyInstaller vì nhẹ và khởi động nhanh hơn.
 */
function resolveAccelSpawn(providers: string): { cmd: string; args: string[]; sitePackages: string } | null {
  if (!app.isPackaged || !providers) return null;
  const serverDir = getServerDir();
  if (!serverDir) return null;
  const mainPy = join(serverDir, 'main.py');
  const runtimeDir = join(ttsAccelDir(), 'runtime');
  const sitePackages = join(runtimeDir, 'site-packages');
  const py = process.platform === 'win32'
    ? join(runtimeDir, 'python', 'python.exe')
    : join(runtimeDir, 'python', 'bin', 'python3');
  if (!existsSync(mainPy) || !existsSync(sitePackages) || !existsSync(py)) return null;
  return { cmd: py, args: [mainPy], sitePackages };
}

function logPackagedResources() {
  const resourcesPath = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
  const refDir = getDevVoiceRefDir() ?? join(resourcesPath, 'voice-ref');
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
  // NF/NF2/SF/NM1/SM (giọng placeholder cũ) đã bị xoá khỏi voice-registry.json 2026-08-04 —
  // dùng giọng mặc định mới (Giang, clone-d0f05071) thay thế, khớp default fallback ở
  // ipc.ts's synthesizeTtsStudio và platform-web's tts.ts.
  const speakers = ['clone-d0f05071'];

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

    // Ref clone + registry ghi vào userData (không phải bundle read-only trên bản đã
    // đóng gói). Seed 6 ref mặc định từ bundle sang userData lần đầu để giọng preset
    // hoạt động. Khi dev (!isPackaged): trỏ THẲNG vào resources/ trong repo — sửa
    // catalog.json/voice-registry.json/*.wav ăn ngay, không cần mò userData + restart.
    // Giữ NGUYÊN ở bundledRefDir (apps/shell-electron/resources/, gitignored) — đây là nơi
    // ghi cloned-ref WAV mới (server tự tạo khi import catalog voice/user clone), không phải
    // apps/tts-service/resources/ (có git track): trỏ thẳng chỗ ghi vào đó sẽ khiến mỗi lần
    // bấm nghe thử/chọn 1 catalog voice mới lại đẻ ra file + sửa voice-registry.json ngay
    // trong source tree, hiện lên git status ngoài ý muốn.
    const userRefDir = isPackaged ? vieneuRefDir() : bundledRefDir;
    const userRegistryPath = isPackaged ? vieneuRegistryPath() : join(resourcesPath, 'voice-registry.json');
    const userConfigPath = isPackaged ? vieneuConfigPath() : join(resourcesPath, 'vieneu-config.json');
    if (isPackaged) {
      seedUserVoiceDir(bundledRefDir, resourcesPath, userRefDir, userRegistryPath);
    }

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
    } else {
      // Không phải engine mở rộng → VieNeu. Nếu người dùng đã bật tăng tốc phần cứng ở
      // bản đóng gói thì phải chạy bằng runtime có onnxruntime-gpu, vì binary PyInstaller
      // chỉ có onnxruntime CPU.
      const accel = resolveAccelSpawn(device.providers);
      if (accel) {
        cmd = accel.cmd;
        args = accel.args;
        extraEnv = {
          PYTHONPATH: [accel.sitePackages, getServerDir(), process.env.PYTHONPATH ?? '']
            .filter(Boolean).join(process.platform === 'win32' ? ';' : ':'),
        };
        console.log(`[Python Server] Tăng tốc '${device.providers}' → spawn runtime ${cmd}`);
        writeDebugLog(`[Python Server] accel runtime: ${cmd}`);
      }
    }

    // Dev-only, read-only: trỏ thẳng vào apps/tts-service/resources/voice-ref (nguồn thật,
    // có git track) để browse catalog (/voices/catalog) thấy voice/thư mục ngôn ngữ mới thêm
    // ngay lập tức — không cần build.sh sync hay copy tay. Tách riêng khỏi VIENEU_REF_DIR
    // (userRefDir ở trên) vì catalog dir CHỈ ĐỌC (xem voice_catalog.py's docstring), còn
    // VIENEU_REF_DIR còn được server GHI file mới vào (cloned-ref WAV) — nếu dùng chung 1
    // dir sẽ ghi thẳng vào source tree có git track mỗi lần test nghe thử/chọn catalog voice.
    const devCatalogDir = getDevVoiceRefDir();

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
        ...(devCatalogDir ? { VIENEU_CATALOG_DIR: devCatalogDir } : {}),
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
    if (devCatalogDir) console.log(`[Python Server] spawn env VIENEU_CATALOG_DIR=${devCatalogDir}`);
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

// Thời gian chờ process cũ tự thoát sau SIGTERM trước khi buộc SIGKILL. Bug thật 2026-08-05:
// hàm này TRƯỚC ĐÂY gửi tín hiệu rồi return ngay (không đợi exit) → khi tts:restart gọi
// startPythonServer() gần như đồng thời, engine cũ (vd VoxCPM — torch, model nặng, đang
// load/infer dở nên không xử lý SIGTERM kịp) vẫn sống song song với process mới, giữ nguyên
// RAM đã cấp phát (quan sát thực tế ~18GB) — đúng như user thấy trong Activity Monitor. Bằng
// chứng: process mới bị đẩy sang port fallback (8090) vì 8089 vẫn bị process cũ giữ.
// 3s là đủ cho graceful shutdown (app đi qua __del__, release model) — không quá lâu khi
// engine đang load model nặng (torch, safetensors I/O) không kịp respond trước SIGKILL.
const STOP_TIMEOUT_MS = 3_000;

export function stopPythonServer(): Promise<void> {
  const proc = pythonProcess;
  pythonProcess = null;
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  console.log('[Python Server] Đang tắt...');
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn('[Python Server] Process không thoát sau SIGTERM, buộc SIGKILL...');
      // SIGKILL không hợp lệ trên Windows nhưng Windows bỏ qua tên signal và luôn
      // TerminateProcess ngay lập tức, nên gọi chung được cả 2 platform.
      try { proc.kill('SIGKILL'); } catch {}
    }, STOP_TIMEOUT_MS);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    if (!proc.kill('SIGTERM')) proc.kill();
  });
}
