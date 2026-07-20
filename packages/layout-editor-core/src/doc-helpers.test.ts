// Test cầu nối dữ liệu itemTemplate — Bước 9 kế hoạch resize/rotate (2026-07-18).

import { describe, expect, it } from 'vitest';
import { findItem, patchItem, resolveEditingItems } from './doc-helpers.js';
import type { LayoutContent, LoopItem } from '@sky-app/slide-shared';

function docWithLoop(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '16:9', w: 16, h: 9 },
        refW: 1920,
        refH: 1080,
        items: [
          { id: 'title', type: 'text', box: { x: 0, y: 0, w: 100, h: 40 }, content: 'A', fontSize: 20 },
          {
            id: 'loop1',
            type: 'loop',
            box: { x: 0, y: 100, w: 400, h: 300 },
            itemTemplate: [
              { id: 'child1', type: 'text', box: { x: 0, y: 0, w: 80, h: 20 }, content: '@ten', fontSize: 14 },
              { id: 'child2', type: 'shape', box: { x: 0, y: 20, w: 30, h: 30 }, shape: 'circle', fill: '#fff' },
            ],
            itemBox: { w: 180, h: 220 },
          },
        ],
      },
    ],
  };
}

describe('findItem — với loopItemId', () => {
  it('không truyền loopItemId → tìm trong variant.items như cũ', () => {
    const doc = docWithLoop();
    expect(findItem(doc, '16:9', 'title')?.id).toBe('title');
  });

  it('truyền loopItemId → tìm trong itemTemplate của đúng LoopItem đó', () => {
    const doc = docWithLoop();
    expect(findItem(doc, '16:9', 'child1', 'loop1')?.id).toBe('child1');
  });

  it('loopItemId trỏ tới item KHÔNG PHẢI loop → undefined', () => {
    const doc = docWithLoop();
    expect(findItem(doc, '16:9', 'child1', 'title')).toBeUndefined();
  });

  it('itemId không tồn tại trong itemTemplate → undefined', () => {
    const doc = docWithLoop();
    expect(findItem(doc, '16:9', 'not-exist', 'loop1')).toBeUndefined();
  });

  it('id trùng giữa top-level và itemTemplate (namespace không tách biệt) → tìm ĐÚNG theo loopItemId, không lẫn lộn', () => {
    const doc = docWithLoop();
    // Thêm 1 item top-level trùng id với child1 trong template — xác nhận findItem không lẫn.
    doc.variants[0]!.items.push({ id: 'child1', type: 'shape', box: { x: 500, y: 500, w: 10, h: 10 }, shape: 'rect', fill: '#000' });

    expect(findItem(doc, '16:9', 'child1')?.type).toBe('shape'); // top-level
    expect(findItem(doc, '16:9', 'child1', 'loop1')?.type).toBe('text'); // trong template
  });
});

describe('patchItem — với loopItemId', () => {
  it('không truyền loopItemId → patch variant.items như cũ', () => {
    const doc = docWithLoop();
    const next = patchItem(doc, '16:9', 'title', { content: 'B' });
    expect(findItem(next, '16:9', 'title')).toMatchObject({ content: 'B' });
  });

  it('truyền loopItemId → patch ĐÚNG item trong itemTemplate, KHÔNG đụng variant.items khác', () => {
    const doc = docWithLoop();
    const next = patchItem(doc, '16:9', 'child1', { content: '@ho_ten' }, 'loop1');

    expect(findItem(next, '16:9', 'child1', 'loop1')).toMatchObject({ content: '@ho_ten' });
    // title (top-level) không bị đụng.
    expect(findItem(next, '16:9', 'title')).toMatchObject({ content: 'A' });
    // child2 (item khác trong CÙNG itemTemplate) không bị đụng.
    expect(findItem(next, '16:9', 'child2', 'loop1')).toMatchObject({ shape: 'circle' });
  });

  it('patch item trong itemTemplate KHÔNG làm đổi identity của variant khác/item khác (immutable đúng)', () => {
    const doc = docWithLoop();
    const next = patchItem(doc, '16:9', 'child1', { content: 'X' }, 'loop1');

    // doc GỐC không đổi (bất biến).
    expect(findItem(doc, '16:9', 'child1', 'loop1')).toMatchObject({ content: '@ten' });
    expect(next).not.toBe(doc);
  });

  it('loopItemId trỏ item không phải loop → no-op (trả nguyên doc)', () => {
    const doc = docWithLoop();
    const next = patchItem(doc, '16:9', 'x', { content: 'Y' }, 'title');
    expect(next).toBe(doc);
  });

  it('patch itemTemplate (mảng con) như 1 field nguyên khối qua patchItem top-level — tái dùng được cho lúc thoát edit-mode', () => {
    const doc = docWithLoop();
    const newTemplate: LoopItem['itemTemplate'] = [{ id: 'onlyChild', type: 'text', box: { x: 0, y: 0, w: 50, h: 20 }, content: 'Mới', fontSize: 12 }];
    const next = patchItem(doc, '16:9', 'loop1', { itemTemplate: newTemplate });

    const loop = findItem(next, '16:9', 'loop1') as LoopItem;
    expect(loop.itemTemplate).toEqual(newTemplate);
  });
});

describe('resolveEditingItems', () => {
  it('editingLoopId undefined → trả variant.items', () => {
    const doc = docWithLoop();
    const variant = doc.variants[0]!;
    expect(resolveEditingItems(variant, undefined)).toBe(variant.items);
  });

  it('editingLoopId hợp lệ → trả itemTemplate của đúng LoopItem', () => {
    const doc = docWithLoop();
    const variant = doc.variants[0]!;
    const items = resolveEditingItems(variant, 'loop1');
    expect(items.map((i) => i.id)).toEqual(['child1', 'child2']);
  });

  it('editingLoopId trỏ item không tồn tại/không phải loop → mảng rỗng (không throw)', () => {
    const doc = docWithLoop();
    const variant = doc.variants[0]!;
    expect(resolveEditingItems(variant, 'title')).toEqual([]);
    expect(resolveEditingItems(variant, 'not-exist')).toEqual([]);
  });
});
