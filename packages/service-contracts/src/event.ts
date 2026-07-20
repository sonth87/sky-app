import type { EventDocument, EventSummary } from '@sky-app/slide-shared';

/**
 * EventPort — CRUD Event + chuyển đổi active hoàn toàn thủ công (docs/roadmap/plans/layout-
 * designer/10-quan-ly-dot-le-event.md §"Chuyển đổi Event", A9). Electron: IPC → @sky-app/
 * ceremony-db. Web: apps/data-service REST — cùng pattern LayoutPort (layout.ts).
 *
 * setActive(id) là cách DUY NHẤT đổi Event đang chạy — không có getActive(now) theo lịch, không
 * gợi ý tự động. scheduledAt trên EventDocument chỉ là thông tin hiển thị/sắp xếp.
 */
export interface EventPort {
  list(): Promise<EventSummary[]>;
  get(id: string): Promise<EventDocument | null>;
  create(doc: Omit<EventDocument, 'createdAt' | 'updatedAt'>): Promise<void>;
  save(doc: EventDocument): Promise<void>;
  getCurrentActive(): Promise<EventDocument | null>;
  setActive(id: string): Promise<void>;
}
