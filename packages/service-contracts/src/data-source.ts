import type { CanonicalGroup, CanonicalSubject, DataSource, DataSourceSummary, FieldMappingProfile } from '@sky-app/slide-shared';

/**
 * DataSourcePort — đọc + ghi DataSource/record (docs/roadmap/plans/layout-designer/13-ceremony-
 * mo-rong.md §"Trách nhiệm 4"). Giai đoạn 3 chỉ có phần đọc (list/get/getRecords). Giai đoạn 4a
 * thêm phần ghi (create/importRecords/FieldMappingProfile) cho luồng import lần đầu tạo
 * DataSource mới — re-import cập nhật DataSource ĐÃ CÓ (diff 4 nhóm màu, file 22) hoãn Giai đoạn 5.
 */
export interface DataSourcePort {
  list(): Promise<DataSourceSummary[]>;
  get(id: string): Promise<DataSource | null>;
  /**
   * Đọc toàn bộ record của 1 DataSource. `excludeConsumedForEvent` (chỉ có ý nghĩa khi
   * DataSource.mode='consumable') — lọc bỏ record đã "dùng" ở BẤT KỲ Event nào cùng trỏ nguồn
   * này (qua bảng nối event_consumed_record, JOIN — 18-luu-tru-sqlite-supabase.md §5), KHÔNG
   * chỉ Event được truyền vào.
   */
  getRecords(id: string, opts?: { excludeConsumedForEvent?: string }): Promise<Array<CanonicalSubject | CanonicalGroup>>;

  /** Tạo 1 DataSource MỚI, RỖNG (chưa có record) — importRecords ghi record ở bước riêng, tách
   * bạch đúng luồng wizard (Bước 1 tạo khung, Bước 2 mới có file thật). */
  create(doc: Omit<DataSource, 'records'>): Promise<void>;
  /** Ghi 1 batch record vào DataSource đã tồn tại. GĐ4a: DataSource MỚI TRỐNG nên mọi record
   * đều là "thêm mới" — chưa cần diff/chiến lược trùng (đó là re-import, Giai đoạn 5). */
  importRecords(dataSourceId: string, records: Array<CanonicalSubject | CanonicalGroup>): Promise<{ imported: number }>;

  listFieldMappingProfiles(): Promise<FieldMappingProfile[]>;
  saveFieldMappingProfile(profile: FieldMappingProfile): Promise<void>;
}
