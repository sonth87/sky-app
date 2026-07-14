/**
 * download-task.ts — Tải file có kiểm soát: pause/resume/checksum/resume-qua-restart.
 *
 * Vì huggingface_hub 1.21 đã BỎ API pause/resume chủ động, ta tự tải bằng Node fetch
 * + HTTP Range header. Mỗi file:
 *   - ghi append vào <dest>.part; offset = kích thước file .part hiện có.
 *   - pause = AbortController.abort() (giữ .part); resume = Range: bytes=<offset>-.
 *   - checksum SHA256 tính TĂNG DẦN khi ghi; xong so với sha mong đợi.
 *   - khớp → rename .part → dest thật; lệch → xoá .part + báo lỗi.
 *
 * Tiến độ tổng (nhiều file) do EngineInstaller cộng dồn; task này lo TỪNG file.
 * State bền (offset, file đã xong) do caller ghi vào install-state.json.
 */
import { createWriteStream, createReadStream, existsSync, statSync, renameSync, rmSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';

export interface FileSpec {
  url: string;
  dest: string;        // đường dẫn đích tuyệt đối
  sha256?: string;     // hash mong đợi (HF LFS). Không có → verify bằng size.
  size?: number;       // bytes mong đợi (nếu biết)
}

export interface DownloadProgress {
  file: string;
  receivedBytes: number;   // bytes file này đã có (gồm phần .part cũ)
  totalBytes: number | null;
  bytesPerSec: number;
}

export type ProgressCb = (p: DownloadProgress) => void;

export class DownloadError extends Error {
  constructor(message: string, readonly kind: 'network' | 'checksum' | 'aborted' | 'io') {
    super(message);
  }
}

/**
 * Tải MỘT file với resume. Trả khi xong (đã rename sang dest thật) hoặc ném lỗi.
 * Ném DownloadError kind='aborted' nếu bị pause/abort (caller giữ .part để resume sau).
 */
export async function downloadFile(
  spec: FileSpec,
  signal: AbortSignal,
  onProgress?: ProgressCb,
): Promise<void> {
  const partPath = spec.dest + '.part';
  mkdirSync(dirname(spec.dest), { recursive: true });

  // Nếu dest thật đã tồn tại + đúng size → coi như xong (idempotent).
  if (existsSync(spec.dest) && (!spec.size || statSync(spec.dest).size === spec.size)) {
    return;
  }

  // Offset resume = kích thước .part hiện có.
  let offset = existsSync(partPath) ? statSync(partPath).size : 0;

  // Nếu .part đã bằng/lớn hơn size mong đợi → có thể đã tải đủ nhưng chưa verify.
  // Cứ verify luôn (đọc lại .part), khỏi tải thừa.
  const needFetch = !spec.size || offset < spec.size;

  if (needFetch) {
    const headers: Record<string, string> = {};
    if (offset > 0) headers['Range'] = `bytes=${offset}-`;

    let res: Response;
    try {
      res = await fetch(spec.url, { headers, signal });
    } catch (e) {
      if (signal.aborted) throw new DownloadError('Đã tạm dừng tải', 'aborted');
      throw new DownloadError(`Lỗi mạng: ${(e as Error).message}`, 'network');
    }

    // 200 = server bỏ qua Range (tải lại từ đầu) → reset offset. 206 = resume OK.
    if (offset > 0 && res.status === 200) {
      offset = 0;
    } else if (offset > 0 && res.status !== 206) {
      throw new DownloadError(`Server không hỗ trợ resume (HTTP ${res.status})`, 'network');
    } else if (offset === 0 && !res.ok) {
      throw new DownloadError(`HTTP ${res.status} khi tải ${spec.url}`, 'network');
    }
    if (!res.body) throw new DownloadError('Response rỗng', 'network');

    const totalBytes = spec.size
      ?? (res.headers.get('content-length')
        ? offset + parseInt(res.headers.get('content-length')!, 10)
        : null);

    // Ghi append (nếu resume) hoặc tạo mới.
    const out = createWriteStream(partPath, { flags: offset > 0 ? 'a' : 'w' });
    let received = offset;
    let lastTs = Date.now();
    let lastBytes = received;

    try {
      const nodeStream = Readable.fromWeb(res.body as any);
      for await (const chunk of nodeStream) {
        if (signal.aborted) {
          out.close();
          throw new DownloadError('Đã tạm dừng tải', 'aborted');
        }
        out.write(chunk);
        received += chunk.length;
        const now = Date.now();
        if (onProgress && now - lastTs >= 250) {
          const bps = ((received - lastBytes) * 1000) / (now - lastTs);
          onProgress({ file: spec.dest, receivedBytes: received, totalBytes, bytesPerSec: bps });
          lastTs = now;
          lastBytes = received;
        }
      }
      await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
    } catch (e) {
      out.close();
      if (e instanceof DownloadError) throw e;
      if (signal.aborted) throw new DownloadError('Đã tạm dừng tải', 'aborted');
      throw new DownloadError(`Lỗi ghi/tải: ${(e as Error).message}`, 'io');
    }
  }

  // ── Verify checksum (đọc lại .part) ──
  if (spec.sha256) {
    const actual = await sha256File(partPath, signal);
    if (actual.toLowerCase() !== spec.sha256.toLowerCase()) {
      rmSync(partPath, { force: true });
      throw new DownloadError(`Checksum sai cho ${spec.dest} (file hỏng)`, 'checksum');
    }
  } else if (spec.size && statSync(partPath).size !== spec.size) {
    rmSync(partPath, { force: true });
    throw new DownloadError(`Kích thước file sai cho ${spec.dest}`, 'checksum');
  }

  // Xong → rename .part sang dest thật (atomic).
  renameSync(partPath, spec.dest);
}

/** SHA256 của file, hủy được qua signal. */
function sha256File(path: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const rs = createReadStream(path);
    const onAbort = () => { rs.destroy(); reject(new DownloadError('Đã hủy', 'aborted')); };
    signal.addEventListener('abort', onAbort, { once: true });
    rs.on('data', (d) => hash.update(d));
    rs.on('error', (e) => { signal.removeEventListener('abort', onAbort); reject(new DownloadError(`Lỗi đọc: ${e.message}`, 'io')); });
    rs.on('end', () => { signal.removeEventListener('abort', onAbort); resolve(hash.digest('hex')); });
  });
}
