import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteHistoryEntry,
  getAllHistoryEntries,
  getHistoryEntry,
  putHistoryEntry,
  type HistoryEntry,
} from '../lib/history-db';

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: overrides.id ?? `id-${Math.random().toString(36).slice(2)}`,
    text: 'xin chào',
    voiceId: 'NF',
    voiceLabel: 'Lan Anh',
    speed: 1.0,
    sampleRate: 48000,
    createdAt: Date.now(),
    audioBlob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
    durationMs: 1000,
    ...overrides,
  };
}

describe('history-db', () => {
  beforeEach(async () => {
    // fake-indexeddb không tự reset giữa các test — xoá sạch DB trước mỗi test.
    const entries = await getAllHistoryEntries();
    await Promise.all(entries.map((e) => deleteHistoryEntry(e.id)));
  });

  it('put + getAll trả về đúng entry vừa lưu', async () => {
    const entry = makeEntry({ id: 'a' });
    await putHistoryEntry(entry);

    const all = await getAllHistoryEntries();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe('a');
    expect(all[0]!.text).toBe('xin chào');
  });

  it('getAll sắp xếp mới nhất trước (createdAt giảm dần)', async () => {
    await putHistoryEntry(makeEntry({ id: 'old', createdAt: 1000 }));
    await putHistoryEntry(makeEntry({ id: 'new', createdAt: 2000 }));

    const all = await getAllHistoryEntries();
    expect(all.map((e) => e.id)).toEqual(['new', 'old']);
  });

  it('getHistoryEntry trả đúng entry theo id, undefined nếu không có', async () => {
    await putHistoryEntry(makeEntry({ id: 'x' }));

    expect((await getHistoryEntry('x'))?.id).toBe('x');
    expect(await getHistoryEntry('không-tồn-tại')).toBeUndefined();
  });

  it('deleteHistoryEntry xoá đúng entry', async () => {
    await putHistoryEntry(makeEntry({ id: 'to-delete' }));
    await deleteHistoryEntry('to-delete');

    expect(await getHistoryEntry('to-delete')).toBeUndefined();
  });

  it('tự prune, chỉ giữ tối đa 30 bản ghi mới nhất', async () => {
    for (let i = 0; i < 35; i++) {
      await putHistoryEntry(makeEntry({ id: `e${i}`, createdAt: i }));
    }

    const all = await getAllHistoryEntries();
    expect(all).toHaveLength(30);
    // Giữ lại 30 bản mới nhất: createdAt từ 5..34 (5 bản cũ nhất 0..4 bị xoá).
    expect(all.map((e) => e.createdAt).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 5),
    );
  });
});
