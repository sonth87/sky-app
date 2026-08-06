---
status: proposed
owner: sonth87
created: 2026-08-06
target_version: layout-designer-v0.14.0 → v0.23.0 (GĐ10 → GĐ19)
supersedes: docs/roadmap/plans/layout-designer-completion.md (GĐ10/GĐ11/GĐ12 — Group/Ungroup làm
  điều kiện, custom component, bộ sưu tập dựng sẵn)
implemented_doc: null
---

## Bối cảnh & lý do

Sau khi hoàn thành GĐ6→GĐ9 (dọn wiring, property panel LoopItem, hiệu ứng shadow/border/gradient,
media search+delete, focal point, multi-select+batch-command), Sonth đối chiếu trực tiếp với
Canva (2 ảnh chụp UI) và kết luận: palette trái hiện tại quá sơ sài, property panel "nhìn xấu",
nhiều property "chưa hoạt động đúng" (ví dụ "Co chữ" không thực sự co). Yêu cầu rõ: **không làm
nửa vời** — mỗi phase phải mô tả đủ UI/UX/luồng thao tác/vấn đề phát sinh để triển khai được
thẳng, không phải hỏi lại.

Trước khi viết plan này, đã tự audit lại code thật (đọc trực tiếp từng file, không suy đoán) và
phát hiện **3 lớp vấn đề**, xếp theo mức độ nghiêm trọng:

1. **Bug thật, tính năng đã quảng cáo nhưng không chạy:**
   - `TextItem.overflow: 'shrink'` — UI có nút chọn "Co chữ", nhưng `renderer.tsx`'s
     `TextItemView` (dòng 177-178) CHỈ xử lý riêng `'clip'` và `'wrap'`; `'shrink'` rơi vào nhánh
     mặc định, không co gì cả. Chữ vẫn tràn khung.
   - `ShapeItem.shape` cho phép chọn 6 giá trị (`rect/circle/triangle/diamond/frame/line`,
     `ShapeControls.tsx:16`) nhưng `renderer.tsx`'s `ShapeItemView` (dòng 278-290) **CHỈ xử lý
     `borderRadius` cho `circle`/`rect`** — chọn `triangle`/`diamond`/`line`/`frame` hiện render
     RA HÌNH CHỮ NHẬT GIỐNG NHAU, không có gì phân biệt hình dạng thật. Đây là 1 phát hiện MỚI
     (không có trong roadmap cũ) — 4/6 lựa chọn hình dạng trong Property Panel là "nút chết".
2. **Nợ visual nhất quán (không phải bug, nhưng dưới chuẩn):**
   - Toàn bộ ô chọn màu trong Property Panel (`TextControls`/`ShapeControls`/`RibbonControls`/
     `ImageControls`/`ShadowControl`/`FrameBackgroundControls` — 8 chỗ) dùng `<input
     type="color">` (OS native picker, xấu, không đồng bộ giao diện) — TRONG KHI
     `packages/ui/src/ColorfulSwatchButton.tsx` đã có sẵn 1 nút swatch đẹp (Radix Popover +
     `@uiw/react-color-colorful`) và đang KHÔNG được dùng ở bất kỳ đâu trong
     `modules/layout-designer`.
   - Rail/ComponentsPanel/LayersPanel dùng ký tự Unicode thô làm icon (▦▤❖▧≣●▲◆▢―▮), 1 emoji
     (`PanelHeader.tsx`'s 🗑) — trong khi `lucide-react` đã là dependency chính thức, dùng nhất
     quán ở nơi khác trong CÙNG module.
   - `radix-ui` đã có sẵn trong monorepo (`packages/ui/package.json`, dùng bởi
     `ColorfulSwatchButton`/`primitives/select.tsx`) nhưng 2 modal hiện có của layout-designer
     (`LayoutInfoModal.tsx`, `CrossLayoutVariantPickerModal.tsx`) là hand-rolled `fixed inset-0`
     — ĐÚNG kiểu cách mà `ColorfulSwatchButton.tsx`'s comment đầu file đã ghi nhận là **sai/dễ
     lỗi vị trí trong Modal lồng nhau, và đã bỏ hẳn để chuyển qua Radix**. Bài học này chưa lan
     tới việc chọn công nghệ cho modal mới.
3. **Thiếu hẳn (chưa từng có):** thư viện Icon/SVG, Frame (ảnh cắt theo hình trang trí), Grid
   preset (bố cục nhiều ô dựng sẵn), Text preset (kiểu chữ dựng sẵn), Media Library dạng modal
   đầy đủ, toolbar riêng theo loại item, "lưu nhóm item đã chọn thành mẫu cá nhân".

**2 quyết định định hướng đã chốt với Sonth (AskUserQuestion):**
1. Rail giữ **8 tab**: 6 nhóm mới (Mẫu/Văn bản/Media/Đồ họa/Khung/Lưới) + 2 tab cũ đang chạy tốt
   (Biến/Lớp) — không dồn/bỏ.
2. Triển khai **theo phụ thuộc kỹ thuật**: nền tảng (icon/primitive dùng chung, sửa bug render,
   property panel, toolbar riêng loại) TRƯỚC → 3 thư viện nội dung (Đồ họa/Khung/Lưới) + Mẫu cá
   nhân Ở GIỮA → lắp Rail mới (đổi điều hướng) CUỐI CÙNG khi mọi tab có nội dung thật.

**Quan hệ với roadmap cũ** (`docs/roadmap/plans/layout-designer-completion.md`): kế hoạch này
**thay thế hoàn toàn** GĐ10 (Group/Ungroup là điều kiện bắt buộc)/GĐ11 (custom component)/GĐ12
(bộ sưu tập) của doc cũ. Phát hiện quan trọng: **"Mẫu > Cá nhân" KHÔNG cần GroupItem/Group-
Ungroup trước** — chỉ cần snapshot mảng `LayoutItem[]` từ multi-select (GĐ9, đã xong) + chèn lại
bằng `batchCommand` (GĐ9, đã xong) là đủ. Group/Ungroup thật (khối di chuyển CỐ ĐỊNH lâu dài) hạ
xuống backlog, không chặn gì ở đây. Đánh số tiếp nối: doc cũ dừng thực tế ở GĐ9 (`v0.10.0`) — kế
hoạch này dùng **GĐ10 → GĐ19**, nhãn version `v0.14.0 → v0.23.0` (nhảy qua v0.11-13 đã "chiếm"
bởi doc cũ, tránh đá nhãn dù nội dung không dùng nữa).

## Quy ước thiết kế dùng CHUNG cho mọi phase (tránh lặp lại ở từng file)

Đã đọc trực tiếp code hiện tại để lấy đúng token thị giác ĐANG DÙNG — mọi UI mới PHẢI theo đúng
bộ này, không tự sáng tạo màu/spacing mới:

- **Màu:** accent `#4b57e6` (border/bg khi active, dùng khắp `ItemToolbar`/`ImageControls`/
  `ShapeControls`), border mặc định `#e6e6ee`, chữ phụ `#9a9bab`, chữ chính phụ `#5c5d6e`, nền
  input `#fcfcfd`, nền hover nhẹ `#f4f5f9`, đỏ cảnh báo/xoá `hover:text-red-500` (Tailwind
  chuẩn, không hex riêng).
- **Bo góc:** input/nút nhỏ `rounded-[7px]`, card/tile `rounded-lg` (~8px), modal/popover lớn
  `rounded-[11px]` (khớp `ColorfulSwatchButton`/`ColorfulSwatchPopover`).
- **Shadow modal/popover:** `shadow-[0_14px_34px_rgba(20,20,40,0.18)]` (dùng nguyên văn ở MỌI
  modal/popover mới — đã dùng ở `LayoutInfoModal`/`ColorfulSwatchButton`).
- **Section trong Property Panel:** `border-t border-[#f0f0f5] p-[13px_15px]`, title
  `font-semibold text-[11px] tracking-[.04em] uppercase text-[#9a9bab] mb-[10px]` — nguyên trạng
  `CommonControls.tsx`'s `Section`, KHÔNG đổi.
- **Icon:** `lucide-react` (`^1.24.0`, đã pin catalog) cho MỌI icon ngữ nghĩa, size chuẩn 14-16px
  trong control nhỏ, 18-20px trong tile lớn. KHÔNG dùng emoji. Danh sách icon cụ thể từng phase
  đã tra thẳng trong `node_modules/lucide-react` (xem file 01) — **không còn hedge "chốt lúc
  code"**, tên export đã xác nhận tồn tại.
- **Popover/Dialog:** dùng `radix-ui` (`Popover`/`Dialog`/`Tabs` namespace import, kiểu
  `import { Popover as PopoverPrimitive } from 'radix-ui'` — ĐÚNG cách `ColorfulSwatchButton.tsx`
  đang làm) — KHÔNG hand-roll `fixed inset-0`/click-outside tự viết cho bất kỳ UI MỚI nào trong
  kế hoạch này (bài học đã có, ghi rõ trong comment `ColorfulSwatchButton.tsx`). Vì `radix-ui`
  KHÔNG được khai trực tiếp trong `package.json` của module nào ngoài `packages/ui` (quy ước ghi
  rõ ở `pnpm-workspace.yaml:81-85`: "packages/ui dùng chung... primitive Radix trùng lặp 3 nơi")
  — mọi Dialog/Tabs MỚI viết dưới dạng primitive trong `packages/ui/src/primitives/` (cùng cấp
  `select.tsx`/`slider.tsx`), `modules/layout-designer` chỉ import từ `@sky-app/ui`, không tự
  khai `radix-ui` trong `package.json` riêng.
- **Interaction model chèn item từ palette:** THỐNG NHẤT dùng kéo-thả (`useSpawnDrag.ts`'s
  `onDown`, đúng pattern `ComponentsPanel.tsx` đang dùng) cho MỌI tile ở 6 tab mới (Văn
  bản/Đồ họa/Khung/Lưới/Mẫu) — KHÔNG dùng click-để-áp-dụng-ngay (kiểu `ImagePanel.tsx` hiện tại)
  cho tile-thêm-item-mới, để tránh 2 mô hình tương tác khác nhau cho cùng hành động "thêm 1 thứ
  vào canvas". `ImagePanel`/`MediaLibraryModal` vẫn giữ click-chọn (vì đó là "áp dụng cho item
  ĐANG chọn" hoặc "chọn rồi bấm Xác nhận", ngữ nghĩa khác hẳn "thêm mới").

## Danh sách 10 phase + quan hệ phụ thuộc

| # | File | Version | Phụ thuộc | Rủi ro |
|---|---|---|---|---|
| GĐ10 | `01-icon-foundation-and-shape-fix.md` | v0.14.0 | không | Thấp |
| GĐ11 | `02-property-panel-redesign.md` | v0.15.0 | GĐ10 | Trung bình |
| GĐ12 | `03-text-autofit.md` | v0.16.0 | không | Trung bình-Cao |
| GĐ13 | `04-item-toolbar-per-type.md` | v0.17.0 | GĐ10 | Thấp-Trung bình |
| GĐ14 | `05-media-library-modal.md` | v0.18.0 | GĐ10 | Trung bình |
| GĐ15 | `06-graphics-library.md` | v0.19.0 | GĐ10, GĐ11 (shape fix) | Thấp-Trung bình |
| GĐ16 | `07-frames-mask-shapes.md` | v0.20.0 | GĐ15 (`overrides`) | Thấp |
| GĐ17 | `08-grid-presets.md` | v0.21.0 | GĐ15 (`overrides`), GĐ9 (`batchCommand`) | Trung bình |
| GĐ18 | `09-personal-templates.md` | v0.22.0 | GĐ17 (spawn `'preset'`) | Thấp |
| GĐ19 | `10-rail-assembly.md` | v0.23.0 | TẤT CẢ trên | Thấp kỹ thuật/Cao UX |

GĐ12 (text autofit) và GĐ14 (media modal) độc lập kỹ thuật, có thể làm SONG SONG với nhánh
GĐ10→GĐ11→GĐ13 nếu Sonth muốn — không có phụ thuộc chéo giữa 2 nhánh này.

## Backlog (không đánh số, không chặn gì)

- **Group/Ungroup thật** (khối di chuyển/resize/xoay CỐ ĐỊNH lâu dài) — dùng lại nguyên phân
  tích `GroupItem`/5 dispatch-site của roadmap cũ khi cần, không thiết kế lại.
- **Tô màu (tint) icon/SVG trong Đồ họa** — hoãn tới khi có nhu cầu thật.
- **`AssetMeta` mở rộng field** (type/dimensions/tags, hỗ trợ video...) — hoãn tới khi Media
  Library cần loại asset khác ngoài ảnh.
- **Migrate `LayoutInfoModal.tsx`/`CrossLayoutVariantPickerModal.tsx` sang Radix Dialog** — 2
  modal này ĐANG CHẠY ĐÚNG, không có bug báo cáo — không refactor lại chỉ vì công nghệ mới đẹp
  hơn (rủi ro thuần, không lợi ích cụ thể). Chỉ modal MỚI (GĐ14) dùng Radix từ đầu.

## Verification tổng thể mỗi phase

`pnpm typecheck` toàn repo + `pnpm --filter @sky-app/layout-editor-core test` +
`pnpm --filter module-layout-designer test` sạch (baseline 255/255 sau GĐ9), cộng
`pnpm --filter @sky-app/ceremony-db test`/`data-service test` cho phase đụng DB/asset (GĐ14,
GĐ18). Runtime thật (`dev:app`) Sonth xác nhận riêng cho phase chạm `renderer.tsx` (GĐ11's shape
fix, GĐ12, GĐ16) và phase lắp ráp cuối (GĐ19).

