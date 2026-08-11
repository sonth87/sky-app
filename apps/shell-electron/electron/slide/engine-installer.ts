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
import { ttsEngineDir, ttsEnginesDir, ttsRuntimeDir } from './data/paths';
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
  /** 'onnx-bundled' | 'onnx-ext' | 'torch' — quyết định runtime dùng chung với engine nào
   * khác (xem `ttsRuntimeDir`) và có cần process riêng hay không (xem `tierOfEngine`). */
  runtime_kind?: string;
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

/**
 * `runtime_kind` của 1 engine đã cài, đọc từ manifest.json cục bộ — KHÔNG cần hỏi server
 * qua HTTP. Bắt buộc phải offline-được: `tierOfEngine()` (python-server.ts) gọi hàm này để
 * quyết định process nào phục vụ engine, kể cả lúc server CHƯA chạy (cold start) — không
 * có port nào để fetch `/engines` vào đúng lúc cần biết.
 *
 * Manifest cũ (cài trước GĐ C, 2026-08-11) không có field này → mặc định 'torch' (coi là
 * nặng, buộc tách process riêng) — an toàn hơn lỡ coi nhầm 1 engine torch là nhẹ rồi nạp
 * chung process với binary bundled (rủi ro lệch ABI numpy/onnxruntime đã bundle).
 */
export function engineRuntimeKind(engineId: string): string {
  try {
    const raw = readFileSync(join(ttsEngineDir(engineId), 'manifest.json'), 'utf-8');
    const m = JSON.parse(raw) as { runtimeKind?: string };
    if (typeof m.runtimeKind === 'string' && m.runtimeKind) return m.runtimeKind;
  } catch { /* chưa cài, hoặc manifest cũ chưa có field này */ }
  return 'torch';
}

/**
 * Nơi thật sự chứa runtime (interpreter + site-packages) của 1 engine mở rộng.
 *
 * Ưu tiên vị trí DÙNG CHUNG mới (GĐ C); nếu chưa có, dò về vị trí RIÊNG cũ (GĐ trước
 * GĐ C: `<engineDir>/runtime/`) — engine cài từ trước bản này vẫn chạy được, không bắt
 * cài lại chỉ vì đổi chỗ lưu.
 */
export function resolveEngineRuntimeLocation(engineId: string): { runtimeDir: string; sitePackages: string } {
  const shared = ttsRuntimeDir(engineRuntimeKind(engineId));
  if (existsSync(join(shared, 'site-packages'))) {
    return { runtimeDir: shared, sitePackages: join(shared, 'site-packages') };
  }
  const legacy = join(ttsEngineDir(engineId), 'runtime');
  return { runtimeDir: legacy, sitePackages: join(legacy, 'site-packages') };
}

/**
 * Dung lượng runtime dùng chung của 1 `kind` + danh sách engine đang dùng nó (đã CÀI, tức
 * `install_status` sẽ là 'installed'/'partial' theo góc nhìn server — ở đây chỉ cần biết
 * "còn thư mục engine nào khai runtime_kind này không", không cần độ chính xác tới mức đó).
 * Dùng cho UI hiện "Thư viện dùng chung (torch): X GB — VoxCPM" và cho việc dọn rác lúc xoá.
 */
export function sharedRuntimeInfo(kind: string): { bytes: number; engineIds: string[] } {
  const dir = ttsRuntimeDir(kind);
  let bytes = 0;
  if (existsSync(dir)) {
    for (const e of walkFiles(dir)) {
      try { bytes += statSync(e.abs).size; } catch { /* ignore */ }
    }
  }
  const engineIds: string[] = [];
  if (existsSync(ttsEnginesDir())) {
    for (const name of readdirSync(ttsEnginesDir())) {
      if (name === '_runtime') continue;
      if (engineRuntimeKindIfInstalled(name) === kind) engineIds.push(name);
    }
  }
  return { bytes, engineIds };
}

/** Như `engineRuntimeKind`, nhưng trả null nếu engine đó chưa từng cài gì (không có
 * manifest) — dùng để phân biệt "chưa cài" khỏi "cài cũ, mặc định torch" khi liệt kê. */
function engineRuntimeKindIfInstalled(engineId: string): string | null {
  try {
    const raw = readFileSync(join(ttsEngineDir(engineId), 'manifest.json'), 'utf-8');
    const m = JSON.parse(raw) as { runtimeKind?: string };
    return typeof m.runtimeKind === 'string' && m.runtimeKind ? m.runtimeKind : 'torch';
  } catch {
    return null;
  }
}

/**
 * Sau khi xoá 1 engine: nếu KHÔNG còn engine nào khác dùng chung `kind` này, dọn luôn thư
 * mục runtime dùng chung — nếu không, torch (~2.5GB) sẽ nằm mồ côi vĩnh viễn sau khi user
 * xoá engine torch duy nhất họ từng cài. Không đụng vị trí RIÊNG cũ của engine khác (nếu
 * còn engine nào chưa migrate sang vị trí dùng chung) — chỉ dọn `ttsRuntimeDir(kind)`.
 */
function cleanupOrphanedRuntimeIfUnused(kind: string): void {
  if (sharedRuntimeInfo(kind).engineIds.length > 0) return;
  try { rmSync(ttsRuntimeDir(kind), { recursive: true, force: true }); } catch { /* ignore */ }
}

/**
 * Vá `runtimeKind` vào manifest của engine đã cài TRƯỚC GĐ C (2026-08-11) — manifest cũ
 * không có field này nên `engineRuntimeKind()` phải fallback 'torch' (an toàn nhưng SAI cho
 * engine torch-free như MOSS), khiến `tierOfEngine()` vẫn route engine đó vào tier 'ext'
 * y hệt trước khi sửa bug — bản thân fix không tự phát huy tác dụng nếu không có bước này.
 *
 * Gọi 1 LẦN sau khi tier 'bundled' (luôn chạy, mọi lúc) sẵn sàng — đây là nơi duy nhất hỏi
 * được `/engines` (nguồn `runtime_kind` thật). Không chặn khởi động (fire-and-forget), không
 * ném lỗi ra ngoài — vá thất bại thì manifest giữ nguyên, tự thử lại ở lần khởi động sau.
 */
export async function migrateEngineManifests(port: number): Promise<void> {
  if (!existsSync(ttsEnginesDir())) return;
  let engines: Array<{ id: string; runtime_kind?: string }>;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/engines`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;
    engines = (await res.json()).engines ?? [];
  } catch {
    return;
  }

  for (const name of readdirSync(ttsEnginesDir())) {
    if (name === '_runtime') continue;
    const manifestPath = join(ttsEngineDir(name), 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      if (m.runtimeKind) continue; // đã vá rồi hoặc cài mới (đã có sẵn)
      const kind = engines.find((e) => e.id === name)?.runtime_kind;
      if (!kind) continue; // server không biết engine này (đã gỡ khỏi registry) — bỏ qua
      m.runtimeKind = kind;
      writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf-8');
    } catch { /* 1 manifest lỗi không được chặn vá các engine khác */ }
  }
}

/** Đang có người trên sân khấu? (nhường lễ — không tải lúc này). */
export function isOnStage(): boolean {
  try {
    return !!sessionStore.get().current_on_stage_id;
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
  logLines?: string[];
  installPct?: number;
}

/** Số dòng log pip install tối đa giữ lại (renderer hiện hộp log cuộn) — đủ dài để thấy hết
 * quá trình cài mà không phình payload IPC cho mỗi event tiến độ. */
const LOG_BUFFER_MAX = 500;

interface InstallState {
  engineId: string;
  source: 'hf' | 'local';
  files: FileSpec[];        // danh sách file cần (đã resolve sha256/size)
  doneFiles: string[];     // dest đã xong
}

type ProgressEmit = (p: InstallProgress) => void;

const HF_BASE = 'https://huggingface.co';

/** Resolve danh sách file model từ HF API (path + size + sha256 LFS). Timeout riêng (bug thật
 * 2026-08-03: fetch không timeout → mạng chặn/không phản hồi thì treo vĩnh viễn, im lặng hoàn
 * toàn, giống hệt download-task.ts's RESPONSE_TIMEOUT_MS — xem comment ở đó). */
async function resolveHfFiles(repo: string, modelDir: string, signal: AbortSignal): Promise<FileSpec[]> {
  const api = `${HF_BASE}/api/models/${repo}/tree/main?recursive=true`;
  let res: Response;
  try {
    res = await fetch(api, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
  } catch (e) {
    if (signal.aborted) throw new DownloadError('Đã tạm dừng tải', 'aborted');
    throw new DownloadError(`Lỗi mạng khi lấy danh sách file HF (không phản hồi sau 20s hoặc lỗi kết nối): ${(e as Error).message}`, 'network');
  }
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
  /** Log dòng lệnh pip install tích luỹ — reset mỗi lượt installRuntime() mới, kể cả retry sau
   * pause/resume (không phải log liên tục xuyên suốt lifetime của installer). */
  private logBuffer: string[] = [];

  constructor(
    private engineId: string,
    private emit: ProgressEmit,
  ) {}

  /** Gắn lại callback báo tiến độ — CẦN THIẾT vì `getInstaller()` bên dưới tái sử dụng instance
   * đang chạy cho engineId đó thay vì tạo mới, nên nếu không gắn lại, callback vẫn là callback
   * GỐC (đóng gói lúc lần đầu `getInstaller` được gọi cho engine này). Bug thật phát hiện
   * 2026-08-03: bấm "Tải model" trong khi 1 lượt tải TRƯỚC ĐÓ đang chạy dở (VD renderer đã
   * reload, hoặc mở lại Engine Manager) → tiến độ vẫn gửi về callback CŨ, UI mới hoàn toàn im
   * lặng dù dữ liệu thật sự vẫn đang tải về đĩa (đã xác nhận: file `.part` tiếp tục lớn dần dù
   * không có dòng log tiến độ nào xuất hiện cho lần bấm mới). */
  setEmit(emit: ProgressEmit) {
    this.emit = emit;
  }

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

  /** Đang thật sự có 1 lượt tải/cài chạy dở (không tính paused) — dùng để tránh gọi
   * `downloadFromHf` CHỒNG LÊN 1 lượt đang chạy (2 vòng lặp cùng ghi 1 file .part → hỏng file,
   * bug thật liên quan phát hiện cùng đợt với bug callback cũ ở `getInstaller`). */
  // Kiểm cả `this.ac.signal.aborted` (KHÔNG chỉ `this.ac !== null`) — `cancel()`/`deleteInstall()`
  // gọi `abort()` nhưng KHÔNG reset `this.ac` về null hay set `this.paused=true`, nên nếu chỉ
  // check `ac !== null && !paused` thì sau khi xoá/hủy khi đang tải dở, isBusy() vẫn báo "đang
  // bận" sai — chặn nhầm lượt tải MỚI ngay sau đó (bug thật phát hiện lúc thêm nút Xoá cho
  // trạng thái 'partial', 2026-08-03).
  isBusy() { return this.ac !== null && !this.ac.signal.aborted && !this.paused; }

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
        await this.installRuntime(this._pipPackages, this._pythonBin, this._runtimeKind ?? 'torch');
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
  /** 'torch' | 'onnx-ext' | ... — quyết định NƠI ghi runtime (dùng chung theo kind, xem
   * `ttsRuntimeDir`). Không set = coi như chưa biết, `installRuntime()` sẽ dùng mặc định
   * an toàn 'torch' (qua `engineRuntimeKind()`'s fallback) thay vì đoán sai. */
  private _runtimeKind: string | null = null;

  /** Khai báo gói pip + python + loại runtime để tự cài sau khi tải model xong. */
  setRuntimeInstall(pipPackages: string[], pythonBin: string | null, runtimeKind: string) {
    this._pipPackages = pipPackages;
    this._pythonBin = pythonBin;
    this._runtimeKind = runtimeKind;
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

  /**
   * Xoá engine đã cài (model + state) để giải phóng đĩa.
   *
   * GĐ C: `this.dir()` không còn chứa runtime dùng chung (nằm ở `ttsRuntimeDir(kind)`) nên
   * xoá nó KHÔNG đụng runtime của engine khác cùng kind — an toàn tự nhiên, không cần
   * refcount thủ công. Đọc `kind` TRƯỚC khi xoá (manifest sắp biến mất theo `this.dir()`),
   * rồi dọn nốt runtime dùng chung nếu đây là engine CUỐI CÙNG còn dùng kind đó — nếu
   * không, torch (~2.5GB) nằm mồ côi vĩnh viễn sau khi xoá engine torch duy nhất.
   */
  deleteInstall(): { ok: boolean; error?: string } {
    const kind = engineRuntimeKindIfInstalled(this.engineId);
    try {
      this.stopStageMonitor();
      if (this.ac) this.ac.abort();
      rmSync(this.dir(), { recursive: true, force: true });
      if (kind) cleanupOrphanedRuntimeIfUnused(kind);
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
   * Cài runtime Python cho engine: pip install các gói (torch...) vào site-packages bằng
   * `pip install --target`. Engine chạy bằng Python này + PYTHONPATH tới đây.
   *
   * GĐ C (2026-08-11): đích ghi là `ttsRuntimeDir(runtimeKind)` — DÙNG CHUNG cho mọi engine
   * cùng kind, KHÔNG còn nằm trong `ttsEngineDir(engineId)` riêng. Cài engine torch thứ hai
   * (vd sau này thêm 1 engine torch khác cạnh VoxCPM) sẽ pip install vào CÙNG thư mục —
   * torch (~2.5GB) chỉ tồn tại 1 bản trên đĩa thay vì nhân theo số engine. Đánh đổi: pip
   * install lần sau phải giải lại dependency graph cho gói MỚI cộng với gói đã có sẵn — nếu
   * 2 engine cùng kind đòi phiên bản torch xung đột nhau, lần cài sau có thể ghi đè/nâng cấp
   * bản đầu (pip tự báo lỗi rõ ràng nếu không giải được, không âm thầm hỏng) — chấp nhận
   * được vì đổi lại tiết kiệm hàng GB cho trường hợp phổ biến (không xung đột).
   *
   * pythonBin: interpreter dùng để chạy pip.
   *   - Bản dev: venv của app (caller truyền vào) — nhanh, khỏi tải thêm.
   *   - Bản ĐÓNG GÓI: caller truyền null → tự tải Python relocatable về
   *     `<runtimeRoot>/python` (xem python-runtime.ts) rồi pip bằng chính nó. Đây cũng là
   *     interpreter mà resolveExtensionEngineSpawn()/resolveEngineRuntimeLocation() sẽ dùng.
   *
   * Tiến độ pip stream qua stdout (không có % chính xác — báo dòng log gần nhất).
   */
  async installRuntime(pipPackages: string[], pythonBin: string | null, runtimeKind: string): Promise<void> {
    this.ac = new AbortController();
    const signal = this.ac.signal;
    this._runtimeKind = runtimeKind;
    const runtimeRoot = ttsRuntimeDir(runtimeKind);
    const runtimeDir = join(runtimeRoot, 'site-packages');
    mkdirSync(runtimeDir, { recursive: true });

    let python = pythonBin;
    if (!python) {
      // Không có interpreter sẵn (bản đóng gói) → tải về. Bước này có thể mất vài chục
      // MB nên báo tiến độ như một phần của phase installing-runtime.
      try {
        const { ensurePythonRuntime } = await import('./python-runtime');
        this.emit(this.prog('installing-runtime', [], [], 0, 0, 0, 'Đang tải runtime Python…'));
        python = await ensurePythonRuntime(runtimeRoot, signal, (p) => {
          this.emit(this.prog('installing-runtime', [], [], p.receivedBytes, p.totalBytes ?? 0,
            p.bytesPerSec, 'runtime Python'));
        });
      } catch (e) {
        // handleError() tự phân biệt DownloadError kind='aborted' (user bấm Tạm dừng lúc đang
        // tải Python runtime) → emit 'paused' thay vì 'error' — bug thật 2026-08-04 tương tự bug
        // pip install bên dưới: trước đây luôn báo 'error' kể cả khi CHÍNH NGƯỜI DÙNG bấm Tạm
        // dừng, khiến nút Tạm dừng "như không có tác dụng gì" (không có Resume rõ ràng, chỉ thấy
        // lỗi chung chung).
        this.handleError(e);
        return;
      }
    }

    // Log dòng lệnh pip tích luỹ — renderer hiện hộp log cuộn khi mở "Chi tiết". Reset mỗi lượt
    // cài MỚI (kể cả retry sau pause/resume).
    this.logBuffer = [];
    // pip không báo tổng dung lượng/tiến độ dạng số khi chạy ngầm (không phải TTY) nên KHÔNG có
    // % chính xác. Ước lượng bằng cách đếm dòng "Collecting <tên gói>" so với số gói top-level
    // yêu cầu cài — luôn tăng dần nhưng không chính xác 100% vì pip còn "Collecting" cả gói kéo
    // theo (dependency), nên chặn ở 95 cho tới khi cài xong hẳn (phase 'done').
    let collectedCount = 0;
    const totalPkgs = pipPackages.length;
    const estimatePct = (): number | undefined =>
      totalPkgs > 0 ? Math.min(95, Math.round((collectedCount / totalPkgs) * 100)) : undefined;
    const emitPipProgress = (phase: InstallProgress['phase']) => {
      this.emit(this.prog(phase, [], [], 0, 0, 0, this.logBuffer.at(-1) ?? '', undefined, undefined,
        [...this.logBuffer], estimatePct()));
    };
    emitPipProgress('installing-runtime');

    const { spawn } = await import('node:child_process');
    const args = ['-m', 'pip', 'install', '--no-cache-dir', '--target', runtimeDir, ...pipPackages];
    const ok = await new Promise<boolean>((resolve) => {
      const proc = spawn(python, args, { windowsHide: true });
      const onData = (d: Buffer) => {
        const lines = d.toString().split('\n').filter((l) => l.trim().length > 0);
        for (const line of lines) {
          if (/^Collecting\s+\S/.test(line.trim())) collectedCount += 1;
        }
        this.logBuffer.push(...lines);
        if (this.logBuffer.length > LOG_BUFFER_MAX) this.logBuffer = this.logBuffer.slice(-LOG_BUFFER_MAX);
        emitPipProgress('installing-runtime');
      };
      proc.stdout?.on('data', onData);
      proc.stderr?.on('data', onData);
      signal.addEventListener('abort', () => proc.kill(), { once: true });
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });

    // Bug thật 2026-08-04: trước đây bị kill (Tạm dừng) → code đóng khác 0 → rơi thẳng vào
    // nhánh lỗi bên dưới ("pip install runtime thất bại") dù người dùng CHỦ ĐỘNG bấm Tạm dừng —
    // nút Tạm dừng vẫn giết được tiến trình pip thật, nhưng UI báo sai thành lỗi, không có
    // đường Resume rõ ràng → trông như bấm Tạm dừng "không có tác dụng gì".
    if (signal.aborted) {
      emitPipProgress('paused');
      return;
    }

    if (!ok) {
      this.emit(this.prog('error', [], [], 0, 0, 0, '', 0, 'pip install runtime thất bại (xem log).', [...this.logBuffer]));
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
      // Ghi lại runtime_kind THẬT SỰ đã dùng để cài — nguồn sự thật offline cho
      // engineRuntimeKind()/tierOfEngine() (không cần hỏi server qua HTTP, xem comment ở
      // engineRuntimeKind). Chỉ ghi khi biết chắc (installRuntime() luôn set trước khi gọi
      // markInstalled) — giữ giá trị cũ trong manifest nếu vì lý do gì đó không có.
      if (this._runtimeKind) m.runtimeKind = this._runtimeKind;
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
      let err = '';
      // 300s: engine mở rộng nặng (vd VoxCPM — torch, model ~4.5GB) đo thực tế mất 118s
      // CHỈ để đọc safetensors từ đĩa (I/O-bound) — sát ngưỡng cũ 120s, dễ vượt khi máy bận
      // (Electron + service cũ còn chạy song song). Khớp với HEALTH_TIMEOUT_MS ở
      // python-server.ts (cùng chờ load model y hệt lúc khởi động thật).
      const to = setTimeout(() => {
        proc.kill();
      }, 300_000);
      proc.stdout?.on('data', (d) => { out += d.toString(); });
      proc.stderr?.on('data', (d) => { err += d.toString(); });
      proc.on('error', (e) => {
        clearTimeout(to);
        resolve({ ok: false, error: `Spawn error: ${e.message}` });
      });
      proc.on('close', (code) => {
        clearTimeout(to);
        // Lấy dòng JSON cuối (verify_engine.py in JSON 1 dòng).
        const line = out.split('\n').reverse().find((l) => l.trim().startsWith('{'));
        if (!line) {
          const msg = code === null
            ? 'Engine kiểm tra bị timeout (>300s) hoặc crash'
            : `Không đọc được kết quả verify (exit code: ${code})`;
          const fullOutput = err ? `stderr: ${err.slice(0, 200)}` : '';
          resolve({
            ok: false,
            error: msg + (fullOutput ? ` — ${fullOutput}` : '')
          });
          return;
        }
        try {
          const r = JSON.parse(line);
          resolve({ ok: !!r.ok, error: r.error ?? undefined, capabilities: r.capabilities });
        } catch (e) {
          resolve({ ok: false, error: `Kết quả verify không hợp lệ: ${e instanceof Error ? e.message : String(e)}` });
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
      // Ghi sớm ngay từ lúc model xong (thường đã biết qua setRuntimeInstall() gọi trước
      // downloadFromHf) — để engineRuntimeKind() có câu trả lời đúng ngay cả khi runtime
      // chưa cài xong (trạng thái 'partial'), không phải đợi tới lúc 'installed'.
      ...(this._runtimeKind ? { runtimeKind: this._runtimeKind } : {}),
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
    filesDone?: number, error?: string, logLines?: string[], installPct?: number,
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
      logLines,
      installPct,
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
  else inst.setEmit(emit); // instance đang chạy dở → gắn lại callback theo cửa sổ/lượt gọi HIỆN TẠI
  return inst;
}

export function getActiveInstaller(engineId: string): EngineInstaller | undefined {
  return _installers.get(engineId);
}
