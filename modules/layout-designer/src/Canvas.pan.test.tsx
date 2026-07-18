import { beforeEach, describe, expect, it } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 760 + 48, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 428 + 48, configurable: true });
});

function emptyContent(): LayoutContent {
  return { variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [] }] };
}

function getContainerEl(container: HTMLElement) {
  return container.querySelector('[style*="background: rgb(236, 238, 243)"]') as HTMLElement;
}

function getArtEl(container: HTMLElement) {
  return container.querySelector('[data-testid="canvas-frame"]') as HTMLElement;
}

describe('Canvas — pan bằng chuột giữa', () => {
  it('giữ chuột giữa kéo → artEl dịch chuyển đúng theo delta chuột', () => {
    const { container } = render(<LayoutDesignerApp content={emptyContent()} />);
    const containerEl = getContainerEl(container);
    const artElBefore = getArtEl(container);
    const leftBefore = parseFloat(artElBefore.style.left);
    const topBefore = parseFloat(artElBefore.style.top);

    fireEvent.pointerDown(containerEl, { button: 1, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(containerEl, { button: 1, clientX: 430, clientY: 280 });

    const artElAfter = getArtEl(container);
    expect(parseFloat(artElAfter.style.left)).toBeCloseTo(leftBefore + 30, 1);
    expect(parseFloat(artElAfter.style.top)).toBeCloseTo(topBefore - 20, 1);
  });

  it('thả chuột giữa → dừng pan, kéo tiếp không còn tác dụng', () => {
    const { container } = render(<LayoutDesignerApp content={emptyContent()} />);
    const containerEl = getContainerEl(container);

    fireEvent.pointerDown(containerEl, { button: 1, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(containerEl, { button: 1, clientX: 430, clientY: 280 });
    fireEvent.pointerUp(containerEl, { button: 1, clientX: 430, clientY: 280 });
    const artElAfterUp = getArtEl(container);
    const leftAfterUp = parseFloat(artElAfterUp.style.left);

    // Move tiếp SAU khi đã pointerUp — không có pointerdown mới nên không được coi là đang pan.
    fireEvent.pointerMove(containerEl, { button: 1, clientX: 500, clientY: 300 });
    const artElAfterExtraMove = getArtEl(container);
    expect(parseFloat(artElAfterExtraMove.style.left)).toBeCloseTo(leftAfterUp, 1);
  });

  it('chuột giữa KHÔNG deselect item đang chọn (khác click trái vào nền)', () => {
    const content: LayoutContent = {
      variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 760, refH: 428, items: [{ id: 'a', type: 'shape', box: { x: 10, y: 10, w: 50, h: 50 }, shape: 'rect', fill: '#fff' }] }],
    };
    const { container } = render(<LayoutDesignerApp content={content} />);
    const itemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    fireEvent.pointerDown(itemEl, { clientX: 30, clientY: 30 });
    fireEvent.pointerUp(itemEl, { clientX: 30, clientY: 30 });
    expect(itemEl.style.outline).toContain('4b57e6'); // selected

    const containerEl = getContainerEl(container);
    fireEvent.pointerDown(containerEl, { button: 1, clientX: 400, clientY: 300 });
    fireEvent.pointerUp(containerEl, { button: 1, clientX: 400, clientY: 300 });

    const itemElAfter = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(itemElAfter.style.outline).toContain('4b57e6'); // vẫn selected, không bị bỏ chọn
  });
});

describe('Canvas — hand-tool tạm thời qua giữ Space', () => {
  it('giữ Space rồi kéo chuột TRÁI → pan (giống chuột giữa)', () => {
    const { container } = render(<LayoutDesignerApp content={emptyContent()} />);
    const containerEl = getContainerEl(container);
    const artElBefore = getArtEl(container);
    const leftBefore = parseFloat(artElBefore.style.left);

    fireEvent.keyDown(containerEl, { key: ' ' });
    fireEvent.pointerDown(containerEl, { button: 0, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(containerEl, { button: 0, clientX: 440, clientY: 300 });

    const artElAfter = getArtEl(container);
    expect(parseFloat(artElAfter.style.left)).toBeCloseTo(leftBefore + 40, 1);
  });

  it('không giữ Space → kéo chuột trái là thao tác chọn/deselect bình thường, KHÔNG pan', () => {
    const { container } = render(<LayoutDesignerApp content={emptyContent()} />);
    const containerEl = getContainerEl(container);
    const artElBefore = getArtEl(container);
    const leftBefore = parseFloat(artElBefore.style.left);

    fireEvent.pointerDown(containerEl, { button: 0, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(containerEl, { button: 0, clientX: 440, clientY: 300 });

    const artElAfter = getArtEl(container);
    expect(parseFloat(artElAfter.style.left)).toBeCloseTo(leftBefore, 1);
  });

  it('thả Space → hand-tool tắt, chuột trái trở lại bình thường', () => {
    const { container } = render(<LayoutDesignerApp content={emptyContent()} />);
    const containerEl = getContainerEl(container);
    const artElBefore = getArtEl(container);
    const leftBefore = parseFloat(artElBefore.style.left);

    fireEvent.keyDown(containerEl, { key: ' ' });
    fireEvent.keyUp(containerEl, { key: ' ' });
    fireEvent.pointerDown(containerEl, { button: 0, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(containerEl, { button: 0, clientX: 440, clientY: 300 });

    const artElAfter = getArtEl(container);
    expect(parseFloat(artElAfter.style.left)).toBeCloseTo(leftBefore, 1);
  });
});
