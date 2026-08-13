# 23 — Kiến trúc Editor-Core (registry đầy đủ: undo/redo, history, zoom, snap, helper-line, drag-drop)

> Yêu cầu MỚI (2026-07-16, xem [20](20-rasoat-2026-07-16.md) §B4): Sonth yêu cầu editor phải có
> **undo, redo, history, zoom, helper line, snap, drag-drop, canvas... với 1 kiến trúc hợp lý
> để đăng ký, quản lý registry đầy đủ**. Đây KHÔNG cắt khỏi v1. Tách thành **package
> `editor-core` riêng** để test được, tái dùng được, không dồn hết logic vào 1 component React.

## 1. Vì sao tách package riêng (không gộp trong modules/layout-designer)

- Editor kéo-thả phức tạp: state history (undo/redo), nhiều công cụ (select/move/resize/rotate/
  add-item), snap+helper-line, zoom/pan — nếu dồn hết vào component React sẽ thành "God component"
  khó test, khó bảo trì.
- Logic editor (command, history, snap tính toán) **không phụ thuộc React** — tách ra test thuần
  bằng vitest, không cần render.
- `modules/layout-designer` chỉ còn việc **ráp UI** (canvas SVG/DOM, panel, toolbar) lên trên
  `editor-core` — mỏng, dễ đọc.

```
packages/layout-editor-core/     ← MỚI: state + command registry + tool + snap/helper (không React)
modules/layout-designer/          ← ráp UI React lên editor-core (canvas, panels, toolbar)
```

## 2. Các trụ cột kiến trúc

### 2.1. State store (nguồn chân lý editor)

Dùng **Zustand** (đã có trong tech stack sky-app) — 1 store giữ toàn bộ trạng thái phiên chỉnh
sửa 1 layout:

```ts
interface EditorState {
  doc: LayoutContent;              // nội dung layout đang sửa (variants[], items[]...)
  activeVariantId: string;         // variant/tỷ lệ đang mở
  selection: string[];             // id các item đang chọn (đa chọn)
  viewport: { zoom: number; panX: number; panY: number };
  tool: EditorTool;                // 'select' | 'text' | 'image' | 'shape' | 'loop' | 'hand'...
  // history quản lý riêng (§2.2), không nằm thẳng trong state để tránh serialize cả lịch sử
}
```

### 2.2. Command registry + undo/redo/history (trụ cột quan trọng nhất)

**Mọi thay đổi lên `doc` phải đi qua 1 Command** — không sửa state trực tiếp. Mỗi command biết
cách `apply` và `invert` (hoặc lưu patch trước/sau) → undo/redo miễn phí, history là danh sách
command đã chạy.

```ts
interface EditorCommand {
  type: string;                    // "move-item", "add-item", "resize", "edit-text", "add-variant"...
  apply(state: EditorState): EditorState;   // hoặc trả patch
  invert(state: EditorState): EditorState;  // để undo
  // gộp command liên tiếp cùng loại (VD kéo item nhiều frame → 1 undo, không phải N undo)
  coalesceWith?(prev: EditorCommand): EditorCommand | null;
}

interface HistoryStack {
  past: EditorCommand[];
  future: EditorCommand[];
  execute(cmd: EditorCommand): void;   // apply + push past + clear future
  undo(): void;                         // pop past → invert → push future
  redo(): void;
}
```

- **`coalesceWith`** giải bài toán "kéo-thả 1 item tạo ra 60 command/giây" — gộp các move liên
  tiếp cùng 1 item thành 1 undo. Không có nó thì Ctrl+Z phải bấm 60 lần để lùi 1 thao tác kéo.
- **Command registry** = bảng đăng ký các loại command (mỗi tool/thao tác đăng ký command của
  nó) — thêm loại item/thao tác mới = đăng ký thêm command, không sửa lõi history.
- History là danh sách command → hiện được **panel History** (xem/nhảy tới 1 bước bất kỳ) đúng
  yêu cầu Sonth.

### 2.3. Tool registry (công cụ)

Mỗi công cụ (select/move/text/image/shape/loop/hand-pan...) là 1 "tool" đăng ký vào registry,
xử lý các sự kiện chuột thô (`onPointerDown/Move/Up`) và **sinh ra command** (không tự sửa state):

```ts
interface EditorTool {
  id: string;
  onPointerDown(e, ctx): void;     // ctx: state hiện tại + hàm dispatch command + snap helper
  onPointerMove(e, ctx): void;
  onPointerUp(e, ctx): void;
  cursor?: string;
}
```
Thêm loại item mới (VD sau này có QR-code item) = thêm 1 tool + 1 command, không đụng lõi.

### 2.4. Snap + Helper-line

Module thuần tính toán (không UI): cho vị trí item đang kéo + các item khác + biên canvas →
trả về vị trí đã "hít" (snap) + danh sách đường gióng (helper-line) để UI vẽ:

```ts
function computeSnap(dragBox: Box, others: Box[], canvas: {w,h}, threshold: number)
  : { snappedBox: Box; guides: Guide[] };
// Guide = đường gióng ngang/dọc (cạnh trái/phải/giữa item khác, tâm canvas, lưới...)
```
- Snap theo: cạnh/tâm item khác, tâm canvas, mép canvas, lưới (grid) nếu bật.
- Helper-line = các `Guide` UI vẽ lên khi item đang kéo thẳng hàng với thứ gì đó.

### 2.5. Viewport (zoom / pan)

- `zoom` + `panX/panY` trong state. Tool 'hand' + phím tắt (space-drag) để pan; Ctrl+scroll để
  zoom quanh con trỏ. Toạ độ item vẫn là px trên canvas chuẩn (`refW/refH`, file 04) — zoom/pan
  chỉ là biến đổi hiển thị, KHÔNG đổi dữ liệu item.

### 2.6. Registry tổng (điểm Sonth nhấn "đăng ký, quản lý registry đầy đủ")

Gom mọi thứ đăng ký được vào 1 nơi khởi tạo editor, để mở rộng nhất quán:

```ts
createEditor({
  commands: [...],   // command registry
  tools: [...],      // tool registry
  itemTypes: [...],  // loại item (text/image/shape/ribbon/loop) — mỗi loại khai renderer +
                      // property-panel + default box + tool tạo nó
  snapConfig: {...},
})
```
`itemTypes` registry đặc biệt quan trọng: thêm 1 loại item = khai 1 entry (cách render, panel
thuộc tính, tool tạo, default) — không sửa rải rác nhiều file. Đây là "registry đầy đủ cho
layout" mà Sonth muốn.

## 3. Ranh giới với LayoutRenderer (file 04, GĐ1)

- **`LayoutRenderer` (GĐ1, packages/slide-shared)** = render 1 `LayoutContent`/variant ra DOM
  để TRÌNH CHIẾU (read-only, dùng chung editor-preview + ceremony-runtime, WYSIWYG).
- **`editor-core` (GĐ2)** = tầng CHỈNH SỬA (command/history/tool/snap) — sinh ra `LayoutContent`
  mà `LayoutRenderer` sẽ render. Editor preview = `editor-core` state → `LayoutRenderer`.
- Không trùng lặp: renderer chỉ đọc, editor-core chỉ sửa; gặp nhau ở kiểu `LayoutContent`.

## 4. Phạm vi triển khai (đưa vào plan GĐ2)

GĐ2 tăng phạm vi so với plan cũ (chỉ "port UI kéo-thả"). Chia GĐ2 thành sub-bước:
- **2.1** `packages/layout-editor-core`: state store + command/history (undo/redo/coalesce) +
  tool registry + item-type registry. Unit test thuần (không React) cho history + snap.
- **2.2** Snap + helper-line + zoom/pan.
- **2.3** Ráp UI React (`modules/layout-designer`): canvas, panels, toolbar lên editor-core;
  nối `LayoutRenderer` cho preview.
- **2.4** Versioning UI (publish/draft/version list) — xem [21](21-layout-versioning.md).
- **2.5** `variable_registry` autocomplete (file 09 §2.6).

## 5. Rủi ro / câu hỏi mở
- Undo/redo + versioning (file 21) là 2 khái niệm khác nhau: undo/redo là **trong phiên sửa
  draft** (chưa publish); version là **các mốc đã publish**. Đừng lẫn — undo không "lùi version",
  chỉ lùi thao tác trong draft hiện tại. Ghi rõ trong UI để user không nhầm.
- Có nên dùng thư viện dnd có sẵn (dnd-kit) cho phần kéo item trên canvas không, hay tự viết
  pointer-event (như prototype)? Canvas free-drag + snap + rotate thường **tự viết pointer-event**
  gọn hơn dnd-kit (dnd-kit mạnh cho list/sortable, không cho canvas tự do). Đề xuất: tự viết
  pointer trong tool registry; dnd-kit chỉ dùng cho bảng selector kéo-thả ở GĐ4b (list sortable).
- Đa chọn + nhóm (group/ungroup) — có làm ở v1 không? Đề xuất: chọn đa được (selection[]), group
  thành item lồng để sau (không phải v1).
