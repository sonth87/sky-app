import { describe, expect, it } from 'vitest';
import { HistoryStack } from './history.js';
import { copyVariantAddMissingCommand, copyVariantOverwriteAllCommand, copyVariantOverwriteExistingCommand } from './sync-commands.js';
import { createInitialState } from './state.js';
import type { LayoutContent, LayoutItem } from '@sky-app/slide-shared';

function textItem(id: string, overrides: Partial<LayoutItem> = {}): LayoutItem {
  return { id, type: 'text', box: { x: 10, y: 10, w: 100, h: 40 }, content: 'A', fontSize: 20, ...overrides } as LayoutItem;
}

function docWith(variants: { aspectId: string; w: number; h: number; items: LayoutItem[]; background?: LayoutContent['variants'][number]['background'] }[]): LayoutContent {
  return {
    variants: variants.map((v) => ({ aspect: { id: v.aspectId, w: v.w, h: v.h }, refW: v.w * 100, refH: v.h * 100, items: v.items, background: v.background })),
  };
}

describe('copyVariantOverwriteAllCommand — chế độ (a) ghi đè toàn bộ', () => {
  it('đích trống → tạo mới toàn bộ theo nguồn (scale toạ độ, set syncRef), xoá background đích', () => {
    const history = new HistoryStack();
    const source = textItem('s1', { syncKey: 'kS', content: 'Nguồn', box: { x: 100, y: 50, w: 200, h: 60 } });
    let state = createInitialState(
      docWith([
        { aspectId: '16:9', w: 16, h: 9, items: [source] },
        { aspectId: '4:3', w: 4, h: 3, items: [], background: { kind: 'color', color: '#000' } },
      ]),
    );

    state = history.execute(copyVariantOverwriteAllCommand('16:9', '4:3', 'skip-locked'), state);

    const target = state.doc.variants[1]!;
    expect(target.items).toHaveLength(1);
    expect(target.items[0]!.content).toBe('Nguồn');
    expect(target.items[0]!.syncRef).toBe('kS');
    expect(target.background).toBeUndefined();
    // aspect/refW/refH của đích KHÔNG đổi.
    expect(target.aspect.id).toBe('4:3');
  });

  it('undo khôi phục ĐÚNG NGUYÊN items + background cũ của đích', () => {
    const history = new HistoryStack();
    const source = textItem('s1', { syncKey: 'kS' });
    const oldTargetItem = textItem('old1');
    let state = createInitialState(
      docWith([
        { aspectId: '16:9', w: 16, h: 9, items: [source] },
        { aspectId: '4:3', w: 4, h: 3, items: [oldTargetItem], background: { kind: 'color', color: '#fff' } },
      ]),
    );

    state = history.execute(copyVariantOverwriteAllCommand('16:9', '4:3', 'skip-locked'), state);
    state = history.undo(state);

    const target = state.doc.variants[1]!;
    expect(target.items).toHaveLength(1);
    expect(target.items[0]!.id).toBe('old1');
    expect(target.background).toEqual({ kind: 'color', color: '#fff' });
  });

  it('chạy LẦN 2 từ CÙNG nguồn: item đích ĐÃ khớp key → GIỮ NGUYÊN id/syncKey, chỉ cập nhật nội dung', () => {
    const history = new HistoryStack();
    const source = textItem('s1', { syncKey: 'kS', content: 'V1' });
    let state = createInitialState(
      docWith([
        { aspectId: '16:9', w: 16, h: 9, items: [source] },
        { aspectId: '4:3', w: 4, h: 3, items: [] },
      ]),
    );

    state = history.execute(copyVariantOverwriteAllCommand('16:9', '4:3', 'skip-locked'), state);
    const targetIdAfterFirst = state.doc.variants[1]!.items[0]!.id;
    const targetKeyAfterFirst = state.doc.variants[1]!.items[0]!.syncKey;

    // Sửa nguồn rồi chạy lại lần 2.
    state = { ...state, doc: { ...state.doc, variants: state.doc.variants.map((v, i) => (i === 0 ? { ...v, items: [{ ...source, content: 'V2' }] } : v)) } };
    state = history.execute(copyVariantOverwriteAllCommand('16:9', '4:3', 'skip-locked'), state);

    const target = state.doc.variants[1]!;
    expect(target.items).toHaveLength(1);
    expect(target.items[0]!.id).toBe(targetIdAfterFirst); // GIỮ NGUYÊN id
    expect(target.items[0]!.syncKey).toBe(targetKeyAfterFirst); // GIỮ NGUYÊN syncKey
    expect(target.items[0]!.content).toBe('V2'); // nội dung cập nhật theo nguồn mới
  });

  it('item đích KHÔNG còn khớp bất kỳ item nguồn nào → bị XOÁ (đúng nghĩa "toàn bộ")', () => {
    const history = new HistoryStack();
    const source = textItem('s1', { syncKey: 'kS' });
    const orphanTarget = textItem('orphan', { syncRef: 'kOld' }); // không khớp source nào
    let state = createInitialState(
      docWith([
        { aspectId: '16:9', w: 16, h: 9, items: [source] },
        { aspectId: '4:3', w: 4, h: 3, items: [orphanTarget] },
      ]),
    );

    state = history.execute(copyVariantOverwriteAllCommand('16:9', '4:3', 'skip-locked'), state);
    expect(state.doc.variants[1]!.items.map((i) => i.id)).not.toContain('orphan');
  });

  it('lockStrategy="skip-locked": item đích đã khoá + khớp key → GIỮ NGUYÊN, không ghi đè', () => {
    const history = new HistoryStack();
    const source = textItem('s1', { syncKey: 'kS', content: 'Mới' });
    const lockedTarget = textItem('locked1', { syncRef: 'kS', syncLocked: true, content: 'Đã khoá' });
    let state = createInitialState(
      docWith([
        { aspectId: '16:9', w: 16, h: 9, items: [source] },
        { aspectId: '4:3', w: 4, h: 3, items: [lockedTarget] },
      ]),
    );

    state = history.execute(copyVariantOverwriteAllCommand('16:9', '4:3', 'skip-locked'), state);
    const target = state.doc.variants[1]!.items.find((i) => i.id === 'locked1');
    expect(target?.content).toBe('Đã khoá'); // KHÔNG bị ghi đè
  });

  it('lockStrategy="overwrite-locked": item đích đã khoá + khớp key → VẪN ghi đè', () => {
    const history = new HistoryStack();
    const source = textItem('s1', { syncKey: 'kS', content: 'Mới' });
    const lockedTarget = textItem('locked1', { syncRef: 'kS', syncLocked: true, content: 'Đã khoá' });
    let state = createInitialState(
      docWith([
        { aspectId: '16:9', w: 16, h: 9, items: [source] },
        { aspectId: '4:3', w: 4, h: 3, items: [lockedTarget] },
      ]),
    );

    state = history.execute(copyVariantOverwriteAllCommand('16:9', '4:3', 'overwrite-locked'), state);
    const target = state.doc.variants[1]!.items.find((i) => i.id === 'locked1');
    expect(target?.content).toBe('Mới'); // BỊ ghi đè dù đã khoá
  });

  it('variantId nguồn/đích không tồn tại → no-op an toàn', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWith([{ aspectId: '16:9', w: 16, h: 9, items: [] }]));
    const before = state;
    state = history.execute(copyVariantOverwriteAllCommand('không-tồn-tại', '16:9', 'skip-locked'), state);
    expect(state.doc).toEqual(before.doc);
  });
});

describe('copyVariantAddMissingCommand — chế độ (b) chỉ thêm cái thiếu', () => {
  it('chỉ thêm item nguồn CHƯA khớp key nào ở đích, KHÔNG đụng item cũ', () => {
    const history = new HistoryStack();
    const s1 = textItem('s1', { syncKey: 'kA' });
    const s2 = textItem('s2', { syncKey: 'kB' });
    const existingTarget = textItem('t1', { syncRef: 'kA', content: 'Đã sửa tay' });
    let state = createInitialState(
      docWith([
        { aspectId: '16:9', w: 16, h: 9, items: [s1, s2] },
        { aspectId: '4:3', w: 4, h: 3, items: [existingTarget] },
      ]),
    );

    state = history.execute(copyVariantAddMissingCommand('16:9', '4:3'), state);

    const target = state.doc.variants[1]!;
    expect(target.items).toHaveLength(2); // existingTarget + 1 item mới (từ s2)
    expect(target.items.find((i) => i.id === 't1')!.content).toBe('Đã sửa tay'); // KHÔNG đổi
    expect(target.items.some((i) => i.syncRef === 'kB')).toBe(true); // đã thêm item khớp s2
  });

  it('undo xoá đúng item mới thêm, khôi phục CHÍNH XÁC thứ tự items ban đầu', () => {
    const history = new HistoryStack();
    const s1 = textItem('s1', { syncKey: 'kA' });
    const existingTarget = textItem('t1');
    let state = createInitialState(
      docWith([
        { aspectId: '16:9', w: 16, h: 9, items: [s1] },
        { aspectId: '4:3', w: 4, h: 3, items: [existingTarget] },
      ]),
    );

    state = history.execute(copyVariantAddMissingCommand('16:9', '4:3'), state);
    state = history.undo(state);

    expect(state.doc.variants[1]!.items).toEqual([existingTarget]);
  });
});

describe('copyVariantOverwriteExistingCommand — chế độ (c) ghi đè nội dung cho cái đã có', () => {
  it('cập nhật nội dung item đích đã khớp key, tôn trọng override', () => {
    const history = new HistoryStack();
    const source = textItem('s1', { syncKey: 'kS', content: 'Nội dung mới', fontSize: 30 });
    const target1 = textItem('t1', { syncRef: 'kS', content: 'Cũ', fontSize: 20, syncOverrides: ['content'] });
    let state = createInitialState(
      docWith([
        { aspectId: '16:9', w: 16, h: 9, items: [source] },
        { aspectId: '4:3', w: 4, h: 3, items: [target1] },
      ]),
    );

    state = history.execute(copyVariantOverwriteExistingCommand('16:9', '4:3'), state);

    const target = state.doc.variants[1]!.items[0]!;
    expect(target.content).toBe('Cũ'); // content override, KHÔNG đổi
    expect((target as { fontSize: number }).fontSize).toBe(30); // style chưa override, cập nhật
  });

  it('undo khôi phục đúng toàn bộ patch đã áp (multi-item, 1 bước)', () => {
    const history = new HistoryStack();
    const source1 = textItem('s1', { syncKey: 'kA', content: 'Mới A' });
    const source2 = textItem('s2', { syncKey: 'kB', content: 'Mới B' });
    const target1 = textItem('t1', { syncRef: 'kA', content: 'Cũ A' });
    const target2 = textItem('t2', { syncRef: 'kB', content: 'Cũ B' });
    let state = createInitialState(
      docWith([
        { aspectId: '16:9', w: 16, h: 9, items: [source1, source2] },
        { aspectId: '4:3', w: 4, h: 3, items: [target1, target2] },
      ]),
    );

    state = history.execute(copyVariantOverwriteExistingCommand('16:9', '4:3'), state);
    expect(state.doc.variants[1]!.items.map((i) => i.content)).toEqual(['Mới A', 'Mới B']);

    state = history.undo(state);
    expect(state.doc.variants[1]!.items.map((i) => i.content)).toEqual(['Cũ A', 'Cũ B']);
  });

  it('item đích không khớp key nào → không đổi gì', () => {
    const history = new HistoryStack();
    const source = textItem('s1', { syncKey: 'kA' });
    const target1 = textItem('t1'); // không có syncRef
    let state = createInitialState(
      docWith([
        { aspectId: '16:9', w: 16, h: 9, items: [source] },
        { aspectId: '4:3', w: 4, h: 3, items: [target1] },
      ]),
    );

    state = history.execute(copyVariantOverwriteExistingCommand('16:9', '4:3'), state);
    expect(state.doc.variants[1]!.items[0]).toEqual(target1);
  });
});
