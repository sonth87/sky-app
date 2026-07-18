// SyncBadge — icon nhỏ báo trạng thái liên kết đồng bộ (12-thu-vien-layout.md mở rộng
// 2026-07-18) của 1 item: "linked" (đang nhận/gửi auto-sync) vs "unlinked" (độc lập hoàn toàn).
// Hiện trên canvas (cạnh mỗi item, LUÔN hiện — không chỉ khi selected, để nhìn toàn cảnh) VÀ
// trong PropertyPanel header (item đang chọn).

import { Link2, Link2Off } from 'lucide-react';
import type { LayoutItem } from '@sky-app/slide-shared';

export interface SyncBadgeProps {
  item: LayoutItem;
  /** true nếu item này đang LÀ CHA của ít nhất 1 item khác (có con qua syncRef trỏ về syncKey
   * của nó) — Canvas/PropertyPanel tự tính sẵn (cần biết `doc` để tra cứu, SyncBadge không nhận
   * doc trực tiếp để giữ component thuần/dễ test). */
  isParent: boolean;
  size?: number;
}

/**
 * - Không liên quan gì tới sync (không syncRef, không isParent) → không hiện gì (`null`).
 * - Có syncRef VÀ !syncLocked (con đang nhận sync ít nhất 1 phần), HOẶC isParent (đang là nguồn
 *   cho ai đó) → icon Link2 (linked).
 * - Có syncRef VÀ syncLocked (con đã tách hẳn) → icon Link2Off (unlinked, nhưng còn dấu vết xuất xứ).
 */
export function SyncBadge({ item, isParent, size = 11 }: SyncBadgeProps) {
  const isChild = Boolean(item.syncRef);
  if (!isChild && !isParent) return null;

  const linked = isParent || (isChild && !item.syncLocked);
  const Icon = linked ? Link2 : Link2Off;
  const label = linked ? 'Đang đồng bộ với tỷ lệ khác' : 'Đã tách khỏi đồng bộ (đã khoá)';

  return (
    <span title={label} aria-label={label} style={{ display: 'inline-flex', alignItems: 'center', color: linked ? 'var(--accent-color, #4b57e6)' : '#9a9bab' }}>
      <Icon size={size} />
    </span>
  );
}
