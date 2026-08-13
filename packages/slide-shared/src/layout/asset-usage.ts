import type { LayoutContent, LayoutItem } from './types.js';

function collectItemAssetPaths(items: LayoutItem[], out: Set<string>): void {
  for (const item of items) {
    if (item.type === 'image' && item.src) out.add(item.src);
    if (item.type === 'loop') collectItemAssetPaths(item.itemTemplate, out);
    if (item.type === 'gallery') {
      for (const img of item.images) if (img.src) out.add(img.src);
    }
  }
}

export function collectUsedAssetPaths(doc: LayoutContent): string[] {
  const paths = new Set<string>();
  for (const variant of doc.variants) {
    if (variant.background?.kind === 'image' && variant.background.src) paths.add(variant.background.src);
    collectItemAssetPaths(variant.items, paths);
  }
  return [...paths];
}
