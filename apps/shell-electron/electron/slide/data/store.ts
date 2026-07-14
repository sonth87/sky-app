import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { CeremonyBundle, SessionState, Student } from '@sky-app/slide-shared';
import { bundleJsonPath, ceremonyDataDir, PHOTO_DIR_NAMES } from './paths';

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
 * Store dữ liệu đợt trong bộ nhớ (main process).
 * - bundle: dữ liệu nguồn (read-mostly) từ Portal.
 * - students: tra cứu nhanh theo msv.
 * Trạng thái vận hành (session) do session-store quản lý riêng.
 */
class CeremonyStore {
  private bundle: CeremonyBundle | null = null;
  private byMsv = new Map<string, Student>();

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

  /** Đọc bundle.json từ đĩa nếu có */
  loadFromDisk(): boolean {
    const p = bundleJsonPath();
    if (!existsSync(p)) return false;
    const raw = readFileSync(p, 'utf-8');
    this.load(JSON.parse(raw) as CeremonyBundle);
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

  patchStudent(code: string, patch: Partial<Student>): Student | undefined {
    const s = this.byMsv.get(code);
    if (!s) return undefined;
    Object.assign(s, patch);
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
      writeFileSync(bundleJsonPath(), JSON.stringify(this.bundle, null, 2), 'utf-8');
    } catch (e) {
      console.error('[CeremonyStore] Failed to persist bundle after clearStudents:', e);
    }
  }

  updateConfig(patch: Partial<any>) {
    if (!this.bundle) return;
    if (!this.bundle.config) {
      this.bundle.config = {} as any;
    }
    Object.assign(this.bundle.config, patch);
    try {
      writeFileSync(bundleJsonPath(), JSON.stringify(this.bundle, null, 2), 'utf-8');
    } catch (e) {
      console.error('[CeremonyStore] Failed to persist bundle after updateConfig:', e);
    }
  }
}

export const ceremonyStore = new CeremonyStore();
