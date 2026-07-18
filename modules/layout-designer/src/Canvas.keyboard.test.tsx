import { beforeEach, describe, expect, it } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 760 + 48, configurable: true });
  // designSize({w:16,h:9}) = 760×427.5 (cạnh dài=760, cạnh còn lại theo tỷ lệ — xem Canvas.tsx,
  // đổi 2026-07-18, KHÔNG còn hằng số cố định 760×428) — mock khớp đúng để fitScale=1 chính xác.
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 427.5 + 48, configurable: true });
});

function sampleContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '16:9', w: 16, h: 9 },
        refW: 760,
        refH: 427.5,
        background: { kind: 'color', color: '#201748' },
        items: [{ id: 'name', type: 'text', box: { x: 100, y: 100, w: 200, h: 40 }, content: 'Xin chào', fontSize: 24, color: '#fff', align: 'left' }],
      },
    ],
  };
}

function getCanvasEl(container: HTMLElement) {
  return container.querySelector('[tabindex="0"]') as HTMLElement;
}

describe('Canvas — keyboard shortcut chỉ active khi canvas có focus', () => {
  it('bấm Delete khi canvas KHÔNG focus → không xoá item', () => {
    const { container } = render(<LayoutDesignerApp content={sampleContent()} />);
    // Không focus canvas, không chọn item — fire trực tiếp vào document.body.
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(screen.getAllByText('Xin chào').length).toBeGreaterThan(0);
  });

  it('click chọn item rồi bấm Delete → xoá item khỏi canvas', () => {
    const { container } = render(<LayoutDesignerApp content={sampleContent()} />);
    const itemEl = screen.getAllByText('Xin chào')[0]!.closest('[style*="cursor: move"]') as HTMLElement;
    fireEvent.pointerDown(itemEl, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(itemEl, { clientX: 50, clientY: 50 });

    const canvasEl = getCanvasEl(container);
    fireEvent.keyDown(canvasEl, { key: 'Delete' });

    expect(screen.queryAllByText('Xin chào')).toHaveLength(0);
  });

  it('Backspace cũng xoá item đang chọn (tương đương Delete)', () => {
    const { container } = render(<LayoutDesignerApp content={sampleContent()} />);
    const itemEl = screen.getAllByText('Xin chào')[0]!.closest('[style*="cursor: move"]') as HTMLElement;
    fireEvent.pointerDown(itemEl, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(itemEl, { clientX: 50, clientY: 50 });

    const canvasEl = getCanvasEl(container);
    fireEvent.keyDown(canvasEl, { key: 'Backspace' });

    expect(screen.queryAllByText('Xin chào')).toHaveLength(0);
  });

  it('mũi tên di chuyển item đang chọn 1px (thường) / 10px (giữ Shift)', () => {
    const { container } = render(<LayoutDesignerApp content={sampleContent()} />);
    const itemEl = screen.getAllByText('Xin chào')[0]!.closest('[style*="cursor: move"]') as HTMLElement;
    fireEvent.pointerDown(itemEl, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(itemEl, { clientX: 50, clientY: 50 });

    const canvasEl = getCanvasEl(container);
    fireEvent.keyDown(canvasEl, { key: 'ArrowRight' });
    fireEvent.keyDown(canvasEl, { key: 'ArrowDown', shiftKey: true });

    // box.x: 100+1=101, box.y: 100+10=110 — kiểm tra qua style left/top hiển thị (fitScale=1, refW=760=DESIGN_W).
    const updatedItemEl = screen.getAllByText('Xin chào')[0]!.closest('[style*="cursor: move"]') as HTMLElement;
    expect(updatedItemEl.style.left).toBe('101px');
    expect(updatedItemEl.style.top).toBe('110px');
  });

  it('Ctrl/Cmd+C rồi Ctrl/Cmd+V → dán bản sao mới (item count tăng lên)', () => {
    const { container } = render(<LayoutDesignerApp content={sampleContent()} />);
    const itemEl = screen.getAllByText('Xin chào')[0]!.closest('[style*="cursor: move"]') as HTMLElement;
    fireEvent.pointerDown(itemEl, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(itemEl, { clientX: 50, clientY: 50 });

    const canvasEl = getCanvasEl(container);
    fireEvent.keyDown(canvasEl, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(canvasEl, { key: 'v', ctrlKey: true });

    // 2 item trên canvas (gốc + bản dán) + 1 lần trong textarea property panel (item vừa dán
    // tự động được chọn — addItemCommand.apply set selection, cùng pattern Flyout.test.tsx).
    expect(screen.getAllByText('Xin chào').length).toBe(3);
  });

  it('Ctrl/Cmd+Z (undo) hoàn tác thao tác xoá item', () => {
    const { container } = render(<LayoutDesignerApp content={sampleContent()} />);
    const itemEl = screen.getAllByText('Xin chào')[0]!.closest('[style*="cursor: move"]') as HTMLElement;
    fireEvent.pointerDown(itemEl, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(itemEl, { clientX: 50, clientY: 50 });

    const canvasEl = getCanvasEl(container);
    fireEvent.keyDown(canvasEl, { key: 'Delete' });
    expect(screen.queryAllByText('Xin chào')).toHaveLength(0);

    fireEvent.keyDown(canvasEl, { key: 'z', ctrlKey: true });
    expect(screen.getAllByText('Xin chào').length).toBeGreaterThan(0);
  });

  it('Ctrl/Cmd+\\ ẩn/hiện panel trái+phải', () => {
    const { container } = render(<LayoutDesignerApp content={sampleContent()} />);
    expect(screen.getByText('Kéo từng khối ra canvas.')).toBeTruthy();

    const canvasEl = getCanvasEl(container);
    fireEvent.keyDown(canvasEl, { key: '\\', ctrlKey: true });
    expect(screen.queryByText('Kéo từng khối ra canvas.')).toBeNull();

    fireEvent.keyDown(canvasEl, { key: '\\', ctrlKey: true });
    expect(screen.getByText('Kéo từng khối ra canvas.')).toBeTruthy();
  });
});
