import type { LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import { extractTokenKeysFromContent } from '@sky-app/slide-shared';

export function collectUsedTokenKeys(variant: LayoutVariant): Set<string> {
  const keys = new Set<string>();
  const scan = (items: LayoutItem[]) => {
    for (const item of items) {
      // extractTokenKeysFromContent (slide-shared/tokens.ts) — nguồn chân lý DUY NHẤT cho regex
      // @var, xử lý CẢ content string LẪN Tiptap JSON (Bước 12 kế hoạch resize/rotate,
      // 2026-07-18). KHÔNG tự viết lại regex ở đây (từng có, đã bỏ — tránh lệch quy định file 09).
      if (item.type === 'text' || item.type === 'ribbon') {
        for (const key of extractTokenKeysFromContent(item.content)) keys.add(key);
      }
      if (item.type === 'image' && item.varKey) keys.add(item.varKey);
      if (item.type === 'loop') scan(item.itemTemplate);
    }
  };
  scan(variant.items);
  return keys;
}
