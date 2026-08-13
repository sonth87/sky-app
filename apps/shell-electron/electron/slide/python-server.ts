import { spawn, ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, chmodSync, mkdirSync, readdirSync, copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { vieneuRefDir, vieneuRegistryPath, vieneuConfigPath, ttsEnginesDir, ttsRuntimeDir, skyAppDbPath } from './data/paths';
import { resolveRuntimePython } from './python-runtime';
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

export type PythonStatus = 'starting' | 'ready' | 'error';

/**
 * Nhóm tiến trình Python (GĐ B của docs/roadmap/plans/tts-engine-architecture.md).
 *
 *  - 'bundled': chạy binary/main.py kèm app — phục vụ VieNeu và mọi engine torch-free
 *    mà process này nạp được tại chỗ (xem create_engine phía Python).
 *  - 'ext':     chạy runtime RIÊNG của một engine mở rộng (torch…). Mỗi lúc chỉ phục vụ
 *    đúng 1 engine; đổi sang engine mở rộng khác thì dựng lại nhóm này.
 *
 * Hai nhóm SỐNG SONG SONG: đổi engine không còn giết tiến trình đang chạy, nên quay lại
 * engine cũ là tức thì thay vì phải nạp lại model (VoxCPM đo thực tế ~118s mỗi lần nạp).
 */
export type PythonTier = 'bundled' | 'ext';

interface TierState {
  proc: ChildProcess | null;
  port: number;
  status: PythonStatus;
  statusDetail: string;
  /** Engine mà tiến trình này được dựng để phục vụ (nhóm 'ext' ràng buộc đúng 1 engine). */
  engineId: string;
  executableUsed: string;
  lastStartupError: string | null;
  lastExitCode: number | null;
  recentStderr: string[];   // rolling buffer, tối đa 60 dòng
}

function newTierState(engineId: string): TierState {
  return {
    proc: null,
    port: DEFAULT_PORT,
    status: 'starting',
    statusDetail: '',
    engineId,
    executableUsed: '',
    lastStartupError: null,
    lastExitCode: null,
    recentStderr: [],
  };
}

const tiers = new Map<PythonTier, TierState>();
/** Nhóm đang phục vụ request. CHỈ đổi sau khi nhóm mới đã health-check xong. */
let activeTier: PythonTier = 'bundled';

function activeState(): TierState | undefined {
  return tiers.get(activeTier);
}

/**
 * Nhóm nào chạy được engine này?
 *
 * CHỈ engine cần runtime tự chứa RIÊNG (torch, mlx...) mới cần process riêng ('ext') —
 * các runtime này có thể mang numpy/onnxruntime bản khác với bản đã bundle sẵn trong
 * process 'bundled', nạp chung dễ lệch ABI. Engine 'onnx-bundled'/'onnx-ext' đều nạp
 * được NGAY TRONG process 'bundled' đang chạy qua `create_engine()`'s sys.path append
 * (phía Python, xem engine_registry.py) — không cần spawn gì thêm.
 *
 * Allowlist NGƯỢC (loại trừ 'onnx-ext' thay vì liệt kê 'torch') — tương lai thêm kind
 * runtime tự chứa mới (vd 'mlx', đã thêm 2026-08-11) tự động rơi đúng nhánh 'ext' mà
 * không phải sửa hàm này, chỉ 'onnx-ext' (nạp tại chỗ) mới cần liệt kê tường minh.
 *
 * Bug thật phát hiện lúc làm GĐ C (2026-08-11): bản GĐ B trước đó coi MỌI engine không
 * phải 'vieneu' là 'ext' hễ đã cài xong (chỉ check `resolveExtensionEngineSpawn` có trả
 * kết quả không, không phân biệt kind) — khiến engine torch-free (MOSS) vẫn bị spawn
 * process riêng dù phía Python đã hỗ trợ nạp tại chỗ từ GĐ A, lãng phí thời gian/RAM
 * không cần thiết cho đúng trường hợp mà tính năng "nạp tại chỗ" sinh ra để phục vụ.
 */
export async function tierOfEngine(engineId: string): Promise<PythonTier> {
  if (!engineId || engineId === 'vieneu') return 'bundled';
  const { engineRuntimeKind } = await import('./engine-installer');
  if (engineRuntimeKind(engineId) === 'onnx-ext') return 'bundled';
  return (await resolveExtensionEngineSpawn(engineId)) ? 'ext' : 'bundled';
}

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

/**
 * Đẩy 1 dòng stdout/stderr thô sang mọi renderer window — nguồn cho tab "Nhật ký" (Logs)
 * kiểu cuộn realtime tham khảo voicebox (xem `TtsLogPanel.tsx`). Phát cho MỌI tier, không
 * lọc theo `activeTier` như `pushStatus` — đây là log gỡ lỗi thô, hữu ích thấy cả tier đang
 * chạy nền (blue-green đổi engine), không chỉ tier đang phục vụ request.
 *
 * 1 event = 1 lần `data` từ stdout/stderr, KHÔNG tách theo dấu xuống dòng thật — giữ đúng
 * cách `recentStderr`/`console.log` ở 2 nơi gọi hàm này đã làm từ trước (limitation có sẵn,
 * không phải lỗi mới): 1 chunk có thể chứa nhiều dòng hoặc 1 dòng dở, nhưng tách đúng nghĩa
 * là việc khác, ngoài phạm vi lần sửa này.
 */
function broadcastLogLine(tier: PythonTier, stream: 'stdout' | 'stderr', line: string) {
  const payload = { tier, stream, line, ts: Date.now() };
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send('tts:log-line', payload);
  });
}

function pushStatus(tier: PythonTier, status: PythonStatus, detail?: string) {
  const st = tiers.get(tier);
  if (st) {
    st.status = status;
    st.statusDetail = detail ?? '';
  }
  // CHỈ phát trạng thái của nhóm ĐANG phục vụ. Nhóm khác có thể đang khởi động nền
  // (blue-green: dựng engine mới trong khi engine cũ vẫn đọc bình thường) — phát trạng
  // thái 'starting' của nó ra sẽ khiến icon menu bar báo động nhầm dù dịch vụ vẫn tốt.
  // Tiến độ của lượt đổi engine do EngineManager tự hiển thị.
  if (tier !== activeTier) return;
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

/**
 * Binary TTS đóng gói sẵn. Tên file CHÍNH LÀ tên tiến trình người dùng thấy trong Activity
 * Monitor / Task Manager (macOS gán `p_comm` từ tên file lúc exec, tiến trình không tự đổi
 * được — `argv0` khi spawn và symlink đều không có tác dụng, đã thử).
 *
 * Giữ 'vieneu-server' làm tên DỰ PHÒNG: bản cài cũ (trước 0.3.0) mang binary tên đó, và
 * người dùng có thể còn thư mục resources cũ sau khi cập nhật thủ công. Thiếu fallback này
 * thì app im lặng rơi về đường "chạy main.py bằng system Python" — vốn không có sẵn ở máy
 * hội trường, nên hỏng TTS hoàn toàn.
 */
function getExecutablePath(): string {
  const isWin = process.platform === 'win32';
  const names = isWin
    ? ['Sky App TTS.exe', 'vieneu-server.exe']
    : ['Sky App TTS', 'vieneu-server'];
  const baseDir = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
  for (const n of names) {
    const p = join(baseDir, n);
    if (existsSync(p)) return p;
  }
  return join(baseDir, names[0]);
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
 * Nếu engine đang chọn là engine mở rộng CẦN PROCESS RIÊNG (kind 'torch' — xem
 * `engineRuntimeKind`), trả cmd/args để spawn bằng runtime của nó (main.py
 * engine-agnostic + VIENEU_ENGINE + PYTHONPATH). Trả null nếu là VieNeu bundled, engine
 * chưa có runtime, hoặc engine torch-free (những engine này nạp NGAY TRONG process đang
 * chạy qua `/engines/switch` — xem `create_engine()` phía Python — không cần hàm này).
 *
 * Async vì phải đọc `manifest.json` của engine qua `engine-installer.ts` để biết kind
 * (dynamic import — tránh vòng import tĩnh, `engine-installer.ts` cũng import ngược lại
 * `getPythonPort` từ file này).
 */
async function resolveExtensionEngineSpawn(engineId: string): Promise<{ cmd: string; args: string[]; sitePackages: string } | null> {
  if (!engineId || engineId === 'vieneu') return null;
  const serverDir = getServerDir();
  if (!serverDir) return null;
  const { resolveEngineRuntimeLocation } = await import('./engine-installer');
  // Vị trí dùng chung theo kind (GĐ C) hoặc vị trí riêng cũ nếu engine cài từ trước đó.
  const { runtimeDir, sitePackages } = resolveEngineRuntimeLocation(engineId);
  const mainPy = join(serverDir, 'main.py');
  if (!existsSync(mainPy) || !existsSync(sitePackages)) return null;
  // Python để chạy engine:
  //  - Packaged: Python tự chứa đã tải về (xem python-runtime.ts).
  //  - Dev: không có bản tải rời → dùng venv app + PYTHONPATH tới site-packages đã pip --target.
  const cmd = resolveRuntimePython(runtimeDir) ?? getPythonPath();
  return { cmd, args: [mainPy], sitePackages };
}

/**
 * Runtime tăng tốc (GPU) cho engine VieNeu bundled — chỉ dùng ở bản ĐÓNG GÓI.
 *
 * Bản đóng gói vốn chạy VieNeu bằng binary PyInstaller đã đóng băng onnxruntime CPU,
 * nên không thể bật GPU cho nó. Khi người dùng cài gói tăng tốc, ta dựng một Python
 * rời có onnxruntime-gpu/directml + trọn bộ dependency server (dùng chung
 * `ttsRuntimeDir('onnx-accel')` với engine mở rộng — GĐ C) và chạy main.py bằng nó
 * thay cho binary.
 *
 * Trả null khi: chạy dev (venv đã có sẵn, cài thẳng vào đó), chưa cài tăng tốc, hoặc
 * người dùng đang chọn CPU — lúc đó giữ binary PyInstaller vì nhẹ và khởi động nhanh hơn.
 */
function resolveAccelSpawn(providers: string): { cmd: string; args: string[]; sitePackages: string } | null {
  if (!app.isPackaged || !providers) return null;
  const serverDir = getServerDir();
  if (!serverDir) return null;
  const mainPy = join(serverDir, 'main.py');
  const runtimeDir = ttsRuntimeDir('onnx-accel');
  const sitePackages = join(runtimeDir, 'site-packages');
  // Cùng resolver với engine mở rộng — ưu tiên hardlink mang tên sản phẩm nếu đã tạo.
  const py = resolveRuntimePython(runtimeDir);
  if (!existsSync(mainPy) || !existsSync(sitePackages) || !py) return null;
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

/** Port của nhóm ĐANG phục vụ — mọi caller cũ (synthesize/voices/config…) dùng hàm này. */
export function getPythonPort(): number {
  return activeState()?.port ?? DEFAULT_PORT;
}

export function getPythonStatus(): { status: PythonStatus; detail: string } {
  const st = activeState();
  if (!st) return { status: 'starting', detail: '' };
  return { status: st.status, detail: st.statusDetail };
}

/** Engine mà nhóm đang phục vụ được dựng cho — dùng để biết có cần dựng lại nhóm 'ext' không. */
export function getTierEngineId(tier: PythonTier): string | null {
  return tiers.get(tier)?.engineId ?? null;
}

export function getActiveTier(): PythonTier {
  return activeTier;
}

/**
 * Ghi nhận engine THẬT SỰ đang được tier phục vụ, sau khi `/engines/switch` thành công
 * trong-process (không respawn — xem `ensureTierForEngine`). Không tự cập nhật ở
 * `ensureTierForEngine` vì lúc đó chỉ mới XÁC NHẬN tier sẵn sàng, chưa chắc switch Python
 * phía sau có thành công hay không — caller (ipc.ts) gọi hàm này SAU khi biết chắc.
 */
export function markTierEngine(tier: PythonTier, engineId: string): void {
  const st = tiers.get(tier);
  if (st) st.engineId = engineId;
}

export function isTierRunning(tier: PythonTier): boolean {
  const st = tiers.get(tier);
  return !!st && st.proc !== null && st.status === 'ready';
}

const MAX_STARTUP_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Khởi động dịch vụ TTS cho engine đang chọn trong config (đường vào lúc mở app).
 * Giữ nguyên chữ ký cũ để main.ts không phải đổi.
 */
export async function startPythonServer(vieneuModelDir: string): Promise<void> {
  const resourcesPath = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
  const userConfigPath = app.isPackaged ? vieneuConfigPath() : join(resourcesPath, 'vieneu-config.json');
  const engineId = readDeviceConfig(userConfigPath).engine || 'vieneu';
  const tier = await tierOfEngine(engineId);
  activeTier = tier;
  await startTier(tier, engineId, vieneuModelDir);
}

/**
 * Bảo đảm có tiến trình phục vụ được `engineId`, KHÔNG đụng tới tiến trình đang chạy
 * (blue-green). Trả port của nhóm đó khi sẵn sàng.
 *
 * Đây là thứ khiến "đổi engine lần sau nhanh": nhóm cũ vẫn sống, nên quay về engine cũ
 * chỉ là đổi con trỏ `activeTier`, không nạp lại gì.
 */
export async function ensureTierForEngine(
  engineId: string,
  vieneuModelDir: string,
): Promise<{ ok: boolean; tier: PythonTier; error?: string }> {
  const tier = await tierOfEngine(engineId);
  const st = tiers.get(tier);

  // Nhóm 'ext' phục vụ MỌI engine 'torch' — từ GĐ C chúng dùng CHUNG site-packages
  // (`ttsRuntimeDir('torch')`), nên `PYTHONPATH` set lúc spawn tier đã bao trọn mọi
  // engine torch, không riêng engine nó được spawn ban đầu. Đổi engine trong tier này
  // giờ chỉ cần respawn khi 2 engine THẬT SỰ trỏ site-packages khác nhau — trường hợp
  // duy nhất còn xảy ra: 1 trong 2 vẫn ở bố cục runtime RIÊNG cũ (trước GĐ C,
  // `resolveEngineRuntimeLocation()` lùi về vị trí legacy nếu chưa migrate).
  let mustRespawn = false;
  if (tier === 'ext' && st && st.engineId !== engineId) {
    const { resolveEngineRuntimeLocation } = await import('./engine-installer');
    const current = resolveEngineRuntimeLocation(st.engineId).sitePackages;
    const target = resolveEngineRuntimeLocation(engineId).sitePackages;
    mustRespawn = current !== target;
  }
  if (st && st.proc !== null && st.status === 'ready' && !mustRespawn) {
    return { ok: true, tier };
  }
  if (mustRespawn) await stopTier(tier);

  try {
    await startTier(tier, engineId, vieneuModelDir);
  } catch (err) {
    return { ok: false, tier, error: err instanceof Error ? err.message : String(err) };
  }
  const after = tiers.get(tier);
  if (!after || after.status !== 'ready') {
    return { ok: false, tier, error: after?.statusDetail || 'Tiến trình TTS không lên được' };
  }
  return { ok: true, tier };
}

/** Chuyển nhóm phục vụ. Chỉ gọi SAU khi nhóm đích đã ready. */
export function setActiveTier(tier: PythonTier): void {
  activeTier = tier;
  const st = tiers.get(tier);
  if (st) pushStatus(tier, st.status, st.statusDetail);
}

async function startTier(tier: PythonTier, engineId: string, vieneuModelDir: string): Promise<void> {
  for (let attempt = 1; attempt <= MAX_STARTUP_RETRIES; attempt++) {
    try {
      console.log(`[Python Server] (${tier}/${engineId}) Attempt ${attempt}/${MAX_STARTUP_RETRIES}`);
      await startPythonServerOnce(tier, engineId, vieneuModelDir);
      return; // Success
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Python Server] (${tier}) Attempt ${attempt} failed: ${msg}`);
      if (attempt < MAX_STARTUP_RETRIES) {
        pushStatus(tier, 'starting', `Khởi động TTS engine (lần ${attempt + 1}/${MAX_STARTUP_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        pushStatus(tier, 'error', `TTS engine không thể khởi động sau ${MAX_STARTUP_RETRIES} lần thử`);
        throw err;
      }
    }
  }
}

async function startPythonServerOnce(
  tier: PythonTier,
  engineId: string,
  vieneuModelDir: string,
): Promise<void> {
  // Dọn tiến trình cũ của CHÍNH tier này trước khi thay state. `tiers.set` bên dưới ghi đè
  // tham chiếu `proc`, nên nếu còn tiến trình sống ở đây thì từ giây phút đó không ai giết
  // được nó nữa — kể cả `stopPythonServer()` lúc thoát app (nó duyệt `tiers`, mà entry cũ
  // đã bị thay). Đường tới đây: khởi động lại tier sau khi lần trước rơi vào trạng thái
  // 'error' (health hết giờ, engine cài dở...) — `ensureTierForEngine` chỉ gọi `stopTier`
  // khi `mustRespawn`, nên nhánh này không được bọc.
  const existing = tiers.get(tier);
  if (existing?.proc) {
    console.warn(`[Python Server][${tier}] Còn tiến trình cũ pid=${existing.proc.pid} — dừng trước khi khởi động lại`);
    await stopTier(tier);
  }

  const st = newTierState(engineId);
  tiers.set(tier, st);
  const isPackaged = app.isPackaged;
  let cmd = '';
  let args: string[] = [];

  // Tìm port trống trước. Nhóm thứ hai phải tránh cả port nhóm đang chạy — findFreePort
  // dò từ cổng ưa thích trở lên nên bắt đầu ngay SAU cổng đã dùng để không phải chờ
  // socket cũ nhả (nhóm kia vẫn đang sống, đây là điểm khác hẳn cơ chế restart cũ).
  const basePort = parseInt(process.env.VIENEU_PORT ?? String(DEFAULT_PORT), 10);
  const busyPorts = [...tiers.entries()]
    .filter(([k, v]) => k !== tier && v.proc !== null)
    .map(([, v]) => v.port);
  const preferredPort = busyPorts.length ? Math.max(basePort, ...busyPorts) + 1 : basePort;
  st.port = await findFreePort(preferredPort);

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

  st.executableUsed = `${cmd}${args.length ? ' ' + args.join(' ') : ''}`;
  st.lastStartupError = null;
  console.log(`[Python Server] (${tier}/${engineId}) Khởi chạy port=${st.port}: ${cmd} ${args.join(' ')}`);
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

    // Engine MỞ RỘNG kind 'torch' (runtime tự chứa) → spawn bằng runtime đó thay vì binary
    // VieNeu — CHỈ khi nhóm này thật sự là 'ext'. Nhóm 'bundled' LUÔN spawn bằng lệnh mặc
    // định bên dưới dù `engineId` ban đầu là 1 engine mở rộng torch-free (MOSS): engine đó
    // được nạp SAU, ngay trong process, qua create_engine()'s sys.path append phía Python
    // (xem tierOfEngine) — đổi cmd/args ở đây cho trường hợp này là sai, sẽ chạy engine
    // bằng runtime CỦA RIÊNG NÓ thay vì process 'bundled' dùng chung mà lẽ ra nó phải nạp
    // vào (bug thật phát hiện lúc làm GĐ C, xem comment ở tierOfEngine).
    const ext = tier === 'ext' ? await resolveExtensionEngineSpawn(engineId) : null;
    let extraEnv: Record<string, string> = { VIENEU_ENGINE: engineId };
    if (ext) {
      cmd = ext.cmd;
      args = ext.args;
      extraEnv = {
        VIENEU_ENGINE: engineId,
        PYTHONPATH: [ext.sitePackages, getServerDir(), process.env.PYTHONPATH ?? '']
          .filter(Boolean).join(process.platform === 'win32' ? ';' : ':'),
      };
      console.log(`[Python Server] Engine mở rộng '${engineId}' → spawn runtime ${cmd}`);
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

    const proc = spawn(cmd, args, {
      stdio: 'pipe',
      windowsHide: true,
      env: {
        ...process.env,
        VIENEU_PORT: String(st.port),
        HF_HOME: vieneuModelDir,
        HF_HUB_OFFLINE: '1',
        RESOURCES_PATH: resourcesPath,
        VIENEU_PREVIEW_DIR: previewDir,
        VIENEU_REF_DIR: userRefDir,
        ...(devCatalogDir ? { VIENEU_CATALOG_DIR: devCatalogDir } : {}),
        VIENEU_REGISTRY_PATH: userRegistryPath,
        VIENEU_CONFIG_PATH: userConfigPath,
        // DB dùng chung (bảng tts_*, xem AGENTS.md §2.1 + apps/tts-service/server/db.py).
        // Chỉ ĐƯỜNG DẪN — Python tự kiểm file tồn tại + đã migrate đủ (schema_version) trước
        // khi dùng, không giả định gì thêm ở phía Electron. An toàn để truyền vô điều kiện:
        // `bootstrapSlideBackend()` (main.ts) migrate xong (đồng bộ) trước khi gọi
        // `startPythonServer()`, nên tới đây file luôn đã tồn tại và đã migrate — nhưng
        // `db.py` vẫn tự kiểm lại thay vì tin tưởng suông, vì lời hứa đó chỉ đứng vững do
        // VỊ TRÍ gọi hàm, không có gì chặn code sau này gọi sai thứ tự.
        SKY_APP_DB_PATH: skyAppDbPath(),
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

    st.proc = proc;

    // Đọc port thực từ stdout ("VIENEU_PORT=XXXX")
    proc.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      console.log(`[Python Server stdout][${tier}] ${line}`);
      broadcastLogLine(tier, 'stdout', line);

      // Ghi log stdout vào rolling buffer
      st.recentStderr.push(`[${new Date().toLocaleTimeString('vi-VN')}] [stdout] ${line}`);
      if (st.recentStderr.length > 60) st.recentStderr.shift();

      const m = line.match(/^VIENEU_PORT=(\d+)/);
      if (m) st.port = parseInt(m[1], 10);

      // Cập nhật trạng thái chi tiết thời gian thực khi đang khởi chạy
      if (st.status === 'starting') {
        const lastLine = line.split('\n').pop()?.trim() ?? line;
        if (lastLine && !lastLine.startsWith('VIENEU_PORT=')) {
          pushStatus(tier, 'starting', lastLine.replace(/^\[VieNeu Python\]\s*/, ''));
        }
      }
    });
    proc.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      console.warn(`[Python Server stderr][${tier}] ${line}`);
      broadcastLogLine(tier, 'stderr', line);

      // Ghi log stderr vào rolling buffer
      st.recentStderr.push(`[${new Date().toLocaleTimeString('vi-VN')}] [stderr] ${line}`);
      if (st.recentStderr.length > 60) st.recentStderr.shift();

      // Cập nhật trạng thái chi tiết thời gian thực khi đang khởi chạy
      if (st.status === 'starting') {
        const lastLine = line.split('\n').pop()?.trim() ?? line;
        if (lastLine) {
          pushStatus(tier, 'starting', lastLine);
        }
      }
    });
    proc.on('error', (err) => {
      console.error(`[Python Server][${tier}] Lỗi:`, err);
      st.lastStartupError = err.message;
      pushStatus(tier, 'error', err.message);
    });
    proc.on('close', (code) => {
      console.log(`[Python Server][${tier}] Thoát code=${code}`);
      st.lastExitCode = code;
      st.proc = null;
      if (code !== 0) pushStatus(tier, 'error', `Process thoát với code ${code}`);
    });

    // Poll health
    const ok = await waitForHealth(st.port);
    if (!ok) {
      pushStatus(tier, 'error', `Không thể kết nối tới TTS engine sau ${HEALTH_TIMEOUT_MS / 1000}s`);
      // PHẢI giết tiến trình, không chỉ return. Health hết giờ KHÔNG có nghĩa tiến trình
      // đã chết — nó thường vẫn đang nạp model (VoxCPM đo thật ~118s, có ca vượt 300s).
      // Bỏ mặc nó thì: (a) `startPythonServerOnce` lần sau `tiers.set` đè lên state, mất
      // luôn tham chiếu `proc` → không ai giết được nữa, kể cả `stopPythonServer()` lúc
      // thoát app (nó chỉ duyệt `tiers`); (b) tiến trình mồ côi vẫn giữ cổng và — sau khi
      // Python nối vào SQLite (xem kế hoạch Phase 1) — giữ cả read-mark WAL, chặn
      // checkpoint vô thời hạn.
      try {
        proc.kill();
      } catch { /* đã chết rồi */ }
      st.proc = null;
      return;
    }

    pushStatus(tier, 'ready', `TTS engine sẵn sàng (port ${st.port})`);

    // Warmup ONNX sessions ngay sau khi server ready — background (không chặn return).
    // CHỈ warm nhóm 'bundled': giọng warmup là giọng VieNeu, và nhóm 'ext' (torch) vừa
    // nạp xong model đã tốn hàng phút — bắt nó đọc thêm 1 câu nữa chỉ làm chậm lượt đổi
    // engine mà người dùng đang chờ, trong khi engine đó thường không dùng giọng này.
    if (tier === 'bundled') {
      warmupSessions(st.port).catch((err) => {
        console.warn('[Python Server] Background warmup failed:', err);
      });
      // Vá `runtimeKind` vào manifest engine cài từ TRƯỚC GĐ C — nếu không, fix tierOfEngine
      // (route engine torch-free vào 'bundled' thay vì spawn riêng) không có tác dụng cho
      // engine đã cài sẵn, chỉ engine cài MỚI mới hưởng. Nền, không chặn khởi động.
      import('./engine-installer').then(({ migrateEngineManifests }) =>
        migrateEngineManifests(st.port).catch((err) => {
          console.warn('[Python Server] Vá runtimeKind manifest thất bại:', err);
        }),
      );
    }
  } catch (err) {
    // Re-throw để retry mechanism ở startTier() xử lý
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
  const st = activeState();
  const port = st?.port ?? DEFAULT_PORT;
  let healthOk: boolean | null = null;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) });
    healthOk = r.ok;
  } catch {
    healthOk = false;
  }
  // Gộp log của MỌI nhóm (kèm nhãn nhóm): khi đổi engine thất bại, nguyên nhân thường
  // nằm ở nhóm vừa dựng dở chứ không phải nhóm đang phục vụ — chỉ trả log nhóm active
  // sẽ giấu mất đúng phần cần xem.
  const merged: string[] = [];
  for (const [key, s] of tiers) {
    for (const line of s.recentStderr) merged.push(`[${key}] ${line}`);
  }
  return {
    port,
    processAlive: st?.proc != null,
    processPid: st?.proc?.pid ?? null,
    executableUsed: st?.executableUsed ?? '',
    lastStartupError: st?.lastStartupError ?? null,
    lastExitCode: st?.lastExitCode ?? null,
    healthOk,
    recentStderr: merged,
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

/** Dừng MỘT nhóm và nhả RAM của nó (engine đang giữ ấm trong nhóm đó mất theo). */
export function stopTier(tier: PythonTier): Promise<void> {
  const st = tiers.get(tier);
  const proc = st?.proc ?? null;
  if (st) st.proc = null;
  tiers.delete(tier);
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  console.log(`[Python Server][${tier}] Đang tắt...`);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[Python Server][${tier}] Process không thoát sau SIGTERM, buộc SIGKILL...`);
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

/**
 * Dừng TOÀN BỘ tiến trình Python (thoát app, hoặc restart dịch vụ).
 *
 * Giữ nguyên tên cũ vì mọi caller (main.ts lúc quit, tts:restart, cài gói tăng tốc) đều
 * mang nghĩa "tắt hẳn dịch vụ" — nay có 2 nhóm nên phải tắt cả hai, bỏ sót nhóm nào là để
 * lại process mồ côi giữ nguyên vài GB RAM (đúng loại lỗi từng gặp 2026-08-05).
 */
export async function stopPythonServer(): Promise<void> {
  await Promise.all([...tiers.keys()].map((tier) => stopTier(tier)));
}
