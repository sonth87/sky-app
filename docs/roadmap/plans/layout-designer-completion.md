---
status: in_progress
owner: sonth87
created: 2026-08-05
target_version: layout-designer-v0.7.0 → v0.13.0 (GĐ6 → GĐ12)
supersedes: null
implemented_doc: null
---

> **Cập nhật 2026-08-06:** GĐ6→GĐ9 đã hoàn thành (xem lịch sử commit). GĐ10/GĐ11/GĐ12 (Group/
> Ungroup, custom component, bộ sưu tập) đã bị thay thế bởi
> [`docs/roadmap/plans/canva-ux/00-index.md`](./canva-ux/00-index.md) — xem ghi chú tại chỗ ở
> Giai đoạn 10 dưới đây.

# Kế hoạch: Hoàn thiện tính năng Layout Designer (GĐ6 → GĐ12)

> Tiếp nối GĐ0-5 của kế hoạch triển khai gốc "Layout Designer + Event trong Ceremony"
> (`~/.claude/plans/lazy-tinkering-goblet.md`, ngoài repo — plan-mode history trên máy dev).
> Kế hoạch NÀY từ nay là bản lưu chính thức trong repo cho GĐ6-12, theo đúng quy ước
> `docs/roadmap/README.md` (1 file = 1 kế hoạch, có `status` theo dõi) — không còn chỉ nằm
> ngoài repo như các GĐ trước, để tránh bị miss giữa các phiên làm việc.

## Context

Sonth cảm nhận `modules/layout-designer` "gần như chưa có gì, chỉ có mỗi cái khung" và tích hợp
với ceremony "chưa đầy đủ, khả năng còn chưa chạy". Trước khi lên kế hoạch, đã cho audit code
thật (không dựa vào memory/plan cũ) qua nhiều agent độc lập:

- **Layout designer KHÔNG phải shell rỗng** — codebase lớn, có test thật (152/152
  `layout-editor-core`, 254/255 `module-layout-designer`), luồng thật chạy được: Library →
  tạo/mở layout → kéo-thả/resize/xoay/snap/zoom-pan → 5 loại item với property panel riêng →
  chèn token `@var` → quản lý variant nhiều tỷ lệ khung hình → publish/version. Ceremony
  tích hợp cũng thật (đã trace toàn bộ chuỗi tạo Event → publish layout → gán qua Hub →
  activate → backdrop hiện đúng, mọi mắt xích có test pass).
- Tuy nhiên audit cũng lộ ra **1 danh sách gap cụ thể, có thật** — vừa việc "đã xây nhưng
  quên nối dây" (xoá layout giả bằng localStorage, màu tag chưa nối, panel Ảnh luôn rỗng do
  thiếu 1 dòng wiring), vừa việc "nửa vời" (LoopItem không có UI chỉnh, hiệu ứng đổ
  bóng/viền/gradient chỉ phủ 1-2/4 loại item), vừa việc **hoàn toàn chưa làm và bị chính
  blueprint gốc gắn cờ hoãn** (multi-select trên canvas, group/ungroup — cả 2 đều là câu hỏi
  mở "not v1" ghi sẵn trong `docs/roadmap/plans/layout-designer/23-editor-core-architecture.md`
  và `04-schema-layout-document.md`).
- Sonth đối chiếu thêm với project tham khảo `PROJECTS/my-builder` (web-page builder tổng quát,
  không cùng domain nhưng có tầng editor/property-panel/asset-management đáng so sánh) và chỉ
  ra đúng 1 mảng còn thiếu mà audit ban đầu bỏ sót: **gộp nhiều component thành 1 custom
  component tái dùng** + **thư viện cụm component dựng sẵn kiểu Canva**. Đào sâu xác nhận: cả
  2 đều chưa tồn tại trong sky-app, và ngay cả my-builder cũng chỉ có phần 2 (thư viện dựng sẵn
  do app cung cấp) là tính năng thật cho user dùng — phần 1 (user tự lưu component) ở my-builder
  cũng mới chỉ là công cụ nội bộ cho dev, chưa từng lộ ra cho end-user.

**Mục tiêu roadmap này:** sắp xếp toàn bộ gap đã xác nhận thành các giai đoạn có thứ tự phụ
thuộc kỹ thuật đúng, ưu tiên hoàn thiện **layout-designer trước**, ceremony-integration-hardening
và phần GĐ5 còn lại của roadmap gốc (`~/.claude/plans/lazy-tinkering-goblet.md`) tạm hoãn sau
theo đúng lựa chọn của Sonth. Đây là roadmap XÁC ĐỊNH SCOPE — chưa bắt tay code giai đoạn nào,
từng giai đoạn khi tới lượt làm thật sẽ có breakdown chi tiết riêng (đúng phong cách các PHỤ LỤC
đã làm trong plan gốc), cập nhật ngay trong file này khi có tiến triển lớn (đúng quy ước
`in_progress` của `docs/roadmap/README.md`).

**Đánh số tiếp nối:** plan gốc dừng ở GĐ5 (+ GĐ CUỐI/DOCS ở cuối cùng) — roadmap này là GĐ6→GĐ12,
chèn vào TRƯỚC GĐ CUỐI/DOCS trong thứ tự tổng thể.

---

## Giai đoạn 6 — Dọn nợ "đã xây nhưng chưa nối dây" + hoàn thiện thanh công cụ chọn

**Mục tiêu:** Đóng các gap nhỏ, độc lập, rủi ro thấp — phần lớn là **nối lại dây đã có sẵn ở
tầng dưới** (port/DB/component đã tồn tại, chỉ thiếu 1 bước wiring cuối) hơn là xây mới. Không
phụ thuộc giai đoạn nào khác trong roadmap này, có thể xen kẽ làm trước/sau bất kỳ giai đoạn nào
bên dưới.

**Version:** `layout-designer-v0.7.0`

**Phạm vi:**
- **Xoá layout thật (Move to Trash hiện là giả):** `LayoutLibraryScreen.tsx` chỉ ghi
  `trashedIds` vào `localStorage` — không đụng DB, không có `deleteDocument` ở bất kỳ tầng nào
  (`LayoutPort`, `packages/ceremony-db/src/queries/layout.ts`, không adapter nào có). Thêm:
  - `deleteLayoutDocument(executor, id)` ở `packages/ceremony-db/src/queries/layout.ts`, theo
    đúng khuôn mẫu **đã có sẵn** `deleteEvent()` (`packages/ceremony-db/src/queries/event.ts`,
    viết 2026-08-03) — xoá tường minh `layout_draft`/`layout_version` TRƯỚC `layout_document`
    trong 1 transaction, KHÔNG dựa vào `ON DELETE CASCADE` (pragma `foreign_keys` chỉ bật ở
    driver `better-sqlite3`/Electron, không bật ở `sql-js-executor.ts`/Web WASM).
  - `LayoutPort.deleteDocument(id)` (`packages/service-contracts/src/layout.ts`) + implement ở
    `platform-electron`/`platform-web`/`sqlite-wasm-layout.ts`, IPC mới
    `kernel:layout:deleteDocument`, REST route mới ở `apps/data-service/src/routes/layout.ts`.
  - `LayoutLibraryScreen.tsx`: nút xoá gọi `layoutPort.deleteDocument()` thật, bỏ cơ chế
    `localStorage` trashedIds.
- **Cần chốt trước khi code:** `event_layout_ref` tham chiếu `layout_document_id` KHÔNG có
  `ON DELETE CASCADE` — nếu 1 Event đang dùng layout bị xoá, cần chốt: (a) chặn cứng, (b) cảnh
  báo mềm liệt kê Event đang dùng rồi cho xoá tiếp nếu xác nhận, (c) cho xoá vô điều kiện. Đề
  xuất (b) — đúng tinh thần "không tự động chặn cứng" đã nhất quán trong plan gốc.
- **Màu tag layout dead-wired:** `LayoutDesignerApp.tsx` đã có sẵn `documentColor`/
  `onChangeColor` props nối tới `ColorSwatchPicker`, nhưng `LayoutDesignerAppModule.tsx` không
  truyền xuống. Thêm handler gọi `layoutPort.updateDocumentMeta(id, { color })` (method đã có
  sẵn, đã dùng ở `LayoutInfoModal`).
- **Cần chốt trước khi code:** đặt UI đổi màu ở đâu — (a) chỉ bật lại prop có sẵn trong toolbar
  `LayoutDesignerApp` (rẻ nhất, code đã chờ sẵn), hay (b) thêm cả vào `LayoutInfoModal.tsx`
  (hiện chưa có field màu). Đề xuất làm (a) trước, cân nhắc (b) sau nếu bất tiện.
- **`listAssets` bị bỏ sót (cùng lớp bug với mục màu):** `LayoutDesignerAppModule.tsx` có
  `assetPort` nhưng chỉ tạo `resolveAssetUrl`/`pickAndSaveImage`, không tạo `listAssets` truyền
  xuống `Flyout/ImagePanel.tsx` — panel "Ảnh" (đã code sẵn) đang luôn rơi vào nhánh rỗng trong
  app thật. Thêm wiring là đủ để hoạt động thật lần đầu tiên.
- **Nút Ẩn/Hiện trên toolbar chọn nhanh:** `modules/layout-designer/src/components/
  ItemToolbar.tsx` (đã có Nhân đôi/Lên-Xuống lớp/Khoá/Xoá, xem `handleDuplicate`/`handleZUp`/
  `handleZDown`/`handleToggleLock`/`handleDelete`) — chỉ thiếu đúng 1 nút Ẩn/Hiện. Thêm field
  `hidden?: boolean` vào `BaseItem` (`packages/slide-shared/src/layout/types.ts`), nút mắt
  trong `ItemToolbar.tsx`, xử lý ẩn ở canvas editor và `renderer.tsx`.
- **Cần chốt trước khi code:** "Ẩn" nghĩa là ẩn vĩnh viễn khỏi bản publish (tắt hẳn kể cả lúc
  trình chiếu thật), hay chỉ ẩn tạm lúc thiết kế (vẫn render khi publish)? Quyết định ảnh hưởng
  trực tiếp `renderer.tsx` có cần đọc `hidden` hay chỉ riêng editor cần.
- **Grid overlay + ruler trên canvas** — xác nhận không có trong `Canvas.tsx`/`FrameSurface.tsx`/
  `GuideLine.tsx`. Thêm toggle trong `FloatingToolbar.tsx`, component mới vẽ lưới px + thước
  ngang/dọc theo `variant.refW/refH`, độc lập hoàn toàn với snap/guide-line hiện có (chỉ hiển
  thị, không có logic bắt dính mới).

**Rủi ro:**
- `LayoutLibraryScreen.test.tsx` hiện có 1 test fail sẵn có, không liên quan phạm vi này (behavior
  đổi từ click sang double-click để mở, test chưa cập nhật) — tiện tay sửa nếu rẻ, không bắt buộc.
- Xoá thật không hoàn tác được (khác Move-to-Trash giả hiện tại) — dialog xác nhận phải đủ rõ.

**Definition of done:**
- [ ] Xoá 1 layout không còn Event tham chiếu → biến mất khỏi Library, khỏi DB thật, khỏi
      `localStorage`.
- [ ] Xoá 1 layout đang được Event tham chiếu → đúng hành vi đã chốt.
- [ ] Đổi màu tag 1 layout → phản ánh đúng ở badge `LayoutPickerModal`/danh sách Event, không hồi quy.
- [ ] Panel "Ảnh" hiện đúng danh sách ảnh đã tải trong app thật (Electron), không còn luôn rỗng.
- [ ] Chọn 1 item → toolbar hiện nút Ẩn/Hiện, hoạt động đúng theo hành vi đã chốt.
- [ ] Bật lưới/thước đo → hiển thị đúng theo `refW/refH` variant hiện tại, tắt không để lại tàn dư DOM.
- [ ] `pnpm --filter @sky-app/module-layout-designer test` + `@sky-app/ceremony-db test` sạch
      (baseline trước stage: 254/255 + 1 fail pre-existing, không tăng thêm).

---

## Giai đoạn 7 — Hoàn thiện Property Panel theo loại item (2 sub-giai đoạn độc lập)

**Mục tiêu chung:** Đóng nốt phần "nửa vời" của property panel — 1 loại item hoàn toàn chưa có
UI (LoopItem), và 3 nhóm hiệu ứng (shadow/border/gradient) hiện chỉ phủ 1-2/4 loại item dù
field/component tái dùng được đã tồn tại. Gộp chung 1 giai đoạn vì cùng chạm nhóm file
`PropertyPanel/*`, có thể làm song song hoặc đảo thứ tự 2 sub-giai đoạn.

### Giai đoạn 7a — Property panel cho LoopItem

**Version:** `layout-designer-v0.8.0`

**Phạm vi:**
- `direction`/`source`/`overflow`/`itemBox`/`columns`/`gap`/`maxItems`/`overflowMoreText` đã có
  type + default hợp lệ (`packages/layout-editor-core/src/item-type.ts`,
  `packages/slide-shared/src/layout/types.ts`) nhưng `PropertyPanel.tsx` không có nhánh
  `item.type === 'loop'` — item loop kẹt vĩnh viễn ở giá trị `createDefault()`.
- Component mới `LoopControls.tsx` (cùng cấp `ShapeControls.tsx`/`RibbonControls.tsx`): chọn
  `direction` (row/column/grid, hiện `columns`/`gap` khi grid), chọn `overflow` (shrink/truncate,
  hiện `maxItems`/`overflowMoreText` khi truncate), chỉnh `itemBox.w/h`.
- **Cần chốt trước khi code:** `source: 'members'` hiện là union 1 giá trị duy nhất — ẩn hẳn
  khỏi UI, hay hiện dạng text tĩnh để không gây hiểu nhầm có thể đổi?

**Rủi ro:** LoopItem là loại phức tạp nhất (chứa `itemTemplate: LayoutItem[]`, đã có UI riêng
sửa qua `LoopEditBreadcrumb.tsx`) — panel mới chỉ chỉnh cấu hình khung ngoài, KHÔNG đụng cơ chế
edit-in-place đã có.

**Definition of done:**
- [ ] Chọn 1 LoopItem → panel bên phải hiện đúng `LoopControls`, không còn rỗng.
- [ ] Đổi `direction` sang `grid` → `columns`/`gap` hiện ra, canvas cập nhật ngay.
- [ ] Đổi `overflow` sang `truncate` → `maxItems`/`overflowMoreText` hiện ra, lưu đúng vào `LayoutContent`.
- [ ] Test mới cho `LoopControls` + hồi quy không giảm.

### Giai đoạn 7b — Hiệu ứng: đổ bóng, viền, gradient fill mở rộng theo loại item

**Version:** `layout-designer-v0.8.1`

**Phạm vi (khảo sát item-by-item xác nhận):**

| | Shadow | Border | Gradient fill |
|---|---|---|---|
| Text | DONE (`ShadowControl` wire sẵn) | N/A | MISSING (chỉ solid color) |
| Shape | MISSING (chưa có field) | DONE (`stroke`/`strokeW`) | MISSING (chỉ solid) |
| Ribbon | MISSING (chưa có field) | MISSING (chưa có field) | MISSING (chỉ solid) |
| Image | MISSING (chưa có field) | DONE (`borderW`/`borderColor`) | N/A |

- `ShadowControl.tsx` là component thuần (`TextShadow | boolean`), CHỈ cần thêm field
  `shadow?` vào `ShapeItem`/`ImageItem`/`RibbonItem` rồi wire lại control đã có — không viết
  control mới.
- Border: chỉ `RibbonItem` thiếu — thêm `borderW?`/`borderColor?` + UI trong `RibbonControls.tsx`.
- Gradient hiện CHỈ tồn tại ở tầng background (`Background.gradient`, sửa qua
  `GradientEditor.tsx`, dùng đúng 1 chỗ: `FrameBackgroundControls.tsx`).
- **Cần chốt trước khi code (ảnh hưởng type dài hạn):**
  1. Phạm vi gradient: đề xuất CHỈ `ShapeItem.fill` và `RibbonItem.bg` — KHÔNG áp cho
     `TextItem.color` (cần `background-clip: text`, để riêng nếu có nhu cầu thật sau), KHÔNG
     áp cho `ImageItem` (đã có ảnh làm nội dung).
  2. Đổi kiểu field: `fill`/`bg` từ `string` sang `string | { kind: 'gradient'; value: string }`
     — tái dùng nguyên cách lưu CSS-gradient-string đã chốt ở `Background`, tái dùng
     `GradientEditor.tsx`, mọi nơi đọc `fill`/`bg` phải type-guard.
  3. `renderer.tsx` (runtime backdrop thật) phải xử lý nhánh gradient mới — không chỉ editor,
     đúng bài học đã rút ra từ trước ("dễ quên phần RUNTIME, chỉ nhớ sửa editor").

**Rủi ro:** field mới đều optional, không cần migration SQL (nằm trong `content_json` — JSON
blob schema-less). Rủi ro thật: phải sửa đúng cả 2 nơi (editor + `renderer.tsx`) cho mỗi field
mới, dễ sót 1 bên.

**Definition of done:**
- [ ] Bật đổ bóng cho Shape/Image/Ribbon → đúng trên canvas VÀ trên `renderer.tsx`.
- [ ] Ribbon có border → chỉnh đúng cả 2 nơi.
- [ ] Shape/Ribbon chọn Gradient thay solid → lưu/đọc lại không mất dữ liệu; layout CŨ (fill
      string thuần) mở lại vẫn hiển thị đúng (test bắt buộc — backward-compat).

---

## Giai đoạn 8 — Ảnh nâng cao: Media Library dùng thật + Focal point theo variant (2 sub-giai đoạn)

**Mục tiêu chung:** Hoàn thiện trải nghiệm dùng lại ảnh (logo, sponsor mark dùng xuyên nhiều
layout) sau khi GĐ6 vá xong lỗi khiến picker luôn rỗng — và thêm khả năng neo điểm crop khác
nhau cho từng variant tỷ lệ khung hình. Cả 2 phần độc lập, không chặn nhau.

> **Chốt 2026-08-05 — phạm vi "dùng chung":** nội bộ sky-app (giữa các app/module hiện có hoặc
> app tương lai trong CÙNG monorepo), đúng khuôn mẫu `packages/*` đã có (`slide-shared`,
> `service-contracts`, `ceremony-db`) — KHÔNG cần tách thành package publish-được ngoài sky-app.
> `AssetPort`/bảng `asset` hiện đã trung lập (không gắn cứng field riêng ceremony), nên thiết kế
> GĐ8a bên dưới giữ nguyên, không cần điều chỉnh. Áp dụng nguyên tắc này xuyên suốt các giai
> đoạn còn lại: khi thêm port/schema mới (GĐ11's `LayoutComponentPort`, v.v.), ưu tiên đặt ở
> `packages/*` thay vì local trong `modules/layout-designer`, để module/app khác trong sky-app
> tái dùng được mà không cần refactor sau — không cần thiết kế thêm gì đặc biệt ngoài việc này.

### Giai đoạn 8a — Media Library: tìm kiếm + tái dùng ở mọi nơi chọn ảnh

**Version:** `layout-designer-v0.9.0`

**Phạm vi:**
- Grid chọn ảnh đã có (`Flyout/ImagePanel.tsx`, sau GĐ6 đã nhận data thật) hiện chỉ dùng được từ
  Flyout "Ảnh" — mở rộng dùng chung ở `PropertyPanel/ImageControls.tsx` ("Đổi ảnh") và
  `PropertyPanel/FrameBackgroundControls.tsx` (ảnh nền) — thêm nút "Chọn từ thư viện" cạnh nút
  "Tải ảnh mới" hiện có.
- Ô tìm kiếm theo tên trong `ImagePanel.tsx` — lọc client-side trên `listAssets()` đã tải.
- `deleteAsset(executor, relativePath)` ở `packages/ceremony-db/src/queries/asset.ts` (bảng
  `asset` đã tồn tại, chỉ thêm 1 hàm DELETE, không migration mới) + `AssetPort.deleteAsset?`
  (optional, giống pattern `exportBundle?`/`importBundle?` đã có ở `LayoutPort`) + nút xoá trên
  mỗi thumbnail.
- **Cần chốt trước khi code:** phạm vi v1 — chỉ tìm theo tên + xoá là đủ, hay cần tag/phân loại
  riêng cho asset? Đề xuất KHÔNG làm tag riêng ở v1 (đúng nguyên tắc tối giản đã áp dụng nhiều
  nơi — VD `data_source` không làm folder).

**Rủi ro:** xoá 1 asset đang dùng ở layout khác (không track usage count ở v1) — chỉ xoá record
DB, không xoá file vật lý; cần quyết định rõ, tránh nhầm "xoá khỏi thư viện" với "xoá file vật lý".

**Definition of done:**
- [ ] "Đổi ảnh" và "ảnh nền" đều mở được grid ảnh đã tải, không chỉ file picker OS.
- [ ] Tìm kiếm trong panel "Ảnh" lọc đúng theo tên.
- [ ] Xoá 1 ảnh khỏi thư viện → biến mất khỏi mọi grid chọn, không crash layout cũ đang dùng path đó.

### Giai đoạn 8b — Focal point / neo điểm crop theo từng variant

**Version:** `layout-designer-v0.9.1`

**Phạm vi:**
- Thêm `focalX?: number`, `focalY?: number` (0..1, mặc định 0.5/0.5) vào `ImageItem`, áp dụng
  khi `fit: 'cover'` (ẩn control khi `fit: 'contain'`).
- UI: overlay crosshair kéo được trên thumbnail ảnh trong `ImageControls.tsx`.
- `renderer.tsx`'s `ImageItemView` + canvas editor's tương ứng — áp `object-position`.
- **Cần chốt trước khi code:** vì mỗi variant đã có `ImageItem` riêng (bản sao qua copy-variant/
  `syncKey`), focal point tự nhiên đã "theo variant" — chỉ cần quyết định field này thuộc nhóm
  `SyncFieldGroup` nào khi đồng bộ giữa variant copy nhau (`box`/`content`/`style`, xem
  `sync.ts`). Đề xuất nhóm `'style'` — đổi crop giống đổi cách hiển thị hơn đổi nội dung/vị trí.

**Rủi ro:** không có — field optional, không migration, tận dụng hạ tầng sync 3-nhóm sẵn có.

**Definition of done:**
- [ ] Kéo crosshair trên thumbnail (fit=cover) → canvas cập nhật đúng điểm crop ngay.
- [ ] 2 variant khác tỷ lệ dùng cùng ảnh (copy từ nhau) → chỉnh focal point ở 1 variant KHÔNG tự
      đổi variant kia (đúng hành vi sync nhóm `style` hiện có).
- [ ] `renderer.tsx` (backdrop thật) áp đúng focal point, không chỉ preview editor.

---

## Giai đoạn 9 — Đa chọn (multi-select) trên canvas thiết kế

**Mục tiêu:** Cho phép chọn nhiều item cùng lúc trực tiếp trên canvas thiết kế (rubber-band +
shift-click) — nền tảng bắt buộc cho Group/Ungroup (GĐ10). Gap này chính blueprint gốc đã gắn cờ
"not v1" (`docs/roadmap/plans/layout-designer/23-editor-core-architecture.md`) — giờ mới đủ chín
để làm.

**Version:** `layout-designer-v0.10.0`

**Phạm vi:**
- `selection: string[]` đã array-typed sẵn ở `packages/layout-editor-core/src/state.ts` nhưng
  KHÔNG nơi nào populate quá 1 id (`CanvasItemView.tsx`, `Canvas.tsx`, `LayersPanel.tsx` đều gán
  `setSelection([id])`) — `Canvas.tsx` gate resize/rotate handles ở `selection.length === 1`.
- Rubber-band select: kéo chuột trên vùng trống canvas → khung chọn, item giao khung → thêm vào
  `selection`.
- Shift-click: toggle thêm/bớt khỏi `selection` hiện có (thay vì thay thế).
- Multi-move: kéo 1 item trong nhóm đã chọn → toàn bộ `selection` di chuyển cùng offset.
- Multi-delete: phím Delete xoá toàn bộ item trong `selection` (mở rộng
  `useCanvasKeyboardShortcuts.ts` hiện chỉ xử lý 1 item).
- **Cần chốt trước khi code (kỹ thuật nền, ảnh hưởng cả GĐ10):** `commands.ts` hiện MỌI command
  thao tác đúng 1 item/1 field — không có tiền lệ "N command = 1 bước undo". Multi-move/
  multi-delete cần 1 bước undo cho N item cùng lúc → cần thêm cơ chế composite/batch command ở
  `commands.ts` + `history.ts`'s `HistoryStack` — làm ở đây vì GĐ10 (group N item = 1 bước) và
  GĐ11/12 (chèn nhiều item cùng lúc) đều cần lại đúng cơ chế này, tránh viết trùng.
- **Cần chốt trước khi code (phạm vi UX v1):** resize/rotate đồng thời nhiều item — đề xuất
  KHÔNG làm ở v1 multi-select, để dành GĐ10 khi có khái niệm Group thật. v1 chỉ cần: chọn nhiều
  + di chuyển cùng + xoá cùng.

**Rủi ro:**
- `PropertyPanel.tsx` hiện giả định luôn có đúng 1 item (đọc `selection[0]`) — cần quyết định
  hiện gì khi `selection.length > 1` (đề xuất: ẩn property panel riêng, hiện "Đã chọn N mục" +
  action chung tối thiểu như xoá/khoá hàng loạt).
- `ItemToolbar.tsx` cũng giả định 1 item (đọc `item.box` để định vị) — cần biến thể tính
  bounding-box chung của N item để định vị toolbar (dùng lại `computeRotatedAABB` đã có trong
  chính file này, union nhiều AABB).

**Definition of done:**
- [ ] Kéo chuột trên vùng trống canvas → khung marquee hiện ra, thả chuột → đúng item giao khung được chọn.
- [ ] Shift-click thêm/bớt item, đúng hành vi toggle.
- [ ] Kéo 1 item trong nhóm đã chọn → cả nhóm di chuyển cùng offset, Ctrl+Z lùi đúng 1 bước.
- [ ] Phím Delete xoá toàn bộ item đang chọn, 1 bước undo duy nhất.
- [ ] `LayersPanel.tsx` phản ánh đúng trạng thái multi-select.
- [ ] Test mới cho composite/batch command ở `layout-editor-core` + hồi quy 152/152 không giảm.

### PHỤ LỤC — Breakdown thực thi chi tiết Giai đoạn 9 (2026-08-05, viết trước khi code)

> Khảo sát code thật (đọc trực tiếp, trích dẫn nguyên văn) trước khi GĐ9 thật sự bắt đầu, để
> giảm rủi ro nếu người thực thi (kể cả model yếu hơn) không tự tin đọc lại toàn bộ codebase.
> Nếu tới lúc code mà kiến trúc đã đổi so với trích dẫn dưới đây, ĐỌC LẠI code thật, đừng tin
> nguyên văn — các dòng/số hiệu có thể trôi theo thời gian.

**Phát hiện quan trọng nhất:** `packages/layout-editor-core/src/sync-commands.ts` **đã có sẵn
CHÍNH XÁC khuôn mẫu cần dùng** cho batch command — dòng đầu file ghi rõ:
> *"Mỗi command là 1 EditorCommand ĐƠN (không phải N command riêng cho N item) — undo 1 lần lùi
> hết toàn bộ thao tác copy, dù copy bao nhiêu item."*

`copyVariantOverwriteExistingCommand` trong file này còn có comment tường minh dạy đúng cách làm:
*"patch N item đích ... trong 1 command duy nhất, dùng `patchItem`-style merge trực tiếp (KHÔNG
gọi lồng patchItemCommand — mỗi EditorCommand phải tự đứng độc lập trong HistoryStack.past)"*.
→ Copy nguyên cấu trúc của các command trong `sync-commands.ts` (snapshot mảng cũ trong closure
trước `apply`, tính mảng mới 1 lần, `invert` phục hồi mảng đã snapshot) — không cần phát minh gì
mới, không cần bọc N `EditorCommand` con.

`EditorCommand` interface (`history.ts`): `{ type: string; apply(state): EditorState;
invert(state): EditorState; coalesceWith?(prev): EditorCommand | null }`. `HistoryStack` lưu
CHÍNH object command (không phải diff đã tính sẵn) trong `past`/`future`.

**Thứ tự bước con:**

1. **Batch command mới trong `packages/layout-editor-core/src/commands.ts`** (đặt cạnh
   `moveItemCommand`/`removeItemCommand` hiện có):
   - `moveItemsCommand(variantId, moves: { itemId: string; from: Box; to: Box }[], loopItemId?)`
     — theo đúng khuôn `sync-commands.ts`: `apply` loop qua `moves`, `patchItem(doc, variantId,
     m.itemId, { box: m.to }, loopItemId)` từng cái, gộp lại 1 `doc` cuối; `invert` làm ngược lại
     bằng `m.from`.
   - `removeItemsCommand(variantId, itemIds: string[], loopItemId?)` — snapshot toàn bộ item bị
     xoá (tìm qua `findItem` cho từng id) trong closure TRƯỚC khi xoá, `apply` xoá hết + set
     `selection: []`, `invert` add lại hết + set `selection: itemIds` (đúng tinh thần
     `removeItemCommand` đơn item hiện có, mở rộng cho N item).
   - Viết test riêng (file test cạnh `commands.ts`, xem tên file test hiện có để theo đúng
     convention) cho cả 2 command mới — độc lập khỏi UI, test thuần logic apply/invert.

2. **Rubber-band select trong `modules/layout-designer/src/components/Canvas/Canvas.tsx`:**
   - Thêm state kéo mới, mô phỏng ĐÚNG khuôn mẫu `panDragRef`/`isPanning` đã có (dòng ~105):
     `useRef<{ startX; startY; curX; curY } | null>` cho điểm bắt đầu/hiện tại của khung marquee
     (toạ độ canvas, không phải toạ độ màn hình — dùng lại `originX`/`originY`/`pointerScaleX`/
     `pointerScaleY` đã có sẵn trong file để quy đổi).
   - Sửa `onPointerDown` của container (hiện tại dòng ~233-240, nhánh `else { handleDeselect();
     }`) — KHÔNG gọi `handleDeselect()` ngay lập tức nữa khi click vùng trống, mà bắt đầu theo
     dõi kéo. Chỉ thật sự `setSelection([])` ở `onPointerUp` NẾU khoảng cách kéo dưới ngưỡng nhỏ
     (VD 4px — coi là click, không phải kéo).
   - `onPointerMove`: nếu đang kéo marquee, cập nhật `curX/curY`, tính khung chữ nhật từ
     start→cur, vẽ 1 `<div>` overlay bán trong suốt (chỉ hiển thị, không cần logic riêng).
   - `onPointerUp`: nếu có kéo thật (vượt ngưỡng), tính giao nhau giữa khung marquee (toạ độ
     canvas) và AABB xoay của từng item — TÁI DÙNG `computeRotatedAABB` đã có trong
     `ItemToolbar.tsx` (cần export ra dùng chung, hiện đang local trong file đó) — item nào giao
     khung → thêm vào `selection` mới, gọi `setSelection(newSelection)`.

3. **Shift-click trong `modules/layout-designer/src/components/Canvas/CanvasItemView.tsx`:**
   - `onPointerDown` hiện tại (dòng ~80) gọi `setSelection([item.id])` VÔ ĐIỀU KIỆN, không có
     check phím Shift. Sửa thành:
     - Nếu giữ Shift: toggle `item.id` trong `selection` hiện có (thêm nếu chưa có, bỏ nếu đã có).
     - Nếu KHÔNG giữ Shift VÀ `item.id` đã có sẵn trong `selection` hiện tại (đang là 1 phần của
       nhóm đã chọn nhiều) → **GIỮ NGUYÊN `selection`**, KHÔNG collapse về `[item.id]` ngay — lý
       do: nếu collapse ngay lúc pointerDown, sẽ không bao giờ kéo được cả nhóm (drag bắt đầu
       ngay sau pointerDown, chọn lại thành 1 item trước khi kịp kéo). Chỉ collapse về
       `[item.id]` ở `onPointerUp` NẾU pointerUp xảy ra mà KHÔNG có di chuyển thật (click đơn
       thuần, không phải kéo) — cần thêm cờ tạm kiểu `pendingCollapseToSingle` set ở
       `onPointerDown`, xử lý ở `onPointerUp` hiện có (dòng ~106-113).
     - Nếu KHÔNG giữ Shift VÀ `item.id` CHƯA có trong `selection` → `setSelection([item.id])`
       như cũ (click 1 item mới, thay thế toàn bộ selection).

4. **Cần chốt trước khi code (kiến trúc):** logic kéo-di-chuyển-cùng-lúc-N-item nên đặt ở đâu?
   `onPointerMove` hiện tại (CanvasItemView.tsx dòng ~88-104) chỉ biết về ĐÚNG 1 item của chính
   nó. Multi-drag cần biết TOÀN BỘ item đang chọn để tính offset chung — đề xuất: khi
   `selection.length > 1` VÀ item đang kéo nằm trong `selection`, snapshot box gốc của TẤT CẢ
   item trong `selection` ngay lúc `onPointerDown` (không chỉ item đang kéo), rồi ở
   `onPointerMove` tính `delta = current - start` của riêng item đang kéo, áp delta đó cho toàn
   bộ item khác trong snapshot, dispatch 1 `moveItemsCommand` duy nhất (từ bước 1) ở
   `onPointerUp` (không dispatch liên tục mỗi frame như single-item hiện tại — tránh N-lần-dispatch
   × N-item mỗi frame; có thể cần local state tạm để preview vị trí trong lúc kéo trước khi
   dispatch thật, xem cách `dragRef.current.lastTo` hiện dùng cho single-item để lấy cảm hứng).

5. **Multi-delete trong `modules/layout-designer/src/hooks/useCanvasKeyboardShortcuts.ts`:**
   - Hiện tại (dòng ~48-56) chỉ đọc `state.selection[0]`. Thêm nhánh: nếu
     `state.selection.length > 1`, dispatch `removeItemsCommand(variant.aspect.id,
     state.selection)` (bước 1) thay vì `removeItemCommand` đơn — giữ nguyên nhánh cũ cho
     trường hợp `selection.length === 1` (tránh động vào test đang pass).

6. **`PropertyPanel.tsx` — hiện UI khi `selection.length > 1`:**
   - Hiện tại (dòng ~43-44) chỉ tra `selection[0]`. Thêm nhánh sớm: nếu `selection.length > 1`,
     render 1 component mới (VD `MultiSelectionSummary`) hiện "Đã chọn N mục" + action tối thiểu
     (xoá hàng loạt qua `removeItemsCommand`, khoá/mở khoá hàng loạt qua patch từng item) — KHÔNG
     cố hiện property panel riêng theo từng loại item khác nhau.

7. **`ItemToolbar.tsx` — định vị toolbar khi multi-select:**
   - Cần hàm `computeUnionAABB(boxes: Box[])` (union nhiều kết quả `computeRotatedAABB`) — thêm
     cạnh `computeRotatedAABB` hiện có trong file. Ở `Canvas.tsx` dòng ~330 (hiện gate
     `selection.length === 1`), thêm nhánh `selection.length > 1` render 1 toolbar rút gọn (chỉ
     Nhân đôi hàng loạt/Khoá hàng loạt/Xoá hàng loạt — KHÔNG làm z-order cho nhóm ở v1, không rõ
     nghĩa "lên/xuống lớp" áp dụng sao cho N item cùng lúc).

**Rủi ro đặc thù đã xác nhận qua khảo sát:**
- `LayersPanel.tsx` đã dùng `.includes()` (không phải `selection[0] ===`) để tô sáng dòng đang
  chọn — nghĩa là phần "phản ánh trạng thái multi-select" trong DoD **tự động đúng, không cần
  sửa gì** ở phần hiển thị. Chỉ nếu MUỐN thêm shift-click ngay trong Layers panel (không bắt
  buộc theo DoD gốc) mới cần sửa `onClick` (dòng ~88-90) tương tự bước 3.
- `computePatchSteps` (sync.ts) đã xác nhận KHÔNG đụng tới multi-select mới này — nó chỉ liên
  quan tới đồng bộ CROSS-VARIANT (khác khái niệm), không xung đột với batch command mới.

---

## Giai đoạn 10 — Group / Ungroup

> **ĐÃ THAY THẾ (2026-08-06):** GĐ10 (điều kiện bắt buộc cho GĐ11)/GĐ11 (custom component)/GĐ12
> (bộ sưu tập) dưới đây bị thay thế hoàn toàn bởi
> [`docs/roadmap/plans/canva-ux/00-index.md`](./canva-ux/00-index.md) — phát hiện quan trọng lúc
> thiết kế lại: "lưu nhóm item đã chọn" KHÔNG cần `GroupItem`/Group-Ungroup trước, chỉ cần
> snapshot `LayoutItem[]` + `batchCommand` (GĐ9, đã xong) là đủ. Group/Ungroup THẬT (khối di
> chuyển CỐ ĐỊNH lâu dài, không chỉ lúc multi-select tạm) vẫn còn giá trị riêng nhưng hạ xuống
> backlog không đánh số trong doc mới — nội dung 3 giai đoạn dưới đây GIỮ LÀM LỊCH SỬ QUYẾT ĐỊNH
> (không xoá), không triển khai theo đúng như viết ở đây nữa.

**Mục tiêu:** Gộp nhiều item đã chọn (GĐ9) thành 1 khối di chuyển/resize/xoay như 1 đơn vị — câu
hỏi mở blueprint gốc chưa từng trả lời (`04-schema-layout-document.md`: *"Có cần 'layout con
lồng nhau' (group) không, hay phẳng là đủ?"*). **PHỤ THUỘC CỨNG vào GĐ9** — không thể bắt đầu trước.

**Version:** `layout-designer-v0.11.0`

**Phạm vi:**
- Thêm `GroupItem` vào union `LayoutItem` (`packages/slide-shared/src/layout/types.ts`):
  `{ type: 'group'; children: LayoutItem[]; ... }`.
- **Cần chốt trước khi code:** toạ độ `children` tuyệt đối trên canvas hay tương đối trong khung
  group (giống tiền lệ `LoopItem.itemTemplate` — item con toạ độ TƯƠNG ĐỐI)? Đề xuất theo tiền
  lệ `LoopItem` — nhất quán cách xử lý "item chứa item con" đã có, resize cả group chỉ cần scale
  hệ số chung thay vì tính lại từng toạ độ tuyệt đối.
- **ĐÃ CHỐT 2026-08-05 — (a) Group có lồng nhau được không?** KHÔNG. Group LUÔN LÀM PHẲNG
  (flatten): nếu selection lúc bấm "Group" có chứa 1 `GroupItem` đã tồn tại, item con
  (`children`) của Group cũ được gộp thẳng vào Group mới, bản thân wrapper `GroupItem` cũ bị
  huỷ (không giữ lại lồng bên trong) — theo đúng lý giải của Sonth: *"khi component cha được tạo
  thành 1 group, thì group bên trong nó không còn là group nữa mà tự nó là các component như
  những component khác bên trong nó"*. Hệ quả: `GroupItem.children` KHÔNG BAO GIỜ chứa 1
  `GroupItem` khác — luôn đúng 1 cấp phẳng. Xem chi tiết cơ chế ở PHỤ LỤC bước 5b.
- **Vẫn CHƯA chốt:** (b) LoopItem chứa Group trong `itemTemplate` được không, và ngược lại (Group
  chứa LoopItem trong `children`)? Khác câu (a) (đã chốt: không áp dụng, vì đó là 2 loại item
  khác nhau, không phải cùng loại lồng nhau) — để ngỏ, quyết định lúc code nếu phát sinh nhu cầu
  thật, mặc định KHÔNG chặn (không có gì trong TYPE ngăn cả 2 chiều).
- `packages/slide-shared/src/layout/renderer.tsx` — dispatch top-level là exhaustive `switch` có
  `never`-check compiler-enforced, thêm `GroupItemView` an toàn về compiler (build tự báo lỗi
  nếu quên).
- **5 nơi dispatch KHÔNG có compiler safety net** (cần tự rà bằng tay — cùng shape công việc như
  khi `LoopItem` được thêm trước đây): `Canvas/ItemContent.tsx` (switch render trong editor),
  `PropertyPanel/PropertyPanel.tsx`, `Flyout/helpers.ts` (scan token usage, đã có nhánh `loop`
  đệ quy, cần thêm nhánh `group`), `Flyout/LayersPanel.tsx` (build tree layer, đã xử lý `loop`,
  cần thêm `group`), `Canvas/CanvasItemView.tsx` (double-click enter-edit).
- Command mới "Group" (N item đã chọn → 1 `GroupItem`, dùng batch command từ GĐ9 = 1 bước undo)
  và "Ungroup" (ngược lại). UI: nút trong `ItemToolbar.tsx` khi `selection.length > 1` (Group)
  hoặc khi item đang chọn là `type: 'group'` (Ungroup).
- `Canvas.tsx` — mở rộng gate resize/rotate handles cho `item.type === 'group'`.

**Rủi ro:**
- Stage nặng nhất về "rủi ro sót chỗ" trong cả roadmap — 5 dispatch site không có compiler check,
  PHẢI rà tay + viết test riêng cho từng site (không chỉ test tạo/xoá Group mà test cả "Group
  nằm trong Layers panel đúng cây", "token `@var` bên trong Group con vẫn scan đúng để gợi ý
  autocomplete").
- Sync giữa variant (`syncKey`/`syncRef`/`syncOverrides`, `sync.ts`) hiện thao tác trên item
  phẳng — cần xác nhận Group (và children bên trong) không phá cơ chế copy-variant hiện có.

**Definition of done:**
- [ ] Chọn N item (qua GĐ9) → Group → thành 1 `GroupItem`, di chuyển/resize/xoay cả khối đúng
      tỷ lệ, 1 bước undo.
- [ ] Ungroup → trả về đúng N item gốc, đúng vị trí tuyệt đối như trước khi group.
- [ ] Layers panel hiện đúng cây phân cấp Group → children.
- [ ] Token `@var` trong item con của Group vẫn gợi ý autocomplete đúng.
- [ ] `renderer.tsx` (backdrop thật) render đúng Group — không chỉ editor.
- [ ] Layout CŨ (chưa từng có Group) mở lại bình thường, không lỗi.
- [ ] Group mới tạo mặc định `locked: true` — click vào bất kỳ đâu trong khối chọn/kéo/resize/
      xoay CẢ khối, không lọt vào con.
- [ ] Bấm nút Mở khoá (toolbar) → click vào từng con bên trong chọn/sửa/di chuyển ĐÚNG con đó
      (không phải cả khối), tại đúng vị trí đang hiển thị. Khoá lại → trở về hành vi 1 khối.
- [ ] Group selection có chứa 1 Group khác → bấm Group → Group cũ bị làm phẳng, children của nó
      nhập thẳng vào Group mới (không còn `GroupItem` lồng bên trong).

### PHỤ LỤC — Breakdown thực thi chi tiết Giai đoạn 10 (2026-08-05, viết trước khi code)

> Cùng nguyên tắc như PHỤ LỤC GĐ9: trích dẫn nguyên văn code thật tại thời điểm viết breakdown
> này — nếu code đã đổi khi thật sự bắt tay làm GĐ10, đọc lại thật, đừng tin nguyên văn dưới đây.

**Quyết định TRUNG TÂM — ĐÃ CHỐT 2026-08-05 (đề xuất của Sonth, thay thế 2 phương án A/B cân nhắc
ban đầu):** Group LUÔN hiện nội dung con trực tiếp trên canvas (không cần "vào trong" như Loop),
nhưng khả năng BẤM VÀO TỪNG CON được gate bởi **field `locked` đã có sẵn** (`BaseItem.locked?:
boolean`, đã có UI Pin/PinOff + `handleToggleLock` trong `ItemToolbar.tsx`) — tái dùng nguyên
field/UI này, mở rộng ý nghĩa CHỈ riêng cho `type: 'group'` (các item type khác giữ nguyên ý
nghĩa cũ "khoá không cho di chuyển"):

- **Locked (mặc định `true` ngay khi Group vừa tạo, hoặc khi kéo custom component/collection ra
  ở GĐ11/12)** — cả khối là 1 đơn vị đặc: click vào bất kỳ đâu trong khối (kể cả trúng ngay 1
  con) đều chọn/kéo/resize/xoay CẢ `GroupItem`, con không nhận pointer event riêng của nó. Con
  vẫn HIỂN THỊ (render đệ quy đầy đủ, không phải placeholder) — chỉ không tương tác được riêng.
- **Unlock (bấm nút Pin/PinOff trên toolbar của Group)** — con trở nên bấm/kéo/sửa được TRỰC
  TIẾP tại đúng vị trí đang hiển thị, y hệt cảm giác đã rã nhóm tạm thời — nhưng cấu trúc
  `GroupItem` logic vẫn còn nguyên, khoá lại (`locked: true`) là quay về 1 khối.

Cách này giải quyết đúng nhược điểm UX của phương án "kiểu Loop" (phải double-click mới thấy con)
MÀ VẪN giữ được state đơn giản — không cần bịa field/state mới (`editingContainerId`), chỉ tái
dùng field/UI đã tồn tại. Đánh đổi thật (không né tránh): rendering con LUÔN hiển thị (không còn
tuỳ chọn hoãn) đồng nghĩa `ItemContent.tsx` PHẢI render đệ quy thật ngay từ đầu (không có
placeholder tĩnh nữa như Loop hiện tại) — và khi unlock, cần cơ chế mới để mỗi con trở thành 1
`CanvasItemView` tương tác được đúng vị trí lồng của nó (xem bước 3 dưới — đây là phần việc kỹ
thuật thật, chưa có tiền lệ y hệt, nhưng phạm vi đã rõ ràng hơn nhiều so với 2 phương án A/B cân
nhắc ban đầu).

**Nền tảng kiểu dữ liệu (áp dụng cho CẢ 2 phương án A/B):**

`BaseItem` (mọi item type đều extend, `packages/slide-shared/src/layout/types.ts`):
```ts
interface BaseItem {
  id: string;
  box: Box;
  opacity?: number;
  locked?: boolean;
  name?: string;
  syncKey?: string; syncRef?: string; syncOverrides?: SyncFieldGroup[]; syncLocked?: boolean;
}
```

`LoopItem` là tiền lệ toạ độ TƯƠNG ĐỐI cho item con (đúng nguyên tắc đã chốt cho `GroupItem`
cũng dùng tương đối):
```ts
export interface LoopItem extends BaseItem {
  type: 'loop';
  itemTemplate: LayoutItem[]; // item con, toạ độ TƯƠNG ĐỐI trong 1 "ô"
  itemBox: { w: number; h: number };
  direction: 'row' | 'column' | 'grid'; columns?: number; gap?: number;
  source: 'members';
  overflow: 'shrink' | 'truncate'; maxItems?: number; overflowMoreText?: string;
}
```
`GroupItem` đơn giản hơn Loop nhiều — KHÔNG cần lặp theo data (`source`/`overflow`/`direction`
đều là khái niệm CHỈ Loop mới cần vì nó lặp theo `CanonicalGroup.members`; Group không lặp gì
cả, con là nội dung THẬT cố định):
```ts
export interface GroupItem extends BaseItem {
  type: 'group';
  children: LayoutItem[]; // item con, toạ độ TƯƠNG ĐỐI trong khung group (giống itemTemplate)
}
```
Union (`packages/slide-shared/src/layout/types.ts`, hiện tại):
`export type LayoutItem = TextItem | ImageItem | ShapeItem | RibbonItem | LoopItem;`
→ thêm `| GroupItem` vào cuối.

**Thứ tự bước con:**

1. **Thêm `GroupItem` vào `types.ts`** (như trên) + đăng ký trong `packages/layout-editor-core/
   src/item-type.ts` — copy chính xác khuôn của entry `loop` hiện có:
   ```ts
   registry.register<Extract<LayoutItem, { type: 'group' }>>({
     type: 'group',
     label: 'Nhóm',
     defaultBox: DEFAULT_GROUP_BOX, // Box mới, kích thước khởi tạo tuỳ chọn — group luôn được
                                     // TẠO qua thao tác "Group" (bước 5), không tạo tay từ palette
     createDefault: (id, box) => ({ id, type: 'group', box: box!, children: [], locked: true }),
     // locked: true mặc định — đúng quyết định TRUNG TÂM đã chốt (xem đầu PHỤ LỤC): Group luôn
     // "đặc" ngay sau khi tạo, user chủ động mở khoá nếu muốn sửa từng con bên trong.
   });
   ```
   Lưu ý: khác Loop, Group KHÔNG có tile trong `ComponentsPanel.tsx` (không kéo-thả tạo Group
   rỗng từ palette — Group chỉ sinh ra từ hành động "Group N item đã chọn", xem bước 5).

2. **`packages/slide-shared/src/layout/renderer.tsx` — runtime thật:**
   - Dispatch top-level (`ItemRenderer`, có `never`-check compiler-enforced) — thêm
     `case 'group': return <GroupItemView item={item} scaleX={scaleX} scaleY={scaleY}
     record={record} resolveAsset={resolveAsset} />;`. Build sẽ tự báo lỗi nếu quên bước này.
   - `GroupItemView` mới — ĐƠN GIẢN HƠN `LoopItemView` nhiều (không cần `computeLoopLayout`/cell
     lặp, không cần `useMemo` phức tạp) — chỉ 1 wrapper theo `toRenderBox(item.box, scaleX,
     scaleY)` rồi map `item.children` qua `ItemRenderer` với CÙNG `scaleX`/`scaleY` (không nhân
     thêm `cell.itemScale` như Loop vì Group không có khái niệm "ô"):
     ```tsx
     function GroupItemView({ item, scaleX, scaleY, record, resolveAsset }: {...}) {
       const outerStyle = toRenderBox(item.box, scaleX, scaleY);
       return (
         <div style={outerStyle}>
           {item.children.map((child) => (
             <ItemRenderer key={child.id} item={child} scaleX={scaleX} scaleY={scaleY}
               record={record} resolveAsset={resolveAsset} />
           ))}
         </div>
       );
     }
     ```

3. **5 nơi dispatch KHÔNG có compiler safety net — rà tay từng file, xác nhận qua khảo sát
   2026-08-05:**
   - **`modules/layout-designer/src/components/Canvas/ItemContent.tsx`** — switch có `default: {
     const _exhaustive: never = item; ... }` giống renderer.tsx nên THỰC RA CŨNG compiler-enforced
     (đã xác nhận qua đọc code) — coi như an toàn compiler giống mục 2, KHÔNG phải rủi ro "quên".
     Case `group` mới PHẢI render đệ quy THẬT (không còn placeholder tĩnh như `loop` hiện tại,
     theo đúng quyết định TRUNG TÂM: con luôn hiển thị) — nhưng render ở ĐÂY chỉ là NỘI DUNG
     THUẦN TUÝ HIỂN THỊ (không gắn pointer handler riêng cho từng con — `ItemContent` vốn không
     phải nơi xử lý tương tác, đó là việc của `CanvasItemView`, xem ngay dưới). Cách đơn giản
     nhất: viết 1 hàm đệ quy nhỏ `renderStaticChildren(children: LayoutItem[])` ngay trong file
     này (hoặc tái dùng chính `ItemContent` gọi lại chính nó cho từng con, nếu chữ ký cho phép),
     định vị từng con bằng CSS `position: absolute; left/top` theo toạ độ tương đối
     `child.box.x/y` (không cần convert gì thêm vì đây chỉ là hiển thị, không phải toạ độ dùng
     để dispatch command).
   - **`modules/layout-designer/src/components/Canvas/CanvasItemView.tsx`** — ĐÂY LÀ PHẦN VIỆC
     KỸ THUẬT THẬT SỰ MỚI của GĐ10, chưa có tiền lệ y hệt trong codebase — cần đọc lại TOÀN BỘ
     phần render/JSX của file này (chưa khảo sát hết ở GĐ9, GĐ9 chỉ khảo sát phần
     `onPointerDown`/`onPointerMove`/`onPointerUp`) trước khi code thật. Thiết kế đề xuất (xác
     nhận lại tính khả thi lúc đọc code thật):
     - Khi `item.type === 'group'` VÀ `item.locked !== false` (mặc định `true`) → render y hệt
       mọi item khác hiện nay: 1 `CanvasItemView` wrapper DUY NHẤT bắt toàn bộ pointer event,
       nội dung bên trong render qua `ItemContent` (đã đệ quy hiển thị con ở bước trên) — KHÔNG
       cần thêm gì đặc biệt, vì con không có handler riêng nên mọi click tự nhiên rơi vào wrapper
       ngoài cùng (không cần `pointer-events: none` thủ công).
     - Khi `item.type === 'group'` VÀ `item.locked === false` (đã unlock) → thay vì gọi
       `ItemContent`, `CanvasItemView` tự đệ quy render CHÍNH NÓ cho từng `item.children[i]`
       (thay vì children hiển thị tĩnh) — mỗi con trở thành 1 `CanvasItemView` thật, có
       `onPointerDown`/resize handle riêng, ĐỘC LẬP CHỌN/KÉO được. Vị trí render cần TOẠ ĐỘ TUYỆT
       ĐỐI cho mục đích HIỂN THỊ (`effectiveBox = { ...child.box, x: child.box.x + item.box.x, y:
       child.box.y + item.box.y }`) trong khi mọi command dispatch (move/patch/resize/rotate) từ
       con đó VẪN PHẢI ghi vào toạ độ TƯƠNG ĐỐI gốc (`child.box`, không phải `effectiveBox`) —
       cần 1 cơ chế convert 2 chiều rõ ràng (tính effectiveBox lúc render, trừ lại offset lúc
       dispatch command) để không làm hỏng dữ liệu lưu trữ.
     - **Threading container-id qua command**: cơ chế `loopItemId?: string` hiện tại (đã dùng
       xuyên suốt `moveItemCommand`/`patchItemCommand`/`removeItemCommand`/`ItemToolbar`'s prop)
       về BẢN CHẤT đã là "chỉ mục vào 1 mảng con thay vì `variant.items`" — vì quyết định "Group
       không lồng Group" (đã chốt ở trên) đảm bảo TỐI ĐA 1 cấp lồng, cơ chế 1-tham-số này ÁP DỤNG
       ĐƯỢC NGUYÊN VẸN cho Group con khi unlock, chỉ cần xác nhận lúc code: `patchItem`/
       `findItem`/`removeItem`/`addItem` (`packages/layout-editor-core/src/doc-helpers.ts`, CHƯA
       đọc kỹ toàn bộ trong khảo sát này — đọc lại file đó trước khi code) có đang viết CHUNG
       cho mọi loại container (tên tham số `loopItemId` chỉ là lịch sử đặt tên, hay logic bên
       trong có giả định cứng "phải là Loop"?). Nếu logic đã trung lập, chỉ cần đổi TÊN tham số
       (`loopItemId` → `containerItemId` hoặc tương tự) cho đúng nghĩa, không cần sửa logic. Nếu
       có giả định cứng riêng Loop, cần tổng quát hoá — việc này PHẢI xác nhận bằng cách đọc code
       thật lúc bắt tay GĐ10, không đoán trước.
   - **`modules/layout-designer/src/components/PropertyPanel/PropertyPanel.tsx`** — dispatch
     kiểu `item.type === 'x' && <...>` (KHÔNG phải switch, KHÔNG có compiler check) — thêm
     `{item.type === 'group' && <GroupControls item={item} onUngroup={...} />}`. Nội dung
     `GroupControls` tối thiểu: hiện "N item trong nhóm" + nút "Rã nhóm" (Ungroup, xem bước 6) —
     `RotationControl`/`OpacityControl` đã áp dụng chung phía dưới, không cần thêm gì.
   - **`modules/layout-designer/src/components/Flyout/helpers.ts`** — `collectUsedTokenKeys`'s
     `scan()` hiện có `if (item.type === 'loop') scan(item.itemTemplate);` — thêm dòng tương tự
     `if (item.type === 'group') scan(item.children);` ngay cạnh.
   - **`modules/layout-designer/src/components/Flyout/LayersPanel.tsx`** — `buildLayerTree`
     hiện: `item.type === 'loop' ? buildLayerTree(item.itemTemplate, path) : []` — sửa thành
     `item.type === 'loop' ? buildLayerTree(item.itemTemplate, path) : item.type === 'group' ?
     buildLayerTree(item.children, path) : []`. `iconOf`/`labelOf` cũng cần thêm nhánh `group`
     (icon gợi ý: `⛶` hoặc tương tự, label "Nhóm"). Con của Group ẩn/hiện trong Layers panel nên
     theo đúng tiền lệ Loop hiện tại (chỉ node top-level clickable, con hiện dạng nhạt không bấm
     được từ panel này — sửa/chọn con làm trực tiếp trên canvas lúc unlock, không qua Layers).
   - `CanvasItemView.tsx` đã xử lý riêng, chi tiết ở ngay trên (không lặp lại ở đây).

3b. **Nút Khoá/Mở khoá cho Group trong `ItemToolbar.tsx`:** nút Pin/PinOff đã tồn tại
   (`handleToggleLock`, dòng ~73, ~98-105) — hoạt động đúng ngay cho Group KHÔNG CẦN SỬA GÌ (nó
   chỉ patch `item.locked`, không quan tâm `item.type`) — chỉ cần xác nhận: khi item đang chọn là
   `type: 'group'`, label/tooltip nút có nên đổi chữ cho rõ nghĩa hơn ("Khoá nhóm"/"Mở khoá nhóm"
   thay vì "Khoá di chuyển"/"Mở khoá di chuyển" chung chung hiện tại) — cải thiện UX nhỏ, không
   bắt buộc.

4. **`Canvas.tsx` — resize/rotate cho Group:** gate hiện tại render `SelectionHandles` theo
   từng `CanvasItemView`'s `selected` boolean (không đặc biệt theo `item.type`) — Group nghiễm
   nhiên đã resize/rotate được như mọi item khác (vì nó vẫn có `box: Box` chuẩn qua `BaseItem`),
   KHÔNG cần sửa gì thêm ở đây — chỉ cần xác nhận qua test thật resize Group có scale đúng tỷ lệ
   `children` bên trong hay không (vì `toRenderBox`/`ItemRenderer` dùng `scaleX`/`scaleY` truyền
   xuống — resize Group đổi `item.box.w/h` nhưng children's `box` (toạ độ tương đối) KHÔNG tự
   đổi theo tỷ lệ trừ khi renderer chủ động tính lại — cần xác nhận: có cần thêm hệ số scale
   riêng bù trừ giữa "box gốc lúc tạo group" vs "box hiện tại sau khi resize" hay chấp nhận
   children giữ nguyên kích thước tuyệt đối (tương đối gốc group) mà chỉ dịch theo x/y? ĐÂY LÀ
   CÂU HỎI KỸ THUẬT CHƯA CÓ CÂU TRẢ LỜI, cần thực nghiệm lúc code — Loop KHÔNG gặp vấn đề này vì
   nó không hỗ trợ resize kiểu "kéo góc" theo nghĩa tương tự (`itemBox` cố định, chỉ đổi qua số
   lượng cell), nên không có tiền lệ trực tiếp để copy).

5a. **Command "Group" mới** (`packages/layout-editor-core/src/commands.ts`, dùng batch command từ
   GĐ9 làm nền — 1 bước undo): nhận `variantId`, `itemIds: string[]` (từ `selection` GĐ9) →
   snapshot các item gốc (nguyên trạng, TRƯỚC khi làm phẳng — xem 5b), tính `box` bao (union AABB,
   tái dùng `computeUnionAABB` đã làm ở GĐ9 bước 7 nếu có, hoặc viết lại ở `layout-editor-core`
   nếu cần dùng cả 2 nơi — cân nhắc đặt hàm union-AABB ở `layout-editor-core` làm nguồn chung,
   `ItemToolbar.tsx` import lại thay vì có 2 bản), chuyển toạ độ từng item từ TUYỆT ĐỐI (variant)
   sang TƯƠNG ĐỐI (trong group's box mới) — `child.box.x = originalItem.box.x - groupBox.x`,
   tương tự `y` — xoá N item gốc khỏi `variant.items`, thêm 1 `GroupItem` mới (`locked: true` mặc
   định) chứa `children` đã đổi toạ độ. `invert` làm ngược lại HOÀN TOÀN — restore đúng nguyên
   trạng đã snapshot ở bước 5b (kể cả khôi phục lại `GroupItem` cũ y hệt nếu có, không chỉ
   children rời rạc của nó).

5b. **Làm phẳng Group lồng — ĐÃ CHỐT, bắt buộc xử lý trong command "Group" ở bước 5a:** trước khi
   tính `children` cho `GroupItem` mới, duyệt qua `itemIds` đã chọn — với MỖI item có
   `type === 'group'` trong số đó, KHÔNG đưa nguyên `GroupItem` đó vào làm 1 phần tử `children`
   mới, mà THAY BẰNG toàn bộ `children` bên trong nó (đã convert toạ độ 2 LẦN: từ tương-đối-group-
   cũ → tuyệt-đối-variant → tương-đối-group-mới, đúng 2 bước convert nối tiếp nhau dùng lại đúng
   công thức 1 bước ở 5a). `GroupItem` cũ bị huỷ hoàn toàn (không giữ id/wrapper của nó trong kết
   quả) — chỉ children của nó "thăng cấp" thành children trực tiếp của Group mới, PHẲNG đúng 1
   cấp. Nếu 1 item khác trong `itemIds` cũng là `type === 'group'` (gộp 2 Group với nhau cùng
   lúc, hoặc 1 Group + 1 Group khác + vài item rời) — áp dụng làm phẳng cho TỪNG Group được chọn
   độc lập, kết quả là 1 Group DUY NHẤT chứa tất cả children đã gộp từ mọi nguồn. Test bắt buộc:
   Group A (chứa 2 item) + Group B (chứa 3 item) + 1 item rời → chọn cả 3 → Group → kết quả ĐÚNG
   1 `GroupItem` mới chứa `children.length === 6` (2+3+1), KHÔNG có `GroupItem` nào lồng bên
   trong `children` của nó.

6. **Command "Ungroup"** — ngược lại bước 5: nhận `GroupItem`, chuyển toạ độ `children` từ TƯƠNG
   ĐỐI về TUYỆT ĐỐI (`child.box.x + groupItem.box.x`), xoá `GroupItem`, add lại N item con như
   item top-level thường. UI: nút trong `ItemToolbar.tsx` (khi `selection.length === 1` và item
   đó `type === 'group'`) hoặc trong `GroupControls` (property panel, bước 3).

7. **UI "Group" (gộp N item đã chọn):** nút mới trong `ItemToolbar.tsx`'s biến thể multi-select
   (đã thêm ở GĐ9 bước 7) — khi `selection.length > 1`, thêm nút "Nhóm" gọi command bước 5.

**Rủi ro đã xác nhận qua khảo sát (không suy đoán):**
- `sync.ts`'s `computePatchSteps` xác nhận KHÔNG bao giờ đệ quy vào `itemTemplate` (Loop) — theo
  đúng comment trong chính file: *"item lồng KHÔNG tham gia cơ chế đồng bộ sync-giữa-variant"*.
  `GroupItem.children` SẼ bị bỏ qua bởi sync giống hệt — cần CHỐT tương tự: children trong Group
  không tự đồng bộ qua các variant khác dù `syncKey`/`syncRef` cha có khớp hay không. Chấp nhận
  hành vi này (nhất quán với Loop), không cần code thêm gì — chỉ cần KHÔNG ngạc nhiên khi thấy
  vậy lúc test.
- `CONTENT_FIELDS` trong `sync.ts` đã có `'itemTemplate'` — cần thêm `'children'` vào set này
  nếu muốn field `children` được coi là nhóm `'content'` khi patch (ảnh hưởng override-lock logic
  khi Group tự nó là 1 syncRef copy của Group khác — trường hợp hiếm, xác nhận có cần lúc code).

---

## Giai đoạn 11 — Lưu vùng chọn thành Custom Component tái dùng

**Mục tiêu:** Đặt tên và lưu lại 1 khối đã group (GĐ10) thành 1 "component" tái dùng được ở BẤT
KỲ layout nào khác. **PHỤ THUỘC CỨNG vào GĐ10** — cần khái niệm "1 khối thống nhất" trước khi có
nghĩa để lưu-và-chèn-lại. Đây là tính năng MỚI hoàn toàn kể cả với project tham khảo `my-builder`
(project đó cũng chỉ có phần này ở dạng công cụ nội bộ cho dev, chưa từng cho end-user dùng trực
tiếp) — không có sẵn khuôn mẫu để copy y nguyên, cần tự thiết kế.

**Version:** `layout-designer-v0.12.0`

**Phạm vi:**
- Bảng SQL mới `packages/ceremony-db/src/migrations/013_layout_component.ts` — đứng độc lập,
  own-PK, KHÔNG buộc FK vào 1 layout cụ thể, mirror tiền lệ "pooled/dùng chung xuyên nhiều nơi
  qua tham chiếu" của `data_source`, và cách lưu blob JSON của `layout_draft`/`layout_version`
  (`content_json TEXT`): `layout_component(id TEXT PRIMARY KEY, name TEXT, content_json TEXT,
  created_at TEXT)`.
- **Cần chốt trước khi code:** `content_json` lưu nguyên `GroupItem` (bọc 1 lớp group) hay
  `LayoutItem[]` phẳng? Đề xuất: lưu nguyên `GroupItem` — đơn giản hoá tính bounding-box lúc hiện
  thumbnail/chèn lại (luôn có đúng 1 root với `box` xác định), user tự Ungroup ngay sau khi chèn
  nếu muốn tách rời.
- `LayoutComponentPort` mới (`packages/service-contracts`) — `list()`/`save(name, group)`/
  `delete(id)`, implement ở cả 3 adapter (Electron/Web+data-service/WASM) — quy mô tương đương
  GĐ6's real-delete (1 bảng mới + CRUD + fan-out 3 tầng), tái dùng nguyên pattern
  `layout.ts`/`asset.ts` đã có, không cần thiết kế storage mới.
- Action "Lưu thành Component" trên `GroupItem` đang chọn (trong `ItemToolbar.tsx` hoặc menu
  chuột phải) → modal đặt tên (tái dùng phong cách `LayoutInfoModal.tsx`).
- Chèn lại: mở rộng union `SpawnKind` (`Flyout/useSpawnDrag.ts` — hiện chỉ có
  `{ kind: 'itemType' }` và `{ kind: 'var' }`) thêm biến thể `{ kind: 'itemGroup'; items:
  LayoutItem[]; label: string }` — kéo-thả từ panel mới ra canvas, dùng batch command (từ GĐ9)
  để chèn N item = 1 bước undo.
- UI browse: panel Flyout mới, hoặc tái cấu trúc `ComponentsPanel.tsx` hiện tại (chỉ có 5 tile
  loại item cơ bản) thành 2 khu vực: "Cơ bản" + "Đã lưu" (danh sách `layout_component`).

**Rủi ro:** stage duy nhất trong nhóm GĐ9-12 cần full-stack mới (SQL + port + 3 adapter + IPC +
REST) — canh thời gian tương đương GĐ6's real-delete nhân 3 (thêm cả `save`/`list` thay vì chỉ
`delete`).

**Definition of done:**
- [ ] Group 1 khối trong layout A → "Lưu thành Component", đặt tên → xuất hiện trong "Đã lưu".
- [ ] Mở layout B (khác A) → kéo component đã lưu ra canvas → chèn đúng, giữ nguyên cấu trúc/
      style, 1 bước undo.
- [ ] Xoá 1 component đã lưu → biến mất khỏi danh sách, KHÔNG ảnh hưởng layout đã từng chèn nó
      (chèn = copy giá trị, không phải tham chiếu sống).
- [ ] Hoạt động đúng trên cả Electron lẫn Web (data-service + WASM fallback).

---

## Giai đoạn 12 — Bộ sưu tập dựng sẵn (app-provided) + dọn `TemplatesPanel`

**Mục tiêu:** Cung cấp sẵn vài cụm item dựng sẵn do đội ngũ tự soạn (không phải user tự lưu) —
ví dụ "khung tên + ruy băng chuẩn". **Độc lập hoàn toàn với nhóm GĐ9-11** về mặt phụ thuộc kỹ
thuật — nhưng có khuyến nghị thứ tự quan trọng, xem bên dưới.

**Version:** `layout-designer-v0.13.0`

**Cần chốt trước khi code (thứ tự làm):** đề xuất làm SAU Giai đoạn 11, dù về kỹ thuật có thể
làm bất cứ lúc nào. Lý do: "Component tự lưu" (GĐ11) và "Bộ sưu tập dựng sẵn" (GĐ12) cùng bản
chất — "chèn 1 cụm nhiều `LayoutItem` cùng lúc vào canvas". Làm GĐ12 trước mà tự viết riêng 1 cơ
chế chèn hardcode (không tái dùng `SpawnKind`/batch-command của GĐ9/11) sẽ tạo 2 cơ chế chèn-
nhiều-item song song, phải hợp nhất lại sau — tốn công gấp đôi.

**Phạm vi:**
- Blueprint chỉ có đúng 1 dòng mô tả, không elaborate (`04-schema-layout-document.md`: *"Bộ sưu
  tập (cụm dựng sẵn) | preset item-group, nice-to-have"*) — `CollectionsPanel.tsx` hiện là
  placeholder trung thực ("Chưa khả dụng — cần đồng bộ cụm dựng sẵn từ server").
- **v1 KHÔNG cần đi qua SQLite/LayoutPort/migration** — tiền lệ trực tiếp trong chính module
  này: `AddVariantModal.tsx` hardcode mảng `PRESETS` ngay trong file component, không qua DB.
  Áp dụng y hệt: 1 file hằng số TS mới (VD `presets/collectionPresets.ts`) chứa vài bộ
  `GroupItem`/`LayoutItem[]` soạn tay, đăng ký như tile kéo-thả trong `CollectionsPanel.tsx`
  (thay placeholder), dùng lại `SpawnKind: 'itemGroup'` + batch command từ GĐ11.
- **Dọn `TemplatesPanel.tsx`:** blueprint gốc của nó (`12-thu-vien-layout.md`) mô tả tái dùng CẢ
  LAYOUT (copy nguyên layout) — đã có thật, dưới dạng `LayoutLibraryScreen.tsx` (màn hình
  top-level riêng, không phải Flyout panel). Panel "Mẫu" hiện tại là placeholder redundant,
  không phải gap cần code mới.
- **Cần chốt trước khi code:** xoá hẳn tab "Mẫu" khỏi `Flyout.tsx`, hay giữ chỗ và đổi hướng
  thành lối tắt mở `LayoutLibraryScreen`? Đề xuất xoá hẳn (Flyout vốn đã nhiều tab: Thành phần/
  Mẫu/Bộ sưu tập/Biến/Ảnh/Lớp) — đã có lối vào Library rồi, không cần lối tắt thứ 2.

**Rủi ro:** thấp — không đụng DB, không đụng runtime `renderer.tsx` theo cách mới (item chèn ra
chỉ là `LayoutItem[]` bình thường, render y hệt item tự tạo tay).

**Definition of done:**
- [ ] Panel "Bộ sưu tập" hiện ít nhất vài cụm dựng sẵn thật (không còn placeholder), kéo ra
      canvas chèn đúng, giữ nguyên cấu trúc.
- [ ] Tab "Mẫu" đã xoá khỏi Flyout (hoặc đổi hướng theo quyết định đã chốt), không còn
      placeholder chết trong sản phẩm.
- [ ] Test hồi quy `module-layout-designer` không giảm.

---

## Ngoài phạm vi roadmap này (đã chốt với Sonth, chỉ ghi nhận — tracked ở nơi khác)

- **Ceremony integration hardening** (test coverage `modules/ceremony/src/backdrop/
  BackdropApp.tsx`, gate kích hoạt khi thiếu fieldMap token, migration/nhắc nhở Event cũ có
  `layoutRefs` rỗng, gap fieldMap cho thành viên trong LoopItem ở `applyFieldMap`) — Sonth chủ
  động ưu tiên hoàn thiện layout-designer TRƯỚC, phần này làm sau.
- **Các sub-bước GĐ5 còn lại của plan gốc** (Export/Import Loại 1 bundle layout độc lập, modal
  diff re-import DataSource, PII redact-by-column) — đã tạm hoãn từ trước trong phiên lập kế
  hoạch này.
- **GĐ CUỐI CÙNG (Supabase)** và **GĐ DOCS CHÍNH THỨC** — giữ nguyên vị trí cuối roadmap tổng
  thể như plan gốc đã chốt, không bị ảnh hưởng bởi GĐ6-12 mới này.

---

## File trọng tâm sẽ chạm tới nhiều nhất

- `packages/slide-shared/src/layout/types.ts` — mọi field mới trên item types (shadow/border/
  gradient/focalX-Y/hidden/GroupItem).
- `packages/slide-shared/src/layout/renderer.tsx` — runtime thật, PHẢI cập nhật song song mọi
  lần sửa editor.
- `packages/layout-editor-core/src/commands.ts` + `history.ts` — nơi thêm cơ chế composite/
  batch command (GĐ9), nền tảng cho GĐ10/11/12.
- `packages/layout-editor-core/src/state.ts` — `selection: string[]` (GĐ9).
- `packages/service-contracts/src/layout.ts` — `LayoutPort` mở rộng (`deleteDocument`, GĐ6) +
  `LayoutComponentPort` mới (GĐ11).
- `packages/ceremony-db/src/queries/layout.ts` + migrations mới — GĐ6 (`deleteLayoutDocument`),
  GĐ11 (`013_layout_component.ts`).
- `modules/layout-designer/src/LayoutDesignerAppModule.tsx` — điểm nối `assetPort`/`layoutPort`
  xuống UI, nơi các bug wiring GĐ6 nằm ở đây.
- `modules/layout-designer/src/components/ItemToolbar.tsx` — toolbar chọn nhanh, mở rộng dần
  qua GĐ6 (ẩn/hiện), GĐ10 (group/ungroup), GĐ11 (lưu thành component).
- `modules/layout-designer/src/components/Flyout/` (`ImagePanel.tsx`, `helpers.ts`,
  `LayersPanel.tsx`, `useSpawnDrag.ts`, `CollectionsPanel.tsx`, `TemplatesPanel.tsx`,
  `ComponentsPanel.tsx`) — chạm ở hầu hết mọi giai đoạn từ GĐ6 tới GĐ12.

## Verification tổng thể mỗi giai đoạn

Theo đúng nguyên tắc plan gốc: mỗi giai đoạn chạy `pnpm typecheck` toàn repo +
`pnpm --filter @sky-app/layout-editor-core test` + `pnpm --filter module-layout-designer test`
sạch (không hồi quy so với baseline 152/152 + 254/255+1-fail-pre-existing), cộng thêm
`pnpm --filter @sky-app/ceremony-db test` cho các giai đoạn đụng DB (GĐ6, GĐ8a, GĐ11). Runtime
thật (`dev:app`) cần xác nhận riêng cho các thay đổi chạm `renderer.tsx` (GĐ7b, GĐ8b, GĐ10, GĐ12)
vì unit test không tự động verify backdrop thật hiển thị đúng — Sonth cần click-through trên
Electron thật trước khi coi 1 giai đoạn là "xong", đúng thông lệ đã áp dụng suốt plan gốc.
