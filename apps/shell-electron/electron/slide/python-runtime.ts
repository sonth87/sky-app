/**
 * python-runtime.ts — Tải Python relocatable cho BẢN ĐÓNG GÓI.
 *
 * Vì sao cần: bản đóng gói chạy engine mặc định bằng binary PyInstaller, trong đó
 * KHÔNG có interpreter Python dùng lại được. Mà engine mở rộng (MOSS, VoxCPM…) lại
 * cần `pip install` gói riêng rồi chạy main.py. Trước đây installRuntime() gặp
 * pythonBin=null là báo lỗi "chưa hỗ trợ" — module này lấp đúng chỗ đó.
 *
 * Nguồn: astral-sh/python-build-standalone. Chọn nguồn này thay vì "Python embeddable"
 * chính chủ vì bản chính chủ CHỈ có cho Windows, còn đây có đủ macOS arm64/x64 +
 * Windows và đều relocatable (chạy được từ thư mục bất kỳ, không cần cài đặt).
 *
 * Giải nén bằng `tar` của hệ điều hành: macOS/Linux có sẵn, Windows 10 trở lên cũng
 * có tar.exe kèm theo. Đổi lại không phải thêm dependency giải nén vào bundle.
 */
import { existsSync, mkdirSync, rmSync, linkSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { downloadFile, DownloadError, type ProgressCb } from './download-task';

/**
 * Tên tiến trình engine mở rộng hiện trong Activity Monitor / Task Manager.
 *
 * Hệ điều hành gán tên tiến trình từ TÊN FILE THỰC THI lúc exec — tiến trình không tự đổi
 * được (đã thử trên máy: `argv0` khi spawn và symlink đều KHÔNG có tác dụng; chỉ tên file
 * thật mới ăn). Nên ta tạo thêm một HARDLINK mang tên sản phẩm trỏ vào chính interpreter:
 * tốn 0 byte, giữ nguyên mọi symlink và bố cục thư mục của bản phân phối Python.
 */
const PROC_ALIAS = process.platform === 'win32' ? 'Sky App TTS.exe' : 'Sky App TTS';

/**
 * Phiên bản ghim. Nâng cấp = đổi 2 hằng số này; KHÔNG để "latest" vì bản đóng gói
 * phải tái lập được y hệt, và một release mới có thể đổi cách đặt tên asset.
 */
const PBS_TAG = '20260718';
const PBS_PYTHON = '3.11.15';

/** Ánh xạ platform/arch của Node sang "target triple" trong tên asset. */
function pbsTriple(): string | null {
  const { platform, arch } = process;
  if (platform === 'darwin') return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  if (platform === 'win32') return arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  if (platform === 'linux') return arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
  return null;
}

/**
 * Đường dẫn interpreter sau khi giải nén. Archive `install_only` bung ra thư mục
 * `python/`, nên bin nằm ở `<runtimeDir>/python/…` — khớp với chỗ
 * resolveExtensionEngineSpawn() dò tìm.
 */
export function embeddedPythonBin(runtimeDir: string): string {
  return process.platform === 'win32'
    ? join(runtimeDir, 'python', 'python.exe')
    : join(runtimeDir, 'python', 'bin', 'python3');
}

/**
 * Interpreter NÊN DÙNG để spawn engine mở rộng trong `runtimeDir`, hoặc null nếu chưa cài.
 *
 * Thứ tự ưu tiên: hardlink mang tên sản phẩm → interpreter gốc → bố cục cũ.
 *
 * Nhánh "bố cục cũ" (`runtime/bin/python`) tồn tại vì trước đây `resolveExtensionEngineSpawn()`
 * và `tts:engine-verify` dò đúng đường dẫn đó, KHÔNG khớp với đường `ensurePythonRuntime()`
 * thật sự tạo ra (`runtime/python/bin/python3`) — lệch từ hồi chuyển nguồn runtime sang
 * astral-sh/python-build-standalone. Hệ quả ở bản ĐÓNG GÓI: không bao giờ tìm thấy
 * interpreter vừa tải, âm thầm rơi về system Python (không có torch) nên engine mở rộng
 * không chạy được. Gom về một hàm duy nhất để không tái diễn lệch đường dẫn.
 */
export function resolveRuntimePython(runtimeDir: string): string | null {
  const real = embeddedPythonBin(runtimeDir);
  const alias = join(dirname(real), PROC_ALIAS);
  if (existsSync(alias)) return alias;
  if (existsSync(real)) return real;
  const legacy = process.platform === 'win32'
    ? join(runtimeDir, 'python.exe')
    : join(runtimeDir, 'bin', 'python');
  return existsSync(legacy) ? legacy : null;
}

/**
 * Tạo hardlink mang tên sản phẩm cạnh interpreter. Trả đường dẫn nên spawn.
 *
 * Không tạo được (hệ tệp không hỗ trợ hardlink, thiếu quyền…) thì trả lại bản gốc — đổi
 * tên hiển thị là thứ "có thì tốt", KHÔNG được phép làm hỏng cài đặt engine.
 */
function createProcessAlias(realBin: string): string {
  const aliasPath = join(dirname(realBin), PROC_ALIAS);
  if (existsSync(aliasPath)) return aliasPath;
  try {
    // Hardlink vào FILE THẬT: `python3` thường chỉ là symlink tới `python3.11`, mà hệ điều
    // hành resolve symlink trước khi đặt tên tiến trình — link vào symlink là mất tác dụng.
    linkSync(realpathSync(realBin), aliasPath);
    return aliasPath;
  } catch {
    return realBin;
  }
}

function run(cmd: string, args: string[], signal?: AbortSignal): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { windowsHide: true });
    let out = '';
    const collect = (d: Buffer) => { out += d.toString(); };
    proc.stdout?.on('data', collect);
    proc.stderr?.on('data', collect);
    signal?.addEventListener('abort', () => proc.kill(), { once: true });
    proc.on('error', (e) => resolve({ ok: false, out: `${out}\n${e.message}` }));
    proc.on('close', (code) => resolve({ ok: code === 0, out }));
  });
}

/**
 * Bảo đảm có Python chạy được trong `runtimeDir`. Trả đường dẫn interpreter.
 * Ném Error nếu không tải/giải nén được (caller báo lên UI qua phase 'error').
 *
 * Idempotent: đã có sẵn thì trả ngay, không tải lại.
 */
export async function ensurePythonRuntime(
  runtimeDir: string,
  signal: AbortSignal,
  onProgress?: ProgressCb,
): Promise<string> {
  const existing = resolveRuntimePython(runtimeDir);
  if (existing) return existing;

  const triple = pbsTriple();
  if (!triple) {
    throw new Error(`Không hỗ trợ nền tảng ${process.platform}/${process.arch} cho runtime Python tải rời.`);
  }

  mkdirSync(runtimeDir, { recursive: true });
  const asset = `cpython-${PBS_PYTHON}+${PBS_TAG}-${triple}-install_only.tar.gz`;
  const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${asset}`;
  const archive = join(runtimeDir, asset);

  try {
    // downloadFile tự resume qua file .part nên tải dở rồi tắt app vẫn tiếp được.
    await downloadFile({ url, dest: archive }, signal, onProgress);
  } catch (e) {
    if (e instanceof DownloadError && e.kind === 'aborted') throw e;
    throw new Error(`Tải runtime Python thất bại: ${e instanceof Error ? e.message : String(e)}`);
  }

  const untar = await run('tar', ['-xzf', archive, '-C', runtimeDir], signal);
  if (!untar.ok) {
    throw new Error(`Giải nén runtime Python thất bại: ${untar.out.trim().split('\n').pop() ?? ''}`);
  }
  rmSync(archive, { force: true });

  // macOS: app chưa code-sign nên file tải về mang cờ quarantine → Gatekeeper chặn
  // thực thi. Gỡ cờ, nếu không mọi lệnh pip/python sau đó đều fail im lặng.
  if (process.platform === 'darwin') {
    await run('xattr', ['-dr', 'com.apple.quarantine', join(runtimeDir, 'python')], signal);
  }

  const bin = embeddedPythonBin(runtimeDir);
  if (!existsSync(bin)) {
    throw new Error(`Giải nén xong nhưng không thấy interpreter tại ${bin}`);
  }
  // Chạy thử: bắt lỗi quarantine/thiếu thư viện NGAY, thay vì để pip fail khó hiểu.
  const check = await run(bin, ['-V'], signal);
  if (!check.ok) {
    throw new Error(`Runtime Python không chạy được: ${check.out.trim()}`);
  }

  // Đặt tên tiến trình cho dễ nhận ra trong Activity Monitor / Task Manager. Kiểm lại bằng
  // `-V` qua CHÍNH hardlink: nếu vì lý do nào đó nó không chạy được, quay về bản gốc thay
  // vì để engine chết ở lần spawn thật.
  const alias = createProcessAlias(bin);
  if (alias !== bin) {
    const aliasCheck = await run(alias, ['-V'], signal);
    if (!aliasCheck.ok) {
      rmSync(alias, { force: true });
      return bin;
    }
  }
  return alias;
}
