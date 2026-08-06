import type { LayoutItem } from '@sky-app/slide-shared';

/** Metadata cho 1 personal template (mẫu tự tạo từ nhóm item). */
export interface LayoutComponentMeta {
  id: string;
  name: string;
  items: LayoutItem[];
  createdAt: string; // ISO 8601
}

/** Port để quản lý personal templates (save/list/delete). Dùng bởi GĐ18 (Mẫu cá nhân). */
export interface LayoutComponentPort {
  /** Danh sách personal templates (mới nhất trước). */
  list(): Promise<LayoutComponentMeta[]>;
  /** Lưu nhóm item thành 1 personal template. */
  save(name: string, items: LayoutItem[]): Promise<{ id: string }>;
  /** Xoá 1 personal template. Không ảnh hưởng layout đã spawn từ nó. */
  delete(id: string): Promise<void>;
}
