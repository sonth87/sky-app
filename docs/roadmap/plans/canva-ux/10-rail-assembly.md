---
status: proposed
target_version: layout-designer-v0.23.0
---

# GĐ19 — Lắp Rail + Flyout mới (8 tab)

## `Rail.tsx` — thay `RailGroup`/`GROUPS`

```ts
type RailGroup = 'template' | 'text' | 'media' | 'graphics' | 'frame' | 'grid' | 'var' | 'layers';
const GROUPS: { id: RailGroup; label: string; icon: LucideIcon }[] = [
  { id: 'template', label: 'Mẫu', icon: LayoutTemplate },
  { id: 'text', label: 'Văn bản', icon: Type },
  { id: 'media', label: 'Media', icon: Image },
  { id: 'graphics', label: 'Đồ họa', icon: Shapes },
  { id: 'frame', label: 'Khung', icon: Frame },
  { id: 'grid', label: 'Lưới', icon: Grid3X3 },
  { id: 'var', label: 'Biến', icon: Variable },
  { id: 'layers', label: 'Lớp', icon: Layers },
];
```
Giữ NGUYÊN layout icon+label xếp DỌC trong mỗi tab-button (xác nhận đúng cấu trúc hiện tại của
`Rail.tsx`, chỉ đổi nguồn icon từ glyph sang component lucide `<Icon size={18}/>`).

## `TemplatesPanel.tsx` — viết lại hoàn toàn, 2 sub-tab

- `Tabs` con NGAY ĐẦU panel (dùng `packages/ui`'s `Tabs` primitive mới từ GĐ14, TÁI DÙNG — không
  viết segmented-control riêng lần 2): "Mẫu" (app-provided, GĐ19 CHƯA có nội dung thật — hiện
  `EmptyState` với text "Chưa có mẫu — sẽ được bổ sung" + icon `LayoutTemplate` xám nhạt, ĐÂY LÀ
  TRẠNG THÁI CÓ CHỦ ĐÍCH, không phải bug) / "Cá nhân" (GĐ18's nội dung thật).

## `TextPresetsPanel.tsx` — MỚI, nội dung thật ngay (không placeholder)

```ts
// modules/layout-designer/src/presets/textPresets.ts
export const TEXT_PRESETS: { label: string; overrides: Partial<TextItem> }[] = [
  { label: 'Tiêu đề lớn', overrides: { fontSize: 48, fontWeight: 700, color: '#1a1a2e' } },
  { label: 'Phụ đề', overrides: { fontSize: 24, fontWeight: 500, color: '#5c5d6e' } },
  { label: 'Đoạn văn', overrides: { fontSize: 16, fontWeight: 400, color: '#2E3A5B' } },
  { label: 'Chữ nổi (có bóng)', overrides: { fontSize: 36, fontWeight: 700, color: '#ffffff', shadow: true } },
  { label: 'IN HOA', overrides: { fontSize: 28, fontWeight: 700, uppercase: true, color: '#1a1a2e' } },
];
```
Mỗi tile RENDER PREVIEW THẬT — không phải icon generic, mà 1 `<div>` với CHÍNH style CSS tương
ứng (`fontSize` thu nhỏ tỷ lệ để fit tile 200×50px, `fontWeight`/`color`/`textShadow` áp trực
tiếp) hiện chữ mẫu "Aa" hoặc tên preset chính nó làm nội dung preview — thấy ĐÚNG kiểu chữ trước
khi kéo ra canvas, đúng tinh thần Canva. Kéo → `overrides` cơ chế GĐ15, `type:'text'`.

## `ImagePanel.tsx`/`GraphicsPanel.tsx`/`FramesPanel.tsx`/`GridPresetsPanel.tsx` → route thẳng

Đã code xong ở GĐ14/15/16/17 — GĐ19 CHỈ route `Flyout.tsx`'s switch tới đúng component, không
code UI mới.

## `ComponentsPanel.tsx` cũ — quyết định

XOÁ HẲN (không giữ dạng ẩn) — vai trò của nó (5 tile spawn item trống) đã được `GraphicsPanel.tsx`
(GĐ15) tiếp nhận đầy đủ hơn (Text/Image/Ribbon/Loop spawn trống VẪN CẦN có nơi — quyết định: đặt
NGAY ĐẦU `GraphicsPanel.tsx`, TRƯỚC section "Hình khối", 1 dòng nhỏ 4 tile "Văn bản trống"/"Ảnh
trống"/"Ruy băng trống"/"Khung lặp trống" — dùng spawn KHÔNG có `overrides`, y hệt hành vi
`ComponentsPanel.tsx` cũ, chỉ đổi vị trí UI).

## Definition of done

- [ ] Rail 8 tab, icon lucide, đúng thứ tự.
- [ ] Mỗi tab mở đúng panel, không còn placeholder "Chưa khả dụng" (trừ Mẫu>Mẫu app-provided,
      có chủ đích).
- [ ] Toàn bộ luồng kéo-thả từ MỌI tab hoạt động đúng, undo/redo đúng single-step cho preset đa-item.
- [ ] Sonth xác nhận thật trên Electron — click qua đủ 8 tab, chèn ít nhất 1 item mỗi tab.
- [ ] `pnpm typecheck` + toàn bộ test suite sạch, baseline 255/255 (GĐ9) không hồi quy.
