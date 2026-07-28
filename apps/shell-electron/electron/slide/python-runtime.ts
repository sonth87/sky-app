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
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { downloadFile, DownloadError, type ProgressCb } from './download-task';

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
  const bin = embeddedPythonBin(runtimeDir);
  if (existsSync(bin)) return bin;

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

  if (!existsSync(bin)) {
    throw new Error(`Giải nén xong nhưng không thấy interpreter tại ${bin}`);
  }
  // Chạy thử: bắt lỗi quarantine/thiếu thư viện NGAY, thay vì để pip fail khó hiểu.
  const check = await run(bin, ['-V'], signal);
  if (!check.ok) {
    throw new Error(`Runtime Python không chạy được: ${check.out.trim()}`);
  }
  return bin;
}
