import { describe, expect, it } from 'vitest';
import {
  affectedGroups,
  cloneVariantItemsForOverwrite,
  computePatchSteps,
  computeSyncPropagation,
  diffMissingItems,
  diffOverwriteExisting,
  ensureSyncKey,
  fieldGroupOf,
  findSyncChildren,
  generateSyncKey,
  markOverridden,
  matchVariantItemsForOverwrite,
} from './sync.js';
import type { LayoutContent, LayoutItem, LayoutVariant } from '@sky-app/slide-shared';

function textItem(id: string, overrides: Partial<LayoutItem> = {}): LayoutItem {
  return { id, type: 'text', box: { x: 10, y: 10, w: 100, h: 40 }, content: 'A', fontSize: 20, ...overrides } as LayoutItem;
}

function variant(aspectId: string, w: number, h: number, items: LayoutItem[]): LayoutVariant {
  return { aspect: { id: aspectId, w, h }, refW: w * 100, refH: h * 100, items };
}

describe('generateSyncKey', () => {
  it('sinh key khác nhau qua nhiều lần gọi liên tiếp', () => {
    const keys = new Set(Array.from({ length: 20 }, () => generateSyncKey()));
    expect(keys.size).toBe(20);
  });
});

describe('fieldGroupOf', () => {
  it('box → nhóm box', () => {
    expect(fieldGroupOf('box')).toBe('box');
  });
  it('content/src/varKey/itemTemplate/source → nhóm content', () => {
    expect(fieldGroupOf('content')).toBe('content');
    expect(fieldGroupOf('src')).toBe('content');
    expect(fieldGroupOf('varKey')).toBe('content');
  });
  it('field khác (fontSize, color...) → nhóm style (mặc định)', () => {
    expect(fieldGroupOf('fontSize')).toBe('style');
    expect(fieldGroupOf('color')).toBe('style');
  });
});

describe('affectedGroups', () => {
  it('trả đúng tập hợp nhóm từ patch nhiều field', () => {
    const groups = affectedGroups({ box: { x: 1, y: 1, w: 1, h: 1 }, content: 'x', fontSize: 12 });
    expect(groups).toEqual(new Set(['box', 'content', 'style']));
  });
});

describe('markOverridden', () => {
  it('item KHÔNG có syncRef → trả nguyên item, không thêm override', () => {
    const item = textItem('a');
    const result = markOverridden(item, { content: 'B' });
    expect(result).toBe(item);
  });

  it('item CÓ syncRef → thêm nhóm bị đụng vào syncOverrides', () => {
    const item = textItem('b', { syncRef: 'k1' });
    const result = markOverridden(item, { box: { x: 1, y: 1, w: 1, h: 1 } });
    expect(result.syncOverrides).toEqual(['box']);
  });

  it('không trùng lặp khi gọi lại cùng nhóm', () => {
    const item = textItem('b', { syncRef: 'k1', syncOverrides: ['box'] });
    const result = markOverridden(item, { box: { x: 2, y: 2, w: 2, h: 2 } });
    expect(result.syncOverrides).toEqual(['box']);
  });

  it('gộp thêm nhóm mới, giữ nhóm cũ', () => {
    const item = textItem('b', { syncRef: 'k1', syncOverrides: ['box'] });
    const result = markOverridden(item, { content: 'X' });
    expect(result.syncOverrides).toEqual(['box', 'content']);
  });
});

describe('findSyncChildren', () => {
  it('tìm đúng con TRỰC TIẾP xuyên nhiều variant, KHÔNG tìm cháu', () => {
    const a = textItem('a', { syncKey: 'kA' });
    const b = textItem('b', { syncKey: 'kB', syncRef: 'kA' });
    const c = textItem('c', { syncKey: 'kC', syncRef: 'kB' }); // cháu của A, con của B
    const doc: LayoutContent = { variants: [variant('16:9', 16, 9, [a]), variant('4:3', 4, 3, [b, c])] };

    const childrenOfA = findSyncChildren(doc, 'kA');
    expect(childrenOfA.map((x) => x.item.id)).toEqual(['b']); // KHÔNG có 'c'

    const childrenOfB = findSyncChildren(doc, 'kB');
    expect(childrenOfB.map((x) => x.item.id)).toEqual(['c']);
  });
});

describe('computeSyncPropagation', () => {
  it('field thuộc nhóm CHƯA override → lan truyền', () => {
    const child = textItem('b', { syncRef: 'kA' });
    const patch = computeSyncPropagation(child, { content: 'Xin chào' });
    expect(patch).toEqual({ content: 'Xin chào' });
  });

  it('field thuộc nhóm ĐÃ override → không lan truyền field đó', () => {
    const child = textItem('b', { syncRef: 'kA', syncOverrides: ['content'] });
    const patch = computeSyncPropagation(child, { content: 'Xin chào', fontSize: 24 });
    expect(patch).toEqual({ fontSize: 24 });
  });

  it('mọi nhóm liên quan đã override → trả null', () => {
    const child = textItem('b', { syncRef: 'kA', syncOverrides: ['content'] });
    const patch = computeSyncPropagation(child, { content: 'Xin chào' });
    expect(patch).toBeNull();
  });

  it('syncLocked=true → KHÔNG lan truyền field nào dù chưa override', () => {
    const child = textItem('b', { syncRef: 'kA', syncLocked: true });
    const patch = computeSyncPropagation(child, { content: 'Xin chào' });
    expect(patch).toBeNull();
  });
});

describe('ensureSyncKey', () => {
  it('item đã có syncKey → giữ nguyên, không sinh mới', () => {
    const item = textItem('a', { syncKey: 'k1' });
    const { key, item: result } = ensureSyncKey(item);
    expect(key).toBe('k1');
    expect(result).toBe(item);
  });

  it('item chưa có syncKey → sinh mới, trả item đã gán key', () => {
    const item = textItem('a');
    const { key, item: result } = ensureSyncKey(item);
    expect(key).toBeTruthy();
    expect(result.syncKey).toBe(key);
  });
});

describe('cloneVariantItemsForOverwrite', () => {
  it('scale toạ độ theo tỷ lệ đích, giữ Y, gán id mới + syncRef trỏ về nguồn', () => {
    const source = variant('16:9', 16, 9, [textItem('a', { syncKey: 'kA', box: { x: 100, y: 50, w: 200, h: 60 } })]);
    let counter = 0;
    const { clonedItems, updatedSourceItems } = cloneVariantItemsForOverwrite(source, { w: 21, h: 9 }, () => `new_${++counter}`);

    expect(clonedItems).toHaveLength(1);
    const cloned = clonedItems[0]!;
    expect(cloned.id).toBe('new_1');
    expect(cloned.syncRef).toBe('kA');
    const scaleX = 21 / 16;
    expect(cloned.box.x).toBeCloseTo(100 * scaleX, 5);
    expect(cloned.box.w).toBeCloseTo(200 * scaleX, 5);
    expect(cloned.box.y).toBe(50); // giữ nguyên Y
    expect(updatedSourceItems[0]!.syncKey).toBe('kA'); // nguồn đã có key, không đổi
  });

  it('item nguồn CHƯA có syncKey → tự sinh, cloned trỏ đúng key mới sinh', () => {
    const source = variant('16:9', 16, 9, [textItem('a')]);
    const { clonedItems, updatedSourceItems } = cloneVariantItemsForOverwrite(source, { w: 16, h: 9 }, () => 'new_1');

    expect(updatedSourceItems[0]!.syncKey).toBeTruthy();
    expect(clonedItems[0]!.syncRef).toBe(updatedSourceItems[0]!.syncKey);
  });
});

describe('diffMissingItems', () => {
  it('đích CHƯA có item nào khớp → trả toàn bộ item nguồn (đã scale + set syncRef)', () => {
    const source = variant('16:9', 16, 9, [textItem('a', { syncKey: 'kA' })]);
    const target = variant('4:3', 4, 3, []);
    const { missing } = diffMissingItems(source, target, () => 'new_1');
    expect(missing).toHaveLength(1);
    expect(missing[0]!.syncRef).toBe('kA');
  });

  it('đích ĐÃ có item khớp (target.syncRef === source.syncKey) → KHÔNG lặp lại item đó', () => {
    const source = variant('16:9', 16, 9, [textItem('a', { syncKey: 'kA' }), textItem('b', { syncKey: 'kB' })]);
    const target = variant('4:3', 4, 3, [textItem('x', { syncRef: 'kA' })]);
    const { missing } = diffMissingItems(source, target, () => 'new_1');
    expect(missing).toHaveLength(1);
    expect(missing[0]!.syncRef).toBe('kB');
  });

  it('item nguồn CHƯA có syncKey → tự sinh VÀ trả về trong updatedSourceItems (để caller ghi lại vào doc)', () => {
    const source = variant('16:9', 16, 9, [textItem('a')]); // không có syncKey
    const target = variant('4:3', 4, 3, []);
    const { missing, updatedSourceItems } = diffMissingItems(source, target, () => 'new_1');

    expect(updatedSourceItems).toHaveLength(1);
    expect(updatedSourceItems[0]!.syncKey).toBeTruthy();
    expect(missing[0]!.syncRef).toBe(updatedSourceItems[0]!.syncKey); // khớp đúng key vừa sinh
  });
});

describe('diffOverwriteExisting', () => {
  it('cập nhật patch cho item đích đã khớp key, tôn trọng override', () => {
    const source = variant('16:9', 16, 9, [textItem('a', { syncKey: 'kA', content: 'Nội dung mới', fontSize: 30 })]);
    const target = variant('4:3', 4, 3, [textItem('x', { syncRef: 'kA', content: 'Cũ', fontSize: 20, syncOverrides: ['content'] })]);

    const diffs = diffOverwriteExisting(source, target);
    expect(diffs).toHaveLength(1);
    // content bị override ở đích → KHÔNG có trong patch; fontSize (style) chưa override → có.
    expect(diffs[0]!.patch).not.toHaveProperty('content');
    expect(diffs[0]!.patch.fontSize).toBe(30);
  });

  it('item đích không khớp key nào → bỏ qua, không có trong kết quả', () => {
    const source = variant('16:9', 16, 9, [textItem('a', { syncKey: 'kA' })]);
    const target = variant('4:3', 4, 3, [textItem('x')]); // không có syncRef
    expect(diffOverwriteExisting(source, target)).toHaveLength(0);
  });
});

describe('matchVariantItemsForOverwrite', () => {
  it('phân loại đúng matched/unmatchedSource/unmatchedTarget', () => {
    const source = variant('16:9', 16, 9, [textItem('a', { syncKey: 'kA' }), textItem('b', { syncKey: 'kB' })]);
    const target = variant('4:3', 4, 3, [textItem('x', { syncRef: 'kA' }), textItem('y')]);

    const { matched, unmatchedSource, unmatchedTarget } = matchVariantItemsForOverwrite(source, target);
    expect(matched).toHaveLength(1);
    expect(matched[0]!.source.id).toBe('a');
    expect(matched[0]!.target.id).toBe('x');
    expect(unmatchedSource.map((i) => i.id)).toEqual(['b']);
    expect(unmatchedTarget.map((i) => i.id)).toEqual(['y']);
  });
});

describe('computePatchSteps — hàm trung tâm dùng bởi commands.ts', () => {
  it('patch item KHÔNG liên quan sync (không cha không con) → chỉ 1 step', () => {
    const doc: LayoutContent = { variants: [variant('16:9', 16, 9, [textItem('a')])] };
    const steps = computePatchSteps(doc, '16:9', 'a', { content: 'Cũ' }, { content: 'Mới' });
    expect(steps).toHaveLength(1);
    expect(steps[0]!.itemId).toBe('a');
  });

  it('patch item CHA → lan truyền đúng sang CON TRỰC TIẾP (khác variant), KHÔNG lan tới cháu', () => {
    const a = textItem('a', { syncKey: 'kA' });
    const b = textItem('b', { syncKey: 'kB', syncRef: 'kA' });
    const c = textItem('c', { syncKey: 'kC', syncRef: 'kB' });
    const doc: LayoutContent = { variants: [variant('16:9', 16, 9, [a]), variant('4:3', 4, 3, [b]), variant('1:1', 1, 1, [c])] };

    const steps = computePatchSteps(doc, '16:9', 'a', { content: 'Cũ' }, { content: 'Mới' });
    expect(steps).toHaveLength(2); // item chính (a) + con trực tiếp (b), KHÔNG có c
    expect(steps.map((s) => s.itemId).sort()).toEqual(['a', 'b']);
  });

  it('patch item CON trực tiếp → item đó tự thêm override, KHÔNG ảnh hưởng cha', () => {
    const a = textItem('a', { syncKey: 'kA' });
    const b = textItem('b', { syncKey: 'kB', syncRef: 'kA' });
    const doc: LayoutContent = { variants: [variant('16:9', 16, 9, [a, b])] };

    const steps = computePatchSteps(doc, '16:9', 'b', { content: 'Cũ' }, { content: 'Sửa tay' });
    expect(steps).toHaveLength(1); // chỉ 1 step (chính b) — b không phải cha của ai
    expect(steps[0]!.to.syncOverrides).toEqual(['content']);
  });

  it('con đã override nhóm content → patch content ở cha KHÔNG lan, patch style vẫn lan', () => {
    const a = textItem('a', { syncKey: 'kA' });
    const b = textItem('b', { syncKey: 'kB', syncRef: 'kA', syncOverrides: ['content'] });
    const doc: LayoutContent = { variants: [variant('16:9', 16, 9, [a, b])] };

    const steps = computePatchSteps(doc, '16:9', 'a', { content: 'Cũ', fontSize: 20 }, { content: 'Mới', fontSize: 30 });
    const childStep = steps.find((s) => s.itemId === 'b');
    expect(childStep).toBeTruthy();
    expect(childStep!.to).not.toHaveProperty('content');
    expect(childStep!.to.fontSize).toBe(30);
  });

  it('con syncLocked=true → hoàn toàn KHÔNG có step lan truyền', () => {
    const a = textItem('a', { syncKey: 'kA' });
    const b = textItem('b', { syncKey: 'kB', syncRef: 'kA', syncLocked: true });
    const doc: LayoutContent = { variants: [variant('16:9', 16, 9, [a, b])] };

    const steps = computePatchSteps(doc, '16:9', 'a', { content: 'Cũ' }, { content: 'Mới' });
    expect(steps).toHaveLength(1); // chỉ item chính, không có step cho b
  });
});
