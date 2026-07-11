import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Student, TtsCondition, CustomVariable } from '@sky-app/slide-shared';
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
  currentStudentCode: string | null;
  students: Record<string, PreGenStudentStatus>;
  quality: Record<string, string[]>;  // studentCode -> flags (chỉ file bị flag)
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

function getVoiceForStudent(
  student: Student,
  conditions: TtsCondition[],
  fallbackVoice: string
): string {
  for (const cond of conditions) {
    let studentVal = '';
    const attr = cond.attr;
    if (attr === 'Giới tính') {
      studentVal = student.gender || '';
    } else if (attr === 'Xếp loại') {
      studentVal = student.classification || '';
    } else if (attr === 'Ngành') {
      studentVal = student.major_name || '';
    } else if (attr === 'Khoa') {
      studentVal = student.faculty_name || '';
    } else if (attr === 'Lớp') {
      studentVal = student.class_code || '';
    } else if (attr === 'Khóa') {
      studentVal = student.course_code || '';
    } else if (attr === 'Họ tên') {
      studentVal = student.full_name || '';
    }
    
    if (studentVal.trim().toLowerCase() === cond.val.trim().toLowerCase()) {
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
  private students: Student[];
  private config: PreGenConfig;
  private configHash: string;
  private onProgress: (status: PreGenStatus) => void;

  private manifest: Manifest;
  private queue: Student[] = [];
  private running = false;
  private paused = false;
  private cancelled = false;
  private currentStudentCode: string | null = null;
  private isConfigStale = false;

  constructor(
    batchId: string,
    students: Student[],
    config: PreGenConfig,
    onProgress: (status: PreGenStatus) => void,
  ) {
    this.batchId = batchId;
    this.students = students;
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

  private buildQueue(regenerate: boolean): Student[] {
    return this.students.filter((s) => {
      if (regenerate) return true;
      const entry = this.manifest.students[s.student_code];
      return !entry || entry.status !== 'done';
    });
  }

  async start(regenerate = false): Promise<void> {
    if (this.running) return;
    logPregen(`start batchId=${this.batchId} students=${this.students.length} regenerate=${regenerate} stale=${this.isConfigStale}`);

    if (regenerate) {
      // Reset tất cả về pending
      for (const s of this.students) {
        this.manifest.students[s.student_code] = { status: 'pending' };
      }
      this.manifest.config_hash = this.configHash;
      this.isConfigStale = false;
      this.saveManifest();
    } else {
      // Đảm bảo có entry cho mọi sinh viên chưa có
      for (const s of this.students) {
        if (!this.manifest.students[s.student_code]) {
          this.manifest.students[s.student_code] = { status: 'pending' };
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

      const student = this.queue.shift()!;
      this.currentStudentCode = student.student_code;
      logPregen(`processing student=${student.student_code} queueLeft=${this.queue.length}`);

      this.manifest.students[student.student_code] = { status: 'processing' };
      this.saveManifest();
      this.onProgress(this.getStatus());

      try {
        await this.processStudent(student);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.manifest.students[student.student_code] = { status: 'failed', error: msg };
        this.saveManifest();
        console.error(`[PreGenQueue] Failed student ${student.student_code}:`, msg);
        logPregen(`failed student=${student.student_code} error=${msg}`);
      }

      this.onProgress(this.getStatus());
    }

    this.currentStudentCode = null;
    this.running = false;
    this.onProgress(this.getStatus());
  }

  private async processStudent(student: Student): Promise<void> {
    // Khi không có template, dùng @full_name làm template để renderTemplate tự title-case tên.
    const text = renderTemplate(this.config.template || '@full_name', student, this.config.customVariables || []);
    logPregen(`render student=${student.student_code} textLen=${text.length} text=${text}`);

    if (!text) {
      this.manifest.students[student.student_code] = { status: 'failed', error: 'Empty text after template render' };
      this.saveManifest();
      return;
    }

    const voice = getVoiceForStudent(student, this.config.ttsConditions || [], this.config.ttsModel);
    const speakerId = voice.replace(/^vieneu-/, '');
    logPregen(`synthesize student=${student.student_code} speaker=${speakerId} voice=${voice} speed=${this.config.ttsSpeed}`);

    // Retry logic cho network errors: tối đa 3 lần, auto-pause nếu server không phản hồi
    let lastError = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        logPregen(`attempt=${attempt + 1} student=${student.student_code} POST /synthesize`);
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
        logPregen(`response student=${student.student_code} status=${res.status} ok=${res.ok}`);

        if (!res.ok) {
          const body = await res.text();
          lastError = `HTTP ${res.status}: ${body}`;
          logPregen(`failed HTTP student=${student.student_code} body=${lastError}`);
          if (res.status >= 500 && attempt < 2) {
            logPregen(`retrying server error student=${student.student_code} after ${250 * (attempt + 1)}ms`);
            await sleep(250 * (attempt + 1));
            continue;
          }
          break; // Non-network error, không retry nữa
        }

        const quality = parseQualityHeaders(res.headers);
        const pcm = Buffer.from(await res.arrayBuffer());
        logPregen(`pcm student=${student.student_code} bytes=${pcm.length} qScore=${quality.quality_score ?? '-'} qFlags=${quality.quality_flags?.join('|') ?? '-'}`);
        const header = buildWavHeader(pcm.byteLength);
        const wav = Buffer.concat([header, pcm]);
        const wavPath = ttsPregenWavPath(this.batchId, student.student_code);
        writeFileSync(wavPath, wav);
        logPregen(`saved wav student=${student.student_code} path=${wavPath} wavBytes=${wav.length}`);

        const sampleRate = 48000;
        const duration_ms = Math.round((pcm.byteLength / 2 / sampleRate) * 1000);
        this.manifest.students[student.student_code] = {
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
        logPregen(`error student=${student.student_code} attempt=${attempt + 1} err=${lastError}`);
        // Network error — kiểm tra server health
        const healthy = await checkHealth();
        if (!healthy) {
          // Auto-pause, đợi server phục hồi
          console.warn('[PreGenQueue] Server unhealthy, pausing queue...');
          logPregen(`server unhealthy student=${student.student_code}, pausing`);
          this.paused = true;
          this.onProgress(this.getStatus());
          // Đợi cho đến khi server OK
          await new Promise<void>((resolve) => {
            const interval = setInterval(async () => {
              if (this.cancelled) { clearInterval(interval); resolve(); return; }
              const ok = await checkHealth();
              if (ok) { clearInterval(interval); this.paused = false; logPregen(`server healthy again student=${student.student_code}`); resolve(); }
            }, 3000);
          });
          if (this.cancelled) throw new Error('Cancelled');
          // Retry sau khi server phục hồi
          continue;
        }
        break; // Server healthy nhưng vẫn lỗi, thôi
      }
    }

    this.manifest.students[student.student_code] = { status: 'failed', error: lastError };
    this.saveManifest();
    logPregen(`mark failed student=${student.student_code} error=${lastError}`);
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
    this.currentStudentCode = null;
    this.onProgress(this.getStatus());
  }

  requeueOne(studentCode: string): boolean {
    const student = this.students.find((s) => s.student_code === studentCode);
    if (!student) return false;
    // Thêm vào đầu queue
    this.queue.unshift(student);
    this.manifest.students[studentCode] = { status: 'pending' };
    this.saveManifest();
    logPregen(`requeue student=${studentCode}`);
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

    const students: Record<string, PreGenStudentStatus> = {};
    const quality: Record<string, string[]> = {};
    for (const [code, entry] of entries) {
      students[code] = entry.status;
      if (entry.status === 'done' && entry.quality_flags && entry.quality_flags.length > 0) {
        quality[code] = entry.quality_flags;
      }
    }
    if (this.currentStudentCode) {
      students[this.currentStudentCode] = 'processing';
    }

    return {
      total: this.students.length,
      done,
      failed,
      pending,
      suspect: Object.keys(quality).length,
      running: this.running,
      paused: this.paused,
      configChanged: this.isConfigStale,
      currentStudentCode: this.currentStudentCode,
      students,
      quality,
    };
  }

  getBatchId() { return this.batchId; }

  /** Trả về true nếu config mới khác config hiện tại (giọng/tốc độ/template đổi) */
  configChanged(newConfig: PreGenConfig): boolean {
    return computeConfigHash(newConfig) !== this.configHash;
  }
}
