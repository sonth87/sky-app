import { beforeEach, describe, expect, it } from 'vitest';
import { render, fireEvent, screen, within } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 760 + 48, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 428 + 48, configurable: true });
});

function oneVariantContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '16:9', w: 16, h: 9, label: '16:9' },
        refW: 1920,
        refH: 1080,
        items: [{ id: 'a', type: 'text', box: { x: 10, y: 10, w: 100, h: 30 }, content: 'Chỉ ở 16:9', fontSize: 20 }],
      },
    ],
  };
}

function twoVariantContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '16:9', w: 16, h: 9, label: '16:9' },
        refW: 1920,
        refH: 1080,
        items: [{ id: 'a', type: 'text', box: { x: 10, y: 10, w: 100, h: 30 }, content: 'Nội dung 16:9', fontSize: 20 }],
      },
      {
        aspect: { id: '21:9', w: 21, h: 9, label: '21:9' },
        refW: 2520,
        refH: 1080,
        items: [{ id: 'b', type: 'text', box: { x: 10, y: 10, w: 100, h: 30 }, content: 'Nội dung 21:9', fontSize: 20 }],
      },
    ],
  };
}

describe('VariantTabs — chuyển đổi biến thể', () => {
  it('mặc định hiện tab của variant đầu tiên, canvas render đúng nội dung variant đó', () => {
    render(<LayoutDesignerApp content={twoVariantContent()} />);
    expect(screen.getByText('16:9')).toBeTruthy();
    expect(screen.getByText('21:9')).toBeTruthy();
    expect(screen.getByText('Nội dung 16:9')).toBeTruthy();
    expect(screen.queryByText('Nội dung 21:9')).toBeNull();
  });

  it('click tab 21:9 → canvas chuyển sang hiện nội dung của variant 21:9', () => {
    render(<LayoutDesignerApp content={twoVariantContent()} />);
    fireEvent.click(screen.getByText('21:9'));

    expect(screen.getByText('Nội dung 21:9')).toBeTruthy();
    expect(screen.queryByText('Nội dung 16:9')).toBeNull();
  });

  it('chỉ 1 variant → KHÔNG hiện nút xoá trên tab (không cho xoá variant cuối cùng)', () => {
    render(<LayoutDesignerApp content={oneVariantContent()} />);
    expect(screen.queryByLabelText(/^Xoá tỷ lệ/)).toBeNull();
  });

  it('click tab 21:9 → mở popover 3 nút, bấm "Xoá" trong popover + confirm → chỉ còn tab 16:9, tự chuyển active về 16:9', () => {
    render(<LayoutDesignerApp content={twoVariantContent()} />);
    // Click tab (BẤT KỲ, kể cả chưa active) → LUÔN mở popover 3 nút (đổi 2026-07-18 mới nhất,
    // thay cho icon hover riêng lẻ trước đó).
    fireEvent.click(screen.getByText('21:9'));
    fireEvent.click(screen.getByText('Xoá'));
    // Confirm 1 lớp xuất hiện (trước đó xoá ngay không hỏi) — phải xác nhận thêm 1 lần.
    expect(screen.getByText('Xoá tỷ lệ 21:9?')).toBeTruthy();
    fireEvent.click(screen.getByText('Xoá')); // nút Xoá trong RemoveVariantConfirm

    expect(screen.queryByText('21:9')).toBeNull();
    expect(screen.getByText('Nội dung 16:9')).toBeTruthy();
  });

  it('mở popover 3 nút, bấm Xoá rồi bấm Huỷ ở confirm → KHÔNG xoá, variant vẫn còn', () => {
    render(<LayoutDesignerApp content={twoVariantContent()} />);
    fireEvent.click(screen.getByText('21:9'));
    fireEvent.click(screen.getByText('Xoá'));
    fireEvent.click(screen.getByText('Huỷ'));

    expect(screen.getByText('21:9')).toBeTruthy(); // vẫn còn
  });

  it('hover vào tab → hover highlight (background đổi khác transparent)', () => {
    render(<LayoutDesignerApp content={twoVariantContent()} />);
    const tab21 = screen.getByText('21:9').closest('div')!;
    expect(tab21.style.background).toBe('transparent'); // chưa hover

    fireEvent.mouseEnter(tab21);
    expect(tab21.style.background).not.toBe('transparent'); // đã hover, có highlight

    fireEvent.mouseLeave(tab21);
    expect(tab21.style.background).toBe('transparent'); // rời chuột, hết highlight
  });

  it('click tab → mở popover 3 nút, click RA NGOÀI (backdrop) → popover đóng hẳn, KHÔNG tự mở lại (bug hồi quy 2026-07-18: backdrop lồng trong div tab có onClick riêng, thiếu stopPropagation khiến event bubble lên tab cha mở lại popover ngay sau khi đóng)', () => {
    render(<LayoutDesignerApp content={twoVariantContent()} />);
    fireEvent.click(screen.getByText('21:9'));
    expect(screen.getByText('Đổi tỷ lệ')).toBeTruthy(); // popover 3 nút đã mở

    // Backdrop là phần tử position:absolute inset:-1000px NGAY TRƯỚC popover trong DOM — click
    // thẳng vào nó (không phải vào nút bên trong popover) mô phỏng "click ra ngoài".
    const backdrop = document.querySelector('[style*="inset: -1000px"]') as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);

    expect(screen.queryByText('Đổi tỷ lệ')).toBeNull(); // popover phải đóng HẲN, không mở lại
  });
});

describe('AddVariantModal — thêm tỷ lệ mới qua nút +', () => {
  it('bấm + → mở modal, hiện danh sách preset, disable preset đã dùng (16:9)', () => {
    render(<LayoutDesignerApp content={oneVariantContent()} />);
    fireEvent.click(screen.getByLabelText('Thêm tỷ lệ'));

    const used = screen.getByText('16:9 — Màn hình rộng').closest('button') as HTMLButtonElement;
    expect(used.disabled).toBe(true);

    const available = screen.getByText('4:3 — Tiêu chuẩn').closest('button') as HTMLButtonElement;
    expect(available.disabled).toBe(false);
  });

  it('hover vào 1 preset khả dụng → hover highlight (background đổi khác transparent), rời chuột → hết highlight (review 2026-07-18: "khi bật phần chọn thay đổi tỷ lệ màn hình thì cho trạng thái hover đi")', () => {
    render(<LayoutDesignerApp content={oneVariantContent()} />);
    fireEvent.click(screen.getByLabelText('Thêm tỷ lệ'));

    const available = screen.getByText('4:3 — Tiêu chuẩn').closest('button') as HTMLButtonElement;
    expect(available.style.background).toBe('transparent'); // chưa hover

    fireEvent.mouseEnter(available);
    expect(available.style.background).not.toBe('transparent'); // đã hover, có highlight

    fireEvent.mouseLeave(available);
    expect(available.style.background).toBe('transparent'); // rời chuột, hết highlight
  });

  it('hover vào preset ĐÃ DÙNG (disabled) → KHÔNG hiện highlight', () => {
    render(<LayoutDesignerApp content={oneVariantContent()} />);
    fireEvent.click(screen.getByLabelText('Thêm tỷ lệ'));

    const used = screen.getByText('16:9 — Màn hình rộng').closest('button') as HTMLButtonElement;
    fireEvent.mouseEnter(used);
    expect(used.style.background).toBe('transparent');
  });

  it('chọn preset 4:3 từ modal → thêm variant mới, tab hiện gọn "4:3" (không phải label dài trong modal)', () => {
    render(<LayoutDesignerApp content={oneVariantContent()} />);
    fireEvent.click(screen.getByLabelText('Thêm tỷ lệ'));
    fireEvent.click(screen.getByText('4:3 — Tiêu chuẩn'));

    // Modal đóng, tab mới xuất hiện và active (canvas trống — variant mới không có item nào).
    expect(screen.queryByText('4:3 — Tiêu chuẩn')).toBeNull(); // modal đã đóng
    expect(screen.getAllByText('4:3').length).toBeGreaterThan(0); // tab mới hiện gọn "4:3"
    expect(screen.queryByText('Chỉ ở 16:9')).toBeNull(); // canvas đã chuyển sang variant mới (trống)
  });

  it('nhập tỷ lệ tuỳ chỉnh (5:2) → thêm variant custom mới, tab hiện gọn "5:2"', () => {
    render(<LayoutDesignerApp content={oneVariantContent()} />);
    fireEvent.click(screen.getByLabelText('Thêm tỷ lệ'));

    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    fireEvent.change(inputs[0]!, { target: { value: '5' } });
    fireEvent.change(inputs[1]!, { target: { value: '2' } });
    fireEvent.click(screen.getByText('Thêm'));

    expect(screen.getByText('5:2')).toBeTruthy();
  });

  it('nút Thêm (custom) bị disable khi chưa nhập đủ W/H', () => {
    render(<LayoutDesignerApp content={oneVariantContent()} />);
    fireEvent.click(screen.getByLabelText('Thêm tỷ lệ'));

    const addBtn = screen.getByText('Thêm').closest('button') as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
  });

  it('undo sau khi thêm variant → quay lại đúng 1 variant ban đầu', () => {
    const { container } = render(<LayoutDesignerApp content={oneVariantContent()} />);
    fireEvent.click(screen.getByLabelText('Thêm tỷ lệ'));
    fireEvent.click(screen.getByText('4:3 — Tiêu chuẩn'));
    expect(screen.getAllByText('4:3').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText('Hoàn tác'));
    expect(screen.queryByText('4:3')).toBeNull();
    expect(screen.getByText('Chỉ ở 16:9')).toBeTruthy();
    void container;
  });
});

describe('CopyVariantPopover — tích hợp qua VariantTabs (Giai đoạn 2.6)', () => {
  it('chỉ 1 variant → mở popover 3 nút, KHÔNG hiện mục "Copy từ tỷ lệ khác" (cần ít nhất 1 nguồn khác)', () => {
    render(<LayoutDesignerApp content={oneVariantContent()} />);
    fireEvent.click(screen.getByText('16:9'));
    expect(screen.queryByText('Copy từ tỷ lệ khác')).toBeNull();
  });

  it('click tab → mở popover 3 nút, bấm "Copy từ tỷ lệ khác" → mở popover Copy, KHÔNG kích hoạt chuyển tab về đích lúc mở popover chính', () => {
    render(<LayoutDesignerApp content={twoVariantContent()} />);
    // Click tab 21:9 (đổi 2026-07-18 mới nhất: click BẤT KỲ tab nào — kể cả chưa active — vừa
    // chuyển active vừa mở popover 3 nút).
    fireEvent.click(screen.getByText('21:9'));
    fireEvent.click(screen.getByText('Copy từ tỷ lệ khác'));

    expect(screen.getByText('Copy từ tỷ lệ khác')).toBeTruthy(); // popover Copy mở (tiêu đề trùng tên nút, vẫn tìm thấy)
  });

  it('copy chế độ "chỉ thêm cái chưa có" qua UI thật → item mới xuất hiện ở đích', () => {
    render(<LayoutDesignerApp content={twoVariantContent()} />);
    fireEvent.click(screen.getByText('21:9'));
    fireEvent.click(screen.getByText('Copy từ tỷ lệ khác'));
    // Mặc định chọn nguồn đầu tiên (16:9) — mode mặc định "add-missing".
    fireEvent.click(screen.getByText('Copy'));

    fireEvent.click(screen.getByText('21:9')); // chuyển sang xem variant đích (mở lại popover, không sao)
    expect(screen.getByText('Nội dung 16:9')).toBeTruthy(); // item mới copy từ 16:9 xuất hiện ở 21:9
    expect(screen.getByText('Nội dung 21:9')).toBeTruthy(); // item cũ vẫn còn
  });

  it('sửa item ở NGUỒN sau khi copy → item COPY tự đổi theo (auto-sync liên kết cha-con)', () => {
    const { container } = render(<LayoutDesignerApp content={twoVariantContent()} />);
    fireEvent.click(screen.getByText('21:9'));
    fireEvent.click(screen.getByText('Copy từ tỷ lệ khác'));
    fireEvent.click(screen.getByText('Copy')); // add-missing mặc định, nguồn 16:9

    // Click tab (đổi 2026-07-18 mới nhất) giờ VỪA chuyển active VỪA mở popover 3 nút — sau khi
    // copy xong đang active ở 21:9 (đích), phải click tab "16:9" để quay lại NGUỒN trước khi sửa.
    fireEvent.click(screen.getByText('16:9'));

    // Sửa item nguồn (16:9) qua PropertyPanel — chọn item TRÊN CANVAS (phần tử đầu tiên khớp,
    // vì đang ở variant 16:9 nên chỉ có item nguồn hiện, không lẫn với item copy ở 21:9).
    const sourceItemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    fireEvent.pointerDown(sourceItemEl, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(sourceItemEl, { clientX: 50, clientY: 50 });

    // Textarea trong PropertyPanel — lấy theo role, tránh trùng với text hiển thị trên canvas.
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe('Nội dung 16:9');
    fireEvent.change(textarea, { target: { value: 'Đã sửa ở nguồn' } });
    expect(textarea.value).toBe('Đã sửa ở nguồn');

    // Kiểm tra NGAY tại variant nguồn (16:9, chưa chuyển tab) — item trên canvas + textarea đều
    // hiện giá trị mới (2 chỗ khớp: canvas item và property panel textarea không tính, dùng getAll).
    expect(screen.getAllByText('Đã sửa ở nguồn').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('21:9')); // chuyển sang variant đích xem kết quả
    expect(screen.getAllByText('Đã sửa ở nguồn').length).toBeGreaterThan(0); // bản copy tự đổi theo
  });
});

describe('Đổi tỷ lệ — tích hợp qua VariantTabs (review 2026-07-18)', () => {
  it('click tab → mở popover 3 nút, bấm "Đổi tỷ lệ" → mở modal → chọn 4:3 → tab đổi thành 4:3, GIỮ NGUYÊN item cũ', () => {
    render(<LayoutDesignerApp content={oneVariantContent()} />);
    fireEvent.click(screen.getByText('16:9'));
    fireEvent.click(screen.getByText('Đổi tỷ lệ'));

    expect(screen.getByText('Đổi tỷ lệ (hiện tại: 16:9)')).toBeTruthy();
    fireEvent.click(screen.getByText('4:3 — Tiêu chuẩn'));

    expect(screen.queryByText('16:9')).toBeNull(); // tab cũ không còn
    expect(screen.getByText('4:3')).toBeTruthy(); // tab đổi thành 4:3
    expect(screen.getByText('Chỉ ở 16:9')).toBeTruthy(); // item CŨ vẫn còn (không tạo bản sao/mất data)
  });

  it('undo sau khi đổi tỷ lệ → quay lại đúng tỷ lệ cũ', () => {
    render(<LayoutDesignerApp content={oneVariantContent()} />);
    fireEvent.click(screen.getByText('16:9'));
    fireEvent.click(screen.getByText('Đổi tỷ lệ'));
    fireEvent.click(screen.getByText('4:3 — Tiêu chuẩn'));
    expect(screen.getByText('4:3')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Hoàn tác'));
    expect(screen.getByText('16:9')).toBeTruthy();
    expect(screen.queryByText('4:3')).toBeNull();
  });

  it('chỉ 1 variant → popover 3 nút VẪN hiện mục "Đổi tỷ lệ" (khác Copy/Xoá cần ≥2 variant)', () => {
    render(<LayoutDesignerApp content={oneVariantContent()} />);
    fireEvent.click(screen.getByText('16:9'));
    expect(screen.getByText('Đổi tỷ lệ')).toBeTruthy();
  });
});
