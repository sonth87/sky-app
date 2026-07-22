import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { AppConfig, Ceremony, CanonicalRecord, RecordRuntimeState } from '@sky-app/slide-shared';
import { DEFAULT_RUNTIME_STATE, isCanonicalGroup } from '@sky-app/slide-shared';
import {
  BetterSqlite3Executor,
  runMigrations,
  getCeremonyWithConfig as dbGetCeremonyWithConfig,
  saveCeremonyWithConfig as dbSaveCeremonyWithConfig,
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
 *   3. Thử {photoDir}/{id}.jpg (id thay cho student_code cũ — khoá đồng bộ mới, giai đoạn
 *      "bỏ Student" 2026-07-22)
 *   4. Để rỗng → renderer hiển thị placeholder "Không có ảnh"
 */
function normalizeRecordPhoto(r: CanonicalRecord): CanonicalRecord {
  const dataDir = ceremonyDataDir();
  const photoDir = detectPhotoDir();

  const p = (r.image_relative_path ?? '').trim();

  // Bước 1: path đã có prefix hợp lệ và file tồn tại → dùng ngay
  if (p && PHOTO_DIR_NAMES.some((d) => p.startsWith(`${d}/`))) {
    if (existsSync(join(dataDir, p))) return r;
  }

  // Bước 2: thử basename(path) trong photoDir thực tế (xử lý dạng "uuid/filename.jpg")
  if (p) {
    const candidate = `${photoDir}/${basename(p)}`;
    if (existsSync(join(dataDir, candidate))) {
      return { ...r, image_relative_path: candidate };
    }
  }

  // Bước 3: thử {photoDir}/{id}.jpg
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    const byId = `${photoDir}/${r.id}${ext}`;
    if (existsSync(join(dataDir, byId))) {
      return { ...r, image_relative_path: byId };
    }
  }

  // Bước 4: không tìm thấy — để rỗng, renderer hiển thị placeholder
  return { ...r, image_relative_path: '' };
}

// Tên file config layout đã đổi (V?) — bundle cũ (đã lưu trên đĩa từ trước) có thể còn trỏ
// tên cũ đã không còn tồn tại, khiến Backdrop không fetch được layout và không hiển thị gì.
const LEGACY_BACKDROPS_CONFIG_NAMES = new Set(['assets/2026/backdrops.json']);
const CURRENT_BACKDROPS_CONFIG = 'assets/2026/backdrops_layouts.json';

const DEFAULT_ROOM_ID = 'H1';
const DEFAULT_ROOM_NAME = 'Hội trường A';

/** So khớp chuẩn hoá (bỏ ký tự đặc biệt, lowercase) — dùng cho findById's fallback. */
function normalizeKey(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/**
 * Store dữ liệu đợt trong bộ nhớ (main process) — nguồn lưu trữ lâu dài là SQLite
 * (ceremony.db, qua @sky-app/ceremony-db), memory chỉ là cache đọc nhanh cho tra cứu
 * (findById/neighborByDisplayOrder gọi liên tục mỗi lần quét QR/next/prev).
 *
 * Giai đoạn "bỏ Student" (2026-07-22): tách 2 sổ riêng theo đúng kiến trúc Canonical —
 * `records: CanonicalRecord[]` là dữ liệu TĨNH từ DataSource (KHÔNG persist ở đây, nguồn thật
 * là data_source_record — records chỉ là cache RAM đọc lại mỗi khi Event active đổi, xem
 * setRecords()), `runtimeStates: Map<id, RecordRuntimeState>` là trạng thái vận hành lễ (đã
 * lên sân khấu chưa, lúc nào...) — KHÔNG persist SQL, chỉ sống trong RAM/phiên chạy hiện tại
 * (khác `session-store.ts` vốn persist con trỏ "đang lên sân khấu" ra session.json).
 *
 * `ceremony`/`config` VẪN persist qua SQLite (bảng ceremony/app_config, KHÔNG đổi) — đây là
 * cấu hình TĨNH của buổi lễ, tách biệt hoàn toàn khỏi danh sách người tham dự.
 */
class CeremonyStore {
  private executor: BetterSqlite3Executor | null = null;
  private ceremony: Ceremony | null = null;
  private config: AppConfig | null = null;
  private records: CanonicalRecord[] = [];
  private runtimeStates = new Map<string, RecordRuntimeState>();
  private byId = new Map<string, CanonicalRecord>();

  private getExecutorOrOpen(): BetterSqlite3Executor {
    if (!this.executor) {
      this.executor = new BetterSqlite3Executor(ceremonyDbPath());
      runMigrations(this.executor);
    }
    return this.executor;
  }

  /** Executor dùng chung cho ipc.ts (Event/DataSource queries, đọc config lúc bootstrap). */
  getExecutor(): BetterSqlite3Executor {
    return this.getExecutorOrOpen();
  }

  /** Đọc ceremony+config đã lưu trong ceremony.db, nếu có — không lọc theo room_id (DB local
   * chỉ chứa 1 ceremony; room_id do nguồn seed quyết định, VD 'H1', không phải hằng cố định). */
  loadFromDisk(): boolean {
    const loaded = dbGetCeremonyWithConfig(this.getExecutorOrOpen());
    if (!loaded) return false;
    this.ceremony = migrateBackdropsConfigName(loaded.ceremony);
    this.config = loaded.config;
    return true;
  }

  /** Ghi ceremony+config mới (VD lần đầu khởi động chưa có gì trong DB) — KHÔNG đụng
   * records/runtimeStates (2 thứ đó không thuộc ceremony/config nữa). */
  saveCeremony(ceremony: Ceremony, config: AppConfig): void {
    dbSaveCeremonyWithConfig(this.getExecutorOrOpen(), {
      roomId: DEFAULT_ROOM_ID,
      roomName: DEFAULT_ROOM_NAME,
      ceremony,
      config,
    });
    this.ceremony = ceremony;
    this.config = config;
  }

  hasData(): boolean {
    return this.ceremony != null;
  }

  getCeremony(): Ceremony | null {
    return this.ceremony;
  }

  getConfig(): AppConfig | null {
    return this.config;
  }

  getRecords(): CanonicalRecord[] {
    return this.records;
  }

  /** Tra 1 record theo id, fallback so khớp chuẩn hoá qua identifierCode/identityNumber/phone
   * (tương đương 4 field fallback của findByMsv cũ, trừ card_code — không có chỗ tương đương
   * core trong CanonicalSubject, cần tra qua extra nếu cần sau này). */
  findById(id: string): CanonicalRecord | undefined {
    const exact = this.byId.get(id);
    if (exact) return exact;

    const normId = normalizeKey(id);
    if (!normId) return undefined;

    return this.records.find((r) => {
      if (normalizeKey(r.id) === normId) return true;
      if (r.identifierCode && normalizeKey(r.identifierCode) === normId) return true;
      if (r.identityNumber && normalizeKey(r.identityNumber) === normId) return true;
      if (r.phone && normalizeKey(r.phone) === normId) return true;
      return false;
    });
  }

  getRuntimeState(id: string): RecordRuntimeState {
    return this.runtimeStates.get(id) ?? DEFAULT_RUNTIME_STATE;
  }

  /** record kế tiếp / trước đó theo displayOrder (cho cmd:next / cmd:prev). */
  neighborByDisplayOrder(currentId: string | null, dir: 1 | -1): CanonicalRecord | undefined {
    const sorted = [...this.records].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    if (sorted.length === 0) return undefined;
    if (currentId == null) return dir === 1 ? sorted[0] : sorted[sorted.length - 1];
    const idx = sorted.findIndex((r) => r.id === currentId);
    if (idx < 0) return sorted[0];
    return sorted[idx + dir];
  }

  /** Patch trạng thái vận hành (status, các mốc thời gian, srcOnStage) — KHÔNG đụng records
   * (dữ liệu tĩnh). KHÔNG persist SQL (runtime state chỉ sống trong RAM, xem comment class). */
  patchRuntimeState(id: string, patch: Partial<RecordRuntimeState>): RecordRuntimeState | undefined {
    if (!this.byId.has(id)) return undefined;
    const current = this.runtimeStates.get(id) ?? { ...DEFAULT_RUNTIME_STATE };
    const next = { ...current, ...patch };
    this.runtimeStates.set(id, next);
    return next;
  }

  /**
   * Thay TOÀN BỘ danh sách record bằng nguồn MỚI (Event active đổi). GIỮ NGUYÊN
   * ceremony/config hiện có. Luôn RESET runtimeStates — id cũ thuộc Event/DataSource khác,
   * mang runtime state cũ sang Event mới vô nghĩa (quyết định user: "vào Event nào thì chỉ
   * hiện data của Event đó").
   *
   * `records: []` hợp lệ (Event chưa gắn DataSource) — xoá sạch record cũ, không giữ sót.
   */
  setRecords(records: CanonicalRecord[]): void {
    this.records = records.map((r) => normalizeRecordPhoto(r));
    this.byId = new Map(this.records.map((r) => [r.id, r]));
    this.runtimeStates = new Map();
  }

  clear() {
    this.ceremony = null;
    this.config = null;
    this.records = [];
    this.runtimeStates = new Map();
    this.byId.clear();
  }

  /** Xóa dữ liệu người tham dự nhưng giữ ceremony/config để Backdrop không mất màn chờ. */
  clearRecords() {
    this.records = [];
    this.runtimeStates = new Map();
    this.byId.clear();
  }

  updateConfig(patch: Partial<AppConfig>) {
    if (!this.ceremony) return;
    if (!this.config) {
      this.config = {} as AppConfig;
    }
    Object.assign(this.config, patch);
    try {
      dbUpsertAppConfig(this.getExecutorOrOpen(), this.ceremony.id, this.config);
    } catch (e) {
      console.error('[CeremonyStore] Failed to persist updateConfig:', e);
    }
  }
}

function migrateBackdropsConfigName(ceremony: Ceremony): Ceremony {
  if (LEGACY_BACKDROPS_CONFIG_NAMES.has(ceremony.backdrops_config)) {
    return { ...ceremony, backdrops_config: CURRENT_BACKDROPS_CONFIG };
  }
  return ceremony;
}

export const ceremonyStore = new CeremonyStore();

// Re-export tiện cho caller cần kiểm tra loại record (Subject vs Group).
export { isCanonicalGroup };
