import type { LayoutContent, LayoutDocument, LayoutVersion, LayoutExportBundle } from '@sky-app/slide-shared';

export interface VariableRegistryEntry {
  key: string;
  firstUsedAt: string;
  lastUsedAt: string;
  usageCount: number;
}

/**
 * LayoutPort — CRUD + versioning cho LayoutDocument (docs/roadmap/plans/layout-designer/
 * 21-layout-versioning.md) + variable_registry (09-quy-dinh-variable.md §2.6, gợi ý autocomplete
 * toàn cục — KHÔNG gắn với 1 layout cụ thể). Electron: IPC → @sky-app/ceremony-db (SQLite
 * local). Web: apps/data-service REST, fallback SqliteWasmAdapter khi data-service không khả
 * dụng — đối xứng DataPort (data.ts), theo đúng docs/guides/ports-and-adapters.md.
 *
 * Save ≠ Publish (file 21 §2): `saveDraft` chỉ cập nhật vùng nháp, KHÔNG tăng version, KHÔNG
 * ảnh hưởng Event nào đang dùng version đã publish. `publish` đóng băng draft hiện tại thành
 * 1 version mới bất biến.
 */
export interface LayoutPort {
  listDocuments(): Promise<Array<{ id: string; name: string; description?: string; color?: string; category?: string; tags?: string[]; latestPublishedVersion: number | null }>>;
  /** Lấy TẤT CẢ layout (kể cả trashed) — dùng cho layout library UI show cả active và trash tabs */
  listAllDocuments?(): Promise<Array<{ id: string; name: string; description?: string; color?: string; category?: string; tags?: string[]; latestPublishedVersion: number | null; trashedAt?: string }>>;
  getDocument(id: string): Promise<LayoutDocument | null>;
  createDocument(id: string, name: string, initialContent: LayoutContent, description?: string): Promise<void>;
  /** Cập nhật metadata layout — name/description/color/category/tags (Giai đoạn 5.2, panel
   * "Thông tin layout"). TRUE partial-patch: chỉ field có mặt trong `patch` mới bị đổi, field
   * khác giữ nguyên. KHÔNG đụng currentDraft/publishedVersions. */
  updateDocumentMeta(id: string, patch: { name?: string; description?: string; color?: string; category?: string; tags?: string[] }): Promise<void>;
  /** Xoá layout vào thùng rác (soft delete) — đặt trashedAt timestamp. Layout sẽ không hiện ở
   * listDocuments() để ceremony không chọn được, nhưng dữ liệu vẫn lưu cho khôi phục sau. */
  moveToTrash(id: string): Promise<void>;
  /** Xoá layout vĩnh viễn (hard delete) — xoá hoàn toàn khỏi DB, không thể khôi phục.
   * Dùng khi xoá từ thùng rác. */
  deleteLayoutPermanently(id: string): Promise<void>;
  /** Khôi phục layout từ thùng rác về danh sách hoạt động. */
  restoreFromTrash(id: string): Promise<void>;
  saveDraft(id: string, content: LayoutContent): Promise<void>;
  publish(id: string, note?: string): Promise<LayoutVersion>;
  listVersions(id: string): Promise<LayoutVersion[]>;
  getVersion(id: string, version: number): Promise<LayoutVersion | null>;
  restoreVersion(id: string, version: number): Promise<void>;

  /** Ghi nhận 1 token vừa được chèn ở BẤT KỲ layout nào — gọi mỗi lần user chọn/gõ xong 1 token mới. */
  recordTokenUsage(key: string): Promise<void>;
  /** Gợi ý autocomplete khi gõ `@` — sắp theo usage_count giảm dần. */
  listTopVariables(limit?: number): Promise<VariableRegistryEntry[]>;

  /**
   * Export/Import Loại 1 (Giai đoạn 5.4, docs/roadmap/plans/layout-designer/15-import-export.md) —
   * xuất/nhập 1 hoặc nhiều LayoutDocument thành 1 file .json/.zip tự chứa (kèm assets). CHỈ Electron
   * implement (cần dialog native) — bỏ trống trên Web, UI tự check `typeof x === 'function'`.
   * Trả `null` = người dùng huỷ dialog chọn/lưu file.
   */
  exportBundle?(layoutIds: string[]): Promise<{ ok: true; filePath: string } | { ok: false; message: string } | null>;
  /**
   * Import LayoutExportBundle từ file .json/.zip — chọn chiến lược xử lý ID trùng
   * ('rename' = tạo ID mới / 'keep' = bỏ qua).
   */
  importBundle?(strategy?: 'rename' | 'keep'): Promise<{ ok: true; imported: number; renamed: number } | { ok: false; message: string } | null>;
}
