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
        items: [{ id: 'name', type: 'text', box: { x: 100, y: 100, w: 400, h: 80 }, content: 'Xin chào @full_name', fontSize: 32, color: '#fff', align: 'left' }],
      },
    ],
  };
}

describe('Rail — đổi group hiện đúng panel', () => {
  it('mặc định hiện panel Thành phần', () => {
    render(<LayoutDesignerApp content={sampleContent()} />);
    expect(screen.getByText('Kéo từng khối ra canvas.')).toBeTruthy();
  });

  it('click nhóm Lớp → hiện panel Lớp với item hiện có', async () => {
    const user = userEvent.setup();
    render(<LayoutDesignerApp content={sampleContent()} />);
    await user.click(screen.getByText('Lớp'));
    // Text xuất hiện cả trong panel Lớp lẫn canvas (item vẫn render bình thường) — kiểm tra
    // có ít nhất 1 khớp thay vì đòi hỏi duy nhất.
    expect(screen.getAllByText('Xin chào @full_name').length).toBeGreaterThan(0);
  });

  it('click nhóm Biến → hiện token đã dùng trong layout', async () => {
    const user = userEvent.setup();
    render(<LayoutDesignerApp content={sampleContent()} />);
    await user.click(screen.getByText('Biến'));
    expect(screen.getByText('@full_name')).toBeTruthy();
  });
});

describe('Flyout — panel Lớp', () => {
  it('click layer → chọn item, property panel hiện đúng', async () => {
    const user = userEvent.setup();
    render(<LayoutDesignerApp content={sampleContent()} />);
    await user.click(screen.getByText('Lớp'));
    // "Xin chào @full_name" xuất hiện cả trong canvas lẫn panel Lớp — chọn phần tử ĐẦU (canvas
    // render trước Rail/Flyout trong DOM order thực tế không đảm bảo, nên lấy phần tử cuối
    // cùng vì Flyout Lớp render SAU Canvas trong cây component — dùng getAllByText[cuối].
    const matches = screen.getAllByText('Xin chào @full_name');
    await user.click(matches[matches.length - 1]!);
    expect(screen.getByText('Văn bản')).toBeTruthy();
  });

  it('bấm nút xoá trên layer → xoá item khỏi canvas', async () => {
    const user = userEvent.setup();
    render(<LayoutDesignerApp content={sampleContent()} />);
    await user.click(screen.getByText('Lớp'));
    await user.click(screen.getByLabelText(/^Xoá /));
    expect(screen.queryAllByText(/Xin chào/)).toHaveLength(0);
  });
});

describe('Flyout — spawn item mới từ palette (Thành phần)', () => {
  it('kéo tile "Chữ" từ palette thả vào canvas → tạo TextItem mới', () => {
    const { container } = render(<LayoutDesignerApp content={sampleContent()} />);

    const tile = screen.getByText('Chữ').closest('div')!;
    fireEvent.mouseDown(tile, { clientX: 10, clientY: 10 });

    // Ghost xuất hiện theo con trỏ khi đang kéo (label lấy từ ItemTypeDefinition.label = "Chữ").
    expect(screen.getAllByText('Chữ').length).toBeGreaterThan(0);

    // Tìm artEl (Frame, khung 760x428) để thả đúng vào giữa vùng canvas — mock getBoundingClientRect.
    const artEl = container.querySelector('[data-testid="canvas-frame"]') as HTMLElement;
    expect(artEl).toBeTruthy();
    artEl.getBoundingClientRect = () => ({ left: 0, top: 0, right: 760, bottom: 428, width: 760, height: 428, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    fireEvent.mouseMove(window, { clientX: 400, clientY: 200 });
    fireEvent.mouseUp(window, { clientX: 400, clientY: 200 });

    // Item mới mặc định content "Văn bản mới" (createDefault trong item-type.ts), tự động
    // được chọn (addItemCommand.apply set selection) nên xuất hiện cả ở canvas lẫn textarea
    // property panel — dùng getAllByText thay vì getByText.
    expect(screen.getAllByText('Văn bản mới').length).toBeGreaterThan(0);
  });

  it('thả NGOÀI vùng Frame (nhưng vẫn trong Canvas) → VẪN tạo item (kéo tự do, đổi 2026-07-18)', () => {
    const { container } = render(<LayoutDesignerApp content={sampleContent()} />);
    const tile = screen.getByText('Chữ').closest('div')!;
    fireEvent.mouseDown(tile, { clientX: 10, clientY: 10 });

    const artEl = container.querySelector('[data-testid="canvas-frame"]') as HTMLElement;
    artEl.getBoundingClientRect = () => ({ left: 0, top: 0, right: 760, bottom: 428, width: 760, height: 428, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    // Thả xa ngoài biên Frame — trước đây (overflow:hidden + screenPointToCanvas trả null) sẽ
    // KHÔNG tạo item; giờ Canvas cho kéo tự do kiểu Figma nên item VẪN được tạo, chỉ ở toạ độ
    // vượt xa refW/refH (sẽ không hiện trên slide thật vì nằm ngoài Frame).
    fireEvent.mouseUp(window, { clientX: 9999, clientY: 9999 });

    expect(screen.queryAllByText('Văn bản mới').length).toBeGreaterThan(0);
  });
});

describe('Flyout — ghost label vị trí TƯƠNG ĐỐI với root app (không dùng position:fixed)', () => {
  // Tái hiện bug thật (ảnh chụp 2026-07-17): @sonth87/device-layout's Window.tsx bọc app trong
  // 1 phần tử giữ `transform` inline thường trực → containing block cho position:fixed đổi từ
  // viewport sang khung cửa sổ app. Mô phỏng bằng cách đặt root app KHÔNG ở góc (0,0) màn hình
  // (root.getBoundingClientRect().left/top > 0, giống cửa sổ Electron nằm giữa màn hình) — nếu
  // ghost còn dùng toạ độ tuyệt đối (clientX/Y) mà root lại lệch, test này sẽ lộ sai lệch đó.
  it('root app lệch khỏi góc màn hình → ghost vẫn hiện đúng vị trí TƯƠNG ĐỐI theo con trỏ', () => {
    const { container } = render(<LayoutDesignerApp content={sampleContent()} />);

    // root là div ngoài cùng của LayoutDesignerApp (position:relative, chứa Toolbar+Rail+Flyout+...).
    const rootEl = container.firstElementChild as HTMLElement;
    rootEl.getBoundingClientRect = () => ({ left: 300, top: 150, right: 1300, bottom: 900, width: 1000, height: 750, x: 300, y: 150, toJSON: () => {} }) as DOMRect;

    const tile = screen.getByText('Chữ').closest('div')!;
    fireEvent.mouseDown(tile, { clientX: 350, clientY: 200 });

    // Ghost label lấy từ ItemTypeDefinition.label ("Văn bản" cho type=text — khác text hiển thị
    // trên tile "Chữ", xem item-type.ts) — lọc qua z-index 9999 (chỉ ghost có z-index này).
    const ghostEl = [...document.querySelectorAll('div')].find((el) => el.style.zIndex === '9999') as HTMLElement;
    expect(ghostEl).toBeTruthy();
    expect(ghostEl.textContent).toBe('Văn bản');
    // Ghost style.left/top PHẢI là toạ độ TƯƠNG ĐỐI (clientX - root.left, clientY - root.top),
    // KHÔNG PHẢI clientX/clientY tuyệt đối (350/200) — đó chính là bug đã sửa.
    expect(parseFloat(ghostEl.style.left)).toBeCloseTo(350 - 300 + 10, 0); // clientX - root.left + offset 10
    expect(parseFloat(ghostEl.style.top)).toBeCloseTo(200 - 150 + 10, 0);
    expect(ghostEl.style.position).toBe('absolute'); // KHÔNG phải 'fixed'
  });
});
