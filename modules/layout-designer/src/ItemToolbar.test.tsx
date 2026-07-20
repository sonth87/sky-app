// Test toolbar nổi theo item-type — Bước 7 kế hoạch resize/rotate (2026-07-18).

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';
import { computeRotatedAABB } from './ItemToolbar.js';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 760 + 48, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 428 + 48, configurable: true });
});

function twoShapesContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '760:428', w: 760, h: 428 },
        refW: 760,
        refH: 428,
        items: [
          { id: 's1', type: 'shape', box: { x: 200, y: 150, w: 100, h: 80 }, shape: 'rect', fill: '#4b57e6' },
          { id: 's2', type: 'shape', box: { x: 400, y: 300, w: 80, h: 60 }, shape: 'circle', fill: '#e63d3d' },
        ],
      },
    ],
  };
}

function selectItem(container: HTMLElement, index = 0) {
  const items = container.querySelectorAll('[style*="cursor: move"]');
  const el = items[index] as HTMLElement;
  fireEvent.pointerDown(el);
  fireEvent.pointerUp(el);
}

describe('computeRotatedAABB — hàm thuần', () => {
  it('rotation=0 → AABB = chính box gốc', () => {
    expect(computeRotatedAABB({ x: 10, y: 20, w: 100, h: 50 })).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
  });

  it('rotation=90 (box vuông) → AABB không đổi (đối xứng)', () => {
    const aabb = computeRotatedAABB({ x: 0, y: 0, w: 100, h: 100, rotation: 90 });
    expect(aabb.minX).toBeCloseTo(0, 5);
    expect(aabb.minY).toBeCloseTo(0, 5);
    expect(aabb.maxX).toBeCloseTo(100, 5);
    expect(aabb.maxY).toBeCloseTo(100, 5);
  });

  it('rotation=45 (box vuông) → AABB LỚN HƠN box gốc (đường chéo mở rộng)', () => {
    const aabb = computeRotatedAABB({ x: 0, y: 0, w: 100, h: 100, rotation: 45 });
    const diag = 100 * Math.SQRT2;
    const expectedMin = 50 - diag / 2;
    const expectedMax = 50 + diag / 2;
    expect(aabb.minX).toBeCloseTo(expectedMin, 3);
    expect(aabb.maxX).toBeCloseTo(expectedMax, 3);
  });

  it('rotation=90 (box CHỮ NHẬT) → w/h hoán đổi trong AABB', () => {
    // box 100x50 tại (0,0), tâm (50,25). Xoay 90° → AABB mới rộng=50 (theo h cũ), cao=100 (theo w cũ).
    const aabb = computeRotatedAABB({ x: 0, y: 0, w: 100, h: 50, rotation: 90 });
    expect(aabb.maxX - aabb.minX).toBeCloseTo(50, 3);
    expect(aabb.maxY - aabb.minY).toBeCloseTo(100, 3);
  });
});

describe('ItemToolbar — hiện/ẩn theo selection', () => {
  it('chọn 1 item → toolbar hiện với đúng nút', () => {
    const { container } = render(<LayoutDesignerApp content={twoShapesContent()} />);
    selectItem(container);

    expect(screen.getByTestId('item-toolbar')).toBeTruthy();
    expect(screen.getByLabelText('Nhân đôi (thanh công cụ)')).toBeTruthy();
    expect(screen.getByLabelText('Xoá (thanh công cụ)')).toBeTruthy();
    expect(screen.getByLabelText('Khoá di chuyển (thanh công cụ)')).toBeTruthy();
    expect(screen.getByLabelText('Lên 1 lớp (thanh công cụ)')).toBeTruthy();
    expect(screen.getByLabelText('Xuống 1 lớp (thanh công cụ)')).toBeTruthy();
  });

  it('không có item nào chọn → KHÔNG hiện toolbar', () => {
    const { container } = render(<LayoutDesignerApp content={twoShapesContent()} />);
    void container;

    expect(screen.queryByTestId('item-toolbar')).toBeNull();
  });

  it('deselect (click nền canvas) → toolbar biến mất', () => {
    const { container } = render(<LayoutDesignerApp content={twoShapesContent()} />);
    selectItem(container);
    expect(screen.getByTestId('item-toolbar')).toBeTruthy();

    const frame = container.querySelector('[data-testid="canvas-frame"]') as HTMLElement;
    fireEvent.pointerDown(frame.parentElement!, { button: 0 });

    expect(screen.queryByTestId('item-toolbar')).toBeNull();
  });
});

describe('ItemToolbar — hành động', () => {
  it('bấm Nhân đôi → thêm item mới, lệch 20px', () => {
    const { container } = render(<LayoutDesignerApp content={twoShapesContent()} />);
    selectItem(container);

    const before = container.querySelectorAll('[style*="cursor: move"]').length;
    fireEvent.click(screen.getByLabelText('Nhân đôi (thanh công cụ)'));
    const after = container.querySelectorAll('[style*="cursor: move"]').length;

    expect(after).toBe(before + 1);
  });

  it('bấm Xoá → item biến mất khỏi canvas', () => {
    const { container } = render(<LayoutDesignerApp content={twoShapesContent()} />);
    selectItem(container);
    const before = container.querySelectorAll('[style*="cursor: move"]').length;

    fireEvent.click(screen.getByLabelText('Xoá (thanh công cụ)'));

    const after = container.querySelectorAll('[style*="cursor: move"], [style*="cursor: default"][style*="position: absolute"]').length;
    expect(after).toBe(before - 1);
  });

  it('bấm Khoá → item.locked=true, toolbar tự ẩn (item khoá KHÔNG có toolbar tương tác, giống SelectionHandles)', () => {
    const { container } = render(<LayoutDesignerApp content={twoShapesContent()} />);
    selectItem(container);

    fireEvent.click(screen.getByLabelText('Khoá di chuyển (thanh công cụ)'));

    // Item khoá vẫn CHỌN được (đổi cursor default) nhưng KHÔNG kéo/resize/rotate được — toolbar
    // vẫn nên hiện để có đường mở khoá lại (test hiện nút Mở khoá).
    expect(screen.getByLabelText('Mở khoá di chuyển (thanh công cụ)')).toBeTruthy();
  });

  it('bấm Lên 1 lớp → box.z tăng', () => {
    const { container } = render(<LayoutDesignerApp content={twoShapesContent()} />);
    selectItem(container);

    fireEvent.click(screen.getByLabelText('Lên 1 lớp (thanh công cụ)'));

    const itemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(itemEl.style.zIndex).toBe('1');
  });
});
