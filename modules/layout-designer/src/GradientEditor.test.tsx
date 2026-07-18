import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GradientEditor } from './GradientEditor.js';

describe('GradientEditor — parse CSS gradient string hiện có', () => {
  it('render đúng loại Linear + góc độ từ CSS ban đầu', () => {
    render(<GradientEditor value="linear-gradient(150deg, rgba(243, 115, 32, 1) 0%, rgba(255, 255, 255, 1) 45%, rgba(33, 63, 153, 1) 100%)" onChange={vi.fn()} />);

    const linearBtn = screen.getByText('Linear').closest('button')!;
    expect(linearBtn.style.color).toBe('var(--accent-color, #4b57e6)'); // đang active
    expect(screen.getByDisplayValue('150')).toBeTruthy(); // input góc độ
  });

  it('render đúng 3 stop với offset đúng (0%, 45%, 100%)', () => {
    render(<GradientEditor value="linear-gradient(150deg, rgba(243, 115, 32, 1) 0%, rgba(255, 255, 255, 1) 45%, rgba(33, 63, 153, 1) 100%)" onChange={vi.fn()} />);

    // Mỗi offset giờ xuất hiện Ở NHIỀU NƠI: hàng số dưới track (mới, review 2026-07-18) + danh
    // sách Stops — "0"/"45" không trùng panel Hex (RGBA "A" mặc định 100 CHỈ đụng "100") nhưng
    // vẫn trùng giữa track-label và Stops nên dùng getAllByDisplayValue cho cả 3.
    expect(screen.getAllByDisplayValue('0').length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue('45').length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue('100').length).toBeGreaterThan(0);
  });

  it('CSS không hợp lệ → fail-soft về gradient mặc định, KHÔNG throw', () => {
    expect(() => render(<GradientEditor value="không phải gradient hợp lệ" onChange={vi.fn()} />)).not.toThrow();
  });

  it('value rỗng → fail-soft về gradient mặc định', () => {
    expect(() => render(<GradientEditor value="" onChange={vi.fn()} />)).not.toThrow();
  });
});

describe('GradientEditor — chỉnh sửa qua UI → build lại CSS string đúng', () => {
  it('đổi sang Radial → onChange nhận CSS "radial-gradient(circle, ...)"', () => {
    const onChange = vi.fn();
    render(<GradientEditor value="linear-gradient(135deg, #201748 0%, #4b57e6 100%)" onChange={onChange} />);

    fireEvent.click(screen.getByText('Radial'));

    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('radial-gradient(circle,'));
  });

  it('đổi góc độ → onChange nhận CSS với góc mới', () => {
    const onChange = vi.fn();
    render(<GradientEditor value="linear-gradient(135deg, #201748 0%, #4b57e6 100%)" onChange={onChange} />);

    const angleInput = screen.getByDisplayValue('135');
    fireEvent.change(angleInput, { target: { value: '90' } });

    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('90deg'));
  });

  it('sửa hex của stop đang chọn → onChange nhận CSS với màu mới ở đúng vị trí', () => {
    const onChange = vi.fn();
    render(<GradientEditor value="linear-gradient(135deg, #201748 0%, #4b57e6 100%)" onChange={onChange} />);

    // "#201748" xuất hiện ở CẢ panel Hex (stop đang chọn) LẪN danh sách Stops (input riêng của
    // từng stop) — input Hex ở panel trên là phần tử ĐẦU TIÊN trong DOM order.
    const hexInputs = screen.getAllByDisplayValue('#201748');
    fireEvent.change(hexInputs[0]!, { target: { value: '#ff0000' } });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as string;
    expect(lastCall).toContain('255, 0, 0');
  });

  it('sửa offset của 1 stop trong danh sách STOPS → onChange nhận CSS với offset mới', () => {
    const onChange = vi.fn();
    render(<GradientEditor value="linear-gradient(135deg, #201748 0%, #4b57e6 100%)" onChange={onChange} />);

    // "100" trùng giữa panel Hex (RGBA "A" mặc định 100) và Stops (offset 100%) — input offset
    // trong danh sách Stops là type="number" với max=100, còn "A" cũng type="number" max=100 nên
    // không phân biệt được qua thuộc tính; lấy phần tử CUỐI (Stops render SAU panel Hex trong DOM).
    const offsetInputs = screen.getAllByDisplayValue('100');
    fireEvent.change(offsetInputs[offsetInputs.length - 1]!, { target: { value: '80' } });

    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('80%'));
  });

  it('xoá 1 stop khi còn ≥3 stop → còn lại 2 stop', () => {
    const onChange = vi.fn();
    render(<GradientEditor value="linear-gradient(150deg, #f37320 0%, #ffffff 45%, #213f99 100%)" onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('Xoá điểm dừng 45%'));

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as string;
    // Đếm số dấu "%" xuất hiện trong CSS đủ để suy ra còn 2 stop (mỗi stop có đúng 1 "N%").
    expect((lastCall.match(/%/g) ?? []).length).toBe(2);
  });

  it('chỉ còn 2 stop → nút xoá bị disable (không cho xoá xuống dưới 2)', () => {
    render(<GradientEditor value="linear-gradient(135deg, #201748 0%, #4b57e6 100%)" onChange={vi.fn()} />);

    const deleteButtons = screen.getAllByRole('button', { name: /^Xoá điểm dừng/ });
    for (const btn of deleteButtons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('click vào dải preview (KHÔNG trúng handle có sẵn) → thêm 1 stop mới', () => {
    const onChange = vi.fn();
    const { container } = render(<GradientEditor value="linear-gradient(135deg, #201748 0%, #4b57e6 100%)" onChange={onChange} />);

    const bar = container.querySelector('[style*="cursor: copy"]') as HTMLElement;
    bar.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 32, width: 200, height: 32, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
    fireEvent.click(bar, { clientX: 100, clientY: 16 }); // giữa dải → offset ~50%

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as string;
    expect((lastCall.match(/%/g) ?? []).length).toBe(3); // 0%, 50% (mới), 100%
  });

  it('click/kéo TRÚNG 1 handle có sẵn → CHỈ đổi offset của handle đó, KHÔNG thêm stop mới (bug hồi quy 2026-07-18: pointerdown→pointerup nhanh trên handle tự sinh thêm sự kiện click bubble lên bar cha, bị hiểu nhầm thành "click vào dải trống")', () => {
    const onChange = vi.fn();
    const { container } = render(<GradientEditor value="linear-gradient(135deg, #201748 0%, #4b57e6 100%)" onChange={onChange} />);

    const bar = container.querySelector('[style*="cursor: copy"]') as HTMLElement;
    bar.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 32, width: 200, height: 32, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
    const handle = container.querySelector('[style*="cursor: grab"]') as HTMLElement;
    expect(handle).toBeTruthy();

    // Mô phỏng "click và giữ để drag" — pointerdown rồi pointerup GẦN NHƯ NGAY (không di chuyển
    // nhiều), đúng kiểu thao tác user báo lỗi. fireEvent.click SAU pointerdown/pointerup mô phỏng
    // đúng hành vi trình duyệt thật (browser tự tổng hợp click sau cặp pointerdown+pointerup
    // nhanh trên cùng phần tử — jsdom không tự làm việc này nên phải fire thủ công).
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 16, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 0, clientY: 16, pointerId: 1 });
    fireEvent.click(handle, { clientX: 0, clientY: 16 });

    // KHÔNG có onChange nào được gọi thêm ngoài (nếu có) từ chính thao tác kéo hợp lệ — số lượng
    // stop vẫn PHẢI là 2 (không bị thêm "stop thứ 3" do click lọt qua bubble lên bar).
    if (onChange.mock.calls.length > 0) {
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as string;
      expect((lastCall.match(/%/g) ?? []).length).toBe(2);
    }
  });
});

describe('GradientEditor — popover Colorful khi bấm swatch màu ở dòng Stops', () => {
  it('bấm swatch → mở popover Colorful (yêu cầu 2026-07-18: "khi stop ấn vào color thì cũng bật lên cái color picker")', () => {
    render(<GradientEditor value="linear-gradient(135deg, #201748 0%, #4b57e6 100%)" onChange={vi.fn()} />);

    const swatchButtons = screen.getAllByLabelText(/^Chọn màu điểm dừng/);
    expect(swatchButtons.length).toBe(2);
    fireEvent.click(swatchButtons[0]!);

    // Colorful render 1 saturation-box (theo class riêng của @uiw/react-color-colorful) — kiểm
    // tra qua số lượng input color/text tăng lên (Colorful KHÔNG dùng input type=color, nhưng có
    // đủ picker element) — đơn giản nhất là xác nhận backdrop popover đã xuất hiện trong DOM.
    const backdrops = document.querySelectorAll('[style*="inset: -1000px"]');
    expect(backdrops.length).toBeGreaterThan(0);
  });

  it('bấm swatch lần 2 (đang mở) → đóng popover (toggle)', () => {
    render(<GradientEditor value="linear-gradient(135deg, #201748 0%, #4b57e6 100%)" onChange={vi.fn()} />);

    const swatchButtons = screen.getAllByLabelText(/^Chọn màu điểm dừng/);
    fireEvent.click(swatchButtons[0]!);
    expect(document.querySelectorAll('[style*="inset: -1000px"]').length).toBeGreaterThan(0);

    fireEvent.click(swatchButtons[0]!);
    // Backdrop CỦA POPOVER SWATCH đã đóng — không còn thêm phần tử nào khớp sau lần bấm thứ 2
    // (đếm KHÔNG tăng thêm, dù có thể vẫn còn backdrop khác không liên quan trong DOM).
    const countAfterToggleOff = document.querySelectorAll('[style*="inset: -1000px"]').length;
    fireEvent.click(swatchButtons[0]!); // mở lại lần nữa để so sánh baseline tăng đúng 1
    const countAfterReopen = document.querySelectorAll('[style*="inset: -1000px"]').length;
    expect(countAfterReopen).toBeGreaterThan(countAfterToggleOff);
  });

  it('click ra ngoài popover swatch → đóng đúng, backdrop biến mất khỏi DOM', () => {
    render(<GradientEditor value="linear-gradient(135deg, #201748 0%, #4b57e6 100%)" onChange={vi.fn()} />);

    const swatchButtons = screen.getAllByLabelText(/^Chọn màu điểm dừng/);
    fireEvent.click(swatchButtons[0]!);
    const backdrop = document.querySelector('[style*="inset: -1000px"]') as HTMLElement;
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop);

    expect(document.querySelectorAll('[style*="inset: -1000px"]').length).toBe(0);
  });
});

describe('GradientEditor — kéo (mousedown+mousemove) trong Saturation của Colorful thực sự đổi màu (bug hồi quy 2026-07-18: "không thấy drag được để thay đổi màu")', () => {
  it('kéo trong Saturation box của StopColorPicker → onChange nhận CSS với màu ĐÃ ĐỔI (không giữ nguyên màu gốc)', () => {
    const onChange = vi.fn();
    const { container } = render(<GradientEditor value="linear-gradient(135deg, #201748 0%, #4b57e6 100%)" onChange={onChange} />);

    // '.w-color-saturation' là class nội bộ của @uiw/react-color-colorful's <Saturation>.
    const saturationEl = container.querySelector('.w-color-saturation') as HTMLElement;
    expect(saturationEl).toBeTruthy();
    saturationEl.getBoundingClientRect = () => ({ left: 0, top: 0, right: 168, bottom: 168, width: 168, height: 168, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    fireEvent.mouseDown(saturationEl, { clientX: 50, clientY: 50, pageX: 50, pageY: 50 });
    fireEvent.mouseMove(window, { clientX: 100, clientY: 60, pageX: 100, pageY: 60, buttons: 1 });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as string;
    // #201748 = rgb(32, 23, 72) — nguyên nhân bug gốc: StopColorPicker gọi 2 callback riêng
    // (onChangeColor rồi onChangeAlpha) trong CÙNG 1 lượt xử lý sự kiện, cả 2 đều đọc closure
    // `parsed` (state) CŨ vì React chưa kịp re-render giữa 2 lệnh dispatch đồng bộ — lệnh THỨ HAI
    // (alpha, không đổi) ghi đè mất thay đổi màu của lệnh THỨ NHẤT. Fix: gộp thành 1 patch, dispatch
    // đúng 1 lần (xem onChange prop mới của StopColorPicker/SwatchColorPopover).
    expect(lastCall).not.toContain('32, 23, 72');
  });

  it('kéo trong Saturation box của SwatchColorPopover (mở từ dòng Stops) → cũng đổi màu đúng', () => {
    const onChange = vi.fn();
    render(<GradientEditor value="linear-gradient(135deg, #201748 0%, #4b57e6 100%)" onChange={onChange} />);

    const swatchButtons = screen.getAllByLabelText(/^Chọn màu điểm dừng/);
    fireEvent.click(swatchButtons[0]!);

    const saturationEls = document.querySelectorAll('.w-color-saturation');
    // 2 khối Saturation cùng hiện: 1 ở StopColorPicker (panel chính), 1 ở SwatchColorPopover vừa
    // mở — lấy phần tử CUỐI (popover render sau, đứng sau trong DOM order).
    const popoverSaturationEl = saturationEls[saturationEls.length - 1] as HTMLElement;
    popoverSaturationEl.getBoundingClientRect = () => ({ left: 0, top: 0, right: 168, bottom: 168, width: 168, height: 168, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    fireEvent.mouseDown(popoverSaturationEl, { clientX: 50, clientY: 50, pageX: 50, pageY: 50 });
    fireEvent.mouseMove(window, { clientX: 100, clientY: 60, pageX: 100, pageY: 60, buttons: 1 });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as string;
    expect(lastCall).not.toContain('32, 23, 72');
  });
});

describe('GradientEditor — kéo Hue slider gần biên phải (bug hồi quy 2026-07-18: "kéo hết phần dải màu sang bên phải thì nó tự nhảy về đầu")', () => {
  it('kéo Hue tới gần cuối track (gần 360°, cùng hex với điểm bắt đầu đỏ thuần) → con trỏ Hue KHÔNG bị kéo giật về đầu track', () => {
    function Wrapper() {
      const [v, setV] = useState('linear-gradient(135deg, #ff0000 0%, #4b57e6 100%)');
      return <GradientEditor value={v} onChange={(css: string) => setV(css)} />;
    }
    const { container } = render(<Wrapper />);

    const hueWrapper = container.querySelector('.w-color-hue') as HTMLElement;
    const interactiveEl = hueWrapper.querySelector('[tabindex="0"]') as HTMLElement;
    interactiveEl.getBoundingClientRect = () => ({ left: 0, top: 0, right: 168, bottom: 24, width: 168, height: 24, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    fireEvent.mouseDown(interactiveEl, { clientX: 84, clientY: 12, pageX: 84, pageY: 12 });
    // Kéo TỪ TỪ (nhiều bước mousemove liên tiếp, mỗi bước qua 1 lượt React re-render — mô phỏng
    // đúng thao tác rê chuột thật) tới GẦN biên phải nhưng CHƯA vượt hẳn (355°, vẫn trong track).
    for (let x = 84; x <= 165; x += 5) {
      fireEvent.mouseMove(window, { clientX: x, clientY: 12, pageX: x, pageY: 12, buttons: 1 });
    }

    // Nguyên nhân bug gốc: mỗi lần Colorful.onChange bắn ra, component TÍNH LẠI hsva bằng
    // hexToHsva(hex) — nhưng hex ở hue≈355-360° cho ra CÙNG giá trị hex với hue=0° (đỏ thuần),
    // hexToHsva LUÔN trả h=0 (không bao giờ ra 360) → con trỏ bị "kéo giật" về ĐẦU track dù user
    // đang kéo về CUỐI. Fix: giữ hsva trong state nội bộ (StopColorPicker/SwatchColorPopover),
    // không suy lại từ hex mỗi render.
    const pointerEl = hueWrapper.querySelector('[style*="translate(-16px, -5px)"]') as HTMLElement;
    const leftPercent = parseFloat(pointerEl?.style.left ?? '0');
    expect(leftPercent).toBeGreaterThan(90); // con trỏ PHẢI ở gần cuối track, không nhảy về 0%
  });
});

describe('GradientEditor — đồng bộ lại khi value đổi TỪ BÊN NGOÀI', () => {
  it('đổi prop value (VD undo/redo) → UI hiện đúng gradient mới', () => {
    const { rerender } = render(<GradientEditor value="linear-gradient(135deg, #201748 0%, #4b57e6 100%)" onChange={vi.fn()} />);
    expect(screen.getAllByDisplayValue('#201748').length).toBeGreaterThan(0);

    rerender(<GradientEditor value="linear-gradient(90deg, #ff0000 0%, #00ff00 100%)" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('90')).toBeTruthy();
    expect(screen.getAllByDisplayValue('#ff0000').length).toBeGreaterThan(0);
  });
});
