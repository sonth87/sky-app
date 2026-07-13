/**
 * renderer-updater.ts — GĐ8 OTA Update, Loại 1a (renderer/UI, không cần cài lại).
 *
 * 2 nguồn zip renderer bundle dùng chung applyRendererZip():
 *  1. OTA tự động: checkAndApplyRendererUpdate() kiểm tra manifest.json trên
 *     server tĩnh → tải zip (downloadFile() từ download-task.ts — resume/
 *     checksum/atomic rename) → applyRendererZip().
 *  2. Update qua file (chọn tay, xem electron/update-file-picker.ts): user
 *     tự chọn 1 file .zip local (không mạng, ví dụ nhận qua USB) →
 *     applyRendererZip() thẳng, không qua downloadFile()/HTTP.
 *
 * Bản mới chỉ có hiệu lực ở LẦN MỞ APP KẾ TIẾP (không hot-reload cửa sổ đang
 * chạy) — đơn giản, tránh gián đoạn app đang dùng tại chỗ trong buổi lễ.
 *
 * Offline-first bắt buộc (nhánh OTA): mọi lỗi (mạng rớt, checksum sai, JSON
 * hỏng) chỉ log, KHÔNG throw ra ngoài — app luôn mở được bằng bản đã có (OTA
 * cũ hoặc dist/ gốc đóng gói sẵn).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import AdmZip from 'adm-zip';
import { downloadFile, DownloadError, type FileSpec } from './download-task';

interface RendererManifest {
  schemaVersion: number;
  bundleVersion: string;
  minAppVersion?: string;
  releaseNotes?: string;
  url: string;
  sha256: string;
  sizeBytes?: number;
  publishedAt: string;
}

interface CurrentState {
  version: string;
  installedAt: string;
}

const FETCH_TIMEOUT_MS = 8_000;

export type UpdateProgressPhase = 'idle' | 'checking' | 'downloading' | 'extracting' | 'done' | 'error';

export interface UpdateProgress {
  phase: UpdateProgressPhase;
  percent: number | null; // null nếu totalBytes không xác định (downloadFile()'s giới hạn đã biết)
  bundleVersion?: string;
  error?: string;
}

interface PendingUpdateInfo {
  bundleVersion: string;
  releaseNotes?: string;
}

let pendingUpdate: PendingUpdateInfo | null = null;

function rendererUpdatesDir(): string {
  return join(app.getPath('userData'), 'renderer-updates');
}
function currentStatePath(): string {
  return join(rendererUpdatesDir(), 'current.json');
}
function downloadTmpDir(): string {
  return join(rendererUpdatesDir(), '.download-tmp');
}
/** Sanitize version thành tên thư mục hợp lệ trên mọi OS (': ' không hợp lệ trên Windows). */
function versionDirName(version: string): string {
  return version.replace(/[:]/g, '');
}
function versionDir(version: string): string {
  return join(rendererUpdatesDir(), versionDirName(version));
}

export function readCurrentState(): CurrentState | null {
  try {
    const raw = readFileSync(currentStatePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed?.version === 'string') return parsed as CurrentState;
    return null;
  } catch {
    return null;
  }
}

/** Ghi atomic: write-temp-then-rename, tránh half-written JSON nếu crash giữa lúc ghi. */
function writeCurrentState(state: CurrentState): void {
  const dir = rendererUpdatesDir();
  mkdirSync(dir, { recursive: true });
  const tmpPath = currentStatePath() + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  renameSync(tmpPath, currentStatePath());
}

/**
 * Path thư mục renderer bundle tốt nhất để loadFile — bản OTA đã tải+verify
 * thành công gần nhất, hoặc null nếu chưa từng có / thư mục bị thiếu file
 * (caller fallback về dist/index.html gốc đóng gói sẵn).
 */
export function resolveActiveRendererDir(): string | null {
  const state = readCurrentState();
  if (!state) return null;
  const dir = versionDir(state.version);
  return existsSync(join(dir, 'index.html')) ? dir : null;
}

export function getPendingAppliedVersion(): string | null {
  return pendingUpdate?.bundleVersion ?? null;
}

export function getPendingUpdateInfo(): PendingUpdateInfo | null {
  return pendingUpdate;
}

/** So sánh SemVer tối giản: 1 nếu a>b, -1 nếu a<b, 0 nếu bằng. Không đủ định dạng → coi bằng 0. */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10));
  const pb = b.split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (Number.isNaN(na) || Number.isNaN(nb)) return 0;
    if (na !== nb) return na > nb ? 1 : -1;
  }
  return 0;
}

async function fetchManifest(manifestUrl: string): Promise<RendererManifest | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(manifestUrl, { signal: controller.signal });
    if (!res.ok) {
      console.error(`[renderer-updater] manifest fetch HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (
      typeof data?.bundleVersion !== 'string' ||
      typeof data?.url !== 'string' ||
      typeof data?.sha256 !== 'string' ||
      typeof data?.publishedAt !== 'string'
    ) {
      console.error('[renderer-updater] manifest thiếu field bắt buộc');
      return null;
    }
    return data as RendererManifest;
  } catch (err) {
    console.error('[renderer-updater] manifest fetch lỗi:', (err as Error).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Xoá mọi thư mục version NGOÀI (current, previous) + dọn .download-tmp. */
function pruneOldVersions(keep: Set<string>): void {
  const dir = rendererUpdatesDir();
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry === 'current.json' || entry === '.download-tmp') continue;
    if (keep.has(entry)) continue;
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
  rmSync(downloadTmpDir(), { recursive: true, force: true });
}

export interface ApplyRendererZipResult {
  ok: boolean;
  bundleVersion?: string;
  error?: string;
}

/**
 * Extract 1 zip renderer bundle đã có sẵn trên đĩa (nguồn gốc bất kỳ — tải
 * OTA hay user tự chọn qua file picker) → atomic swap → writeCurrentState →
 * prune. THUẦN, không tải file — caller lo việc đưa zip vào đĩa trước khi
 * gọi. Không throw — trả {ok:false, error} để caller (IPC handler hay
 * checkAndApplyRendererUpdate) tự quyết log/UI.
 */
export async function applyRendererZip(
  zipPath: string,
  bundleVersion: string,
  releaseNotes?: string,
): Promise<ApplyRendererZipResult> {
  const current = readCurrentState();
  const finalDir = versionDir(bundleVersion);
  const extractingDir = finalDir + '.extracting';
  try {
    rmSync(extractingDir, { recursive: true, force: true });
    mkdirSync(extractingDir, { recursive: true });
    new AdmZip(zipPath).extractAllTo(extractingDir, true);

    if (!existsSync(join(extractingDir, 'index.html'))) {
      throw new Error('bundle giải nén thiếu index.html');
    }

    rmSync(finalDir, { recursive: true, force: true });
    renameSync(extractingDir, finalDir); // atomic swap thư mục
  } catch (err) {
    rmSync(extractingDir, { recursive: true, force: true });
    return { ok: false, error: (err as Error).message };
  }

  const previousVersion = current?.version;
  writeCurrentState({ version: bundleVersion, installedAt: new Date().toISOString() });

  const keep = new Set([versionDirName(bundleVersion)]);
  if (previousVersion) keep.add(versionDirName(previousVersion));
  pruneOldVersions(keep);

  pendingUpdate = { bundleVersion, releaseNotes };
  console.log(`[renderer-updater] bản ${bundleVersion} đã sẵn sàng, áp dụng ở lần mở app kế tiếp`);
  return { ok: true, bundleVersion };
}

/**
 * Toàn bộ flow check + download + verify + extract + swap. Non-blocking,
 * fire-and-forget — gọi từ main.ts sau createMainWindow(), KHÔNG chặn app mở.
 * onProgress optional — nếu truyền, nhận các mốc trạng thái (main.ts forward
 * qua webContents.send('renderer-update:progress', ...) tới renderer).
 */
export async function checkAndApplyRendererUpdate(
  manifestUrl: string,
  onProgress?: (p: UpdateProgress) => void,
): Promise<void> {
  onProgress?.({ phase: 'checking', percent: null });

  const manifest = await fetchManifest(manifestUrl);
  if (!manifest) {
    onProgress?.({ phase: 'idle', percent: null });
    return;
  }

  if (manifest.minAppVersion && compareSemver(app.getVersion(), manifest.minAppVersion) < 0) {
    console.log(
      `[renderer-updater] app version ${app.getVersion()} < minAppVersion ${manifest.minAppVersion}, bỏ qua bản ${manifest.bundleVersion}`
    );
    onProgress?.({ phase: 'idle', percent: null });
    return;
  }

  const current = readCurrentState();
  if (current && compareSemver(manifest.bundleVersion, current.version) <= 0) {
    onProgress?.({ phase: 'idle', percent: null });
    return; // đã có bản này hoặc mới hơn rồi — không downgrade nếu server serve nhầm bản cũ
  }

  const tmpDir = downloadTmpDir();
  mkdirSync(tmpDir, { recursive: true });
  const zipPath = join(tmpDir, `${versionDirName(manifest.bundleVersion)}.zip`);

  const spec: FileSpec = {
    url: manifest.url,
    dest: zipPath,
    sha256: manifest.sha256,
    size: manifest.sizeBytes,
  };

  try {
    await downloadFile(spec, new AbortController().signal, (p) => {
      const percent = p.totalBytes ? Math.round((p.receivedBytes / p.totalBytes) * 100) : null;
      onProgress?.({ phase: 'downloading', percent, bundleVersion: manifest.bundleVersion });
    });
  } catch (err) {
    const message = err instanceof DownloadError ? err.message : (err as Error).message;
    if (err instanceof DownloadError) {
      console.error(`[renderer-updater] tải bản ${manifest.bundleVersion} thất bại (${err.kind}):`, err.message);
    } else {
      console.error('[renderer-updater] lỗi không xác định khi tải:', err);
    }
    onProgress?.({ phase: 'error', percent: null, bundleVersion: manifest.bundleVersion, error: message });
    return;
  }

  onProgress?.({ phase: 'extracting', percent: null, bundleVersion: manifest.bundleVersion });
  const result = await applyRendererZip(zipPath, manifest.bundleVersion, manifest.releaseNotes);
  if (!result.ok) {
    console.error(`[renderer-updater] extract bản ${manifest.bundleVersion} thất bại:`, result.error);
    rmSync(zipPath, { force: true });
    onProgress?.({ phase: 'error', percent: null, bundleVersion: manifest.bundleVersion, error: result.error });
    return;
  }

  onProgress?.({ phase: 'done', percent: 100, bundleVersion: manifest.bundleVersion });
}
