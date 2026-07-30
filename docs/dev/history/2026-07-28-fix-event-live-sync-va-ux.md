# 2026-07-28 — Sửa 6 lỗi/UX từ đợt QA thủ công đầu tiên của Event Hub + LayoutRenderer

## Bối cảnh

Sau khi nối `BackdropApp.tsx` sang `LayoutRenderer` (xem
[2026-07-28-backdrop-layout-renderer.md](./2026-07-28-backdrop-layout-renderer.md)), Sonth tự tay
chạy `dev:app` và test luồng Event Hub/layout-designer lần đầu qua GUI thật, phát hiện 6 vấn đề.

## Quyết định 1 — Bug chặn đường: backdrop không cập nhật khi sửa layout của Event đang active

**Nguyên nhân:** `state:activeEventChanged` (kênh `BackdropApp.tsx`/`IdlePanel.tsx` dùng để
refetch Event active) chỉ được `resetSessionForNewEvent()` emit, mà hàm đó chỉ chạy khi
`kernel:event:setActive` (đổi Event). `kernel:event:save` (lưu Event ĐANG active, VD sửa
`layoutRefs`/màn chờ qua `LayoutConfigPanel`) không hề báo gì — Backdrop giữ `layoutRefs` cũ tới
khi khởi động lại app hoặc đổi Event đi rồi quay lại.

**Fix:** thêm `notifyActiveEventChanged(eventId)`
(`apps/shell-electron/electron/slide/socket-server.ts`) — CHỈ emit `state:activeEventChanged`,
KHÔNG gọi `clearAutoShow`/`clearIdleTimer`/reset `onStage` như `resetSessionForNewEvent` (sửa
cấu hình không được làm gián đoạn người đang trên sân khấu). Gọi trong `kernel:event:save`
(`apps/shell-electron/electron/ipc.ts`) khi `doc.status === 'active'`.

**Bài học:** mọi field mới của `EventDocument` cần live-sync tới Backdrop khi Event đang active
phải tự nhớ gọi kênh này — không có cơ chế tự động phát hiện field nào "cần" sync.

## Quyết định 2 — Không làm checkbox/label động cho menu "Dùng dữ liệu mẫu"

`menuBarMenus` (`modules/ceremony/src/index.ts`) là mảng TĨNH khai 1 lần lúc module load —
`MenuBarItem` (package `@sonth87/device-layout`) không hỗ trợ đổi label/hiện checkbox theo state
runtime. Vì vậy bỏ hẳn ý tưởng "menu tự đổi thành ✓ khi đã dùng data mẫu". Thay vào đó: hệ nạp
data mẫu cũ (dựa trên schema `Student`, đã xoá hẳn khi bỏ Student 22/7) được xây lại QUA hệ
Event/DataSource mới (`modules/ceremony/src/control/lib/sampleCanonicalData.ts`, id cố định
`sample-event`/`sample-data-source` để bấm lại không tạo trùng) — trạng thái "đã dùng data mẫu
chưa" xem được qua chính danh sách Event (badge số bản ghi ở `EventGate.tsx`), không cần menu báo.

## Quyết định 3 — Tái dùng `applyFieldMap`/`eventToIdleRecord` cho preview trong Control

`IdlePanel.tsx` trước đây preview 1 ảnh hardcode không liên quan tới bất kỳ hệ nào (cũ lẫn mới).
Viết lại để preview ĐÚNG những gì `BackdropApp.tsx` sẽ hiển thị thật — dùng lại chính
`applyFieldMap`/`eventToIdleRecord` (`@sky-app/slide-shared`, viết cho backdrop hôm qua) thay vì
viết công thức riêng, đảm bảo preview và màn chiếu thật luôn khớp nhau. Refetch qua
`state:activeEventChanged` — tự động cập nhật đúng lúc nhờ Quyết định 1 ở trên.

## Các sửa nhỏ khác

- `EventHubModal.tsx`: nút "Sửa" ở `EventGate.tsx` trước đây chỉ mở Hub menu (Import/Layout),
  KHÔNG có cách đổi tên/ngày Event sau khi tạo — thêm view `'info'` (icon bút chì cạnh tóm tắt
  ngày trong Hub) dùng lại đúng 2 field của form tạo mới, lưu qua `eventPort.save()`.
- `LayoutRuleTable.tsx`/`LayoutPickerModal.tsx`: tab đầu trong modal Ghép biến từng ra rỗng/ID khó
  đọc vì `label` quy tắc không tự điền theo tên layout đã chọn — `LayoutPickerButton`/
  `LayoutPickerModal`'s `onPick` giờ trả thêm `name`, tự điền `label` khi đang rỗng (không ghi đè
  label đã có). Cả 2 nơi cũng thêm 1 dòng liệt kê tỷ lệ (`variant.aspect.id`) dưới tên layout —
  trước đó chỉ có thumbnail (co méo về 1 kích thước cố định, không rõ tỷ lệ thật) + tên.

## Đã kiểm chứng

- `pnpm typecheck` sạch sau mỗi bước (shell-electron, module-ceremony).
- `pnpm --filter @sky-app/module-ceremony test` không hồi quy.
- Build test thật qua `dev:app`: kích hoạt Event có màn chờ, mở Backdrop, sửa lại màn chờ trong
  lúc Backdrop đang mở → xác nhận Backdrop VÀ `IdlePanel` cùng đổi theo ngay, không cần khởi động
  lại (xác nhận Quyết định 1 và 3 hoạt động đúng, khớp nhau qua cùng 1 kênh socket).

**Chưa kiểm chứng bằng mắt** (agent không thao tác chuột): auto-fill label layout, thumbnail tỷ
lệ, view sửa thông tin Event, nút "Dùng dữ liệu mẫu" tạo đúng Event demo — cần Sonth tự xác nhận.
