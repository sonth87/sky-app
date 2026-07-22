import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { CanonicalRecord, TtsCondition, CustomVariable } from '@sky-app/slide-shared';
import { flattenCanonicalRecord } from '@sky-app/slide-shared';
import { ttsPregenDir, ttsPregenManifestPath, ttsPregenWavPath } from './data/paths';
import { renderTemplate } from './lib/renderTemplate';
import { getPythonPort } from './python-server';

export interface PreGenConfig {
  template: string;
  ttsModel: string;
  ttsSpeed: number;
  ttsConditions?: TtsCondition[];
  customVariables?: CustomVariable[];
}

export type PreGenStudentStatus = 'pending' | 'processing' | 'done' | 'failed';
export type PreGenType = 'pregen' | 'realtime';

export interface ManifestEntry {
  status: PreGenStudentStatus;
  error?: string;
  // Metadata audio — có khi status=done
  type?: PreGenType;       // pregen = chủ động, realtime = bị động (bấm play)
  text?: string;           // nội dung đã đọc
  voice?: string;          // vieneu-NF, vieneu-NM1,...
  speed?: number;
  duration_ms?: number;
  generated_at?: string;   // ISO 8601
  // Chất lượng — cảnh báo file khả nghi (ú ớ/rè/méo/cụt). Có khi status=done.
  quality_score?: number;  // 0-100, càng thấp càng nghi
  quality_flags?: string[]; // vd ['noisy','low_energy']; rỗng = không nghi
}

interface Manifest {
  batch_id: string;
  config_hash: string;
  students: Record<string, ManifestEntry>;
}

export interface PreGenStatus {
  total: number;
  done: number;
  failed: number;
  pending: number;
  suspect: number;   // số file done nhưng có quality_flags
  running: boolean;
  paused: boolean;
  configChanged: boolean;
  currentId: string | null;
  records: Record<string, PreGenStudentStatus>;
  quality: Record<string, string[]>;  // id -> flags (chỉ file bị flag)
}

function computeConfigHash(config: PreGenConfig): string {
  const str = JSON.stringify({
    model: config.ttsModel,
    speed: config.ttsSpeed,
    template: config.template,
    conditions: config.ttsConditions || [],
    customVariables: config.customVariables || [],
  });
  return createHash('md5').update(str).digest('hex');
}

function getVoiceForRecord(
  record: CanonicalRecord,
  conditions: TtsCondition[],
  fallbackVoice: string
): string {
  const flat = flattenCanonicalRecord(record);
  for (const cond of conditions) {
    const recordVal = flat[cond.attr] ?? '';
    if (recordVal.trim().toLowerCase() === cond.val.trim().toLowerCase()) {
      return cond.voice;
    }
  }
  return fallbackVoice;
}

function buildWavHeader(pcmByteLength: number): Buffer {
  const header = Buffer.alloc(44);
  const sampleRate = 48000;
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcmByteLength, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);           // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcmByteLength, 40);
  return header;
}

function pythonUrl() {
  return `http://127.0.0.1:${getPythonPort()}`;
}

/** Đọc X-Quality-Score / X-Quality-Flags từ response TTS. Trả undefined nếu header vắng (server cũ). */
export function parseQualityHeaders(headers: Headers): { quality_score?: number; quality_flags?: string[] } {
  const out: { quality_score?: number; quality_flags?: string[] } = {};
  const scoreRaw = headers.get('X-Quality-Score');
  if (scoreRaw != null) {
    const n = parseInt(scoreRaw, 10);
    if (!Number.isNaN(n)) out.quality_score = n;
  }
  const flagsRaw = headers.get('X-Quality-Flags');
  if (flagsRaw != null) {
    out.quality_flags = flagsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

function logPregen(message: string) {
  console.log(`[PreGenQueue] ${message}`);
}

async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${pythonUrl()}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export class PreGenQueue {
  private batchId: string;
  private records: CanonicalRecord[];
  private config: PreGenConfig;
  private configHash: string;
  private onProgress: (status: PreGenStatus) => void;

  private manifest: Manifest;
  private queue: CanonicalRecord[] = [];
  private running = false;
  private paused = false;
  private cancelled = false;
  private currentId: string | null = null;
  private isConfigStale = false;

  constructor(
    batchId: string,
    records: CanonicalRecord[],
    config: PreGenConfig,
    onProgress: (status: PreGenStatus) => void,
  ) {
    this.batchId = batchId;
    this.records = records;
    this.config = config;
    this.configHash = computeConfigHash(config);
    this.onProgress = onProgress;

    mkdirSync(ttsPregenDir(batchId), { recursive: true });
    this.manifest = this.loadOrCreateManifest();
    this.isConfigStale = this.manifest.config_hash !== this.configHash;

    // Job trước có thể đã bị ngắt giữa chừng (đóng app/crash) để lại entry 'processing'
    // mồ côi trên đĩa — không có job nào đang thực sự chạy lúc khởi tạo (running=false),
    // nên đưa các entry này về 'pending' để không hiển thị nhầm là đang xử lý.
    let hadStaleProcessing = false;
    for (const entry of Object.values(this.manifest.students)) {
      if (entry.status === 'processing') {
        entry.status = 'pending';
        hadStaleProcessing = true;
      }
    }
    if (hadStaleProcessing) {
      this.saveManifest();
    }
  }

  private loadOrCreateManifest(): Manifest {
    const path = ttsPregenManifestPath(this.batchId);
    if (existsSync(path)) {
      try {
        return JSON.parse(readFileSync(path, 'utf-8')) as Manifest;
      } catch { /* fall through to create */ }
    }
    return { batch_id: this.batchId, config_hash: this.configHash, students: {} };
  }

  private saveManifest() {
    writeFileSync(ttsPregenManifestPath(this.batchId), JSON.stringify(this.manifest, null, 2), 'utf-8');
  }

  private buildQueue(regenerate: boolean): CanonicalRecord[] {
    return this.records.filter((r) => {
      if (regenerate) return true;
      const entry = this.manifest.students[r.id];
      return !entry || entry.status !== 'done';
    });
  }

  async start(regenerate = false): Promise<void> {
    if (this.running) return;
    logPregen(`start batchId=${this.batchId} records=${this.records.length} regenerate=${regenerate} stale=${this.isConfigStale}`);

    if (regenerate) {
      // Reset tất cả về pending
      for (const r of this.records) {
        this.manifest.students[r.id] = { status: 'pending' };
      }
      this.manifest.config_hash = this.configHash;
      this.isConfigStale = false;
      this.saveManifest();
    } else {
      // Đảm bảo có entry cho mọi record chưa có
      for (const r of this.records) {
        if (!this.manifest.students[r.id]) {
          this.manifest.students[r.id] = { status: 'pending' };
        }
      }
      this.saveManifest();
    }

    this.queue = this.buildQueue(regenerate);
    this.cancelled = false;
    this.paused = false;
    this.running = true;
    this.onProgress(this.getStatus());

    this.runLoop().catch((err) => {
      console.error('[PreGenQueue] Unhandled error in runLoop:', err);
      this.running = false;
      this.onProgress(this.getStatus());
    });
  }

  private async runLoop(): Promise<void> {
    while (!this.cancelled && this.queue.length > 0) {
      if (this.paused) {
        await new Promise<void>((resolve) => {
          const interval = setInterval(() => {
            if (!this.paused || this.cancelled) {
              clearInterval(interval);
              resolve();
            }
          }, 200);
        });
        if (this.cancelled) break;
      }

      const record = this.queue.shift()!;
      this.currentId = record.id;
      logPregen(`processing id=${record.id} queueLeft=${this.queue.length}`);

      this.manifest.students[record.id] = { status: 'processing' };
      this.saveManifest();
      this.onProgress(this.getStatus());

      try {
        await this.processRecord(record);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.manifest.students[record.id] = { status: 'failed', error: msg };
        this.saveManifest();
        console.error(`[PreGenQueue] Failed record ${record.id}:`, msg);
        logPregen(`failed id=${record.id} error=${msg}`);
      }

      this.onProgress(this.getStatus());
    }

    this.currentId = null;
    this.running = false;
    this.onProgress(this.getStatus());
  }

  private async processRecord(record: CanonicalRecord): Promise<void> {
    // Khi không có template, dùng @full_name làm template để renderTemplate tự title-case tên.
    const text = renderTemplate(this.config.template || '@full_name', record, this.config.customVariables || []);
    logPregen(`render id=${record.id} textLen=${text.length} text=${text}`);

    if (!text) {
      this.manifest.students[record.id] = { status: 'failed', error: 'Empty text after template render' };
      this.saveManifest();
      return;
    }

    const voice = getVoiceForRecord(record, this.config.ttsConditions || [], this.config.ttsModel);
    const speakerId = voice.replace(/^vieneu-/, '');
    logPregen(`synthesize id=${record.id} speaker=${speakerId} voice=${voice} speed=${this.config.ttsSpeed}`);

    // Retry logic cho network errors: tối đa 3 lần, auto-pause nếu server không phản hồi
    let lastError = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        logPregen(`attempt=${attempt + 1} id=${record.id} POST /synthesize`);
        // Timeout scale theo độ dài text: câu dài (tên + ngành + khoa) cần nhiều
        // thời gian gen hơn, nhất là trên máy yếu (RTF>1). Cứng 30s trước đây làm
        // câu dài luôn timeout → auto-pause + retry vô ích. Base 30s + 250ms/char, cap 150s.
        const genTimeoutMs = Math.min(150_000, 30_000 + text.length * 250);
        const res = await fetch(`${pythonUrl()}/synthesize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, speaker_id: speakerId, speed: this.config.ttsSpeed }),
          signal: AbortSignal.timeout(genTimeoutMs),
        });
        logPregen(`response id=${record.id} status=${res.status} ok=${res.ok}`);

        if (!res.ok) {
          const body = await res.text();
          lastError = `HTTP ${res.status}: ${body}`;
          logPregen(`failed HTTP id=${record.id} body=${lastError}`);
          if (res.status >= 500 && attempt < 2) {
            logPregen(`retrying server error id=${record.id} after ${250 * (attempt + 1)}ms`);
            await sleep(250 * (attempt + 1));
            continue;
          }
          break; // Non-network error, không retry nữa
        }

        const quality = parseQualityHeaders(res.headers);
        const pcm = Buffer.from(await res.arrayBuffer());
        logPregen(`pcm id=${record.id} bytes=${pcm.length} qScore=${quality.quality_score ?? '-'} qFlags=${quality.quality_flags?.join('|') ?? '-'}`);
        const header = buildWavHeader(pcm.byteLength);
        const wav = Buffer.concat([header, pcm]);
        const wavPath = ttsPregenWavPath(this.batchId, record.id);
        writeFileSync(wavPath, wav);
        logPregen(`saved wav id=${record.id} path=${wavPath} wavBytes=${wav.length}`);

        const sampleRate = 48000;
        const duration_ms = Math.round((pcm.byteLength / 2 / sampleRate) * 1000);
        this.manifest.students[record.id] = {
          status: 'done',
          type: 'pregen',
          text,
          voice: `vieneu-${speakerId}`,
          speed: this.config.ttsSpeed,
          duration_ms,
          generated_at: new Date().toISOString(),
          ...quality,
        };
        this.saveManifest();
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        logPregen(`error id=${record.id} attempt=${attempt + 1} err=${lastError}`);
        // Network error — kiểm tra server health
        const healthy = await checkHealth();
        if (!healthy) {
          // Auto-pause, đợi server phục hồi
          console.warn('[PreGenQueue] Server unhealthy, pausing queue...');
          logPregen(`server unhealthy id=${record.id}, pausing`);
          this.paused = true;
          this.onProgress(this.getStatus());
          // Đợi cho đến khi server OK
          await new Promise<void>((resolve) => {
            const interval = setInterval(async () => {
              if (this.cancelled) { clearInterval(interval); resolve(); return; }
              const ok = await checkHealth();
              if (ok) { clearInterval(interval); this.paused = false; logPregen(`server healthy again id=${record.id}`); resolve(); }
            }, 3000);
          });
          if (this.cancelled) throw new Error('Cancelled');
          // Retry sau khi server phục hồi
          continue;
        }
        break; // Server healthy nhưng vẫn lỗi, thôi
      }
    }

    this.manifest.students[record.id] = { status: 'failed', error: lastError };
    this.saveManifest();
    logPregen(`mark failed id=${record.id} error=${lastError}`);
  }

  pause() {
    this.paused = true;
    this.onProgress(this.getStatus());
  }

  resume() {
    this.paused = false;
    this.onProgress(this.getStatus());
  }

  cancel() {
    this.cancelled = true;
    this.paused = false;
    this.queue = [];
    this.running = false;
    this.currentId = null;
    this.onProgress(this.getStatus());
  }

  requeueOne(id: string): boolean {
    const record = this.records.find((r) => r.id === id);
    if (!record) return false;
    // Thêm vào đầu queue
    this.queue.unshift(record);
    this.manifest.students[id] = { status: 'pending' };
    this.saveManifest();
    logPregen(`requeue id=${id}`);
    // Nếu queue không đang chạy, bắt đầu lại
    if (!this.running) {
      this.cancelled = false;
      this.paused = false;
      this.running = true;
      this.onProgress(this.getStatus());
      this.runLoop().catch(console.error);
    }
    this.onProgress(this.getStatus());
    return true;
  }

  getStatus(): PreGenStatus {
    const entries = Object.entries(this.manifest.students);
    const done = entries.filter(([, v]) => v.status === 'done').length;
    const failed = entries.filter(([, v]) => v.status === 'failed').length;
    const pending = entries.filter(([, v]) => v.status === 'pending' || v.status === 'processing').length;

    const records: Record<string, PreGenStudentStatus> = {};
    const quality: Record<string, string[]> = {};
    for (const [id, entry] of entries) {
      records[id] = entry.status;
      if (entry.status === 'done' && entry.quality_flags && entry.quality_flags.length > 0) {
        quality[id] = entry.quality_flags;
      }
    }
    if (this.currentId) {
      records[this.currentId] = 'processing';
    }

    return {
      total: this.records.length,
      done,
      failed,
      pending,
      suspect: Object.keys(quality).length,
      running: this.running,
      paused: this.paused,
      configChanged: this.isConfigStale,
      currentId: this.currentId,
      records,
      quality,
    };
  }

  getBatchId() { return this.batchId; }

  /** Trả về true nếu config mới khác config hiện tại (giọng/tốc độ/template đổi) */
  configChanged(newConfig: PreGenConfig): boolean {
    return computeConfigHash(newConfig) !== this.configHash;
  }
}
