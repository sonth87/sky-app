import { beforeEach, describe, expect, it } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

// Khớp designSize({w:16,h:9}) trong Canvas.tsx (cạnh dài=760, cạnh còn lại tự tính theo tỷ lệ —
// KHÔNG còn hằng số cố định 760×428, xem đổi 2026-07-18) — test dùng aspect 16:9 nên designH =
// 760*9/16 = 427.5 (không phải 428 chẵn như hằng số cũ trước khi hỗ trợ đa tỷ lệ).
const DESIGN_W_TEST = 760;
const DESIGN_H_TEST = 427.5;

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 760 + 48, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 427.5 + 48, configurable: true });
});

function emptyContent(): LayoutContent {
  return { variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [] }] };
}

function mockContainerRect(container: HTMLElement) {
  // Container (cha của khung canvas) — dùng để tính anchor lúc wheel zoom.
  const containerEl = container.querySelector('[style*="background: rgb(236, 238, 243)"]') as HTMLElement;
  containerEl.getBoundingClientRect = () => ({ left: 0, top: 0, right: 808, bottom: 476, width: 808, height: 476, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
  return containerEl;
}

describe('Canvas — zoom qua Ctrl+scroll', () => {
  it('scroll THƯỜNG (không giữ Ctrl/Cmd) → KHÔNG đổi zoom', () => {
    const { container } = render(<LayoutDesignerApp content={emptyContent()} />);
    const containerEl = mockContainerRect(container);

    fireEvent.wheel(containerEl, { deltaY: -100, ctrlKey: false, metaKey: false });

    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('Ctrl+scroll lên (deltaY âm) → phóng to (zoom tăng)', () => {
    const { container } = render(<LayoutDesignerApp content={emptyContent()} />);
    const containerEl = mockContainerRect(container);

    fireEvent.wheel(containerEl, { deltaY: -100, ctrlKey: true, clientX: 400, clientY: 238 });

    expect(screen.queryByText('100%')).toBeNull();
    expect(screen.getByText('110%')).toBeTruthy();
  });

  it('Ctrl+scroll xuống (deltaY dương) → thu nhỏ (zoom giảm)', () => {
    const { container } = render(<LayoutDesignerApp content={emptyContent()} />);
    const containerEl = mockContainerRect(container);

    fireEvent.wheel(containerEl, { deltaY: 100, ctrlKey: true, clientX: 400, clientY: 238 });

    expect(screen.getByText('91%')).toBeTruthy();
  });

  it('Cmd (metaKey, macOS) + scroll → cũng zoom được như Ctrl', () => {
    const { container } = render(<LayoutDesignerApp content={emptyContent()} />);
    const containerEl = mockContainerRect(container);

    fireEvent.wheel(containerEl, { deltaY: -100, metaKey: true, clientX: 400, clientY: 238 });

    expect(screen.getByText('110%')).toBeTruthy();
  });
});

describe('Canvas — vị trí artEl KHÔNG lệch khi zoom (bug ảnh chụp 2026-07-17: canvas+item trôi lệch dần khi zoom lên)', () => {
  function getArtEl(container: HTMLElement) {
    return container.querySelector('[data-testid="canvas-frame"]') as HTMLElement;
  }

  it('zoom quanh đúng TÂM container (anchor = tâm) → artEl vẫn nằm giữa container sau zoom', () => {
    // Container 808×475.5 (760+48, 427.5+48) → fitScale=1 (DESIGN 760×427.5 vừa khít trong vùng
    // khả dụng 760×427.5). baseOffset = (808-760)/2 = 24 theo X, (475.5-427.5)/2 = 24 theo Y.
    // Tâm container = (404, 237.75). Zoom quanh đúng tâm → artEl phải NGUYÊN VỊ TRÍ CENTER sau
    // zoom (không trôi lệch theo hướng nào).
    const { container } = render(<LayoutDesignerApp content={emptyContent()} />);
    const containerEl = mockContainerRect(container);

    fireEvent.wheel(containerEl, { deltaY: -100, ctrlKey: true, clientX: 404, clientY: 237.75 });
    expect(screen.getByText('110%')).toBeTruthy();

    const artEl = getArtEl(container);
    const left = parseFloat(artEl.style.left);
    const top = parseFloat(artEl.style.top);
    const w = DESIGN_W_TEST * 1.1; // fitScale(1) × zoom(1.1)
    const h = DESIGN_H_TEST * 1.1;
    // Tâm của artEl sau zoom phải TRÙNG tâm container (404, 237.75) — sai lệch dù chỉ 1 lần zoom
    // sẽ lộ ngay nếu công thức origin/anchor không khớp (đây chính là bug đã báo qua ảnh chụp).
    expect(left + w / 2).toBeCloseTo(404, 1);
    expect(top + h / 2).toBeCloseTo(237.75, 1);
  });

  it('zoom lên NHIỀU LẦN LIÊN TIẾP quanh cùng 1 điểm (không phải tâm) → điểm đó vẫn đứng yên trên màn hình (không trôi lệch dần)', () => {
    const { container } = render(<LayoutDesignerApp content={emptyContent()} />);
    const containerEl = mockContainerRect(container);
    const anchor = { clientX: 500, clientY: 300 };

    // Zoom 3 lần liên tiếp quanh CÙNG 1 điểm màn hình — nếu công thức origin sai (như bug cũ dùng
    // left:50%+translate lẫn baseOffset không nhất quán), điểm neo sẽ trôi dần sau mỗi lần zoom.
    fireEvent.wheel(containerEl, { deltaY: -100, ctrlKey: true, ...anchor });
    fireEvent.wheel(containerEl, { deltaY: -100, ctrlKey: true, ...anchor });
    fireEvent.wheel(containerEl, { deltaY: -100, ctrlKey: true, ...anchor });

    const artEl = getArtEl(container);
    const left = parseFloat(artEl.style.left);
    const top = parseFloat(artEl.style.top);
    const zoom = 1.1 * 1.1 * 1.1;
    const w = DESIGN_W_TEST * zoom;
    const h = DESIGN_H_TEST * zoom;

    // Điểm canvas-logic tương ứng với anchor lúc zoom=1 (fitScale=1, baseOffset=24,24):
    // canvasPoint = (anchor - baseOffset) / fitScale = (500-24, 300-24) = (476, 276).
    // Sau 3 lần zoom, điểm đó (quy đổi lại theo scale mới + left/top mới) phải VẪN Ở (500, 300).
    const canvasX = 476;
    const canvasY = 276;
    const screenX = left + canvasX * zoom;
    const screenY = top + canvasY * zoom;
    expect(screenX).toBeCloseTo(500, 0);
    expect(screenY).toBeCloseTo(300, 0);
    void w;
    void h;
  });
});

describe('Canvas — item KHÔNG phóng to nhanh hơn canvas khi zoom (bug ảnh chụp 2026-07-17 lần 3: item chiếm tỉ lệ ngày càng lớn so với canvas khi zoom lên)', () => {
  function contentWithItem(): LayoutContent {
    return {
      variants: [
        {
          // refW/refH KHÁC DESIGN_W/DESIGN_H (760×428) để lộ rõ nếu công thức nhân sai thêm 1
          // lớp scale — dùng đúng tỷ lệ 16:9 điển hình 1920×1080 như blueprint thật.
          aspect: { id: '16:9', w: 16, h: 9 },
          refW: 1920,
          refH: 1080,
          background: { kind: 'color', color: '#201748' },
          items: [{ id: 'box', type: 'shape', box: { x: 100, y: 100, w: 200, h: 100 }, shape: 'rect', fill: '#fff' }],
        },
      ],
    };
  }

  function getArtEl(container: HTMLElement) {
    return container.querySelector('[data-testid="canvas-frame"]') as HTMLElement;
  }
  function getItemEl(container: HTMLElement) {
    return container.querySelector('[style*="cursor: move"]') as HTMLElement;
  }

  it('tỉ lệ (item.width / artEl.width GỐC 760) giữ NGUYÊN khi zoom lên — vì cả 2 cùng nằm trong 1 lớp transform:scale() duy nhất', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithItem()} />);
    const containerEl = mockContainerRect(container);

    // TRƯỚC khi zoom (zoom=1): item.width hiển thị (style, TRƯỚC transform) tính theo
    // layoutScaleX = DESIGN_W/refW = 760/1920. box.w=200 → 200*760/1920 ≈ 79.17px.
    const itemElBefore = getItemEl(container);
    const widthBefore = parseFloat(itemElBefore.style.width);
    expect(widthBefore).toBeCloseTo((200 * DESIGN_W_TEST) / 1920, 1);

    // Zoom lên 2 lần liên tiếp (Ctrl+scroll) quanh tâm container.
    fireEvent.wheel(containerEl, { deltaY: -100, ctrlKey: true, clientX: 404, clientY: 238 });
    fireEvent.wheel(containerEl, { deltaY: -100, ctrlKey: true, clientX: 404, clientY: 238 });

    // SAU khi zoom: style.width của item KHÔNG ĐƯỢC ĐỔI (vẫn ~79.17px) — vì artEl cha đã tự
    // transform:scale() phóng to CẢ item lẫn canvas cùng lúc, đúng tỉ lệ. Nếu bug tái diễn (nhân
    // thêm totalScale vào style.width của item), giá trị này sẽ tăng vọt theo zoom (SAI).
    const itemElAfter = getItemEl(container);
    const widthAfter = parseFloat(itemElAfter.style.width);
    expect(widthAfter).toBeCloseTo(widthBefore, 1);

    // Xác nhận artEl'S OWN kích thước GỐC (trước transform) cũng KHÔNG đổi theo zoom — chỉ có
    // transform:scale() phóng to lúc HIỂN THỊ, không phải style.width/height thay đổi.
    const artEl = getArtEl(container);
    expect(parseFloat(artEl.style.width)).toBe(DESIGN_W_TEST);
    expect(parseFloat(artEl.style.height)).toBe(DESIGN_H_TEST);
    // scale trong transform phải phản ánh đúng zoom đã tăng (fitScale=1 × zoom=1.21).
    expect(artEl.style.transform).toContain('scale(1.21');
  });
});

describe('Canvas — nút zoom +/- và reset', () => {
  it('bấm nút "+" → tăng zoom theo bước cố định', () => {
    render(<LayoutDesignerApp content={emptyContent()} />);
    fireEvent.click(screen.getByLabelText('Phóng to'));
    expect(screen.getByText('110%')).toBeTruthy();
  });

  it('bấm nút "−" → giảm zoom theo bước cố định', () => {
    render(<LayoutDesignerApp content={emptyContent()} />);
    fireEvent.click(screen.getByLabelText('Thu nhỏ'));
    expect(screen.getByText('91%')).toBeTruthy();
  });

  it('bấm nhãn % (giữa) → đặt lại zoom về 100%', () => {
    render(<LayoutDesignerApp content={emptyContent()} />);
    fireEvent.click(screen.getByLabelText('Phóng to'));
    fireEvent.click(screen.getByLabelText('Phóng to'));
    expect(screen.queryByText('100%')).toBeNull();

    fireEvent.click(screen.getByLabelText('Đặt lại zoom 100%'));
    expect(screen.getByText('100%')).toBeTruthy();
  });
});
