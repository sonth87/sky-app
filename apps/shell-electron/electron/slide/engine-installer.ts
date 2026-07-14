/**
 * engine-installer.ts — Cài đặt engine TTS mở rộng theo nhu cầu (Cụm 1: preflight).
 *
 * Engine mở rộng (vd MOSS-TTS-Nano) KHÔNG bundle sẵn — phải tải runtime (Python
 * embeddable + torch...) + model vào userData/tts-engines/<id>/. Module này:
 *   - preflight():  kiểm điều kiện TRƯỚC khi cho tải (đĩa/RAM/GPU/on-stage/mạng).
 *   - (Cụm sau) DownloadTask, install, verify, spawn micro-service.
 *
 * KHÔNG phụ thuộc ceremony — chỉ đọc trạng thái on-stage qua sessionStore để
 * "nhường lễ". Đặt tách để multi-verse sau kéo lên tầng shell dễ.
 */
import {
  statfsSync, existsSync, mkdirSync, writeFileSync, readFileSync, rmSync,
  readdirSync, statSync, copyFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import * as os from 'node:os';
import { ttsEngineDir, ttsEnginesDir } from './data/paths';
import { getPythonPort } from './python-server';
import { sessionStore } from './session-store';
import { downloadFile, DownloadError, type FileSpec } from './download-task';

const GB = 1024 * 1024 * 1024;

export interface PreflightResult {
  ok: boolean;                 // true nếu không có block nào
  blocks: string[];            // lý do CHẶN (không cho tải)
  warnings: string[];          // cảnh báo (vẫn cho tải)
  info: {
    totalRamGb: number;
    freeDiskGb: number | null; // null nếu không đo được
    requiredDiskGb: number;
    engineTotalMb: number;
  };
}

interface EngineRequirements {
  min_ram_gb?: number;
  recommended_ram_gb?: number;
  needs_gpu?: boolean;
  disk_headroom_factor?: number;
}

interface EngineInfo {
  id: string;
  bundled: boolean;
  install_status: string;
  requirements: EngineRequirements | null;
  // total_mb ước tính (runtime + model) — lấy từ /engines nếu server tính được.
  install?: { model?: { total_mb?: number }; runtime?: { pip_packages?: string[] } };
}

/** Lấy metadata engine từ server (/engines). */
async function fetchEngineInfo(engineId: string): Promise<EngineInfo | null> {
  const port = getPythonPort();
  if (!port) return null;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/engines`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.engines ?? []).find((e: EngineInfo) => e.id === engineId) ?? null;
  } catch {
    return null;
  }
}

/** Lấy capabilities provider (để cảnh báo needs_gpu). */
async function fetchHasAccelerator(): Promise<boolean> {
  const port = getPythonPort();
  if (!port) return false;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/capabilities`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const data = await res.json();
    // works=true và không phải CPU → có accelerator dùng được.
    return (data.providers ?? []).some((p: { kind: string; works: boolean }) => p.kind !== 'cpu' && p.works);
  } catch {
    return false;
  }
}

/** Đĩa trống (GB) tại thư mục engines, null nếu không đo được. */
function freeDiskGb(): number | null {
  try {
    // Đảm bảo có thư mục cha để statfs (statfs cần path tồn tại).
    const dir = existsSync(ttsEnginesDir()) ? ttsEnginesDir() : os.homedir();
    const st = statfsSync(dir);
    return (Number(st.bavail) * Number(st.bsize)) / GB;
  } catch {
    return null;
  }
}

/** Đang có SV trên sân khấu? (nhường lễ — không tải lúc này). */
export function isOnStage(): boolean {
  try {
    return !!sessionStore.get().current_on_stage_msv;
  } catch {
    return false;
  }
}

/**
 * Kiểm điều kiện trước khi cho tải engine. blocks → chặn; warnings → vẫn cho.
 * Ước lượng dung lượng: (model total_mb) + (runtime ~2500MB nếu có torch) rồi × headroom.
 */
export async function preflight(engineId: string): Promise<PreflightResult> {
  const blocks: string[] = [];
  const warnings: string[] = [];

  const info = await fetchEngineInfo(engineId);
  const req: EngineRequirements = info?.requirements ?? {};

  // Ước tính dung lượng cần: model + runtime (torch nặng ~2.5GB nếu có trong pip_packages).
  const modelMb = info?.install?.model?.total_mb ?? 0;
  const pipPkgs = info?.install?.runtime?.pip_packages ?? [];
  const hasTorch = pipPkgs.some((p) => /torch/i.test(p));
  const runtimeMb = hasTorch ? 2500 : 300; // ước lượng thô: torch stack ~2.5GB, embeddable+nhẹ ~300MB
  const engineTotalMb = modelMb + runtimeMb;
  const headroom = req.disk_headroom_factor ?? 2.0;
  const requiredDiskGb = (engineTotalMb * headroom) / 1024;

  const totalRamGb = os.totalmem() / GB;
  const freeDisk = freeDiskGb();

  // 1. On-stage (CHẶN) — nhường lễ.
  if (isOnStage()) {
    blocks.push('Đang có sinh viên trên sân khấu — không tải khi đang đọc tên. Hãy đợi lúc rảnh.');
  }

  // 2. Đĩa (CHẶN nếu đo được và thiếu).
  if (freeDisk !== null && freeDisk < requiredDiskGb) {
    blocks.push(
      `Không đủ dung lượng đĩa: cần ~${requiredDiskGb.toFixed(1)}GB, còn trống ${freeDisk.toFixed(1)}GB. Hãy dọn bớt.`
    );
  }

  // 3. RAM (CHẶN nếu dưới tối thiểu, CẢNH BÁO nếu dưới khuyến nghị).
  if (req.min_ram_gb && totalRamGb < req.min_ram_gb) {
    blocks.push(`Máy không đủ RAM: cần tối thiểu ${req.min_ram_gb}GB, máy có ${totalRamGb.toFixed(1)}GB.`);
  } else if (req.recommended_ram_gb && totalRamGb < req.recommended_ram_gb) {
    warnings.push(`RAM dưới mức khuyến nghị (${req.recommended_ram_gb}GB) — engine có thể chạy chậm.`);
  }

  // 4. GPU (CẢNH BÁO).
  if (req.needs_gpu) {
    const hasAccel = await fetchHasAccelerator();
    if (!hasAccel) warnings.push('Engine này cần GPU; máy này không có bộ tăng tốc dùng được — có thể rất chậm.');
  }

  // 5. Mạng (CẢNH BÁO khi tải từ HF — chỉ báo, không chặn; import USB là đường thay thế).
  //    Không HEAD ở preflight để khỏi chậm; DownloadTask sẽ báo lỗi mạng khi tải thật.

  return {
    ok: blocks.length === 0,
    blocks,
    warnings,
    info: {
      totalRamGb: Math.round(totalRamGb * 10) / 10,
      freeDiskGb: freeDisk === null ? null : Math.round(freeDisk * 10) / 10,
      requiredDiskGb: Math.round(requiredDiskGb * 10) / 10,
      engineTotalMb,
    },
  };
}

// ─── EngineInstaller: điều phối tải model (Cụm 1) ────────────────────────────
//
// Tải model của 1 engine mở rộng vào ttsEngineDir(id)/model/, có:
//   - resume qua restart app (install-state.json ghi file nào xong).
//   - progress tổng (cộng dồn nhiều file).
//   - pause/resume/cancel (AbortController).
//   - checksum từng file (DownloadTask).
//   - import từ thư mục/USB (copy thay vì tải).
// Runtime (Python embeddable + torch) tách sang D2c. Cụm 1 tập trung model + khung.

export interface InstallProgress {
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

interface InstallState {
  engineId: string;
  source: 'hf' | 'local';
  files: FileSpec[];        // danh sách file cần (đã resolve sha256/size)
  doneFiles: string[];     // dest đã xong
}

type ProgressEmit = (p: InstallProgress) => void;

const HF_BASE = 'https://huggingface.co';

/** Resolve danh sách file model từ HF API (path + size + sha256 LFS). */
async function resolveHfFiles(repo: string, modelDir: string, signal: AbortSignal): Promise<FileSpec[]> {
  const api = `${HF_BASE}/api/models/${repo}/tree/main?recursive=true`;
  const res = await fetch(api, { signal });
  if (!res.ok) throw new DownloadError(`Không lấy được danh sách file HF (HTTP ${res.status})`, 'network');
  const tree = (await res.json()) as Array<{ path: string; type: string; size: number; lfs?: { oid: string } }>;
  const specs: FileSpec[] = [];
  for (const f of tree) {
    if (f.type !== 'file') continue;
    // Bỏ file phụ không cần cho runtime (README, .gitattributes).
    if (/^(\.|README|LICENSE)/i.test(f.path)) continue;
    specs.push({
      url: `${HF_BASE}/${repo}/resolve/main/${f.path}`,
      dest: join(modelDir, f.path),
      sha256: f.lfs?.oid,               // chỉ file LFS có; file thường verify bằng size
      size: f.size,
    });
  }
  return specs;
}

export class EngineInstaller {
  private ac: AbortController | null = null;
  private paused = false;

  constructor(
    private engineId: string,
    private emit: ProgressEmit,
  ) {}

  private dir() { return ttsEngineDir(this.engineId); }
  private modelDir() { return join(this.dir(), 'model'); }
  private statePath() { return join(this.dir(), 'install-state.json'); }
  private manifestPath() { return join(this.dir(), 'manifest.json'); }

  private loadState(): InstallState | null {
    if (!existsSync(this.statePath())) return null;
    try { return JSON.parse(readFileSync(this.statePath(), 'utf-8')); } catch { return null; }
  }
  private saveState(s: InstallState) {
    mkdirSync(this.dir(), { recursive: true });
    writeFileSync(this.statePath(), JSON.stringify(s, null, 2), 'utf-8');
  }

  isPaused() { return this.paused; }

  // Auto-pause khi có SV lên sân khấu (nhường lễ). Phân biệt với pause thủ công:
  // chỉ TỰ resume nếu bị auto-pause (user chủ động pause thì tôn trọng, không tự chạy).
  private autoPaused = false;
  private stageMonitor: ReturnType<typeof setInterval> | null = null;
  private offStageSince = 0;
  private repo: string | null = null;
  private readonly RESUME_DEBOUNCE_MS = 5000;   // hết SV ổn định 5s mới tự resume
  private readonly MONITOR_INTERVAL_MS = 800;

  /** Tạm dừng tải (giữ .part để resume). manual=true = user chủ động. */
  pause(manual = true) {
    if (this.ac) { this.paused = true; if (manual) this.autoPaused = false; this.ac.abort(); }
  }

  /** Hủy hẳn — xoá state + file dở. */
  cancel() {
    this.stopStageMonitor();
    if (this.ac) this.ac.abort();
    this.paused = false;
    this.autoPaused = false;
    try { rmSync(this.dir(), { recursive: true, force: true }); } catch { /* ignore */ }
  }

  /** Theo dõi on-stage: đang tải + SV lên sân khấu → tự pause; hết SV ổn định → tự resume. */
  private startStageMonitor() {
    if (this.stageMonitor) return;
    this.stageMonitor = setInterval(() => {
      const onStage = isOnStage();
      if (onStage && !this.paused) {
        // Đang tải mà có SV → tự pause (nhường lễ).
        this.autoPaused = true;
        this.pause(false);
        this.emit(this.prog('paused', [], [], 0, 0, 0, 'Đã tạm dừng tải để đọc tên'));
      } else if (!onStage && this.paused && this.autoPaused && this.repo) {
        // Hết SV — chờ ổn định (debounce) rồi tự resume.
        if (this.offStageSince === 0) this.offStageSince = Date.now();
        else if (Date.now() - this.offStageSince >= this.RESUME_DEBOUNCE_MS) {
          this.offStageSince = 0;
          this.autoPaused = false;
          this.downloadFromHf(this.repo);  // resume từ install-state.json
        }
      } else if (onStage) {
        this.offStageSince = 0;  // reset debounce nếu SV lại lên
      }
    }, this.MONITOR_INTERVAL_MS);
  }

  private stopStageMonitor() {
    if (this.stageMonitor) { clearInterval(this.stageMonitor); this.stageMonitor = null; }
    this.offStageSince = 0;
  }

  /**
   * Bắt đầu/tiếp tục tải model từ HF. Resume nếu đã có state.
   * `engineMeta`: lấy từ /engines (install.model.repo).
   */
  async downloadFromHf(repo: string): Promise<void> {
    this.repo = repo;
    this.paused = false;
    this.ac = new AbortController();
    const signal = this.ac.signal;
    mkdirSync(this.modelDir(), { recursive: true });

    // Nếu vừa gọi mà đang có SV trên sân khấu → không bắt đầu, chờ giám sát tự chạy sau.
    if (isOnStage()) {
      this.autoPaused = true;
      this.paused = true;
      this.startStageMonitor();
      this.emit(this.prog('paused', [], [], 0, 0, 0, 'Đang có sinh viên trên sân khấu — sẽ tự tải khi xong'));
      return;
    }

    this.startStageMonitor();
    try {
      // Resolve file list (hoặc dùng state cũ nếu có).
      let state = this.loadState();
      if (!state || state.source !== 'hf' || state.files.length === 0) {
        this.emit(this.prog('resolving', [], [], 0, 0, 0, ''));
        const files = await resolveHfFiles(repo, this.modelDir(), signal);
        state = { engineId: this.engineId, source: 'hf', files, doneFiles: [] };
        this.saveState(state);
      }

      await this.runDownload(state, signal);
      // Model xong → cài runtime (pip) nếu có. Chỉ khi tải model không bị pause.
      if (!this.paused && this._pipPackages && this._pythonBin !== undefined) {
        await this.installRuntime(this._pipPackages, this._pythonBin);
      }
      // Xong hẳn (không phải pause) → dừng giám sát.
      if (!this.paused) this.stopStageMonitor();
    } catch (e) {
      this.handleError(e);
    }
  }

  // Runtime deps để cài sau khi tải model (set qua setRuntimeInstall trước downloadFromHf).
  private _pipPackages: string[] | null = null;
  private _pythonBin: string | null | undefined = undefined;

  /** Khai báo gói pip + python để tự cài runtime sau khi tải model xong. */
  setRuntimeInstall(pipPackages: string[], pythonBin: string | null) {
    this._pipPackages = pipPackages;
    this._pythonBin = pythonBin;
  }

  /** Import model từ thư mục/USB (copy file-by-file, không cần mạng). */
  async importFromLocal(srcDir: string): Promise<void> {
    this.ac = new AbortController();
    try {
      mkdirSync(this.modelDir(), { recursive: true });
      const entries = walkFiles(srcDir);
      const total = entries.reduce((s, e) => s + statSync(e.abs).size, 0);
      let received = 0;
      let done = 0;
      for (const e of entries) {
        if (this.ac.signal.aborted) return;
        const dst = join(this.modelDir(), e.rel);
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(e.abs, dst);
        received += statSync(e.abs).size;
        done += 1;
        this.emit(this.prog('importing', entries.map((x) => x.rel), [], received, total, 0, e.rel, done));
      }
      this.writeManifest('local', entries.length);
      this.emit(this.prog('done', [], [], total, total, 0, ''));
    } catch (e) {
      this.handleError(e);
    }
  }

  /** Export model đã tải ra thư mục/USB (chép sang máy khác khỏi tải lại). */
  async exportToLocal(dstDir: string): Promise<{ ok: boolean; error?: string; count?: number }> {
    try {
      if (!existsSync(this.modelDir())) return { ok: false, error: 'Chưa có model để export' };
      const entries = walkFiles(this.modelDir());
      for (const e of entries) {
        const dst = join(dstDir, e.rel);
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(e.abs, dst);
      }
      return { ok: true, count: entries.length };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Xoá toàn bộ engine đã cài (model + runtime + state) để giải phóng đĩa. */
  deleteInstall(): { ok: boolean; error?: string } {
    try {
      this.stopStageMonitor();
      if (this.ac) this.ac.abort();
      rmSync(this.dir(), { recursive: true, force: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Dung lượng engine đang chiếm trên đĩa (bytes). */
  diskUsage(): number {
    if (!existsSync(this.dir())) return 0;
    let total = 0;
    for (const e of walkFiles(this.dir())) {
      try { total += statSync(e.abs).size; } catch { /* ignore */ }
    }
    return total;
  }

  /**
   * Cài runtime Python cho engine: pip install các gói (torch...) vào runtime/site-packages
   * bằng `pip install --target`. Engine (Cụm sau) chạy bằng Python này + PYTHONPATH tới đây.
   *
   * pythonBin: interpreter dùng để chạy pip.
   *   - Bản dev: có thể dùng python hệ thống / venv (đủ để kiểm chứng luồng).
   *   - Bản ĐÓNG GÓI: KHÔNG có Python → phải tải Python embeddable trước (chưa làm ở Cụm 1;
   *     cần test trên Windows thật). Nếu pythonBin=null → báo lỗi rõ ràng.
   *
   * Tiến độ pip stream qua stdout (không có % chính xác — báo dòng log gần nhất).
   */
  async installRuntime(pipPackages: string[], pythonBin: string | null): Promise<void> {
    this.ac = new AbortController();
    const runtimeDir = join(this.dir(), 'runtime', 'site-packages');
    mkdirSync(runtimeDir, { recursive: true });

    if (!pythonBin) {
      this.emit(this.prog('error', [], [], 0, 0, 0, '', 0,
        'Bản đóng gói chưa hỗ trợ cài runtime (cần Python embeddable). Chạy bản từ nguồn để thử.'));
      return;
    }

    this.emit(this.prog('installing-runtime', [], [], 0, 0, 0, 'pip install ' + pipPackages.join(' ')));

    const { spawn } = await import('node:child_process');
    const args = ['-m', 'pip', 'install', '--no-cache-dir', '--target', runtimeDir, ...pipPackages];
    const ok = await new Promise<boolean>((resolve) => {
      const proc = spawn(pythonBin, args, { windowsHide: true });
      let tail = '';
      const onData = (d: Buffer) => {
        tail = (tail + d.toString()).split('\n').slice(-3).join('\n');
        this.emit(this.prog('installing-runtime', [], [], 0, 0, 0, tail.split('\n').pop() ?? ''));
      };
      proc.stdout?.on('data', onData);
      proc.stderr?.on('data', onData);
      this.ac!.signal.addEventListener('abort', () => proc.kill(), { once: true });
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });

    if (!ok) {
      this.emit(this.prog('error', [], [], 0, 0, 0, '', 0, 'pip install runtime thất bại (xem log).'));
      return;
    }
    // Runtime xong → đánh dấu manifest 'installed' (đủ model + runtime).
    this.markInstalled();
    this.emit(this.prog('done', [], [], 0, 0, 0, 'runtime OK'));
  }

  /** Cập nhật manifest status='installed' (đủ model + runtime, dùng được). */
  private markInstalled() {
    try {
      const m = existsSync(this.manifestPath())
        ? JSON.parse(readFileSync(this.manifestPath(), 'utf-8'))
        : { engineId: this.engineId };
      m.status = 'installed';
      m.installedAt = new Date().toISOString();
      writeFileSync(this.manifestPath(), JSON.stringify(m, null, 2), 'utf-8');
    } catch { /* ignore */ }
  }

  /**
   * Dry-run kiểm engine LOAD được (verify_engine.py) bằng runtime của engine.
   * Chạy TRƯỚC khi cho đổi engine — tránh tải xong nhưng lỗi → đổi → server không lên.
   * Trả { ok, error?, capabilities? }.
   *
   * pythonBin: interpreter của engine (runtime tự chứa). serverDir: nơi chứa
   * verify_engine.py + engine_registry.py. runtimeSitePackages: PYTHONPATH tới torch...
   */
  async verify(
    pythonBin: string,
    serverDir: string,
    runtimeSitePackages: string,
    env: Record<string, string>,
  ): Promise<{ ok: boolean; error?: string; capabilities?: unknown }> {
    this.emit(this.prog('verifying', [], [], 0, 0, 0, 'Đang kiểm tra engine load được…'));
    const { spawn } = await import('node:child_process');
    return await new Promise((resolve) => {
      const proc = spawn(pythonBin, ['verify_engine.py', this.engineId], {
        cwd: serverDir,
        windowsHide: true,
        env: {
          ...process.env,
          ...env,
          PYTHONPATH: [runtimeSitePackages, serverDir, process.env.PYTHONPATH ?? '']
            .filter(Boolean)
            .join(process.platform === 'win32' ? ';' : ':'),
        },
      });
      let out = '';
      const to = setTimeout(() => proc.kill(), 120_000); // engine load có thể lâu (30-60s)
      proc.stdout?.on('data', (d) => { out += d.toString(); });
      proc.stderr?.on('data', (d) => { out += d.toString(); });
      proc.on('error', (e) => { clearTimeout(to); resolve({ ok: false, error: e.message }); });
      proc.on('close', () => {
        clearTimeout(to);
        // Lấy dòng JSON cuối (verify_engine.py in JSON 1 dòng).
        const line = out.split('\n').reverse().find((l) => l.trim().startsWith('{'));
        if (!line) { resolve({ ok: false, error: 'Không đọc được kết quả verify' }); return; }
        try {
          const r = JSON.parse(line);
          resolve({ ok: !!r.ok, error: r.error ?? undefined, capabilities: r.capabilities });
        } catch {
          resolve({ ok: false, error: 'Kết quả verify không hợp lệ' });
        }
      });
    });
  }

  private async runDownload(state: InstallState, signal: AbortSignal) {
    const total = state.files.reduce((s, f) => s + (f.size ?? 0), 0);
    let received = state.files
      .filter((f) => state.doneFiles.includes(f.dest))
      .reduce((s, f) => s + (f.size ?? 0), 0);

    for (const f of state.files) {
      if (state.doneFiles.includes(f.dest)) continue;
      if (signal.aborted) { this.emit(this.prog('paused', state.files.map(x=>x.dest), state.doneFiles, received, total, 0, f.dest)); return; }

      const baseReceived = received;
      try {
        await downloadFile(f, signal, (p) => {
          this.emit(this.prog('downloading', state.files.map(x=>x.dest), state.doneFiles,
            baseReceived + p.receivedBytes, total, p.bytesPerSec, f.dest, state.doneFiles.length));
        });
      } catch (e) {
        if (e instanceof DownloadError && e.kind === 'aborted') {
          this.emit(this.prog('paused', state.files.map(x=>x.dest), state.doneFiles, received, total, 0, f.dest));
          return;
        }
        throw e;
      }
      state.doneFiles.push(f.dest);
      received += f.size ?? 0;
      this.saveState(state);
    }

    this.writeManifest('hf', state.files.length);
    this.emit(this.prog('done', state.files.map(x=>x.dest), state.doneFiles, total, total, 0, '', state.files.length));
  }

  private writeManifest(source: string, fileCount: number) {
    mkdirSync(this.dir(), { recursive: true });
    writeFileSync(this.manifestPath(), JSON.stringify({
      engineId: this.engineId,
      status: 'model_ready',   // Cụm 1: model xong. Runtime + 'installed' ở D2c/cụm sau.
      source,
      fileCount,
      installedAt: new Date().toISOString(),
    }, null, 2), 'utf-8');
    // Dọn state khi xong (không cần resume nữa) + dừng giám sát on-stage.
    try { rmSync(this.statePath(), { force: true }); } catch { /* ignore */ }
    this.stopStageMonitor();
  }

  private handleError(e: unknown) {
    if (e instanceof DownloadError && e.kind === 'aborted') {
      this.emit(this.prog('paused', [], [], 0, 0, 0, ''));
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    this.emit(this.prog('error', [], [], 0, 0, 0, '', 0, msg));
  }

  private prog(
    phase: InstallProgress['phase'], allFiles: string[], done: string[],
    received: number, total: number, bps: number, current: string,
    filesDone?: number, error?: string,
  ): InstallProgress {
    return {
      engineId: this.engineId,
      phase,
      filesTotal: allFiles.length,
      filesDone: filesDone ?? done.length,
      bytesReceived: received,
      bytesTotal: total,
      bytesPerSec: Math.round(bps),
      currentFile: current,
      error,
    };
  }
}

/** Liệt kê file (đệ quy) trong thư mục để import. */
function walkFiles(root: string): Array<{ abs: string; rel: string }> {
  const out: Array<{ abs: string; rel: string }> = [];
  const walk = (dir: string, prefix: string) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(abs).isDirectory()) walk(abs, rel);
      else out.push({ abs, rel });
    }
  };
  walk(root, '');
  return out;
}

// Registry các installer đang chạy (1 lúc 1 engine — R2 multi-verse; đủ cho Cụm 1).
const _installers = new Map<string, EngineInstaller>();

export function getInstaller(engineId: string, emit: ProgressEmit): EngineInstaller {
  let inst = _installers.get(engineId);
  if (!inst) { inst = new EngineInstaller(engineId, emit); _installers.set(engineId, inst); }
  return inst;
}

export function getActiveInstaller(engineId: string): EngineInstaller | undefined {
  return _installers.get(engineId);
}
