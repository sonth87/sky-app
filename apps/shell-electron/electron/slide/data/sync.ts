import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, renameSync, readdirSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import AdmZip from 'adm-zip';
import type { CeremonyBundle, Student } from '@sky-app/slide-shared';
import { IMPORT_WARN_SIZE, IMPORT_MAX_SIZE, formatGB } from '@sky-app/slide-shared';
import { ceremonyDataDir, bundleJsonPath, sampleDataDir, PHOTO_DIR_NAMES, ttsPregenDir } from './paths';
import { ceremonyStore } from './store';
import { sessionStore } from '../session-store';

// Ngưỡng dung lượng import — nguồn duy nhất ở @trao-bang/shared, dùng chung với renderer.
const WARN_SIZE = IMPORT_WARN_SIZE;
const MAX_SIZE = IMPORT_MAX_SIZE;

/**
 * Lock chống import/export chạy đồng thời (V2). syncBundle/commitImport/export dùng chung
 * một stagingDir + ghi vào ceremony-data, nên chạy song song sẽ hỏng dữ liệu.
 */
let ioBusy = false;
export function isIoBusy(): boolean { return ioBusy; }
function acquireIoLock(): boolean {
  if (ioBusy) return false;
  ioBusy = true;
  return true;
}
function releaseIoLock(): void { ioBusy = false; }

/** Dọn staging rác còn sót từ lần crash/đóng app giữa import (V1). Gọi lúc app khởi động. */
export function cleanupImportStaging(): void {
  try {
    rmSync(importStagingDir(), { recursive: true, force: true });
  } catch { /* ignore */ }
}

/**
 * Kiểm tra ổ đĩa còn đủ chỗ cho `needBytes` tại `path` (V8).
 * Trả null nếu đủ (hoặc không kiểm tra được), hoặc message lỗi nếu thiếu.
 */
function checkDiskSpace(path: string, needBytes: number): string | null {
  try {
    const st = statfsSync(path);
    const freeBytes = st.bavail * st.bsize;
    // Cần needBytes + 15% đệm (rename fallback sang copy có thể dùng gấp đôi tạm thời).
    const required = needBytes * 1.15;
    if (freeBytes < required) {
      return `Ổ đĩa không đủ chỗ: cần ~${formatGB(required)}, còn trống ${formatGB(freeBytes)}.`;
    }
    return null;
  } catch {
    return null; // không kiểm tra được → không chặn
  }
}

/** Một SV không hợp lệ trong bundle import */
export interface InvalidStudent {
  index: number;   // vị trí trong students.json
  code: string;    // student_code (nếu có) để user nhận diện
  reason: string;
}

export interface ImportPreview {
  valid: number;
  invalid: InvalidStudent[];
  total: number;
}

export interface SyncResult {
  ok: boolean;
  updated: number;
  added: number;
  photosChanged: number;
  offline: boolean;
  message: string;
  warning?: string;             // cảnh báo file nặng (không phải lỗi, vẫn import được)
  pendingConfirm?: ImportPreview; // đã verify xong, chờ user xác nhận trước khi ghi đè
}

export interface SyncProgress {
  step: string;
  pct: number; // 0–100
}

/** Thư mục tạm để giải nén + verify trước khi commit vào ceremony-data */
function importStagingDir(): string {
  return join(app.getPath('userData'), 'ceremony-data-import-tmp');
}

export const DEFAULT_BUNDLE_URL =
  process.env['BUNDLE_URL'] ?? 'http://localhost:4000/ceremonies/1/bundle';

/** Trường vận hành — giữ nguyên từ session khi merge */
const OPERATIONAL_FIELDS: (keyof Student)[] = [
  'status',
  'ts_checkin',
  'ts_called',
  'ts_on_stage',
  'ts_returned',
  'src_on_stage',
  'staff_presenter',
];

/**
 * Load dữ liệu vào store. Nguồn có thể là:
 *   1. useSample=true  → đọc thẳng từ sample-bundle/data/ (không cần ZIP, không ghi vào dataDir)
 *   2. zipPath         → giải nén file ZIP local vào ceremony-data/
 *   3. url / default   → tải ZIP từ server rồi giải nén
 *
 * Cấu trúc ZIP (và sample/data/) đều theo cùng 1 chuẩn:
 *   students.json (hoặc student/data/index.json)  ← data sinh viên
 *   image/ (hoặc images/photo/photos/avatar/)     ← ảnh sinh viên
 *   assets/                                        ← assets lễ (tùy chọn; fallback về _assets/)
 */
export async function syncBundle(
  source?: { url?: string; zipPath?: string; useSample?: boolean },
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  // V2 — chống chạy đồng thời với import/export khác.
  if (!acquireIoLock()) {
    return offlineResult('Đang có thao tác dữ liệu khác chạy — vui lòng đợi hoàn tất.');
  }
  try {
    return await syncBundleInner(source, onProgress);
  } finally {
    // Import file local dừng ở preview (giữ staging) → GIỮ lock cho tới confirm/cancel.
    // Các đường khác (sample, server, lỗi) → nhả lock ngay.
    if (!(source?.zipPath && lastSyncPending)) {
      releaseIoLock();
    }
    lastSyncPending = false;
  }
}

// Cờ nội bộ: đánh dấu lần sync vừa rồi trả pendingConfirm (giữ lock qua confirm/cancel).
let lastSyncPending = false;

async function syncBundleInner(
  source?: { url?: string; zipPath?: string; useSample?: boolean },
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  const emit = (step: string, pct: number) => onProgress?.({ step, pct });
  const dataDir = ceremonyDataDir();
  mkdirSync(dataDir, { recursive: true });

  // --- Nhánh 1: dùng sample data ---
  if (source?.useSample) {
    emit('Đang đọc dữ liệu mẫu…', 30);
    const sampleDir = sampleDataDir();
    const newBundle = readBundleFromDir(sampleDir);
    if (!newBundle) {
      return offlineResult('Không tìm thấy dữ liệu mẫu trong sample-bundle/data/.');
    }
    // Dọn dẹp thư mục assets cũ để ép sử dụng _assets từ sample-bundle
    const oldAssets = join(dataDir, 'assets');
    if (existsSync(oldAssets)) {
      try {
        rmSync(oldAssets, { recursive: true, force: true });
      } catch (e) {
        console.error('Failed to clean old assets:', e);
      }
    }
    // Copy ảnh từ sample/data/<photoDir>/ vào ceremony-data/<photoDir>/ để renderer truy cập được
    for (const dir of PHOTO_DIR_NAMES) {
      const src = join(sampleDir, dir);
      if (existsSync(src)) {
        const dst = join(dataDir, dir);
        mkdirSync(dst, { recursive: true });
        cpSync(src, dst, { recursive: true, force: true });
        break; // chỉ copy thư mục ảnh đầu tiên tìm thấy
      }
    }
    emit('Đang merge dữ liệu…', 70);
    const result = applyMerge(newBundle, (pct) => emit('Đang merge dữ liệu…', 70 + Math.round(pct * 0.2)));
    emit('Hoàn tất', 100);
    return result;
  }

  // --- Nhánh 2 & 3: ZIP (local hoặc từ server) ---
  // Giải nén vào thư mục TẠM (staging), verify, rồi mới commit vào ceremony-data.
  // - Import file local: dừng ở preview, trả pendingConfirm để user xác nhận (commitImport).
  // - Refresh từ server: tự động, commit luôn không hỏi.
  const stagingDir = importStagingDir();
  const isLocalImport = !!source?.zipPath;
  let zipBuffer: Buffer | null = null;
  let warning: string | undefined;

  if (source?.zipPath && existsSync(source.zipPath)) {
    // Kiểm tra dung lượng TRƯỚC khi đọc — tránh đụng trần Buffer 4GB của Node.
    const size = statSync(source.zipPath).size;
    if (size >= MAX_SIZE) {
      return offlineResult(
        `File ${formatGB(size)} vượt giới hạn ${formatGB(MAX_SIZE)} — app không thể xử lý file ZIP lớn hơn mức này. ` +
        `Hãy giảm dung lượng bundle (nén/resize ảnh phía server) rồi thử lại.`
      );
    }
    if (size >= WARN_SIZE) {
      warning = `File lớn (${formatGB(size)}), quá trình import có thể chậm.`;
    }
    emit('Đọc file…', 10);
    zipBuffer = readFileSync(source.zipPath);
    emit('Đọc file…', 30);
  } else {
    const url = source?.url ?? DEFAULT_BUNDLE_URL;
    emit('Đang tải dữ liệu…', 5);
    try {
      const res = await fetch(url);
      if (!res.ok) return offlineResult(`Tải bundle lỗi: HTTP ${res.status}`);
      emit('Đang tải dữ liệu…', 25);
      zipBuffer = Buffer.from(await res.arrayBuffer());
      emit('Đang tải dữ liệu…', 30);
    } catch {
      return offlineResult('Không thể làm mới — đang chạy offline với dữ liệu hiện có.');
    }
  }

  // Giải nén vào staging (KHÔNG đụng ceremony-data). Zip hỏng → lỗi sạch.
  emit('Giải nén…', 40);
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  try {
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(stagingDir, /* overwrite */ true);
  } catch {
    rmSync(stagingDir, { recursive: true, force: true });
    return offlineResult('File ZIP hỏng hoặc không đúng định dạng — không thể giải nén.');
  }
  emit('Giải nén…', 55);

  // Lớp 1 — Cấu trúc: có file danh sách SV không?
  emit('Kiểm tra dữ liệu…', 60);
  const newBundle = readBundleFromDir(stagingDir);
  if (!newBundle) {
    rmSync(stagingDir, { recursive: true, force: true });
    return offlineResult('Không tìm thấy file dữ liệu (students.json / student.json / data.json / index.json / bundle.json) trong file ZIP.');
  }

  // Lớp 2 — Nội dung: validate từng SV.
  const preview = validateStudents(newBundle.students);
  if (preview.valid === 0) {
    rmSync(stagingDir, { recursive: true, force: true });
    return offlineResult(`Không có sinh viên hợp lệ trong file (${preview.total} bản ghi, tất cả đều lỗi).`);
  }

  // V5 — Cảnh báo nếu zip thiếu assets/ (backdrop config/ảnh nền đợt cũ sẽ mất, chỉ còn _assets fallback).
  const assetsWarn = !hasAssetsDir(stagingDir) && existsSync(join(dataDir, 'assets'))
    ? 'File không chứa assets/ — cấu hình backdrop/ảnh nền hiện tại sẽ mất (dùng mặc định).'
    : undefined;
  const mergedWarning = [warning, assetsWarn].filter(Boolean).join(' ') || undefined;

  // V8 — Kiểm tra đĩa trống trước khi ghi (ước lượng = dung lượng staging).
  const diskErr = checkDiskSpace(dataDir, dirSize(stagingDir));
  if (diskErr) {
    rmSync(stagingDir, { recursive: true, force: true });
    return offlineResult(diskErr);
  }

  // Import file local → dừng lại, trả preview cho user xác nhận. Staging được giữ (lock cũng giữ).
  if (isLocalImport) {
    emit('Chờ xác nhận…', 60);
    lastSyncPending = true;
    return {
      ok: true,
      updated: 0,
      added: 0,
      photosChanged: 0,
      offline: false,
      message: '',
      warning: mergedWarning,
      pendingConfirm: preview,
    };
  }

  // Refresh từ server → commit luôn (không có UI hỏi).
  // V4 — nếu có SV lỗi, đưa vào warning để người dùng biết (đường server không có preview).
  const serverInvalidWarn = preview.invalid.length > 0
    ? `${preview.invalid.length}/${preview.total} sinh viên trong dữ liệu server bị lỗi và đã bị bỏ qua.`
    : undefined;
  const result = commitStaging(newBundle, (step, pct) => emit(step, pct));
  result.warning = [mergedWarning, serverInvalidWarn].filter(Boolean).join(' ') || undefined;
  return result;
}

/**
 * Commit dữ liệu từ staging vào ceremony-data (bước 2 của import 2 pha, hoặc gọi trực tiếp cho refresh).
 * Xoá bundle cũ (ảnh/voice/assets/bundle.json) nhưng GIỮ session.json, autoplay.json, _assets/.
 */
export function commitImport(onProgress?: (p: SyncProgress) => void): SyncResult {
  const emit = (step: string, pct: number) => onProgress?.({ step, pct });
  const stagingDir = importStagingDir();
  try {
    if (!existsSync(stagingDir)) {
      return offlineResult('Không có dữ liệu chờ import (staging trống). Hãy chọn lại file.');
    }
    const newBundle = readBundleFromDir(stagingDir);
    if (!newBundle) {
      rmSync(stagingDir, { recursive: true, force: true });
      return offlineResult('Dữ liệu staging không hợp lệ. Hãy chọn lại file.');
    }
    return commitStaging(newBundle, emit);
  } finally {
    releaseIoLock(); // nhả lock mà syncBundle giữ qua giai đoạn pendingConfirm
  }
}

/** Huỷ import đang chờ xác nhận — dọn staging + nhả lock. */
export function cancelImport(): void {
  rmSync(importStagingDir(), { recursive: true, force: true });
  releaseIoLock();
}

/** Thực hiện commit: dọn bundle cũ (giữ session), chuyển staging → ceremony-data, merge. */
function commitStaging(newBundle: CeremonyBundle, emit: (step: string, pct: number) => void): SyncResult {
  const dataDir = ceremonyDataDir();
  const stagingDir = importStagingDir();

  // Dọn bundle cũ — CHỈ ảnh/voice/assets/bundle.json. Giữ session.json, autoplay.json, _assets/.
  emit('Ghi dữ liệu…', 78);
  for (const dir of PHOTO_DIR_NAMES) {
    rmSync(join(dataDir, dir), { recursive: true, force: true });
  }
  rmSync(join(dataDir, 'voice'), { recursive: true, force: true });
  rmSync(join(dataDir, 'assets'), { recursive: true, force: true });
  rmSync(bundleJsonPath(), { force: true });

  // Chuyển nội dung staging sang ceremony-data (từng entry ở gốc staging).
  emit('Ghi dữ liệu…', 84);
  for (const entry of readdirSyncSafe(stagingDir)) {
    const from = join(stagingDir, entry);
    const to = join(dataDir, entry);
    rmSync(to, { recursive: true, force: true });
    try {
      renameSync(from, to);           // cùng ổ đĩa: tức thì
    } catch {
      cpSync(from, to, { recursive: true, force: true }); // khác ổ đĩa: fallback copy
    }
  }
  rmSync(stagingDir, { recursive: true, force: true });

  // Copy thư mục voice (nếu có) sang tts-pregen của batch.
  const batchId = newBundle.students[0]?.graduation_batch_id || 'default';
  const voiceImportDir = join(dataDir, 'voice');
  if (existsSync(voiceImportDir)) {
    const targetPregenDir = ttsPregenDir(batchId);
    mkdirSync(targetPregenDir, { recursive: true });
    cpSync(voiceImportDir, targetPregenDir, { recursive: true, force: true });
    rmSync(voiceImportDir, { recursive: true, force: true });
  }

  // Loại SV lỗi (thiếu code/name, trùng code) — không để lọt vào store.
  const seen = new Set<string>();
  newBundle.students = newBundle.students.filter((s) => {
    const code = (s.student_code ?? '').trim();
    const name = (s.full_name ?? '').trim();
    if (!code || !name || seen.has(code)) return false;
    seen.add(code);
    return true;
  });

  emit('Đang merge dữ liệu…', 88);
  const result = applyMerge(newBundle, (pct) => emit('Đang merge dữ liệu…', 88 + Math.round(pct * 0.1)));
  emit('Hoàn tất', 100);
  return result;
}

/** readdirSync an toàn (trả [] nếu thư mục không tồn tại) */
function readdirSyncSafe(dir: string): string[] {
  try {
    return existsSync(dir) ? readdirSync(dir) : [];
  } catch {
    return [];
  }
}

/** Có thư mục assets/ trong bundle không (V5) */
function hasAssetsDir(dir: string): boolean {
  return existsSync(join(dir, 'assets'));
}

/** Ước lượng tổng dung lượng thư mục (đệ quy nông, dùng cho check đĩa). */
function dirSize(dir: string): number {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const entry of readdirSyncSafe(cur)) {
      const p = join(cur, entry);
      try {
        const st = statSync(p);
        if (st.isDirectory()) stack.push(p);
        else total += st.size;
      } catch { /* skip */ }
    }
  }
  return total;
}

/**
 * Lớp 2 — validate nội dung từng SV.
 * Bắt buộc: student_code + full_name không rỗng (khóa QR + tên đọc TTS).
 * Ghi nhận trùng student_code.
 */
export function validateStudents(students: Student[]): ImportPreview {
  const invalid: InvalidStudent[] = [];
  const seen = new Set<string>();
  let valid = 0;

  students.forEach((s, index) => {
    const code = (s.student_code ?? '').trim();
    const name = (s.full_name ?? '').trim();
    const reasons: string[] = [];
    if (!code) reasons.push('thiếu mã sinh viên');
    if (!name) reasons.push('thiếu họ tên');
    if (code && seen.has(code)) reasons.push('trùng mã sinh viên');
    if (code) seen.add(code);

    if (reasons.length > 0) {
      invalid.push({ index, code, reason: reasons.join(', ') });
    } else {
      valid += 1;
    }
  });

  return { valid, invalid, total: students.length };
}

/** Tên file JSON chứa danh sách sinh viên được chấp nhận (theo thứ tự ưu tiên) */
const STUDENTS_JSON_NAMES = ['students.json', 'student.json', 'data.json', 'index.json'];


/**
 * Đọc bundle từ thư mục (ceremony-data hoặc sample-bundle/data/).
 * Ưu tiên file danh sách SV (students/student/data/index.json), fallback bundle.json (format cũ).
 */
function readBundleFromDir(dataDir: string): CeremonyBundle | null {
  for (const name of STUDENTS_JSON_NAMES) {
    const p = join(dataDir, name);
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, 'utf-8')) as RawStudent[];
        return buildBundleFromStudentsJson(raw, dataDir);
      } catch (e) {
        console.error(`Lỗi đọc ${name}:`, e);
      }
    }
  }

  const bundlePath = join(dataDir, 'bundle.json');
  if (existsSync(bundlePath)) {
    try {
      return JSON.parse(readFileSync(bundlePath, 'utf-8')) as CeremonyBundle;
    } catch (e) {
      console.error('Lỗi đọc bundle.json:', e);
    }
  }

  return null;
}


/** Shape thô của students.json từ hệ thống portal */
interface RawStudent {
  id: string;
  graduation_batch_id: string;
  batch_name: string;
  display_order: number;
  student_code: string;
  full_name: string;
  gender: string;
  date_of_birth: string;
  major_name: string;
  faculty_name: string;
  class_code: string;
  course_code: string;
  phone_number: string;
  identity_number: string;
  email: string;
  gpa: number;
  classification: string;
  classification_type: number;
  achievement_title: string;
  award_type: string;
  award_type_code: string | null;
  award_content: string;
  quote: string | null;
  image_file_name: string;
  image_relative_path: string;
  presentation_template_type: string;
  presentation_template_type_code: string | null;
  registration_status: string;
  degree_award_status: string;
}

/** Map registration_status từ portal sang StudentStatus nội bộ */
function mapStatus(raw: string): Student['status'] {
  switch (raw) {
    case 'on_stage': return 'on_stage';
    case 'returned':
    case 'received_hardcopy': return 'returned';
    case 'checked_in': return 'checked_in';
    case 'called': return 'called';
    case 'absent': return 'absent';
    default: return 'registered';
  }
}

// Tên file config layout đã đổi (V?) — bundle cũ có thể còn trỏ tên cũ đã không tồn tại trên đĩa.
const LEGACY_BACKDROPS_CONFIG_NAMES = new Set(['assets/2026/backdrops.json']);
const CURRENT_BACKDROPS_CONFIG = 'assets/2026/backdrops_layouts.json';

/** Dựng CeremonyBundle từ students.json, giữ ceremony từ bundle cũ nếu có */
function buildBundleFromStudentsJson(raw: RawStudent[], _dataDir: string): CeremonyBundle {
  // Lấy ceremony từ bundle.json cũ nếu tồn tại (để giữ config lễ)
  const existingBundle = ceremonyStore.getBundle();
  const ceremony = existingBundle?.ceremony ?? {
    id: 1,
    name: raw[0]?.batch_name ?? 'Lễ Trao Bằng Tốt Nghiệp',
    graduation_year: new Date().getFullYear().toString(),
    date: new Date().toISOString().slice(0, 10),
    venue: 'Trường ĐH Đại Nam',
    university_name: 'TRƯỜNG ĐẠI HỌC ĐẠI NAM',
    ministry_name: 'BỘ GIÁO DỤC VÀ ĐÀO TẠO',
    title_line1: 'LỄ TRAO BẰNG TỐT NGHIỆP',
    title_line2: '',
    logo: 'logo.png',
    backdrops_config: CURRENT_BACKDROPS_CONFIG,
    idle_image: 'assets/2026/backdrop_idle.jpg',
    idle_image_variants: { '25:9': 'assets/2026/backdrop_idle_25-9.jpg' },
  };

  // Migrate tên file config cũ (bundle đã lưu từ trước khi đổi tên) sang tên hiện hành.
  if (LEGACY_BACKDROPS_CONFIG_NAMES.has(ceremony.backdrops_config)) {
    ceremony.backdrops_config = CURRENT_BACKDROPS_CONFIG;
  }

  const students: Student[] = raw.map((r, idx) => {
    if (idx === 0) {
      console.log('[Sync] First student raw:', {
        phone_number: r.phone_number,
        identity_number: r.identity_number,
      });
    }
    return {
      id: r.id,
      student_code: r.student_code,
      display_order: r.display_order,
      full_name: r.full_name,
      gender: r.gender || 'Nam',
      date_of_birth: r.date_of_birth,
      major_name: r.major_name,
      faculty_name: r.faculty_name,
      class_code: r.class_code,
      course_code: r.course_code,
      phone_number: r.phone_number ?? '',
      identity_number: r.identity_number ?? '',
      email: r.email,
      gpa: r.gpa,
      classification: r.classification,
      classification_type: r.classification_type,
      achievement_title: r.achievement_title,
      award_type: r.award_type,
      award_type_code: r.award_type_code,
      award_content: r.award_content,
      presentation_template_type: r.presentation_template_type,
      presentation_template_type_code: r.presentation_template_type_code,
      quote: r.quote,
      image_file_name: r.image_file_name,
      image_relative_path: r.image_relative_path ?? '',
      graduation_batch_id: r.graduation_batch_id,
      batch_name: r.batch_name,
      degree_award_status: r.degree_award_status,
      status: mapStatus(r.registration_status),
      ts_checkin: null,
      ts_called: null,
      ts_on_stage: null,
      ts_returned: null,
      src_on_stage: null,
      staff_presenter: null,
    };
  });

  return {
    room_id: existingBundle?.room_id ?? 'H1',
    room_name: existingBundle?.room_name ?? 'Hội trường A',
    ceremony,
    config: existingBundle?.config ?? {
      ws_port: 8765,
      http_port: 8080,
      mode: 'auto',
      delay_seconds: 0,
      auto_open_browser: true,
      kiosk_mode: true,
      auto_load_first: true,
      slide_display_seconds: 20,
      idle_timeout_enabled: false,
      idle_timeout_seconds: 60,
    },
    students,
    session_state: existingBundle?.session_state ?? {
      current_on_stage_msv: null,
      pending_msv: null,
      mode: 'auto',
      last_scan_msv: null,
      last_scan_ts: null,
      broadcast_count: 0,
      sync_queue: [],
    },
  };
}

function offlineResult(message: string): SyncResult {
  return { ok: false, updated: 0, added: 0, photosChanged: 0, offline: true, message };
}

/**
 * Merge an toàn: thông tin tĩnh lấy từ bundle mới, trạng thái vận hành giữ từ session.
 * Không đụng SV đang on_stage.
 */
function applyMerge(newBundle: CeremonyBundle, onProgress?: (pct: number) => void): SyncResult {
  const current = ceremonyStore.getBundle();
  const session = sessionStore.get();
  const onStageCode = session.current_on_stage_msv;

  let updated = 0;
  let added = 0;
  let photosChanged = 0;

  if (current) {
    const currentByCode = new Map(current.students.map((s) => [s.student_code, s]));
    const total = newBundle.students.length;
    newBundle.students = newBundle.students.map((incoming, i) => {
      if (total > 0) onProgress?.(Math.round((i / total) * 100));
      const existing = currentByCode.get(incoming.student_code);
      if (!existing) {
        added += 1;
        return incoming;
      }
      updated += 1;
      if (existing.image_relative_path !== incoming.image_relative_path) photosChanged += 1;
      const merged: Student = { ...incoming };
      if (existing.status !== 'registered') {
        for (const f of OPERATIONAL_FIELDS) {
          Object.assign(merged, { [f]: existing[f] });
        }
      }
      if (incoming.student_code === onStageCode) {
        return existing;
      }
      return merged;
    });
  } else {
    added = newBundle.students.length;
    photosChanged = newBundle.students.filter((s) => s.image_relative_path).length;
  }

  newBundle._synced_at = new Date().toISOString();
  writeFileSync(bundleJsonPath(), JSON.stringify(newBundle, null, 2), 'utf-8');
  ceremonyStore.load(newBundle);

  return {
    ok: true,
    updated,
    added,
    photosChanged,
    offline: false,
    message: `Đã cập nhật ${updated} sinh viên · thêm ${added} mới · đổi ${photosChanged} ảnh.`,
  };
}
