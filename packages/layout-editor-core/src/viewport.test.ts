import { describe, expect, it } from 'vitest';
import { canvasToScreen, panBy, resetViewport, screenToCanvas, zoomAt, MIN_ZOOM, MAX_ZOOM } from './viewport.js';

describe('zoomAt', () => {
  it('điểm neo giữ nguyên vị trí màn hình sau khi zoom (không nhảy)', () => {
    const viewport = { zoom: 1, panX: 0, panY: 0 };
    const anchor = { x: 300, y: 200 };
    const zoomed = zoomAt(viewport, anchor, 2);

    // canvasToScreen(anchor trước và sau zoom phải cho cùng 1 điểm màn hình = anchor gốc)
    const canvasPointAtAnchor = screenToCanvas(viewport, anchor);
    const screenAfter = canvasToScreen(zoomed, canvasPointAtAnchor);
    expect(screenAfter.x).toBeCloseTo(anchor.x, 5);
    expect(screenAfter.y).toBeCloseTo(anchor.y, 5);
  });

  it('factor > 1 tăng zoom, factor < 1 giảm zoom', () => {
    const viewport = { zoom: 1, panX: 0, panY: 0 };
    expect(zoomAt(viewport, { x: 0, y: 0 }, 2).zoom).toBeCloseTo(2, 5);
    expect(zoomAt(viewport, { x: 0, y: 0 }, 0.5).zoom).toBeCloseTo(0.5, 5);
  });

  it('clamp không vượt MAX_ZOOM', () => {
    const viewport = { zoom: MAX_ZOOM, panX: 0, panY: 0 };
    expect(zoomAt(viewport, { x: 0, y: 0 }, 10).zoom).toBe(MAX_ZOOM);
  });

  it('clamp không dưới MIN_ZOOM', () => {
    const viewport = { zoom: MIN_ZOOM, panX: 0, panY: 0 };
    expect(zoomAt(viewport, { x: 0, y: 0 }, 0.01).zoom).toBe(MIN_ZOOM);
  });
});

describe('panBy', () => {
  it('cộng dồn dx/dy vào panX/panY, giữ nguyên zoom', () => {
    const viewport = { zoom: 1.5, panX: 10, panY: 20 };
    const panned = panBy(viewport, 5, -5);
    expect(panned).toEqual({ zoom: 1.5, panX: 15, panY: 15 });
  });
});

describe('resetViewport', () => {
  it('trả về zoom=1, pan=0', () => {
    expect(resetViewport()).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });
});

describe('screenToCanvas / canvasToScreen — round-trip', () => {
  it('screenToCanvas rồi canvasToScreen trả lại đúng điểm gốc', () => {
    const viewport = { zoom: 2, panX: 50, panY: -30 };
    const screenPoint = { x: 400, y: 300 };
    const canvasPoint = screenToCanvas(viewport, screenPoint);
    const backToScreen = canvasToScreen(viewport, canvasPoint);
    expect(backToScreen.x).toBeCloseTo(screenPoint.x, 5);
    expect(backToScreen.y).toBeCloseTo(screenPoint.y, 5);
  });

  it('zoom=1, pan=0 → toạ độ màn hình và canvas trùng nhau', () => {
    const viewport = { zoom: 1, panX: 0, panY: 0 };
    expect(screenToCanvas(viewport, { x: 123, y: 456 })).toEqual({ x: 123, y: 456 });
  });
});
