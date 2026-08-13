---
status: completed
target_version: layout-designer-v0.16.0
completed_date: 2026-08-06
---

# GĐ12 — Text tự co chữ khi tràn khung (`overflow: 'shrink'`) — cài thật

## Bối cảnh & phạm vi lỗi hiện tại

`renderer.tsx:177-178`:
```ts
overflow: item.overflow === 'clip' ? 'hidden' : undefined,
whiteSpace: item.overflow === 'wrap' ? 'pre-wrap' : 'pre',
```
`'shrink'` không khớp case nào → rơi vào `whiteSpace: 'pre'` (không xuống dòng, không co) — chữ
dài tràn thẳng ra ngoài box, KHÔNG co font-size. Y hệt trong `Canvas/ItemContent.tsx`'s tương
đương (cần xác nhận đúng dòng khi code, nhưng cùng bug pattern).

## Thiết kế thuật toán — ĐÃ CHỐT, không còn điểm mở

### Phát hiện quan trọng giúp đơn giản hoá đáng kể: đo lường KHÔNG bị ảnh hưởng bởi zoom/rotation

`scrollHeight`/`clientHeight`/`scrollWidth`/`clientWidth` của 1 phần tử DOM phản ánh kích thước
LAYOUT-BOX trong không gian TOẠ ĐỘ RIÊNG của nó — CSS `transform` (dùng cho zoom canvas qua
`totalScale` trên `artEl` cha, và cho `rotation` trên từng item) là phép biến đổi ở PAINT TIME,
KHÔNG tham gia layout, nên KHÔNG làm thay đổi các giá trị này. Hệ quả: tỷ lệ "nội dung có tràn
khung hay không" tính được ỔN ĐỊNH dù canvas đang zoom bao nhiêu % hay item đang xoay bao nhiêu
độ — **không cần ResizeObserver theo dõi kích thước PIXEL THẬT trên màn hình, chỉ cần effect
chạy lại khi các PROP LOGIC đổi** (content/box.w/box.h/fontSize gốc/fontFamily/fontWeight/
lineHeight). Đây là điểm mấu chốt giúp implementation NHẸ, không cần observer liên tục.

### Hook dùng chung — API đã chốt

```ts
// packages/slide-shared/src/layout/useAutoFitFontSize.ts
export interface AutoFitInput {
  text: string; // plain text HOẶC innerHTML string — dùng để làm dependency-key, không parse
  boxWidthPx: number;
  boxHeightPx: number;
  requestedFontSizePx: number; // giá trị fontSize ĐÃ nhân fScale, sẵn sàng gán CSS
  minFontSizePx: number; // = requestedFontSizePx * 0.4 (xem quyết định dưới), tính ở nơi gọi
  wrap: boolean; // true nếu whiteSpace sẽ là 'pre-wrap' (item.overflow !== 'clip' logic khác)
  enabled: boolean; // chỉ true khi item.overflow === 'shrink'
}

export function useAutoFitFontSize(ref: RefObject<HTMLElement>, input: AutoFitInput): number {
  const [fontSizePx, setFontSizePx] = useState(input.requestedFontSizePx);

  useLayoutEffect(() => {
    if (!input.enabled || !ref.current) {
      setFontSizePx(input.requestedFontSizePx);
      return;
    }
    const el = ref.current;
    let lo = input.minFontSizePx;
    let hi = input.requestedFontSizePx;
    const fits = (px: number) => {
      el.style.fontSize = `${px}px`;
      // reflow xảy ra ngay khi đọc scrollHeight/scrollWidth (browser tự flush layout).
      const overflowsHeight = el.scrollHeight > el.clientHeight + 0.5; // +0.5 chống sai số subpixel
      const overflowsWidth = !input.wrap && el.scrollWidth > el.clientWidth + 0.5;
      return !overflowsHeight && !overflowsWidth;
    };
    if (fits(hi)) {
      setFontSizePx(hi);
      return;
    }
    // Binary search: hi KHÔNG fit (đã biết), lo GIẢ ĐỊNH fit (min size luôn đủ nhỏ để fit trong
    // >99% trường hợp thực tế — box tối thiểu hợp lý; nếu lo cũng không fit, kết quả trả về vẫn
    // là lo — chữ tràn nhẹ ở mức TỐI THIỂU, không lặp vô hạn tìm cách "vừa hoàn hảo" không tồn tại).
    for (let i = 0; i < 20 && hi - lo > 0.5; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid; else hi = mid;
    }
    setFontSizePx(lo);
  }, [input.enabled, input.text, input.boxWidthPx, input.boxHeightPx, input.requestedFontSizePx, input.minFontSizePx, input.wrap]);

  return fontSizePx;
}
```

- **20 vòng lặp cap cứng** — hội tụ thực tế trong ~7-10 vòng cho khoảng search hợp lý (VD
  8px→72px), 20 là biên an toàn dư, KHÔNG BAO GIỜ treo.
- **Set style TRỰC TIẾP qua `el.style.fontSize` trong lúc search** (không qua React state mỗi
  vòng) — tránh 20 lần re-render/flicker. CHỈ `setState` **1 LẦN DUY NHẤT** ở cuối với giá trị
  hội tụ — React re-render 1 lần, gán lại `fontSize` qua style THẬT (JSX) bằng giá trị đó, khớp
  với giá trị `el.style.fontSize` cuối cùng của quá trình đo (không lệch pha).
- **`minFontSizePx` = 40% `requestedFontSizePx`** — CHỐT, không cho override per-item ở v1 (đơn
  giản, đúng tinh thần tối giản đã áp dụng nhiều nơi trong module — thêm field per-item sau nếu
  Sonth thấy 40% không hợp mọi trường hợp).

### Áp dụng ở 2 nơi — chi tiết tích hợp

**`renderer.tsx`'s `TextItemView`:**
```tsx
const textRef = useRef<HTMLDivElement>(null);
const requestedPx = item.fontSize * fScale;
const fittedPx = useAutoFitFontSize(textRef, {
  text: typeof resolved === 'string' ? resolved : resolved.html,
  boxWidthPx: item.box.w * scaleX,
  boxHeightPx: item.box.h * scaleY,
  requestedFontSizePx: requestedPx,
  minFontSizePx: requestedPx * 0.4,
  wrap: false, // 'shrink' luôn no-wrap (co chữ thay vì xuống dòng — đúng NGỮ NGHĨA đối lập với 'wrap')
  enabled: item.overflow === 'shrink',
});
// style.fontSize dùng fittedPx thay item.fontSize * fScale trực tiếp — MỌI nhánh overflow khác
// (wrap/clip/undefined) fittedPx === requestedPx (hook trả nguyên input khi enabled=false), nên
// GIỮ NGUYÊN 1 dòng gán fontSize duy nhất, không cần if/else riêng theo overflow.
```
Gắn `ref={textRef}` lên đúng `<div>` render text (cả nhánh string và nhánh
`dangerouslySetInnerHTML`).

**Canvas editor tương đương** (`Canvas/ItemContent.tsx`'s case `'text'`) — GỌI CHUNG HOOK NÀY,
KHÔNG viết logic đo riêng lần 2. Cần xác nhận đúng file/dòng render text trong editor lúc code
(đã biết tồn tại từ audit trước, chưa có số dòng chính xác — nhưng CHẮC CHẮN dùng cùng
`useAutoFitFontSize` y hệt cách gọi ở trên, chỉ khác nguồn `scaleX/scaleY/fScale` lấy từ props
Canvas đang có).

### Test — cách mock `scrollHeight`/`clientHeight` trong jsdom (jsdom mặc định luôn = 0)

```ts
// Trong test file mới useAutoFitFontSize.test.ts
Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
  configurable: true,
  get() { return parseInt(this.style.fontSize || '16', 10) > 20 ? 200 : 50; }, // giả lập: font to → tràn
});
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 100 });
```
Mock kiểu "hàm số giả" theo `fontSize` hiện tại của phần tử — đủ để test binary-search hội tụ
ĐÚNG HƯỚNG (giảm dần khi tràn) mà không cần browser thật.

## Vấn đề phát sinh & cách xử lý

- **`LoopItem` chứa nhiều TextItem lặp (`itemTemplate`) cùng `overflow:'shrink'`** — mỗi cell
  lặp là 1 instance riêng của `TextItemView`, hook chạy ĐỘC LẬP theo từng cell (đúng, vì mỗi
  cell có thể có nội dung dài/ngắn khác nhau nếu bind theo field khác nhau của từng member) —
  KHÔNG cần tối ưu gộp, số lượng cell thực tế trong 1 layout (thường <20) không đủ lớn để lo hiệu
  năng.
- **RichTextContent (HTML từ Tiptap)** — `scrollHeight` của container bọc `dangerouslySetInnerHTML`
  vẫn đo được bình thường (đo container, không quan tâm nội dung con là text hay HTML) — không
  cần xử lý riêng, xác nhận lại bằng 1 test case cụ thể có HTML nội dung.
- **Đổi box liên tục lúc user resize bằng chuột (kéo handle)** — effect chạy lại mỗi lần
  `box.w`/`box.h` đổi (mỗi pixel kéo) → 20-vòng binary-search CHẠY LẠI mỗi lần — có thể giật ở
  máy yếu nếu kéo resize rất nhanh nhiều TextItem `shrink` cùng lúc (multi-select resize, tương
  lai). v1: KHÔNG debounce (chấp nhận rủi ro nhỏ, resize thường chỉ 1 item tại 1 thời điểm hiện
  tại — chưa có multi-resize) — ghi nhận làm điểm cần theo dõi hiệu năng thật khi Sonth test trên
  Electron, thêm debounce SAU nếu thực sự giật (không tối ưu sớm cho vấn đề chưa xác nhận có thật).

## Definition of done

- [ ] TextItem `overflow:'shrink'` với nội dung dài hơn khung → font-size TỰ GIẢM tới khi vừa,
      giống nhau ở canvas editor VÀ `renderer.tsx`.
- [ ] Item overflow khác (`wrap`/`clip`/mặc định) — không có hiệu ứng đo DOM nào chạy, hiệu năng
      y như trước khi có GĐ12.
- [ ] Resize box → font tự điều chỉnh theo thời gian thực.
- [ ] Test `useAutoFitFontSize` (mock DOM) + test tích hợp renderer.tsx/canvas cho cùng kết quả
      với cùng input.
- [ ] Sonth xác nhận trên Electron thật — không giật khi resize 1 TextItem shrink có nội dung dài.

