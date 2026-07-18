// Test toggle ẩn/hiện + resize palette trái (Rail+Flyout) và panel phải (PropertyPanel) — review
// 2026-07-18: "panel property... có thể drag để resize được, và có nút để toggle (nhớ lưu trạng
// thái)" + "palette trái cũng có nút để toggle". Trạng thái lưu localStorage (usePersistedState.ts).

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

function sampleContent(): LayoutContent {
  return {
    variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [] }],
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('LayoutDesignerApp — toggle palette trái (Rail+Flyout)', () => {
  it('mặc định hiện Rail (label "Thành phần")', () => {
    render(<LayoutDesignerApp content={sampleContent()} />);
    // "Thành phần" xuất hiện CẢ ở label icon Rail LẪN tiêu đề panel Flyout (ComponentsPanel) —
    // dùng getAllByText, chỉ cần xác nhận có ít nhất 1 (đủ để biết Rail/Flyout đang hiện).
    expect(screen.getAllByText('Thành phần').length).toBeGreaterThan(0);
  });

  it('bấm nút "Ẩn palette" → Rail/Flyout biến mất, xuất hiện dải mảnh "Hiện palette"', () => {
    render(<LayoutDesignerApp content={sampleContent()} />);
    fireEvent.click(screen.getByLabelText('Ẩn palette'));

    expect(screen.queryByText('Thành phần')).toBeNull();
    expect(screen.getByLabelText('Hiện palette')).toBeTruthy();
  });

  it('ẩn rồi bấm lại dải mảnh → palette hiện lại', () => {
    render(<LayoutDesignerApp content={sampleContent()} />);
    fireEvent.click(screen.getByLabelText('Ẩn palette'));
    fireEvent.click(screen.getByLabelText('Hiện palette'));

    expect(screen.getAllByText('Thành phần').length).toBeGreaterThan(0);
  });

  it('trạng thái ẩn được LƯU qua localStorage — remount component vẫn giữ ẩn', () => {
    const { unmount } = render(<LayoutDesignerApp content={sampleContent()} />);
    fireEvent.click(screen.getByLabelText('Ẩn palette'));
    unmount();

    render(<LayoutDesignerApp content={sampleContent()} />);
    expect(screen.queryByText('Thành phần')).toBeNull();
    expect(screen.getByLabelText('Hiện palette')).toBeTruthy();
  });
});

describe('LayoutDesignerApp — toggle panel phải (PropertyPanel)', () => {
  it('mặc định hiện panel phải (nút "Ẩn panel thuộc tính")', () => {
    render(<LayoutDesignerApp content={sampleContent()} />);
    expect(screen.getByLabelText('Ẩn panel thuộc tính')).toBeTruthy();
  });

  it('bấm nút "Ẩn panel thuộc tính" → panel biến mất, xuất hiện dải mảnh "Hiện panel thuộc tính"', () => {
    render(<LayoutDesignerApp content={sampleContent()} />);
    fireEvent.click(screen.getByLabelText('Ẩn panel thuộc tính'));

    expect(screen.queryByLabelText('Ẩn panel thuộc tính')).toBeNull();
    expect(screen.getByLabelText('Hiện panel thuộc tính')).toBeTruthy();
  });

  it('trạng thái ẩn được LƯU qua localStorage — remount component vẫn giữ ẩn', () => {
    const { unmount } = render(<LayoutDesignerApp content={sampleContent()} />);
    fireEvent.click(screen.getByLabelText('Ẩn panel thuộc tính'));
    unmount();

    render(<LayoutDesignerApp content={sampleContent()} />);
    expect(screen.getByLabelText('Hiện panel thuộc tính')).toBeTruthy();
  });
});

describe('LayoutDesignerApp — resize panel phải bằng kéo cạnh trái', () => {
  it('kéo cạnh resize sang trái → panel RỘNG hơn, width lưu localStorage', () => {
    const { container } = render(<LayoutDesignerApp content={sampleContent()} />);

    const handle = container.querySelector('[style*="cursor: col-resize"]') as HTMLElement;
    expect(handle).toBeTruthy();

    fireEvent.pointerDown(handle, { clientX: 500 });
    fireEvent.pointerMove(handle, { clientX: 400 }); // kéo SANG TRÁI 100px → rộng thêm 100px
    fireEvent.pointerUp(handle, { clientX: 400 });

    const stored = window.localStorage.getItem('layout-designer:rightPanelWidth');
    expect(stored).toBe('440'); // mặc định 340 + 100
  });

  it('kéo vượt quá MIN/MAX width → bị giới hạn (clamp)', () => {
    const { container } = render(<LayoutDesignerApp content={sampleContent()} />);
    const handle = container.querySelector('[style*="cursor: col-resize"]') as HTMLElement;

    fireEvent.pointerDown(handle, { clientX: 500 });
    fireEvent.pointerMove(handle, { clientX: 5000 }); // kéo sang phải RẤT NHIỀU → hẹp hơn MIN
    fireEvent.pointerUp(handle, { clientX: 5000 });

    const stored = Number(window.localStorage.getItem('layout-designer:rightPanelWidth'));
    expect(stored).toBe(280); // MIN_RIGHT_PANEL_WIDTH
  });
});
