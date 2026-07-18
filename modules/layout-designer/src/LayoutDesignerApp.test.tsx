import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

function sampleContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '16:9', w: 16, h: 9 },
        refW: 1920,
        refH: 1080,
        background: { kind: 'color', color: '#201748' },
        items: [
          { id: 'name', type: 'text', box: { x: 100, y: 100, w: 400, h: 80 }, content: 'Xin chào', fontSize: 32, color: '#fff', align: 'left' },
          { id: 'avatar', type: 'image', box: { x: 600, y: 100, w: 200, h: 200 }, shape: 'circle' },
        ],
      },
    ],
  };
}

describe('LayoutDesignerApp — canvas & selection', () => {
  it('render đúng item text và image ban đầu', () => {
    render(<LayoutDesignerApp content={sampleContent()} />);
    expect(screen.getByText('Xin chào')).toBeTruthy();
    expect(screen.getByText('ẢNH')).toBeTruthy();
  });

  it('click vào item → property panel hiện đúng loại + nội dung', async () => {
    const user = userEvent.setup();
    render(<LayoutDesignerApp content={sampleContent()} />);

    // Không có item nào chọn → Property Panel hiện thuộc tính Canvas/Frame (đổi 2026-07-18,
    // trước đó hiện text tĩnh "Chọn một thành phần").
    expect(screen.getByText('Không có phần tử nào đang chọn — chỉnh nền chung cho toàn bộ tỷ lệ này.')).toBeTruthy();

    await user.pointer({ keys: '[MouseLeft]', target: screen.getByText('Xin chào') });
    expect(screen.getByText('Văn bản')).toBeTruthy();
    expect(screen.getByDisplayValue('Xin chào')).toBeTruthy();
  });

  it('click ra ngoài canvas → bỏ chọn', async () => {
    const user = userEvent.setup();
    const { container } = render(<LayoutDesignerApp content={sampleContent()} />);
    await user.pointer({ keys: '[MouseLeft]', target: screen.getByText('Xin chào') });
    expect(screen.getByText('Văn bản')).toBeTruthy();

    const canvasBg = container.querySelector('[style*="background: rgb(236, 238, 243)"]') ?? container.querySelector('div');
    fireEvent.pointerDown(canvasBg!);
    expect(screen.queryByText('Văn bản')).toBeNull(); // bỏ chọn → không còn hiện Property Panel của item
    expect(screen.getByText('Không có phần tử nào đang chọn — chỉnh nền chung cho toàn bộ tỷ lệ này.')).toBeTruthy();
  });
});

describe('LayoutDesignerApp — property panel sửa nội dung', () => {
  it('sửa textarea content → canvas cập nhật ngay', async () => {
    const user = userEvent.setup();
    render(<LayoutDesignerApp content={sampleContent()} />);
    await user.pointer({ keys: '[MouseLeft]', target: screen.getByText('Xin chào') });

    const textarea = screen.getByDisplayValue('Xin chào');
    await user.clear(textarea);
    await user.type(textarea, 'Nội dung mới');

    // Canvas + textarea property panel đều hiện "Nội dung mới" (item vẫn đang chọn) — kiểm
    // tra bằng getAllByText thay vì getByText để không mơ hồ khi trùng text ở 2 nơi.
    expect(screen.getAllByText('Nội dung mới').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Xin chào')).toHaveLength(0);
  });
});

describe('LayoutDesignerApp — undo/redo qua toolbar', () => {
  it('xoá item rồi undo → item quay lại canvas', async () => {
    const user = userEvent.setup();
    render(<LayoutDesignerApp content={sampleContent()} />);
    await user.pointer({ keys: '[MouseLeft]', target: screen.getByText('Xin chào') });

    await user.click(screen.getByText('🗑'));
    expect(screen.queryAllByText('Xin chào')).toHaveLength(0);

    await user.click(screen.getByLabelText('Hoàn tác'));
    // Sau undo, item khôi phục lại VÀ vẫn đang chọn → text xuất hiện cả trên canvas lẫn
    // textarea property panel (2 phần tử) — xác nhận có ít nhất 1, không dùng getByText.
    expect(screen.getAllByText('Xin chào').length).toBeGreaterThan(0);
  });

  it('nút undo/redo disabled đúng trạng thái ban đầu', () => {
    render(<LayoutDesignerApp content={sampleContent()} />);
    expect(screen.getByLabelText('Hoàn tác')).toBeDisabled();
    expect(screen.getByLabelText('Làm lại')).toBeDisabled();
  });

  it('redo sau undo → item bị xoá lại', async () => {
    const user = userEvent.setup();
    render(<LayoutDesignerApp content={sampleContent()} />);
    await user.pointer({ keys: '[MouseLeft]', target: screen.getByText('Xin chào') });
    await user.click(screen.getByText('🗑'));
    await user.click(screen.getByLabelText('Hoàn tác'));
    expect(screen.getAllByText('Xin chào').length).toBeGreaterThan(0);

    await user.click(screen.getByLabelText('Làm lại'));
    expect(screen.queryAllByText('Xin chào')).toHaveLength(0);
  });
});
