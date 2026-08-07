// Icon lucide-react dùng chung cho MỌI nơi cần biểu diễn "loại item" bằng icon (ComponentsPanel/
// GraphicsPanel's tile, LayersPanel's cây layer) — nguồn DUY NHẤT, tránh 2 map icon lệch nhau
// (GĐ10, docs/roadmap/plans/canva-ux/01-icon-foundation-and-shape-fix.md — trước đó
// ComponentsPanel và LayersPanel mỗi nơi tự định nghĩa 1 bộ glyph riêng).
import { Type, Image, Shapes, Flag, Repeat, Images, type LucideIcon } from 'lucide-react';
import type { LayoutItem } from '@sky-app/slide-shared';

const ITEM_TYPE_ICONS: Record<LayoutItem['type'], LucideIcon> = {
  text: Type,
  image: Image,
  shape: Shapes,
  ribbon: Flag,
  loop: Repeat,
  gallery: Images,
};

export function getItemTypeIcon(type: LayoutItem['type']): LucideIcon {
  return ITEM_TYPE_ICONS[type];
}
