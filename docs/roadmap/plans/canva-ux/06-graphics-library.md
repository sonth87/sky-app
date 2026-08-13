---
status: proposed
target_version: layout-designer-v0.19.0
---

# GĐ15 — Đồ họa: Shape presets qua `overrides` + thư viện Icon/SVG

## Mở rộng `SpawnKind` — cơ chế dùng lại cho GĐ16/17

```ts
// useSpawnDrag.ts — SpawnKind hiện tại:
// { kind: 'itemType'; type: LayoutItem['type']; label: string } | { kind: 'var'; key: string; label: string }
// Thêm field overrides VÀO biến thể itemType:
| { kind: 'itemType'; type: LayoutItem['type']; label: string; overrides?: Partial<LayoutItem> }
```
`createSpawnedItem()` — sau khi `registry.get(type).createDefault(id)`, merge:
`{ ...defaultItem, ...spawnKind.overrides, id: defaultItem.id, box: defaultItem.box }` (giữ
NGUYÊN `id`/`box` do `createDefault`+repositioning tính, `overrides` CHỈ áp cho field nội dung
như `shape`/`bg`/`fontSize`... — tránh `overrides` vô tình đè `box`/`id` gây lỗi vị trí spawn).

## UI `GraphicsPanel.tsx` (thay `ComponentsPanel.tsx`)

- 2 khu vực, phân tách bằng `Section`-style header (không phải `Section` component thật —
  đây là Flyout panel, không phải Property Panel, dùng header riêng đơn giản: `text-[11px]
  font-semibold uppercase text-[#9a9bab] px-3 pt-3 pb-1`).
- **"Hình khối"**: grid `grid-cols-3 gap-2` các tile 60×60px (giữ kích thước `ComponentsPanel`
  hiện tại), MỖI hình 1 tile riêng (6 tile: Vuông/Tròn/Tam giác/Kim cương/Khung viền/Đường kẻ —
  dùng label tiếng Việt tương ứng `shape` enum, icon từ bảng GĐ10). Kéo tile → dùng
  `useSpawnDrag`'s `onDown({kind:'itemType', type:'shape', label, overrides:{shape:'triangle'}})`
  tương ứng.
- **"Icon/SVG"**: grid `grid-cols-4 gap-2` tile 48×48px NHỎ HƠN (icon đơn sắc, không cần to như
  shape) — MỖI tile = 1 `ImageItem` preset, `overrides: { src: '/static-icons/xxx.svg', fit:
  'contain', shape: 'rect' }` — `fit:'contain'` QUAN TRỌNG (khác default `'cover'` của ImageItem
  — icon phải hiện TRỌN VẸN không bị cắt, khác ảnh chụp thường muốn lấp đầy khung).

## Resolve asset tĩnh 3-platform — quyết định

Icon SVG là asset CỦA APP (không phải user upload) → KHÔNG đi qua `AssetPort`/DB. Đặt file tại
`packages/slide-shared/src/layout/static-icons/*.svg`, import qua Vite's asset URL resolution
(`import iconUrl from './static-icons/star.svg'` → Vite tự inline base64 hoặc emit file + trả
URL, hoạt động ĐÚNG NHƯ NHAU cho Web build VÀ Electron renderer process — cả 2 đều qua Vite bundler
theo kiến trúc hiện tại của repo, xác nhận: `apps/shell-electron` render process dùng Vite y hệt
Web, chỉ main process là Node thường). Đây là cách AN TOÀN NHẤT (không cần biết đường dẫn file-
system runtime, Vite lo hết) — KHÔNG dùng cách trỏ đường dẫn tương đối string thủ công.

`GraphicsPanel.tsx` import trực tiếp các icon này qua Vite import, đưa vào 1 mảng
`ICON_PRESETS: { url: string; label: string }[]` — Sonth bổ sung thêm file SVG + entry vào mảng
này theo thời gian, KHÔNG cần sửa gì khác.

## Definition of done

- [ ] Tile hình khối thả ra ĐÚNG hình dạng tương ứng (không cần sửa tay Property Panel sau).
- [ ] `overrides` hoạt động qua `useSpawnDrag`, spawn cũ (không dùng overrides) không đổi hành vi.
- [ ] Icon SVG mẫu (vài cái placeholder) chèn được, hiển thị đúng cả Electron/Web build (build
      thật, không chỉ dev server — Vite asset resolution có thể khác giữa dev/build).
- [ ] Test cho `overrides` merge + hồi quy `useSpawnDrag` không giảm.

