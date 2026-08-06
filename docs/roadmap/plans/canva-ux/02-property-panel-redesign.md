---
status: proposed
target_version: layout-designer-v0.15.0
---

# GĐ11 — Property Panel: áp dụng primitive mới + màu Colorful + section thu gọn

## Bối cảnh

GĐ10 đã có `IconToggleButton`/`IconToggleGroup` + sửa bug render Shape. Phase này: (1) áp dụng
primitive vào TẤT CẢ file Controls; (2) đổi 8 chỗ `<input type="color">` sang
`ColorfulSwatchButton` (đã có sẵn trong `@sky-app/ui`, chưa được dùng ở module này); (3) thêm
`CollapsibleSection` cho Shadow/Border (giảm chiều dài panel).

## UI/UX chi tiết theo từng file

### `TextControls.tsx`

- Section "Kiểu": ĐANG có 3 nút hàng ngang "B"/"I"/"AA" tự viết `btnClass`. ĐỔI thành 1
  `IconToggleGroup`... nhưng CHÚ Ý: đây KHÔNG phải chọn-1-trong-N (radio) — Bold/Italic/
  Uppercase là 3 TOGGLE ĐỘC LẬP (bật/tắt riêng từng cái, không loại trừ nhau) — `IconToggleGroup`
  (thiết kế GĐ10) là radio-style, KHÔNG PHÙ HỢP ở đây. Quyết định: dùng 3 `IconToggleButton` rời
  đặt cạnh nhau trong `flex gap-[7px]` (KHÔNG bọc trong `IconToggleGroup`), mỗi nút tự quản lý
  `active`/`onClick` riêng:
  ```tsx
  <div className="flex gap-[7px]">
    <IconToggleButton icon={Bold} title="Đậm" active={(item.fontWeight ?? 400) >= 700}
      onClick={() => patch({ fontWeight: (item.fontWeight ?? 400) >= 700 ? 400 : 700 })} />
    <IconToggleButton icon={Italic} title="Nghiêng" active={!!item.italic}
      onClick={() => patch({ italic: !item.italic })} />
    <IconToggleButton icon={CaseUpper} title="Chữ hoa" active={!!item.uppercase}
      onClick={() => patch({ uppercase: !item.uppercase })} />
  </div>
  ```
- Section "Căn ngang": 3 giá trị loại trừ nhau (`left/center/right`) → ĐÚNG use-case
  `IconToggleGroup`, dùng thẳng.
- Section "Căn dọc": tương tự, `IconToggleGroup` với `AlignVerticalJustifyStart/Center/End`.
- Section "Khi tràn khung": GIỮ layout 3-nút-có-label hiện tại (không đổi sang icon-only) nhưng
  THÊM icon đứng trước label text trong mỗi nút (`<WrapText size={13}/> Xuống dòng`), vẫn dùng
  `IconToggleGroup` NHƯNG với biến thể có label — nghĩa là `IconToggleGroup`/`IconToggleButton`
  (GĐ10) cần thêm 1 prop optional `label?: string` render TRƯỚC/SAU icon khi có — mở rộng nhỏ
  primitive đã thiết kế ở GĐ10 (không phải thiết kế lại, chỉ thêm 1 prop).
- Section "Màu chữ": đổi `<input type="color">` → `<ColorfulSwatchButton color={item.color}
  onChange={(color) => patch({ color })} title="Màu chữ" />` (import từ `@sky-app/ui`).

### `ImageControls.tsx`

- Section "Hình dạng & viền": 3 nút rect/round/circle đổi sang `IconToggleGroup` (loại trừ nhau,
  đúng use-case). Màu viền (`borderColor`) đổi sang `ColorfulSwatchButton`.
- Section "Bộ lọc" (none/bright/gray/warm): **thêm preview thật** — mỗi nút giờ là 1 khối 32×32px
  hiện ẢNH ĐANG CHỌN của item (qua `previewUrl` đã có từ `useResolvedAssetUrl`) với CSS `filter`
  tương ứng áp trực tiếp (`filter: 'brightness(1.3)'` cho bright, `'grayscale(1)'` cho gray,
  `'sepia(0.4) saturate(1.3)'` cho warm — 3 giá trị CSS filter cụ thể, KHÔNG hedge). Nếu
  `previewUrl` chưa có (chưa chọn ảnh) → hiện khối màu xám trung tính `#e6e6ee` thay ảnh, filter
  vẫn áp (để thấy hiệu ứng tương đối dù chưa có ảnh thật) — label text "none/bright/gray/warm"
  đổi thành tiếng Việt: "Gốc"/"Sáng"/"Đen trắng"/"Ấm", hiện DƯỚI khối preview (không phải nút
  text ngang hàng như hiện tại).
- Section "Neo điểm crop" (focalX/focalY) — KHÔNG đổi (đã là slider, không phải glyph/text cần
  đổi icon).

### `ShapeControls.tsx`

- Section "Hình dạng": 6 nút → `IconToggleGroup` với icon đã chốt ở GĐ10 (Square/Squircle-hoặc-
  fallback/Circle/Triangle/Diamond/Minus/Frame — chú ý: 6 GIÁ TRỊ enum nhưng có thể hiện 7 icon
  nếu tách round riêng biệt khỏi rect — XEM LẠI: `ShapeItem.shape` chỉ có 6 giá trị đã liệt kê
  (`rect|circle|triangle|diamond|frame|line`), KHÔNG có `round` — `round` là field của
  `ImageItem.shape` riêng (`rect|round|circle`), 2 enum ĐỘC LẬP dù tên field giống nhau. Vậy
  `ShapeControls` chỉ cần 6 icon: Square(rect)/Circle/Triangle/Diamond/Frame/Minus(line) — không
  có "Squircle" ở đây, cái đó chỉ cần cho `ImageControls`'s `round`. Sửa lại bảng icon GĐ10 cho
  đúng: `ImageControls`'s "round" cần icon riêng — dùng `Square` + `className="rounded-md"` trực
  tiếp trên chính icon (border-radius áp lên SVG icon luôn được vì nó nằm trong 1 `<button>` có
  thể bo góc) thay vì tìm icon "Squircle" không chắc tồn tại — quyết định RÕ, không hedge.
- Màu nền (`fill`), màu viền (`stroke`) → `ColorfulSwatchButton`.

### `RibbonControls.tsx`

- Nút Bold → 1 `IconToggleButton` đơn (không phải group, chỉ 1 toggle).
- Màu chữ/nền/viền (3 chỗ) → `ColorfulSwatchButton`.

### `LoopControls.tsx`

- Hướng sắp xếp (Hàng/Cột/Lưới) → `IconToggleGroup` (Rows3/Columns3/Grid3X3).
- Tràn dữ liệu (Thu nhỏ/Cắt bớt) → GIỮ dạng có-label như "Khi tràn khung" bên trên (dùng biến
  thể `label` mở rộng của `IconToggleGroup`).

### `FrameBackgroundControls.tsx`

- Kiểu nền (none/color/gradient/image) → `IconToggleGroup` có label.
- Màu nền → `ColorfulSwatchButton`.

### `ShadowControl.tsx`

- Toggle bật/tắt: đổi text "Bật đổ bóng"/"Đang bật" → giữ TEXT (không đổi icon-only, vì đây là
  toggle bool đơn, text rõ nghĩa hơn icon mù mờ "có bóng hay không") — KHÔNG cần đổi phase này,
  chỉ đổi màu bóng (`color`) sang `ColorfulSwatchButton`.

## `CollapsibleSection` — component mới

```tsx
// packages/ui hoặc PropertyPanel/CommonControls.tsx — quyết định: ĐẶT Ở
// CommonControls.tsx (không đưa lên packages/ui) vì cách dùng gắn chặt style `Section` đã có
// SẴN Ở ĐÓ, tách ra riêng sẽ phải export cả 2 cùng lúc mới dùng được, không có lợi ích thực.
export function CollapsibleSection({
  title, defaultOpen, children,
}: { title: string; defaultOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-[#f0f0f5]">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-[13px_15px] cursor-pointer">
        <span className="font-semibold text-[11px] tracking-[.04em] uppercase text-[#9a9bab]">{title}</span>
        {open ? <ChevronDown size={14} className="text-[#9a9bab]" /> : <ChevronRight size={14} className="text-[#9a9bab]" />}
      </button>
      {open && <div className="p-[0_15px_13px]">{children}</div>}
    </div>
  );
}
```

- Áp dụng cho Section "Đổ bóng" (mọi Controls có `ShadowControl`) và "Viền" (`ImageControls`/
  `ShapeControls`/`RibbonControls`).
- `defaultOpen` = TRUE nếu field liên quan đã có giá trị khác mặc định (VD `item.shadow` truthy,
  hoặc `borderW > 0`), FALSE nếu chưa — tính TRỰC TIẾP tại nơi gọi (`PropertyPanel.tsx`'s per-
  type Controls file), không cần logic chung.
- KHÔNG animate mở/đóng (chỉ conditional render, không CSS transition height) — quyết định đơn
  giản hoá v1, animation không phải yêu cầu, tránh phức tạp hoá component cho 1 thứ chưa ai đòi.

## Vấn đề phát sinh & cách xử lý

- **`ColorfulSwatchButton` cần `container` prop** khi dùng TRONG modal (theo đúng comment gốc
  của nó — tránh bị Modal's overflow che popover). Property Panel KHÔNG nằm trong modal (là panel
  cố định bên phải màn hình chính) → không cần truyền `container`, dùng mặc định (portal vào
  `document.body`). Chỉ CẦN truyền `container` khi dùng `ColorfulSwatchButton` sau này TRONG
  `MediaLibraryModal` (GĐ14) hoặc modal khác — ghi chú lại đây để GĐ14 không quên.
- **Test hiện tại query bằng `getByDisplayValue`/`querySelector('input[type="color"]')`** (nếu
  có) sẽ fail sau khi đổi sang `ColorfulSwatchButton` (không còn là `<input>` mà là `<button>` mở
  popover) — rà lại toàn bộ test file Controls, đổi cách assert màu (query theo `style.background`
  của nút swatch, hoặc mở popover trong test rồi assert giá trị hex hiện trong Colorful picker).

## Definition of done

- [ ] Mọi Section chọn-1-trong-N dùng `IconToggleGroup`, mọi toggle độc lập dùng
      `IconToggleButton` rời — không còn nút raw text/glyph cho các trường hợp này.
- [ ] Toàn bộ 8+ chỗ `<input type="color">` trong Property Panel đã đổi sang
      `ColorfulSwatchButton`, hoạt động đúng (patch đúng field, hiện đúng màu hiện tại).
- [ ] Bộ lọc ảnh hiện preview thật bằng CSS filter, không còn chữ suông.
- [ ] `CollapsibleSection` hoạt động đúng, mặc định mở/đóng theo trạng thái field.
- [ ] Test mới cho `CollapsibleSection` + toàn bộ test Controls cũ cập nhật theo
      `ColorfulSwatchButton`, hồi quy không giảm so với baseline GĐ10.

