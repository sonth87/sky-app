---
status: proposed
target_version: layout-designer-v0.14.0
---

# GĐ10 — Icon foundation + sửa bug render ShapeItem (4/6 hình dạng "chết")

## Bối cảnh

2 việc ghép vào 1 phase vì CÙNG chạm `ShapeControls.tsx`/icon-picker: (1) dọn icon Unicode/emoji
sang `lucide-react` thật + xây 2 primitive dùng chung; (2) sửa bug `ShapeItem.shape` — 4/6 giá
trị (`triangle/diamond/line/frame`) hiện render giống `rect` (không phân biệt hình), phát hiện
khi audit `renderer.tsx:278-290` (chỉ xử lý `borderRadius` cho `circle`/`rect`, các case còn lại
rơi qua không có xử lý riêng).

## Phần A — Sửa render `ShapeItem` (ưu tiên làm TRƯỚC phần icon, vì đây là bug thật)

### Thiết kế: dùng CSS `clip-path` cho 4 hình còn thiếu, KHÔNG SVG riêng

Kiểm tra Electron đang dùng (`apps/shell-electron/package.json`: `"electron": "^43.1.0"`) →
Chromium tương ứng hỗ trợ đầy đủ `clip-path: polygon()` (từ lâu) VÀ `clip-path: path()` (từ
Chromium ~99+, Electron 43 chắc chắn dư). **Không còn hedge tương thích** — dùng `polygon()` cho
mọi hình cố định dưới đây (đủ, không cần `path()` phức tạp hơn ở đây).

Thêm map hằng số MỚI, đặt cạnh `ShapeItemView` trong `packages/slide-shared/src/layout/
renderer.tsx` (và import dùng lại ở `Canvas/ItemContent.tsx` — xem Phần A.2):

```ts
// packages/slide-shared/src/layout/shapeClipPaths.ts (file mới, để dùng được ở CẢ renderer.tsx
// và Canvas/ItemContent.tsx mà không phải định nghĩa 2 lần)
export const SHAPE_CLIP_PATHS: Partial<Record<ShapeItem['shape'], string>> = {
  triangle: 'polygon(50% 0%, 0% 100%, 100% 100%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  // 'rect'/'circle' KHÔNG có trong map này — tiếp tục dùng borderRadius như cũ (rẻ hơn clip-path,
  // không cần đổi hành vi đã đúng).
  // 'line' và 'frame' xử lý riêng bên dưới, KHÔNG dùng clip-path (xem giải thích).
};
```

- **`triangle`/`diamond`** → áp `clipPath: SHAPE_CLIP_PATHS[item.shape]` lên `style` khi có giá
  trị trong map. `background: fillValue` vẫn tô như cũ, giờ chỉ hiển thị trong vùng đã cắt.
- **`line`** → KHÔNG phải "cắt hình", là "vẽ 1 đường kẻ" — quyết định: nếu `box.w >= box.h` (nằm
  ngang) → render 1 thanh cao `max(2, box.h)` px CHÍNH GIỮA theo chiều đứng của box (căn giữa
  dọc), nếu `box.h > box.w` (nằm đứng) → thanh rộng `max(2, box.w)` px căn giữa ngang. Cụ thể:
  giữ `width`/`height` = `toRenderBox()` như mọi item khác (không đổi kích thước box thật — box
  vẫn là vùng chọn/kéo/resize như bình thường), nhưng bên trong render 1 `<div>` con tuyệt đối
  định vị chính giữa với độ dày cố định 3px (đã nhân `Math.min(scaleX,scaleY)` cho nhất quán với
  cách `strokeW`/`borderW` đang scale), màu = `fillValue` (dùng field `fill` có sẵn, không cần
  field mới) — nghĩa là `line` là 1 EXCEPTION về cấu trúc render (có 1 lớp con), không dùng
  chung code path với `triangle`/`diamond`/`rect`/`circle`.
- **`frame`** → xác nhận ý nghĩa: là 1 KHUNG VIỀN RỖNG (hollow rectangle, chỉ có border, không
  fill) — KHÁC HẲN tính năng mới "Khung" ở GĐ16 (đó là ẢNH cắt theo hình trang trí, đây là 1
  HÌNH KHỐI không tô nền, chỉ có viền) — 2 khái niệm trùng tên tiếng Việt "khung" nhưng độc lập
  hoàn toàn về field/code, không đổi tên field/enum để tránh phá layout cũ đã lưu `shape:
  'frame'`. Render: `background: 'transparent'` (bỏ qua `fillValue` khi `shape === 'frame'`),
  `border: (item.strokeW || 2) * Math.min(scaleX,scaleY) + 'px solid ' + (item.stroke ??
  '#000')` — tức nếu `strokeW` chưa set, MẶC ĐỊNH border 2px (khác hành vi `rect`/`circle` hiện
  tại — chúng chỉ có border khi `strokeW > 0`) — vì với `frame`, "không viền" = vô hình, không
  có ý nghĩa gì để chọn hình này. Cần patch `createDefault`/spawn để khi chọn `frame` từ
  Property Panel, TỰ set `strokeW: 2` nếu đang là 0/undefined (UX: chọn "Khung viền" trong
  ShapeControls thấy có viền ngay, không phải tự bấm thêm Viền).

### A.2 — Áp dụng ở CẢ 2 nơi (bài học lặp lại nhiều lần trong module)

- `packages/slide-shared/src/layout/renderer.tsx`'s `ShapeItemView` (dòng 278-290) — patch theo
  thiết kế trên.
- `modules/layout-designer/src/components/Canvas/ItemContent.tsx`'s case `'shape'` (canvas
  editor preview) — PHẢI cho ra kết quả THỊ GIÁC giống hệt renderer.tsx với cùng input, dùng lại
  `SHAPE_CLIP_PATHS` từ file dùng chung mới, không viết map riêng lần 2.

### A.3 — Property Panel: `ShapeControls.tsx` cập nhật theo bug fix

- Khi chọn `frame`, nếu `strokeW` hiện là 0/undefined → tự `patch({ strokeW: 2, stroke: stroke
  ?? '#000000' })` NGAY khi bấm nút chọn hình (không đợi user tự mở Section "Viền") — implement
  trong `onClick` handler của nút hình `frame`, không phải trong `createDefault()` (vì
  `createDefault()` mặc định vẫn là `rect`, đây là hành vi riêng khi CHUYỂN sang `frame`).
- Section "Viền" — label đổi 1 chữ nhỏ: khi `item.shape === 'frame'`, đổi tiêu đề Section thành
  "Viền (bắt buộc — đây là khung viền)" để user hiểu vì sao không tắt được xuống 0 một cách vô
  hình (không chặn cứng việc kéo strokeW về 0 — vẫn cho phép, chỉ là visual sẽ biến mất, đúng
  logic CSS, không cần validate/chặn gì thêm).

## Phần B — Icon foundation

### B.1 — Danh sách icon CHÍNH THỨC (đã tra `node_modules/lucide-react`, xác nhận tồn tại)

| Vị trí | Cũ | Mới (tên export lucide-react, PascalCase) |
|---|---|---|
| `Rail.tsx` — Mẫu | ▦ | `LayoutTemplate` |
| `Rail.tsx` — Văn bản | (chưa có) | `Type` |
| `Rail.tsx` — Media | ▧ | `Image` |
| `Rail.tsx` — Đồ họa | (chưa có) | `Shapes` |
| `Rail.tsx` — Khung | (chưa có) | `Frame` |
| `Rail.tsx` — Lưới | (chưa có) | `Grid3X3` (giữ đúng casing đã dùng ở `FloatingToolbar.tsx`) |
| `Rail.tsx` — Biến | "{ }" | `Variable` |
| `Rail.tsx` — Lớp | ≣ | `Layers` |
| `ComponentsPanel`/`LayersPanel` — text | T | `Type` |
| `ComponentsPanel`/`LayersPanel` — image | ▦ | `Image` |
| `ComponentsPanel`/`LayersPanel` — shape | ◆ | `Shapes` |
| `ComponentsPanel`/`LayersPanel` — ribbon | ⚑ | `Flag` |
| `ComponentsPanel`/`LayersPanel` — loop | ⟲ | `Repeat` |
| `PanelHeader.tsx` — xoá | 🗑 (emoji) | `Trash2` (đồng bộ `ItemToolbar.tsx`) |
| `TextControls`/`RibbonControls` — Bold | "B" | `Bold` (đồng bộ `TextEditToolbar.tsx`) |
| `TextControls` — Italic | "I" | `Italic` |
| `TextControls` — Uppercase | "AA" | `CaseUpper` |
| `TextControls` — Căn ngang | ◧▣◨ | `AlignLeft`/`AlignCenter`/`AlignRight` |
| `TextControls` — Căn dọc | text "Trên/Giữa/Dưới" | `AlignVerticalJustifyStart`/`Center`/`End` |
| `TextControls` — Khi tràn khung | text 3 nút | `WrapText` (wrap) / `Minimize2` (shrink) / `Scissors` (clip) — GIỮ label text kèm icon, không icon-only (khái niệm khó truyền tải chỉ bằng icon) |
| `ImageControls`/`ShapeControls` — hình rect | ▢ | `Square` |
| `ImageControls` — hình round | (chưa rõ) | `Squircle` — KIỂM TRA: nếu không tồn tại, fallback `Square` + `rounded` class minh hoạ trực quan hơn tên icon |
| `ImageControls`/`ShapeControls` — hình circle | ● | `Circle` |
| `ShapeControls` — triangle | ▲ | `Triangle` |
| `ShapeControls` — diamond | ◆ | `Diamond` |
| `ShapeControls` — line | ― | `Minus` |
| `ShapeControls` — frame | ▮ | `Frame` |
| `LoopControls` — Hàng/Cột/Lưới | text | `Rows3`/`Columns3`/`Grid3X3` |
| `FrameBackgroundControls` — none/color/gradient/image | text | tương ứng `Ban`/`Palette`/`Sparkles`(tạm, hoặc giữ chữ "Gradient" không icon rõ nghĩa)/`Image` |

`Squircle` cần xác nhận lại lúc code (chưa tra trong danh sách đã kiểm — nếu không có, dùng
`Square` cho cả rect/round, phân biệt bằng LABEL text "Vuông"/"Vuông tròn" thay icon khác nhau).

### B.2 — 2 primitive mới trong `packages/ui/src/primitives/` (KHÔNG đặt trong
`modules/layout-designer` — theo đúng quy ước "packages/ui dùng chung", primitive này đủ tổng
quát để module khác cũng dùng được sau này, không có gì đặc thù layout-designer)

```tsx
// packages/ui/src/primitives/icon-toggle.tsx
export function IconToggleButton({
  icon: Icon, active, onClick, title, disabled,
}: { icon: LucideIcon; active?: boolean; onClick: () => void; title: string; disabled?: boolean }) {
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick}
      className={cn(
        'flex items-center justify-center w-8 h-8 rounded-[7px] border cursor-pointer transition-colors',
        active ? 'border-[#4b57e6] bg-[#4b57e6]/10 text-[#4b57e6]' : 'border-[#e6e6ee] bg-[#fcfcfd] text-[#5c5d6e] hover:bg-[#f4f5f9]',
        disabled && 'opacity-40 cursor-not-allowed hover:bg-[#fcfcfd]',
      )}
    >
      <Icon size={15} />
    </button>
  );
}

export function IconToggleGroup<T extends string>({
  options, value, onChange,
}: { options: { value: T; icon: LucideIcon; title: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-[7px]">
      {options.map((opt) => (
        <IconToggleButton key={opt.value} icon={opt.icon} title={opt.title}
          active={value === opt.value} onClick={() => onChange(opt.value)} />
      ))}
    </div>
  );
}
```

- Kích thước nút CỐ ĐỊNH 32×32px (`w-8 h-8`) — đủ lớn cho ngón tay/chuột, khớp chiều cao input
  hiện có trong Section (`p-[6px_8px]` input text ~28-30px, gần bằng).
  `title` prop = tooltip native browser (đủ cho v1, KHÔNG cần Radix Tooltip riêng — native
  `title` đã đủ thông tin, tránh over-engineer 1 component chỉ để hiện tooltip đơn giản).
- Export 2 hàm này qua `packages/ui/src/index.ts`.

### B.3 — `getItemTypeIcon()` dùng chung (xoá duplicate `COMPONENT_TILES`/`iconOf()`)

```ts
// modules/layout-designer/src/itemTypeIcons.ts (file mới, đặt ngoài components/ vì dùng bởi
// nhiều components/ khác nhau — không thuộc riêng 1 component nào)
import { Type, Image, Shapes, Flag, Repeat, type LucideIcon } from 'lucide-react';
import type { LayoutItem } from '@sky-app/slide-shared';

const ICONS: Record<LayoutItem['type'], LucideIcon> = {
  text: Type, image: Image, shape: Shapes, ribbon: Flag, loop: Repeat,
};

export function getItemTypeIcon(type: LayoutItem['type']): LucideIcon {
  return ICONS[type];
}
```

`ComponentsPanel.tsx`'s `COMPONENT_TILES` bỏ field icon glyph, gọi `getItemTypeIcon(t.type)` lúc
render. `LayersPanel.tsx`'s `iconOf()` xoá hẳn, gọi hàm này thay thế.

## Rủi ro

- Bug fix Phần A đổi HIỂN THỊ THẬT của layout cũ đã lưu `shape: 'triangle'/'diamond'/'line'/
  'frame'` (nếu Sonth đã từng tạo — cần kiểm tra dữ liệu thật trước khi merge, dù xác suất thấp
  vì tính năng này chưa từng hiển thị đúng nên khó có ai chủ động chọn rồi hài lòng với kết quả
  sai). Không phải "phá dữ liệu" — là SỬA ĐÚNG lần đầu.
- Đổi label-text-only sang icon-only ở vài nút (Bold/Italic/Uppercase/căn ngang/dọc) → test hiện
  dùng `screen.getByText('B')` kiểu cũ SẼ FAIL, phải đổi sang `getByTitle(...)`/`getByLabelText`.

## Definition of done

- [ ] `shape: 'triangle'/'diamond'` hiển thị ĐÚNG hình (không còn là rect), cả canvas editor và
      `renderer.tsx`.
- [ ] `shape: 'line'` hiển thị 1 đường kẻ mảnh, `shape: 'frame'` hiển thị khung viền rỗng có
      viền mặc định nếu strokeW chưa set.
- [ ] `Rail.tsx`/`ComponentsPanel.tsx`/`LayersPanel.tsx`/`PanelHeader.tsx` không còn glyph
      Unicode/emoji (grep xác nhận) — Controls files (TextControls/ImageControls/ShapeControls/
      RibbonControls/LoopControls/FrameBackgroundControls) VẪN CÒN glyph ở phase này, được
      GĐ11 dọn tiếp khi wire vào `IconToggleGroup` (tránh sửa 2 lần: 1 lần đổi icon thô, 1 lần
      refactor sang primitive).
- [ ] `IconToggleButton`/`IconToggleGroup` tồn tại trong `@sky-app/ui`, `getItemTypeIcon()` là
      nguồn DUY NHẤT cho icon-theo-loại-item.
- [ ] `pnpm --filter @sky-app/module-layout-designer test` sạch, baseline 255/255 (sau khi sửa
      test bị ảnh hưởng bởi đổi label→icon).

