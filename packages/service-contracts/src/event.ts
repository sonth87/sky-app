import type { EventDocument, EventSummary } from '@sky-app/slide-shared';

/**
 * EventPort — CRUD Event + chuyển đổi active hoàn toàn thủ công (docs/roadmap/plans/layout-
 * designer/10-quan-ly-dot-le-event.md §"Chuyển đổi Event", A9). Electron: IPC → @sky-app/
 * ceremony-db. Web: apps/data-service REST — cùng pattern LayoutPort (layout.ts).
 *
 * setActive(id) là cách DUY NHẤT đổi Event đang chạy — không có getActive(now) theo lịch, không
 * gợi ý tự động. scheduledAt trên EventDocument chỉ là thông tin hiển thị/sắp xếp.
 */
export interface EventExportSummary {
  eventName: string;
  renamed: boolean;
  layoutsCreated: number;
  dataSourceImported: boolean;
}

export interface EventPort {
  list(): Promise<EventSummary[]>;
  get(id: string): Promise<EventDocument | null>;
  create(doc: Omit<EventDocument, 'createdAt' | 'updatedAt'>): Promise<void>;
  save(doc: EventDocument): Promise<void>;
  getCurrentActive(): Promise<EventDocument | null>;
  setActive(id: string): Promise<void>;

  /**
   * Export/Import Loại 2 (Giai đoạn 5.3, 15-import-export.md) — xuất/nhập 1 Event kèm layout tham
   * chiếu + DataSource + mapping profile thành 1 file .zip di chuyển được. CHỈ Electron implement
   * (cần zip + dialog native — không có thư viện zip nào chạy được ở renderer/Web, giống hệt
   * `DataSourcePort.pickZipFile`) — bỏ trống trên Web, UI tự check `typeof x === 'function'`.
   * Trả `null` = người dùng huỷ dialog chọn/lưu file (khác lỗi thật, `{ ok: false }`).
   */
  exportBundle?(eventId: string, opts: { includeData: boolean }): Promise<{ ok: true; filePath: string } | { ok: false; message: string } | null>;
  importBundle?(): Promise<{ ok: true; summary: EventExportSummary } | { ok: false; message: string } | null>;
}
