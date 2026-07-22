import type { LayoutContent, LayoutDocument, LayoutVersion } from '@sky-app/slide-shared';

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
  listDocuments(): Promise<Array<{ id: string; name: string; description?: string; color?: string; latestPublishedVersion: number | null }>>;
  getDocument(id: string): Promise<LayoutDocument | null>;
  createDocument(id: string, name: string, initialContent: LayoutContent, description?: string): Promise<void>;
  /** Cập nhật metadata layout (hiện chỉ `color` — badge phân biệt layout ở danh sách Event,
   * PHỤ LỤC "Event Hub" 2026-07-22). KHÔNG đụng currentDraft/publishedVersions. */
  updateDocumentMeta(id: string, patch: { color?: string }): Promise<void>;
  saveDraft(id: string, content: LayoutContent): Promise<void>;
  publish(id: string, note?: string): Promise<LayoutVersion>;
  listVersions(id: string): Promise<LayoutVersion[]>;
  getVersion(id: string, version: number): Promise<LayoutVersion | null>;
  restoreVersion(id: string, version: number): Promise<void>;

  /** Ghi nhận 1 token vừa được chèn ở BẤT KỲ layout nào — gọi mỗi lần user chọn/gõ xong 1 token mới. */
  recordTokenUsage(key: string): Promise<void>;
  /** Gợi ý autocomplete khi gõ `@` — sắp theo usage_count giảm dần. */
  listTopVariables(limit?: number): Promise<VariableRegistryEntry[]>;
}
