import { describe, expect, it } from 'vitest';
import { computeSnap } from './snap.js';

const CANVAS = { w: 1920, h: 1080 };

describe('computeSnap', () => {
  it('không gần cạnh/tâm nào trong threshold → không snap, box giữ nguyên', () => {
    const result = computeSnap({ x: 500, y: 500, w: 100, h: 100 }, [], CANVAS, 10);
    expect(result.snappedBox).toEqual({ x: 500, y: 500, w: 100, h: 100 });
    expect(result.guides).toEqual([]);
  });

  it('hít vào tâm canvas theo trục X khi đủ gần', () => {
    // Tâm canvas X = 960. Box rộng 100, đặt x=915 → centerX=965, cách tâm canvas 5 (< threshold 10).
    const result = computeSnap({ x: 915, y: 500, w: 100, h: 100 }, [], CANVAS, 10);
    expect(result.snappedBox.x).toBe(910); // centerX snap về 960 → x = 960 - 50
    expect(result.guides.some((g) => g.axis === 'x' && g.position === 960)).toBe(true);
  });

  it('hít vào mép trái canvas (x=0)', () => {
    const result = computeSnap({ x: 5, y: 500, w: 100, h: 100 }, [], CANVAS, 10);
    expect(result.snappedBox.x).toBe(0);
  });

  it('hít vào cạnh phải của 1 item khác', () => {
    const other = { x: 200, y: 200, w: 100, h: 100 }; // right = 300
    const result = computeSnap({ x: 305, y: 500, w: 50, h: 50 }, [other], CANVAS, 10);
    expect(result.snappedBox.x).toBe(300);
    expect(result.guides.some((g) => g.axis === 'x' && g.position === 300)).toBe(true);
  });

  it('hít vào tâm của 1 item khác theo cả 2 trục cùng lúc', () => {
    const other = { x: 400, y: 400, w: 200, h: 200 }; // center = (500, 500)
    const result = computeSnap({ x: 455, y: 455, w: 100, h: 100 }, [other], CANVAS, 10);
    expect(result.snappedBox.x).toBe(450); // centerX 505 → snap 500 → x = 500-50
    expect(result.snappedBox.y).toBe(450);
  });

  it('vượt threshold → không snap dù có candidate gần đó', () => {
    const other = { x: 200, y: 200, w: 100, h: 100 }; // right = 300
    const result = computeSnap({ x: 350, y: 500, w: 50, h: 50 }, [other], CANVAS, 10); // cách 50, threshold 10
    expect(result.snappedBox.x).toBe(350);
  });

  it('chọn candidate GẦN NHẤT khi có nhiều lựa chọn trong threshold', () => {
    const others = [
      { x: 100, y: 0, w: 10, h: 10 }, // right = 110
      { x: 118, y: 0, w: 10, h: 10 }, // left = 118
    ];
    // dragBox left tại 115 — cách candidate 110 là 5, cách candidate 118 là 3 → chọn 118 (gần hơn).
    const result = computeSnap({ x: 115, y: 500, w: 50, h: 50 }, others, CANVAS, 10);
    expect(result.snappedBox.x).toBe(118);
  });

  it('giữ nguyên w/h, chỉ đổi x/y khi snap', () => {
    const result = computeSnap({ x: 5, y: 5, w: 123, h: 456 }, [], CANVAS, 10);
    expect(result.snappedBox.w).toBe(123);
    expect(result.snappedBox.h).toBe(456);
  });
});
