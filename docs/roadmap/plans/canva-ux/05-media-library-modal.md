---
status: completed
target_version: layout-designer-v0.18.0
completed_date: 2026-08-06
---

# GĐ14 — Media Library modal đầy đủ + mở rộng AssetPort

## Bối cảnh & quyết định công nghệ quan trọng

`radix-ui` đã có trong monorepo, `ColorfulSwatchButton.tsx`'s comment ghi RÕ bài học: hand-roll
positioning tự viết ĐàSAI trong modal lồng nhau, đã bỏ hẳn để dùng Radix. Modal MỚI này PHẢI học
bài học đó ngay từ đầu — dùng Radix `Dialog` + `Tabs`, KHÔNG hand-roll `fixed inset-0` (khác
`LayoutInfoModal.tsx`/`CrossLayoutVariantPickerModal.tsx` cũ — 2 file đó KHÔNG bị sửa lại, xem
Backlog ở file 00-index).

Vì `radix-ui` chỉ được khai trong `packages/ui/package.json` (quy ước
`pnpm-workspace.yaml:81-85`), **2 primitive mới** viết trong `packages/ui/src/primitives/`:

```tsx
// packages/ui/src/primitives/dialog.tsx — mirror packages/ui/src/primitives/select.tsx's
// pattern (Radix namespace import, data-slot, className mặc định TỐI THIỂU để consumer override).
import { Dialog as DialogPrimitive } from 'radix-ui';
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export function DialogOverlay(props: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay {...props} className={cn('fixed inset-0 z-50 bg-black/40', props.className)} />;
}
export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content {...props}
        className={cn('fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-[11px] bg-white shadow-[0_14px_34px_rgba(20,20,40,0.18)] outline-none', className)}>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export const DialogTitle = DialogPrimitive.Title;
export const DialogClose = DialogPrimitive.Close;
```
```tsx
// packages/ui/src/primitives/tabs.tsx — tương tự, mirror shape API shadcn chuẩn
// (Tabs/TabsList/TabsTrigger/TabsContent), style TỐI THIỂU.
```
Export cả 2 qua `packages/ui/src/index.ts`.

## UI chi tiết `MediaLibraryModal.tsx`

- Kích thước: `w-[720px] max-h-[80vh] flex flex-col` (khớp `CrossLayoutVariantPickerModal.tsx`'s
  kích thước đã có, giữ NHẤT QUÁN độ lớn modal trong module).
- Header: `DialogTitle` "Thư viện Media" (font-bold text-sm, không icon — khớp
  `LayoutInfoModal.tsx`'s style) + nút đóng (`X` icon, `DialogClose`) góc phải trên.
- `Tabs` 2 tab NGAY DƯỚI header: **"Thư viện"** (mặc định) / **"Tải lên"** — `TabsList` dạng
  segmented control ngang, style theo `IconToggleGroup`'s look nhưng KHÔNG dùng lại chính
  component đó (khác ngữ nghĩa — đây là navigation tab, không phải chọn giá trị field) — viết
  className riêng tương tự (`flex gap-[7px] p-[4px]` nền `#f4f5f9`, tab active
  `bg-white shadow-sm rounded-[7px]`).
- **Quyết định tab mặc định — ĐÃ CHỐT:** nếu `assets.length === 0` khi mở modal → mặc định mở
  tab "Tải lên" (không có gì để xem ở Thư viện) — nếu có ít nhất 1 asset → mặc định "Thư viện".

### Tab "Thư viện"

- Ô tìm kiếm (Search icon, y hệt `ImagePanel.tsx` hiện tại) NGAY DƯỚI TabsList.
- Grid `grid-cols-4 gap-3` (rộng hơn 720px cho phép 4 cột thumbnail ~150px, khác `ImagePanel`'s
  2-cột hiện tại vì đó là panel HẸP 242px — modal RỘNG hơn nên nhiều cột hơn).
- Mỗi card: thumbnail vuông (background cover), hover hiện nút `Trash2` góc trên-trái (giữ đúng
  vị trí/hành vi `ImagePanel.tsx` hiện tại, chuyển nguyên logic `AssetThumbnail` vào đây).
  **KHÁC hành vi cũ:** click card → **KHÔNG áp dụng ngay** — chỉ set `selectedAsset` cục bộ, card
  hiện `ring-2 ring-[#4b57e6]/40` + `Check` badge góc trên-phải (mirror
  `CrossLayoutVariantPickerModal.tsx`'s card-selection UI, dùng nguyên). Double-click → xác nhận
  NGAY (gọi `onSelect` + đóng modal) — tái dùng chính hành vi double-click-confirm đã có ở
  `CrossLayoutVariantPickerModal`.
- Footer (LUÔN hiện, không riêng theo tab): trái = text trạng thái ("Đã chọn: tên-file.jpg" hoặc
  "Chưa chọn ảnh"), phải = nút "Huỷ" (đóng modal, không callback) + nút "Chọn" (disabled nếu
  `!selectedAsset`, click → `onSelect(selectedAsset)` rồi đóng).
- **Xoá asset:** click `Trash2` trên card → gọi `deleteAsset(relativePath)` → **PHẢI cập nhật lại
  `assets` state ngay bằng filter local** (sửa đúng bug đã audit thấy ở `ImagePanel.tsx` hiện
  tại — click xoá không tự refresh list, card cũ vẫn hiện tới khi `listAssets()` load lại) —
  KHÔNG chờ round-trip gọi lại `listAssets()`, filter optimistic ngay khi promise resolve.

### Tab "Tải lên"

- Vùng kéo-thả: `border-2 border-dashed border-[#cfd0da] rounded-lg` mặc định, đổi
  `border-[#4b57e6] bg-[#4b57e6]/5` khi `dragover` (state `isDragOver`, `onDragOver`/
  `onDragLeave`/`onDrop` chuẩn HTML5 D&D) — cao ~120px, giữa có icon `CloudUpload` (48px) + text
  "Kéo-thả ảnh vào đây, hoặc" + nút "Chọn file" (`<input type="file" multiple accept="image/*"
  hidden>` trigger qua ref).
- Sau khi có file (drop hoặc chọn) → build hàng đợi `UploadItem[]` (mirror my-builder's
  `processFiles`), render list các dòng NGAY DƯỚI vùng kéo-thả: mỗi dòng = thumbnail 40×40 (từ
  `FileReader.readAsDataURL`, preview LOCAL trước khi upload xong) + tên file + progress bar
  (indeterminate, vì `saveImageBlob` không có progress event thật — chỉ 2 trạng thái
  pending/uploading, KHÔNG có % thật) + icon trạng thái cuối (`Loader2` xoay khi uploading,
  `CheckCircle2` xanh khi done, `XCircle` đỏ khi error).
- Upload TUẦN TỰ (1 file tại 1 thời điểm, `for` loop `await saveImageBlob(file, file.name)`) —
  mirror my-builder, tránh nghẽn nếu nhiều file lớn cùng lúc.
- Khi TẤT CẢ xong (done hoặc error) → sau 900ms tự chuyển sang tab "Thư viện" (setTimeout, mirror
  ĐÚNG timing my-builder đã dùng — có tiền lệ cụ thể, không tự chọn số tuỳ ý) + tự
  `setAssets(prev => [...newlyUploaded, ...prev])` (thêm vào đầu list, không phải gọi lại
  `listAssets()` — optimistic, nhất quán với cách xử lý xoá ở trên).

## Mở rộng `AssetPort` — `saveImageBlob`

```ts
// packages/service-contracts/src/asset.ts — thêm vào AssetPort
saveImageBlob?(file: Blob, filename: string): Promise<{ relativePath: string }>;
```
- **Electron** (`apps/shell-electron/electron/ipc.ts`): IPC handler mới `kernel:layoutAsset:
  saveBlob` nhận `ArrayBuffer` + filename qua `ipcRenderer.invoke` (Blob không serialize qua IPC
  trực tiếp — renderer phải `await file.arrayBuffer()` TRƯỚC KHI invoke, main process
  `Buffer.from(arrayBuffer)` rồi ghi file — pattern chuẩn Electron cho binary qua IPC).
- **Web** (`apps/data-service/src/routes/asset.ts`): route mới `POST /api/layout-assets/upload`
  nhận `multipart/form-data` (dùng `multer` — CẦN THÊM DEPENDENCY nếu `data-service` chưa có,
  kiểm tra `apps/data-service/package.json` lúc code; nếu media.routes.ts của my-builder dùng
  multer, tiền lệ đã có ở project tham khảo, đủ tin tưởng chọn multer cho sky-app).
- **WASM** (`packages/platform-web/src/adapters/wasm-asset.ts`): gọi thẳng
  `saveAssetBlob(key, blob)` đã có sẵn trong `asset-blob-store.ts` (KHÔNG cần thêm hàm mới ở
  tầng lưu trữ, chỉ thêm entrypoint `saveImageBlob` gọi lại nó).
- Platform adapter (`platform-electron`/`platform-web`) — thêm
  `async saveImageBlob(file, filename) { const buf = await file.arrayBuffer(); return
  window.sky.invoke('kernel:layoutAsset:saveBlob', buf, filename); }` (Electron) và tương ứng
  fetch multipart (Web).

## Thay điểm dùng cũ

- `ImagePanel.tsx` (nội dung tab Media trong Flyout, chưa đổi Rail — đó là GĐ19): đổi thành hiện
  tối đa 12 ảnh gần nhất (`assets.slice(0, 12)`, KHÔNG search — search chỉ có trong modal) + nút
  "+" (mở modal, mặc định tab "Tải lên") + nút "Xem tất cả" cuối grid (mở modal, tab "Thư viện").
- `ImageControls.tsx`'s "Đổi ảnh" — 2 nút cạnh nhau: "Tải ảnh mới" (native picker, giữ nguyên
  hành vi cũ) + "Chọn từ thư viện" (mở `MediaLibraryModal`, `onSelect` → `patch({src:
  asset.relativePath})`).
- `FrameBackgroundControls.tsx` — tương tự, thêm "Chọn từ thư viện" cạnh nút ảnh nền hiện có.
- `ItemToolbar.tsx`'s Image quick-button (GĐ13) — đổi từ gọi trực tiếp native picker sang mở
  popover 2 dòng dẫn tới 1 trong 2 flow trên (đã ghi chú ở file GĐ13).

## Vấn đề phát sinh & cách xử lý

- **Modal mở TRONG context nào?** — được gọi từ Flyout (panel cố định, không phải modal khác) VÀ
  từ Property Panel (cũng panel cố định) — KHÔNG có trường hợp "modal-trong-modal" ở v1, nên
  `ColorfulSwatchButton` dùng TRONG `MediaLibraryModal` (nếu cần, hiện chưa cần vì modal này
  không có ô chọn màu) sẽ CẦN truyền `container` — ghi chú lại phòng trường hợp mở rộng modal
  sau có thêm field màu.
- **Upload file KHÔNG PHẢI ảnh** (user kéo nhầm .pdf/.docx) — chặn ở `accept="image/*"` trên
  input VÀ kiểm tra lại `file.type.startsWith('image/')` trước khi đưa vào hàng đợi (input
  `accept` chỉ là gợi ý UI, không chặn thật với drag-drop) — file không hợp lệ bị BỎ QUA ngay
  (không thêm vào `UploadItem[]`), không cần thông báo lỗi riêng (đơn giản hoá v1).
- **File quá lớn** — giới hạn kích thước: chưa có tiền lệ trong `AssetPort` hiện tại (không giới
  hạn) — v1 KHÔNG thêm giới hạn (giữ nguyên hành vi port hiện tại, không tự thêm rule mới không
  ai yêu cầu) — nếu Electron/Web thực tế gặp vấn đề file lớn, xử lý ở giai đoạn sau khi có bằng chứng cụ thể.

## Definition of done

- [ ] Modal mở từ Media tab/"Đổi ảnh"/"ảnh nền" — cùng 1 component, dùng Radix Dialog+Tabs.
- [ ] Kéo-thả nhiều file → từng file có tiến trình riêng, xong hết tự chuyển tab Thư viện.
- [ ] `saveImageBlob` hoạt động đúng cả 3 platform.
- [ ] Chọn ảnh PHẢI double-click hoặc bấm "Chọn" mới áp dụng — click đơn chỉ preview-select.
- [ ] Xoá asset trong modal → biến mất NGAY khỏi grid (optimistic update, không cần reload).
- [ ] Test cho `saveImageBlob` 3 adapter + modal UI (tab switch, upload queue states).

