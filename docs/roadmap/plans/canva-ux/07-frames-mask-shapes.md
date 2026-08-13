---
status: proposed
target_version: layout-designer-v0.20.0
---

# GĐ16 — Khung: ảnh cắt theo hình trang trí (frame/mask, KHÁC `ShapeItem.shape:'frame'` ở GĐ10)

## Field mới — đã chốt tên, tránh đụng `ShapeItem.shape:'frame'`

Thêm `clipPath?: string` vào `ImageItem` (`packages/slide-shared/src/layout/types.ts`) — CSS
`clip-path` value thô. Electron 43 xác nhận hỗ trợ đủ `polygon()`/`path()` (xem GĐ10's khảo sát
Chromium version) — không còn hedge tương thích.

Khi `clipPath` có giá trị → ƯU TIÊN thay `shape`'s `borderRadius` (2 field không cộng dồn — logic
hình học không có ý nghĩa khi áp cả 2, chọn 1).

## Preset content — file hằng số

```ts
// modules/layout-designer/src/presets/framePresets.ts
export const FRAME_PRESETS: { label: string; clipPath: string; suggestedBox: { w: number; h: number } }[] = [
  { label: 'Tam giác', clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)', suggestedBox: { w: 240, h: 220 } },
  { label: 'Sao 5 cánh', clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)', suggestedBox: { w: 240, h: 240 } },
  { label: 'Trái tim', clipPath: "path('M 120 40 C 100 0, 20 0, 20 60 C 20 100, 120 160, 120 160 C 120 160, 220 100, 220 60 C 220 0, 140 0, 120 40 Z')", suggestedBox: { w: 240, h: 210 } },
  { label: 'Lục giác', clipPath: 'polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)', suggestedBox: { w: 240, h: 220 } },
];
```
(Toạ độ path trái tim minh hoạ — cần tinh chỉnh thật khi code bằng công cụ vẽ path trực quan,
không phải số cuối cùng, nhưng CƠ CHẾ đã đúng: `path()` string tuỳ ý, box tương ứng tỷ lệ.)

## UI `FramesPanel.tsx`

Grid `grid-cols-3 gap-2` tile 70×70px, MỖI tile hiện 1 `<div>` với `clipPath` tương ứng + nền
gradient xám placeholder (để thấy rõ silhouette hình dù chưa có ảnh) + label dưới tile. Kéo tile
→ `useSpawnDrag`'s `onDown({kind:'itemType', type:'image', label, overrides:{clipPath,
box:{w:suggestedBox.w, h:suggestedBox.h}}})`.

## Render 2 nơi

- `renderer.tsx`'s `ImageItemView` — `style.clipPath = item.clipPath ?? undefined`, khi có giá
  trị BỎ `borderRadius` (không set cả 2).
- `Canvas/ItemContent.tsx`'s tương đương — y hệt.

## Definition of done

- [ ] Thả tile Khung → `ImageItem` với `clipPath` đúng, box theo gợi ý.
- [ ] Chọn ảnh cho item đó → ảnh CẮT ĐÚNG theo silhouette, cả canvas VÀ `renderer.tsx`.
- [ ] Layout cũ (không có `clipPath`) không đổi hiển thị.
- [ ] Test render `clipPath` 2 nơi + hồi quy không giảm.

