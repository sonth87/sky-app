// Test field còn thiếu Text/Image/Shape/Ribbon — Bước 5 kế hoạch resize/rotate (2026-07-18).
// Verify 2 CHIỀU cho mỗi field: patch qua PropertyPanel input VÀ render đúng trên Canvas (cạm
// bẫy đã ghi trong plan: input tồn tại KHÔNG đảm bảo Canvas.tsx render field đó).

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 760 + 48, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 428 + 48, configurable: true });
});

function textContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '760:428', w: 760, h: 428 },
        refW: 760,
        refH: 428,
        items: [{ id: 't1', type: 'text', box: { x: 50, y: 50, w: 300, h: 100 }, content: 'Xin chào', fontSize: 24 }],
      },
    ],
  };
}

function ribbonContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '760:428', w: 760, h: 428 },
        refW: 760,
        refH: 428,
        items: [{ id: 'r1', type: 'ribbon', box: { x: 50, y: 50, w: 300, h: 40 }, content: 'Giải nhất', fontSize: 16 }],
      },
    ],
  };
}

function imageContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '760:428', w: 760, h: 428 },
        refW: 760,
        refH: 428,
        items: [{ id: 'i1', type: 'image', box: { x: 50, y: 50, w: 100, h: 100 }, borderW: 4 }],
      },
    ],
  };
}

function shapeContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '760:428', w: 760, h: 428 },
        refW: 760,
        refH: 428,
        items: [{ id: 's1', type: 'shape', box: { x: 50, y: 50, w: 100, h: 100 }, shape: 'rect', fill: '#4b57e6' }],
      },
    ],
  };
}

function selectFirstItem(container: HTMLElement) {
  const el = container.querySelector('[style*="cursor: move"]') as HTMLElement;
  fireEvent.pointerDown(el);
  fireEvent.pointerUp(el);
}

/** Div render CONTENT của item trên canvas — KHÁC screen.getByText (khớp NHẦM cả textarea của
 * VariableTextarea trong PropertyPanel, vốn hiện cùng nội dung text). */
function getCanvasContentEl(container: HTMLElement, text: string): HTMLElement {
  const itemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
  const found = [...itemEl.querySelectorAll('div')].find((d) => d.textContent === text && d.children.length === 0);
  return found as HTMLElement;
}

describe('PropertyPanel — TextItem field còn thiếu', () => {
  it('bật Bold → fontWeight=700, render đúng fontWeight trên canvas', () => {
    const { container } = render(<LayoutDesignerApp content={textContent()} />);
    selectFirstItem(container);

    fireEvent.click(screen.getByText('B'));

    const contentEl = getCanvasContentEl(container, 'Xin chào');
    expect(contentEl.style.fontWeight).toBe('700');
  });

  it('bật Italic → render fontStyle italic trên canvas', () => {
    const { container } = render(<LayoutDesignerApp content={textContent()} />);
    selectFirstItem(container);

    fireEvent.click(screen.getByText('I'));

    const contentEl = getCanvasContentEl(container, 'Xin chào');
    expect(contentEl.style.fontStyle).toBe('italic');
  });

  it('bật Uppercase → render textTransform uppercase trên canvas', () => {
    const { container } = render(<LayoutDesignerApp content={textContent()} />);
    selectFirstItem(container);

    fireEvent.click(screen.getByText('AA'));

    const contentEl = getCanvasContentEl(container, 'Xin chào');
    expect(contentEl.style.textTransform).toBe('uppercase');
  });

  it('đổi Font chữ → render fontFamily trên canvas', () => {
    const { container } = render(<LayoutDesignerApp content={textContent()} />);
    selectFirstItem(container);

    const fontInput = screen.getByPlaceholderText('Mặc định hệ thống…');
    fireEvent.change(fontInput, { target: { value: 'Georgia' } });

    const contentEl = getCanvasContentEl(container, 'Xin chào');
    expect(contentEl.style.fontFamily).toBe('Georgia');
  });

  it('đổi Giãn dòng → render lineHeight trên canvas (không còn hard-code 1.18)', () => {
    const { container } = render(<LayoutDesignerApp content={textContent()} />);
    selectFirstItem(container);

    const lineHeightSection = [...container.querySelectorAll('div')].find((d) => d.textContent === 'Giãn dòng')?.parentElement;
    const slider = lineHeightSection?.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '2' } });

    const contentEl = getCanvasContentEl(container, 'Xin chào');
    expect(contentEl.style.lineHeight).toBe('2');
  });

  it('chọn Căn dọc "Dưới" → item content wrapper justifyContent flex-end', () => {
    const { container } = render(<LayoutDesignerApp content={textContent()} />);
    selectFirstItem(container);

    fireEvent.click(screen.getByText('Dưới'));

    const contentEl = getCanvasContentEl(container, 'Xin chào');
    const wrapper = contentEl.parentElement!;
    expect(wrapper.style.justifyContent).toBe('flex-end');
  });

  it('chọn overflow "Cắt" → wrapper overflow hidden', () => {
    const { container } = render(<LayoutDesignerApp content={textContent()} />);
    selectFirstItem(container);

    fireEvent.click(screen.getByText('Cắt'));

    const contentEl = getCanvasContentEl(container, 'Xin chào');
    const wrapper = contentEl.parentElement!;
    expect(wrapper.style.overflow).toBe('hidden');
  });

  it('bật đổ bóng → render textShadow trên canvas', () => {
    const { container } = render(<LayoutDesignerApp content={textContent()} />);
    selectFirstItem(container);

    fireEvent.click(screen.getByText('Bật đổ bóng'));

    const contentEl = getCanvasContentEl(container, 'Xin chào');
    expect(contentEl.style.textShadow).toBeTruthy();
  });
});

describe('PropertyPanel — RibbonItem field còn thiếu (RibbonControls tách riêng)', () => {
  it('RibbonControls có nút Bold độc lập (KHÁC TextControls, không có Căn dọc/overflow/shadow)', () => {
    const { container } = render(<LayoutDesignerApp content={ribbonContent()} />);
    selectFirstItem(container);

    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.queryByText('Bật đổ bóng')).toBeNull();
    expect(screen.queryByText('Giãn dòng')).toBeNull();
  });

  it('bấm Bold → fontWeight=700, render đúng trên canvas', () => {
    const { container } = render(<LayoutDesignerApp content={ribbonContent()} />);
    selectFirstItem(container);

    fireEvent.click(screen.getByText('B'));

    const contentEl = getCanvasContentEl(container, 'Giải nhất');
    expect(contentEl.style.fontWeight).toBe('700');
  });
});

describe('PropertyPanel — ImageItem field còn thiếu', () => {
  it('gõ varKey → patch đúng, hiện @varKey khi không có ảnh', () => {
    const { container } = render(<LayoutDesignerApp content={imageContent()} />);
    selectFirstItem(container);

    const varKeyInput = screen.getByPlaceholderText(/anh_dai_dien/);
    fireEvent.change(varKeyInput, { target: { value: 'anh_sinh_vien' } });

    expect(screen.getByText('@anh_sinh_vien')).toBeTruthy();
  });

  it('gõ fallbackText → ƯU TIÊN hiện fallbackText thay vì @varKey', () => {
    const { container } = render(<LayoutDesignerApp content={imageContent()} />);
    selectFirstItem(container);

    const varKeyInput = screen.getByPlaceholderText(/anh_dai_dien/);
    fireEvent.change(varKeyInput, { target: { value: 'anh_sinh_vien' } });
    const fallbackInput = screen.getByPlaceholderText(/tên biến hoặc/);
    fireEvent.change(fallbackInput, { target: { value: 'Chưa có ảnh' } });

    expect(screen.getByText('Chưa có ảnh')).toBeTruthy();
    expect(screen.queryByText('@anh_sinh_vien')).toBeNull();
  });

  it('chọn "Vừa khung" → render background-size contain trên canvas', () => {
    const content = imageContent();
    content.variants[0].items[0] = { ...content.variants[0].items[0], src: 'fake.png' } as never;
    const { container } = render(<LayoutDesignerApp content={content} />);
    selectFirstItem(container);

    fireEvent.click(screen.getByText('Vừa khung (giữ nguyên)'));

    const itemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    const imgDiv = itemEl.querySelector('div') as HTMLElement;
    expect(imgDiv.style.background).toContain('contain');
  });

  it('đổi màu viền (borderColor) → render đúng border color trên canvas', () => {
    const { container } = render(<LayoutDesignerApp content={imageContent()} />);
    selectFirstItem(container);

    const colorInputs = container.querySelectorAll('input[type="color"]');
    const borderColorInput = colorInputs[colorInputs.length - 1] as HTMLInputElement;
    fireEvent.change(borderColorInput, { target: { value: '#ff0000' } });

    const itemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    const imgDiv = itemEl.querySelector('div') as HTMLElement;
    expect(imgDiv.style.border).toContain('rgb(255, 0, 0)');
  });
});

describe('PropertyPanel — ShapeItem field còn thiếu', () => {
  it('đổi strokeW + stroke → render border trên canvas', () => {
    const { container } = render(<LayoutDesignerApp content={shapeContent()} />);
    selectFirstItem(container);

    const strokeSection = [...container.querySelectorAll('div')].find((d) => d.textContent === 'Viền')?.parentElement;
    const slider = strokeSection?.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '3' } });

    const itemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    const shapeDiv = itemEl.querySelector('div') as HTMLElement;
    expect(shapeDiv.style.border).toBeTruthy();
  });

  it('đổi radius (rect) → render border-radius trên canvas', () => {
    const { container } = render(<LayoutDesignerApp content={shapeContent()} />);
    selectFirstItem(container);

    const radiusSection = [...container.querySelectorAll('div')].find((d) => d.textContent === 'Bo góc')?.parentElement;
    const slider = radiusSection?.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '20' } });

    const itemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    const shapeDiv = itemEl.querySelector('div') as HTMLElement;
    expect(shapeDiv.style.borderRadius).toBe('20px');
  });

  it('chọn dạng "frame" → hiện thêm nút chọn hình dạng mới trong panel', () => {
    const { container } = render(<LayoutDesignerApp content={shapeContent()} />);
    selectFirstItem(container);

    const shapeSection = [...container.querySelectorAll('div')].find((d) => d.textContent === 'Hình dạng')?.parentElement;
    const buttons = shapeSection?.querySelectorAll('button');
    expect(buttons?.length).toBe(6); // rect/circle/triangle/diamond/frame/line
  });

  it('chọn dạng "line" → ẨN Section "Màu nền" (line dùng stroke, không dùng fill)', () => {
    const { container } = render(<LayoutDesignerApp content={shapeContent()} />);
    selectFirstItem(container);

    expect(screen.getByText('Màu nền')).toBeTruthy();

    const shapeSection = [...container.querySelectorAll('div')].find((d) => d.textContent === 'Hình dạng')?.parentElement;
    const lineBtn = [...(shapeSection?.querySelectorAll('button') ?? [])].find((b) => b.textContent === '―');
    fireEvent.click(lineBtn!);

    expect(screen.queryByText('Màu nền')).toBeNull();
  });
});
