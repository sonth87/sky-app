---
status: completed
target_version: layout-designer-v0.17.0
completed_date: 2026-08-06
---

# GĐ13 — Toolbar riêng theo loại item

## Bối cảnh

`ItemToolbar.tsx` hiện 100% đồng nhất: Duplicate/Z-up/Z-down/Lock/Hide/Delete cho MỌI type. Thêm
1 cụm ĐẶC THÙ theo `item.type`, chèn GIỮA `Duplicate` và `Z-up`.

## Cấu trúc & vị trí — đã xác nhận không có rủi ro responsive-width

Đọc lại `ItemToolbar.tsx:83-88`: container dùng `-translate-x-1/2` để tự căn giữa theo
`centerX` (tính từ AABB của item, KHÔNG phụ thuộc độ rộng thật của toolbar) — nghĩa là toolbar
rộng ra thêm bao nhiêu nút cũng TỰ ĐỘNG vẫn căn đúng giữa, KHÔNG cần tính lại `TOOLBAR_HEIGHT`/
width thủ công. Rủi ro "responsive width" nêu trong roadmap sơ bộ trước đó — ĐÃ XÁC NHẬN KHÔNG
PHẢI vấn đề thật, gỡ khỏi danh sách rủi ro.

## UI/UX + hành vi từng nút đặc thù — ĐÃ CHỐT

### Text — toggle Bold nhanh
- 1 `IconToggleButton` (Bold, GĐ10/11), `active = (item.fontWeight ?? 400) >= 700`, click →
  `patch({ fontWeight: active ? 400 : 700 })` — patch qua `patchItemCommand` đã có, không command mới.

### Image — "Đổi ảnh" nhanh
- Nút `ImageUp` icon, click → gọi ĐÚNG flow `handlePickImage` hiện có trong `ImageControls.tsx`
  (native file picker qua `pickAndSaveImage`) — CẦN prop-drill `pickAndSaveImage` xuống
  `ItemToolbar` (hiện chưa có, `ItemToolbarProps` cần thêm field optional
  `pickAndSaveImage?: () => Promise<{relativePath:string}|null>`, truyền từ `Canvas.tsx` xuống
  giống cách nó truyền cho `PropertyPanel`). Nút ẨN nếu `pickAndSaveImage` không được truyền
  (graceful degradation, đúng pattern đã dùng cho `AssetPort` optional methods khác trong module).
- **Sau GĐ14 xong** (Media Library modal), nút này đổi hành vi: click → hiện 1 popover nhỏ
  (Radix Popover, 2 dòng: "Tải ảnh mới" / "Chọn từ thư viện") thay vì gọi trực tiếp native
  picker — NHƯNG đây là thay đổi thuộc GĐ14's phạm vi (điểm dùng cũ), GĐ13 chỉ cần code cho
  ĐÚNG hành vi tại thời điểm GĐ13 chạy (trước khi có Media Library) — không làm 2 lần, chỉ ghi
  chú rõ đây là 1 điểm sẽ bị GĐ14 sửa tiếp.

### Shape — đổi hình dạng nhanh (dropdown icon)
- Nút hiện icon hình dạng HIỆN TẠI của item (VD nếu đang `circle` → hiện icon `Circle`), click →
  mở popover (Radix `Popover`, ĐÚNG pattern `ColorfulSwatchButton.tsx` — `Trigger`/`Content` với
  `sideOffset={6}`, `className="z-[60] rounded-[11px] bg-white p-[10px] shadow-[...]"`) chứa 6
  `IconToggleButton` (1 hàng, các hình `ShapeItem.shape`), click 1 hình → `patch({shape})` +
  đóng popover (`onOpenChange(false)` qua state cục bộ `open`).
- Container cho Radix Popover Portal: `ItemToolbar` render TRÊN canvas (không trong modal) →
  không cần custom `container`, portal mặc định `document.body` là đủ (giống lưu ý GĐ11 cho
  Property Panel).

### Ribbon — đổi màu nền nhanh
- Nút hiện tròn nhỏ màu = `bg` hiện tại (button trigger CHÍNH LÀ `ColorfulSwatchButton` luôn,
  không cần icon Palette riêng — component này TỰ hiện đúng UI "nút tròn xem màu, click mở
  picker" đã có sẵn, tái dùng THẲNG, không viết thêm gì): `<ColorfulSwatchButton
  color={typeof item.bg==='string'?item.bg:undefined} onChange={(bg) => patch({bg})}
  title="Đổi màu nền" />`.

### Loop — "Sửa mẫu"
- Nút `Pencil` icon, click → gọi `onEnterLoopEdit?.(item.id)` — prop NÀY ĐÃ TỒN TẠI, được truyền
  xuống `CanvasItemView` hiện tại nhưng KHÔNG được truyền xuống `ItemToolbar` — cần thêm
  `onEnterLoopEdit?: (id: string) => void` vào `ItemToolbarProps`, truyền từ `Canvas.tsx` (nơi
  đã có sẵn hàm này cho double-click, giờ dùng lại nguyên).

## Registry — cấu trúc code

```tsx
// ItemToolbar.tsx — thêm hàm renderExtraButtons(item, ctx) trả JSX hoặc null theo item.type,
// đặt NGAY TRONG FILE này (không tách registry riêng — chỉ 5 case, tách file thêm sẽ over-
// engineer cho quy mô hiện tại; tách khi >10 loại item mới cần xem lại).
function renderExtraButtons(item: LayoutItem, ctx: { patch: ..., pickAndSaveImage?: ..., onEnterLoopEdit?: ... }) {
  switch (item.type) {
    case 'text': return <TextExtraButtons item={item} patch={ctx.patch} />;
    case 'image': return <ImageExtraButtons item={item} pickAndSaveImage={ctx.pickAndSaveImage} />;
    case 'shape': return <ShapeExtraButtons item={item} patch={ctx.patch} />;
    case 'ribbon': return <RibbonExtraButtons item={item} patch={ctx.patch} />;
    case 'loop': return <LoopExtraButtons item={item} onEnterLoopEdit={ctx.onEnterLoopEdit} />;
  }
}
```
Mỗi `*ExtraButtons` là 1 component nhỏ trong CÙNG FILE `ItemToolbar.tsx` (không tách 5 file con
cho 5 nút — quá nhỏ để tách, tăng số file không có lợi).

## Multi-select — không hiện cụm đặc thù (đã chốt, giữ nguyên quyết định sơ bộ trước)

`item.id === 'multi-select-box'` → `renderExtraButtons` return `null` — đơn giản, tránh case
"nhiều item khác type, nút đặc thù nghĩa là gì".

## Definition of done

- [ ] Mỗi loại item (chọn đúng 1) → toolbar hiện đúng cụm nút đặc thù, hoạt động đúng patch.
- [ ] Shape's dropdown đổi hình + Ribbon's color-swap dùng ĐÚNG Radix Popover/`ColorfulSwatchButton`
      đã có, không hand-roll popover mới.
- [ ] Loop's "Sửa mẫu" gọi đúng `onEnterLoopEdit`, hành vi giống double-click hiện có.
- [ ] Multi-select không bị ảnh hưởng, vẫn như GĐ9.
- [ ] Test mới cho từng cụm đặc thù + hồi quy `ItemToolbar` cũ không giảm.

