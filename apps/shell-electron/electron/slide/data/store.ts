import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { CeremonyBundle, SessionState, Student } from '@sky-app/slide-shared';
import {
  BetterSqlite3Executor,
  runMigrations,
  getCeremonyBundle as dbGetCeremonyBundle,
  patchStudent as dbPatchStudent,
  clearStudents as dbClearStudents,
  upsertAppConfig as dbUpsertAppConfig,
} from '@sky-app/ceremony-db/node';
import { ceremonyDbPath, ceremonyDataDir, PHOTO_DIR_NAMES } from './paths';

/**
 * Tìm thư mục ảnh đang thực sự tồn tại trong ceremony-data.
 * Thử theo PHOTO_DIR_NAMES; fallback về 'image' nếu không có thư mục nào.
 */
function detectPhotoDir(): string {
  const dataDir = ceremonyDataDir();
  for (const name of PHOTO_DIR_NAMES) {
    if (existsSync(join(dataDir, name))) return name;
  }
  return PHOTO_DIR_NAMES[0];
}

/**
 * Chuẩn hóa image_relative_path — điểm duy nhất xử lý path ảnh.
 *
 * Thứ tự thử:
 *   1. Nếu path có prefix hợp lệ (image/, photos/...) VÀ file tồn tại → dùng ngay
 *   2. Lấy basename(path) rồi tìm file trong photoDir thực tế
 *   3. Thử {photoDir}/{student_code}.jpg
 *   4. Để rỗng → renderer hiển thị placeholder "Không có ảnh"
 */
function normalizeStudentPhoto(s: Student): Student {
  const dataDir = ceremonyDataDir();
  const photoDir = detectPhotoDir();

  const p = (s.image_relative_path ?? '').trim();

  // Bước 1: path đã có prefix hợp lệ và file tồn tại → dùng ngay
  if (p && PHOTO_DIR_NAMES.some((d) => p.startsWith(`${d}/`))) {
    if (existsSync(join(dataDir, p))) return s;
  }

  // Bước 2: thử basename(path) trong photoDir thực tế (xử lý dạng "uuid/filename.jpg")
  if (p) {
    const candidate = `${photoDir}/${basename(p)}`;
    if (existsSync(join(dataDir, candidate))) {
      return { ...s, image_relative_path: candidate };
    }
  }

  // Bước 3: thử {photoDir}/{student_code}.jpg
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    const byCode = `${photoDir}/${s.student_code}${ext}`;
    if (existsSync(join(dataDir, byCode))) {
      return { ...s, image_relative_path: byCode };
    }
  }

  // Bước 4: không tìm thấy — để rỗng, renderer hiển thị placeholder
  return { ...s, image_relative_path: '' };
}

// Tên file config layout đã đổi (V?) — bundle cũ (đã lưu trên đĩa từ trước) có thể còn trỏ
// tên cũ đã không còn tồn tại, khiến Backdrop không fetch được layout và không hiển thị gì.
const LEGACY_BACKDROPS_CONFIG_NAMES = new Set(['assets/2026/backdrops.json']);
const CURRENT_BACKDROPS_CONFIG = 'assets/2026/backdrops_layouts.json';


/**
 * Store dữ liệu đợt trong bộ nhớ (main process) — nguồn lưu trữ lâu dài là SQLite
 * (ceremony.db, qua @sky-app/ceremony-db), memory chỉ là cache đọc nhanh cho tra cứu
 * (findByMsv/neighborByStt gọi liên tục mỗi lần quét QR/next/prev).
 * Trạng thái vận hành (session) do session-store quản lý riêng.
 */
class CeremonyStore {
  private executor: BetterSqlite3Executor | null = null;
  private bundle: CeremonyBundle | null = null;
  private byMsv = new Map<string, Student>();

  private getExecutorOrOpen(): BetterSqlite3Executor {
    if (!this.executor) {
      this.executor = new BetterSqlite3Executor(ceremonyDbPath());
      runMigrations(this.executor);
    }
    return this.executor;
  }

  /** Executor dùng chung cho sync.ts (đọc config lúc bootstrap trước khi có bundle trong memory). */
  getExecutor(): BetterSqlite3Executor {
    return this.getExecutorOrOpen();
  }

  /**
   * Nạp bundle vào memory — KHÔNG tự ghi DB (caller ghi trước nếu cần persist, VD
   * sync.ts's applyMerge() gọi dbSaveCeremonyBundle() rồi mới load(), tránh ghi 2 lần).
   */
  load(bundle: CeremonyBundle) {
    bundle.students = bundle.students.map(normalizeStudentPhoto);
    // Migrate tên file config cũ mỗi khi bundle được nạp (từ đĩa hoặc build mới) —
    // trước đây chỉ migrate lúc build mới từ students.json, bundle.json đã lưu sẵn trên đĩa
    // không bao giờ đi qua nhánh đó nên vẫn giữ tên cũ mãi.
    if (bundle.ceremony && LEGACY_BACKDROPS_CONFIG_NAMES.has(bundle.ceremony.backdrops_config)) {
      bundle.ceremony.backdrops_config = CURRENT_BACKDROPS_CONFIG;
    }
    this.bundle = bundle;
    this.byMsv = new Map(bundle.students.map((s) => [s.student_code, s]));
  }

  /** Đọc dữ liệu đã lưu trong ceremony.db, nếu có — không lọc theo room_id (DB local chỉ
   * chứa 1 ceremony; room_id do nguồn seed quyết định, VD 'H1', không phải hằng cố định). */
  loadFromDisk(): boolean {
    const loaded = dbGetCeremonyBundle(this.getExecutorOrOpen());
    if (!loaded) return false;
    loaded.students = loaded.students.map(normalizeStudentPhoto);
    this.bundle = loaded;
    this.byMsv = new Map(loaded.students.map((s) => [s.student_code, s]));
    return true;
  }

  hasData(): boolean {
    return this.bundle != null;
  }

  getBundle(): CeremonyBundle | null {
    return this.bundle;
  }

  getCeremony() {
    return this.bundle?.ceremony ?? null;
  }

  getConfig() {
    return this.bundle?.config ?? null;
  }

  getInitialSession(): SessionState | null {
    return this.bundle?.session_state ?? null;
  }

  getStudents(): Student[] {
    return this.bundle?.students ?? [];
  }

  findByMsv(code: string): Student | undefined {
    const exact = this.byMsv.get(code);
    if (exact) return exact;

    const normCode = code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (!normCode) return undefined;

    return this.getStudents().find((s) => {
      const sCode = (s.student_code ?? '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (sCode === normCode) return true;

      const idNum = (s.identity_number ?? '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (idNum === normCode) return true;

      const phone = (s.phone_number ?? '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (phone === normCode) return true;

      const card = (s.card_code ?? '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (card === normCode) return true;

      return false;
    });
  }

  /** SV kế tiếp / trước đó theo stt (cho cmd:next / cmd:prev) */
  neighborByStt(currentCode: string | null, dir: 1 | -1): Student | undefined {
    const students = [...this.getStudents()].sort((a, b) => a.display_order - b.display_order);
    if (students.length === 0) return undefined;
    if (currentCode == null) return dir === 1 ? students[0] : students[students.length - 1];
    const idx = students.findIndex((s) => s.student_code === currentCode);
    if (idx < 0) return students[0];
    return students[idx + dir];
  }

  /**
   * UPDATE ngay lập tức trong SQLite (không còn "chỉ sửa memory, chờ ghi toàn file" như trước —
   * xem docs/roadmap/plans/layout-designer/18-luu-tru-sqlite-supabase.md §2), đồng thời cập
   * nhật cache memory để các lần đọc tiếp theo (findByMsv/getStudents) thấy ngay hiệu ứng.
   */
  patchStudent(code: string, patch: Partial<Student>): Student | undefined {
    const s = this.byMsv.get(code);
    if (!s) return undefined;
    Object.assign(s, patch);
    if (this.bundle) {
      const ceremonyId = this.bundle.ceremony.id;
      dbPatchStudent(this.getExecutorOrOpen(), ceremonyId, code, patch);
    }
    return s;
  }

  clear() {
    this.bundle = null;
    this.byMsv.clear();
  }

  /** Xóa dữ liệu sinh viên nhưng giữ ceremony/config để Backdrop không mất màn chờ. */
  clearStudents() {
    if (!this.bundle) return;
    this.bundle.students = [];
    this.byMsv.clear();
    try {
      dbClearStudents(this.getExecutorOrOpen(), this.bundle.ceremony.id);
    } catch (e) {
      console.error('[CeremonyStore] Failed to persist clearStudents:', e);
    }
  }

  updateConfig(patch: Partial<CeremonyBundle['config']>) {
    if (!this.bundle) return;
    if (!this.bundle.config) {
      this.bundle.config = {} as CeremonyBundle['config'];
    }
    Object.assign(this.bundle.config, patch);
    try {
      dbUpsertAppConfig(this.getExecutorOrOpen(), this.bundle.ceremony.id, this.bundle.config);
    } catch (e) {
      console.error('[CeremonyStore] Failed to persist updateConfig:', e);
    }
  }
}

export const ceremonyStore = new CeremonyStore();
