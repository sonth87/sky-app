import { describe, expect, it } from 'vitest';
import { computeLoopLayout, renderOverflowMoreText } from './loop.js';
import type { LoopItem } from './types.js';
import type { CanonicalSubject } from './canonical.js';

function makeMembers(count: number): CanonicalSubject[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    displayOrder: i,
    full_name: `Người ${i}`,
    subjectType: 'student',
    extra: {},
  }));
}

function baseLoopItem(overrides: Partial<LoopItem> = {}): LoopItem {
  return {
    id: 'loop1',
    type: 'loop',
    box: { x: 0, y: 0, w: 1200, h: 400 },
    itemTemplate: [],
    itemBox: { w: 200, h: 200 },
    direction: 'grid',
    gap: 10,
    source: 'members',
    overflow: 'shrink',
    ...overrides,
  };
}

describe('computeLoopLayout — members rỗng/undefined (nhóm danh nghĩa)', () => {
  it('members undefined → cells rỗng, không lỗi', () => {
    const result = computeLoopLayout(baseLoopItem(), undefined);
    expect(result.cells).toEqual([]);
    expect(result.overflowed).toBe(false);
  });

  it('members rỗng → cells rỗng', () => {
    const result = computeLoopLayout(baseLoopItem(), []);
    expect(result.cells).toEqual([]);
  });
});

describe('computeLoopLayout — overflow shrink', () => {
  it('vừa khung → không cắt bớt, itemScale tính đúng theo cellH/itemBox.h', () => {
    // 1200x400, itemBox 200x200, gap 10 → 6 ô grid (cols=ceil(sqrt(6))=3, rows=2).
    // cellW=(1200-20)/3=393.3 cellH=(400-10)/2=195 → itemScale=min(393.3/200, 195/200, 1)=0.975
    const item = baseLoopItem({ overflow: 'shrink' });
    const result = computeLoopLayout(item, makeMembers(6));
    expect(result.cells).toHaveLength(6);
    expect(result.overflowed).toBe(false);
    expect(result.cells[0]!.itemScale).toBeCloseTo(0.975, 5);
  });

  it('đông người → tự co itemScale nhỏ lại, vẫn giữ HẾT members khi trên ngưỡng', () => {
    const item = baseLoopItem({ overflow: 'shrink', box: { x: 0, y: 0, w: 1200, h: 400 } });
    const result = computeLoopLayout(item, makeMembers(20), 0.05); // ngưỡng thấp để không truncate
    expect(result.cells).toHaveLength(20);
    expect(result.overflowed).toBe(false);
    expect(result.cells[0]!.itemScale).toBeLessThan(1);
  });

  it('cực đông vượt minItemScale → tự chuyển sang cắt bớt (không lỗi, không vô hạn)', () => {
    const item = baseLoopItem({ overflow: 'shrink', box: { x: 0, y: 0, w: 300, h: 300 } });
    const result = computeLoopLayout(item, makeMembers(100), 0.3);
    expect(result.overflowed).toBe(true);
    expect(result.cells.length).toBeLessThan(100);
    expect(result.overflowCount).toBe(100 - result.cells.length);
    // Mọi ô hiển thị phải đạt tối thiểu minItemScale
    for (const cell of result.cells) {
      expect(cell.itemScale).toBeGreaterThanOrEqual(0.3 - 1e-9);
    }
  });

  it('giữ đúng thứ tự displayOrder khi co/cắt', () => {
    const item = baseLoopItem({ overflow: 'shrink', box: { x: 0, y: 0, w: 300, h: 300 } });
    const shuffled = [makeMembers(5)[3]!, makeMembers(5)[0]!, makeMembers(5)[4]!, makeMembers(5)[1]!, makeMembers(5)[2]!];
    const result = computeLoopLayout(item, shuffled, 0.05);
    expect(result.cells.map((c) => c.member.displayOrder)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('computeLoopLayout — overflow truncate', () => {
  it('số lượng dưới maxItems → hiện hết, không cắt', () => {
    const item = baseLoopItem({ overflow: 'truncate', maxItems: 10 });
    const result = computeLoopLayout(item, makeMembers(5));
    expect(result.cells).toHaveLength(5);
    expect(result.overflowed).toBe(false);
    expect(result.overflowCount).toBe(0);
  });

  it('vượt maxItems → cắt đúng maxItems ô đầu theo displayOrder, còn lại đếm vào overflowCount', () => {
    const item = baseLoopItem({ overflow: 'truncate', maxItems: 3 });
    const result = computeLoopLayout(item, makeMembers(10));
    expect(result.cells).toHaveLength(3);
    expect(result.cells.map((c) => c.member.id)).toEqual(['m0', 'm1', 'm2']);
    expect(result.overflowed).toBe(true);
    expect(result.overflowCount).toBe(7);
  });

  it('maxItems không khai báo → dùng hết số lượng, không cắt', () => {
    const item = baseLoopItem({ overflow: 'truncate' });
    const result = computeLoopLayout(item, makeMembers(4));
    expect(result.cells).toHaveLength(4);
    expect(result.overflowed).toBe(false);
  });
});

describe('renderOverflowMoreText', () => {
  it('mặc định "+@count_more" thay đúng số', () => {
    expect(renderOverflowMoreText(undefined, 38)).toBe('+38');
  });

  it('template tuỳ chỉnh vẫn thay đúng token @count_more', () => {
    expect(renderOverflowMoreText('và @count_more người khác', 5)).toBe('và 5 người khác');
  });
});
