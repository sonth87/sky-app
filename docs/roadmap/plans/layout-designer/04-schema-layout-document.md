# 04 — Schema `LayoutDocument` (đề xuất, multi-aspect)

> Đây là bản nháp schema. Chưa chốt tên field. Mục tiêu: đủ diễn đạt mọi yêu cầu,
> đặt ở `packages/slide-shared` để editor + ceremony dùng chung.

## Nguyên tắc thiết kế

1. **Toạ độ px trên "canvas chuẩn" (`refW × refH`) của TỪNG variant** — xem §"Quyết định
   đơn vị toạ độ" bên dưới. Không phải px tuyệt đối kiểu "cố định 1920×1080 cho mọi màn".
2. **Một layout = nhiều variant theo tỷ lệ** — mỗi variant có background + item riêng. (YC6)
3. **Item tự do** — không ép panel/field stack dọc; đặt bất kỳ đâu. (từ editor prototype)
4. **Biến là token trong nội dung text / trong nguồn ảnh** — không hardcode field-key. (YC4)
5. **Layout thuần hình** — không chứa nghiệp vụ (GPA, danh hiệu…); nghiệp vụ nằm ở biến/adapter.

## Quyết định đơn vị toạ độ (2026-07-15, thay đổi so với bản nháp đầu)

> Xem thảo luận đầy đủ trong lịch sử trò chuyện — tóm tắt quyết định ở đây.

**Chốt: dùng `px` trên một "canvas chuẩn" riêng của từng variant, KHÔNG dùng `%`.**

Lý do đổi từ `%` sang `px`: với người dùng thiết kế (không phải dev), số `px` trên canvas
1920×1080 dễ hình dung ("cách lề trái 400px, rộng 300px") hơn nhiều so với phần trăm trừu
tượng. Đây là đánh đổi có chủ đích: **ưu tiên trải nghiệm chỉnh sửa trước, có thể quay lại `%`
sau nếu phát sinh vấn đề** (quyết định của Sonth — thử trước, đo sau).

**Về mặt toán học, `px + scale` và `%` tương đương khi tỷ lệ khung không đổi** — cả hai đều là
cùng một phép co giãn tuyến tính, chỉ khác cách biểu diễn con số. Do đó đổi sang `px` **không
mất khả năng chống lệch màn hình**, miễn tuân thủ đúng cơ chế dưới đây:

```
mỗi variant khai báo canvas chuẩn: refW, refH (VD 1920×1080)
mọi toạ độ item (x, y, w, h, fontSize...) là px TRÊN canvas chuẩn đó
lúc render: scale = min(mànThật.w / refW, mànThật.h / refH)   // giữ tỷ lệ, không méo
            mọi giá trị nhân với scale trước khi vẽ
```

- `scale` theo `min(...)` → nếu tỷ lệ màn thật LỆCH so với `refW/refH` của variant, phần dư
  ra sẽ là khoảng trống đều 2 bên (pillarbox) hoặc trên/dưới (letterbox) — **không kéo méo**.
- Đây chính là lý do **vẫn cần nhiều variant theo tỷ lệ (YC6)**: variant tốt nhất là variant
  có `refW:refH` KHỚP đúng màn thật đang chiếu → `resolveVariant` chọn variant gần nhất,
  scale-to-fit chỉ là lưới an toàn cho trường hợp không khớp tuyệt đối hoặc tỷ lệ custom lạ.
- fontSize/borderW/mọi kích thước đều nhân chung 1 `scale` — không riêng lẻ đơn vị khác nhau,
  tránh trường hợp chữ to nhưng viền không to theo.

**Nếu sau này phát sinh vấn đề** (VD: người dùng chỉnh trên canvas 1920 nhưng preview trên
màn cao độ phân giải rất khác nhiều tỷ lệ font-hinting/subpixel, hoặc muốn 1 layout chạy tốt
trên dải tỷ lệ rộng hơn số variant đã thiết kế) → quay lại `%`/`cqh` theo phân tích đã có ở
bản nháp trước (giữ trong lịch sử, chưa xoá tư duy đó, chỉ đổi field mặc định).

## Cấu trúc tổng thể (3 cấp)

```
LayoutDocumentMap          // 1 "bộ" layout (VD backdrops của 1 năm) = Record<layoutId, LayoutDocument>
  └─ LayoutDocument        // 1 layout logic (VD "Vinh danh xuất sắc")
       ├─ meta             // id, name, mô tả (KHÔNG có điều kiện chọn — điều kiện thuộc
       │                     Event.layoutRefs[].selector, xem file 10, chốt 2026-07-15)
       ├─ variables[]      // khai báo biến layout này DÙNG (tài liệu hoá, validate)
       └─ variants[]       // NHIỀU biến thể theo tỷ lệ màn hình
            └─ Variant     // 1 tỷ lệ: aspect + background + items[]
                 └─ Item   // text | image | shape | ribbon ...  (toạ độ %)
```

## Draft TypeScript

```ts
// ─── Tỷ lệ màn hình ──────────────────────────────────────────────
// Không đóng cứng union — cho phép preset + custom (YC6)
export interface AspectRatio {
  id: string;         // "16:9", "21:9", "25:9", "4:3", hoặc "custom:1920x720"
  w: number;          // 16
  h: number;          // 9
  label?: string;     // "Ultrawide 21:9"
}

// ─── Toạ độ + kích thước, THEO PX TRÊN CANVAS CHUẨN CỦA VARIANT ──
// Đơn vị là px "thiết kế" trên refW×refH của variant chứa item này,
// KHÔNG phải px màn hình thật. Render nhân với scale = min(realW/refW, realH/refH).
export interface Box {
  x: number;          // px trên canvas chuẩn
  y: number;          // px trên canvas chuẩn
  w: number;          // px trên canvas chuẩn
  h: number;          // px trên canvas chuẩn
  rotation?: number;  // độ, mặc định 0
  z?: number;         // z-index (thứ tự lớp)
}

// ─── Item (phần tử trên canvas) ─────────────────────────────────
// LoopItem thêm 2026-07-15 (trao giải tập thể — 1 khung thiết kế 1 lần, lặp theo danh sách
// thành viên lúc render). Định nghĩa đầy đủ + overflow/itemTemplate/gap ở file 11 — union ở
// đây CHỈ khai tên để LayoutItem là nguồn chân lý duy nhất, tránh 2 nơi định nghĩa union.
export type LayoutItem =
  | TextItem | ImageItem | ShapeItem | RibbonItem | LoopItem;

interface BaseItem {
  id: string;
  box: Box;
  opacity?: number;   // 0..100
  locked?: boolean;   // khoá không cho di chuyển trong editor
  name?: string;      // nhãn hiện ở panel Layers
}

export interface TextItem extends BaseItem {
  type: 'text';
  content: string;    // "Xin chúc mừng @full_name" — token @var nhúng trong text
  fontFamily?: string;
  fontSize: number;   // px trên canvas chuẩn — nhân với scale lúc render, như Box
  fontWeight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  vAlign?: 'top' | 'center' | 'bottom';
  italic?: boolean;
  uppercase?: boolean;
  lineHeight?: number;
  shadow?: boolean | TextShadow;
  // Cách xử lý khi text tràn box: co chữ / xuống dòng / cắt
  overflow?: 'shrink' | 'wrap' | 'clip';
}

export interface ImageItem extends BaseItem {
  type: 'image';
  // Nguồn ảnh: hoặc tĩnh (src) hoặc theo biến (varKey → mỗi record 1 ảnh)
  src?: string;         // asset path tĩnh
  varKey?: string;      // "anh_dai_dien" — bind biến ảnh; ưu tiên hơn src khi có record
  fit?: 'cover' | 'contain';
  shape?: 'rect' | 'round' | 'circle';
  borderW?: number;     // px trên canvas chuẩn, nhân scale như mọi kích thước khác
  borderColor?: string;
  ring?: string;        // ảnh viền overlay (giữ tính năng "ring" cũ)
  filter?: 'none' | 'bright' | 'gray' | 'warm';
  fallbackText?: string; // hiện khi không có ảnh — "Không có ảnh"
}

export interface ShapeItem extends BaseItem {
  type: 'shape';
  shape: 'rect' | 'circle' | 'triangle' | 'diamond' | 'frame' | 'line';
  fill?: string;
  stroke?: string;
  strokeW?: number;
  radius?: number;      // bo góc cho rect
}

export interface RibbonItem extends BaseItem {
  type: 'ribbon';
  content: string;      // có thể chứa @var
  bg?: string;
  color?: string;
  fontSize: number;     // px trên canvas chuẩn
  fontWeight?: number;
  // ribbon = 1 dạng text đặc biệt có nền cắt góc; có thể coi là TextItem + style
}

// LoopItem — định nghĩa đầy đủ (itemTemplate, itemBox, direction, overflow: shrink|truncate,
// maxItems, overflowMoreText) ở 11-canonical-da-loai-va-loop.md §"Item dạng Loop", KHÔNG lặp
// lại ở đây để tránh 2 nguồn định nghĩa lệch nhau khi 1 trong 2 file được sửa sau này.

// ─── Variant: một biến thể theo tỷ lệ ───────────────────────────
export interface LayoutVariant {
  aspect: AspectRatio;         // tỷ lệ của variant này
  refW: number;                 // canvas chuẩn dùng khi thiết kế, VD 1920
  refH: number;                 // VD 1080 (refW/refH nên khớp aspect.w/aspect.h)
  background?: Background;      // ẢNH NỀN RIÊNG cho tỷ lệ này (YC6)
  items: LayoutItem[];         // VỊ TRÍ ITEM RIÊNG cho tỷ lệ này (YC6), toạ độ px trên refW×refH
  safeArea?: Box;              // vùng an toàn (viền vàng trong prototype) — optional
}

export interface Background {
  kind: 'image' | 'color' | 'gradient';
  src?: string;                // asset path (kind=image)
  color?: string;              // (kind=color)
  gradient?: string;           // CSS gradient string (kind=gradient)
}

// ─── LayoutDocument: 1 layout logic ─────────────────────────────
export interface LayoutDocument {
  id: string;                  // "vinh-danh-xuat-sac"
  name: string;                // "Vinh danh — Xuất sắc"
  description?: string;
  version: number;             // schema version, để migrate về sau
  // Biến mà layout này dùng — khai báo để validate + hiện trong editor
  variables?: LayoutVariableRef[];
  // KHÔNG có field selector/điều kiện chọn ở đây (chốt 2026-07-15, xem file 14 §1a).
  // layout-designer CHỈ quản lý danh sách layout (thuần hình) — điều kiện "layout nào
  // dùng cho ai" là quyết định của ceremony/control khi gán layout vào 1 Event, xem
  // EventLayoutRef.selector ở file 10.
  // Nhiều biến thể theo tỷ lệ; PHẢI có ít nhất 1
  variants: LayoutVariant[];
  // Biến thể mặc định khi tỷ lệ màn không khớp cái nào (fallback)
  defaultVariantAspectId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LayoutVariableRef {
  key: string;                 // "full_name"
  kind: 'text' | 'image';
  required?: boolean;
}

// ─── Map: 1 bộ layout (VD 1 năm) ────────────────────────────────
export type LayoutDocumentMap = Record<string, LayoutDocument>;
```

## Chống lệch pixel giữa các màn hình (giải YC7)

Ba tầng phòng vệ (cập nhật theo quyết định `px + scale`):

1. **Toạ độ px trên canvas chuẩn (`refW×refH`) của variant.** Không phải px màn hình thật —
   là "px thiết kế", luôn đi kèm kích thước canvas nó thuộc về.
2. **Scale-to-fit lúc render.** `scale = min(realW/refW, realH/refH)`; mọi toạ độ/fontSize/
   border nhân với `scale` trước khi vẽ.
3. **Variant riêng cho mỗi tỷ lệ.** Cách tốt nhất để hình đẹp đúng mọi màn là thiết kế đủ
   variant cho từng tỷ lệ hay dùng. `resolveVariant` chọn variant có `aspect` khớp nhất; khi
   KHÔNG có variant khớp tuyệt đối, xem quyết định fallback ngay dưới đây (chốt 2026-07-15).

### Khi thiếu variant khớp đúng tỷ lệ màn — CHỐT 2026-07-15 (xem [14](14-rasoat-2026-07-15.md) #9)

Sonth chốt: *"thiết kế theo tỷ lệ màn hình, sử dụng cũng chọn theo tỷ lệ màn hình, nếu không
có tỷ lệ tương ứng, có 2 điều xảy ra: quay lại thêm tỷ lệ, hoặc sử dụng 1 tỷ lệ đã làm trước
đó và chấp nhận nó bị kéo giãn hoặc co lại tuỳ sự thay đổi."*

Nghĩa là: **KHÔNG letterbox/pillarbox (không viền đen giữ nguyên tỷ lệ)** — khi phải dùng
variant gần nhất cho 1 màn lệch tỷ lệ, chấp nhận **stretch** (scaleX ≠ scaleY, hình co/giãn
méo theo đúng khung màn, lấp đầy hoàn toàn, không viền thừa). Đây là lưới an toàn cuối cùng —
lựa chọn ưu tiên vẫn luôn là **quay lại thiết kế thêm variant đúng tỷ lệ** khi phát hiện màn
mới; stretch chỉ dùng tạm khi chưa kịp làm variant mới.

### resolveVariant + scale (thay `resolveTemplateVariant` cũ, tổng quát hơn)

```ts
function resolveVariant(doc: LayoutDocument, screen: {w:number;h:number}): LayoutVariant {
  const target = screen.w / screen.h;
  // chọn variant có aspect gần nhất với tỷ lệ màn thực
  let best = doc.variants[0], bestDiff = Infinity;
  for (const v of doc.variants) {
    const diff = Math.abs(v.aspect.w / v.aspect.h - target);
    if (diff < bestDiff) { bestDiff = diff; best = v; }
  }
  return best;
}

// scaleX/scaleY RIÊNG BIỆT — khi variant khớp đúng tỷ lệ màn, 2 giá trị bằng nhau (không méo).
// Khi KHÔNG khớp (fallback), 2 giá trị khác nhau → hình stretch lấp đầy màn, không viền đen
// (chốt 2026-07-15 — xem đoạn trên).
function computeScale(variant: LayoutVariant, screen: {w:number;h:number}) {
  return {
    scaleX: screen.w / variant.refW,
    scaleY: screen.h / variant.refH,
  };
}

// Render 1 item: nhân theo TỪNG TRỤC — scaleX cho x/w, scaleY cho y/h. fontSize dùng
// trung bình 2 trục (hoặc scaleY, tuỳ lựa chọn fontSizeBasis — xem câu hỏi mở) để chữ không
// méo quá mức dù khung có stretch.
function toRenderBox(box: Box, scaleX: number, scaleY: number) {
  return {
    left: box.x * scaleX,
    top: box.y * scaleY,
    width: box.w * scaleX,
    height: box.h * scaleY,
  };
}
```

## Ví dụ 1 `LayoutDocument` (rút gọn)

```jsonc
{
  "id": "vinh-danh-xuat-sac",
  "name": "Vinh danh — Xuất sắc",
  "version": 1,
  "variables": [
    { "key": "full_name", "kind": "text", "required": true },
    { "key": "anh_dai_dien", "kind": "image" },
    { "key": "chuc_vu", "kind": "text" }
  ],
  "variants": [
    {
      "aspect": { "id": "16:9", "w": 16, "h": 9 },
      "refW": 1920, "refH": 1080,
      "background": { "kind": "image", "src": "assets/2026/bg-16x9.jpg" },
      "items": [
        { "id": "name", "type": "text", "box": {"x":384,"y":594,"w":1152,"h":130},
          "content": "@full_name", "fontSize": 64, "fontWeight": 800,
          "color": "#fff", "align": "center", "shadow": true },
        { "id": "avatar", "type": "image", "box": {"x":806,"y":194,"w":307,"h":302},
          "varKey": "anh_dai_dien", "shape": "circle", "ring": "assets/2026/ring.png" }
      ]
    },
    {
      "aspect": { "id": "25:9", "w": 25, "h": 9 },
      "refW": 2560, "refH": 920,
      "background": { "kind": "image", "src": "assets/2026/bg-25x9.jpg" },
      "items": [
        { "id": "name", "type": "text", "box": {"x":896,"y":460,"w":768,"h":129},
          "content": "@full_name", "fontSize": 72, "fontWeight": 800,
          "color": "#fff", "align": "center", "shadow": true },
        { "id": "avatar", "type": "image", "box": {"x":256,"y":184,"w":256,"h":460},
          "varKey": "anh_dai_dien", "shape": "circle" }
      ]
    }
  ]
}
```

Chú ý: cùng item `name`/`avatar` nhưng **box + background + canvas chuẩn khác nhau** giữa 16:9
và 25:9 → đúng YC6. Mỗi variant tự chọn `refW/refH` hợp lý cho tỷ lệ của mình.

## Quan hệ item ↔ editor prototype

| Prototype (`.dc.html`) | Schema mới |
|---|---|
| `items[].x,y,w` (px, canvas 1920×1080 ngầm định) | `box.x/y/w/h` (px) trên `variant.refW/refH` khai báo tường minh — gần như 1-1, chỉ thêm refW/refH |
| `type: text/ribbon/image/shape` | `TextItem/RibbonItem/ImageItem/ShapeItem` |
| `content: "@ho_ten"` | `content` (giữ nguyên token) |
| `varKey` (image) | `ImageItem.varKey` |
| `samples{}` | KHÔNG lưu vào layout — chỉ để preview (lấy từ FieldMappingProfile/record mẫu) |
| `varDefs[]` | thay bằng import `STUDENT_TEMPLATE_VARIABLES` + `CustomVariable` (xem 05) |
| "Bộ sưu tập" (cụm dựng sẵn) | preset item-group, nice-to-have |

## Câu hỏi chốt sau (đưa vào 08)

- `refW/refH` mặc định khi tạo variant mới trong editor là bao nhiêu? (đề xuất: suy từ
  `aspect.w/h` × hệ số chuẩn, VD ×120 → 16:9 thành 1920×1080, 21:9 thành 2520×1080)
- Ngưỡng "diff" trong `resolveVariant` bao nhiêu thì nên **cảnh báo mềm** trong `control/`
  ("màn đang dùng lệch nhiều so với variant gần nhất, cân nhắc thiết kế thêm") — không chặn,
  chỉ gợi ý, vì đã chốt KHÔNG validate bắt buộc (xem §"Khi thiếu variant khớp" ở trên).
- `fontSize` khi stretch (scaleX≠scaleY) nên nhân theo `scaleX`, `scaleY`, hay trung bình 2
  trục? Ảnh hưởng độ méo của chữ khi variant fallback bị kéo giãn khác tỷ lệ gốc.
- Có cần "layout con lồng nhau" (group) không, hay phẳng là đủ?
- Font: bundle sẵn (đã chốt, xem file 08 A4) — danh sách cụ thể sẽ bổ sung sau khi implement,
  chỉ cần đảm bảo cơ chế đổi font được (không hardcode 1 font duy nhất trong renderer).
- Có cần "master/base variant" để các variant khác kế thừa item, chỉ override box? (giảm lặp)
  — đã chốt KHÔNG kế thừa runtime (A3, file 08), chỉ còn câu hỏi tiện ích UI thuần tuý.
- Nếu về sau đổi lại `%`/`cqh` (theo đúng kế hoạch "thử px trước, đo sau"): cần viết sẵn hàm
  convert `px(trên refW/refH) → %` để migrate 1 chiều không mất dữ liệu.
