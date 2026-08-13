# 2026-07-29 — Màn hình chờ chỉ hiển thị từ layout đã chọn, không còn fallback

## Quyết định

Màn hình chờ (idle) trên Backdrop thật giờ **CHỈ được phép hiển thị nội dung từ layout đã chọn
trong Layout Designer cho Event đang active** (`EventLayoutRef.role === 'idle'`). Không còn bất kỳ
fallback nào khi chưa cấu hình — trước đây (`BackdropApp.tsx`) rơi về `BackdropView` cũ, hiện tên
lễ/venue mặc định từ `Ceremony.name`/`Ceremony.venue`. Giờ khi Event chưa có `idleLayoutRef`,
Backdrop hiện màn ĐEN (không render gì, dùng nguyên nền `bg-black` sẵn có của root div) — không
còn text/ảnh cứng nào xuất hiện trên màn hình lễ khi thao tác viên chưa cấu hình xong.

**CHỈ áp dụng cho màn chờ** — layout trao giải (khi có người trên sân khấu) vẫn giữ nguyên fallback
`BackdropView` cũ khi Event chưa có `layoutRefs` khớp (quyết định fallback #1 từ
`2026-07-28-backdrop-layout-renderer.md`), không nằm trong phạm vi thay đổi lần này.

## `IdlePanel.tsx` (Control) — phản ánh đúng trạng thái + lối tắt sang thiết kế

Preview trong `IdlePanel.tsx` (sidebar Control) bỏ hẳn nhánh fallback ảnh tĩnh cũ
(`ceremony.idle_image`/`idle_image_variants`) — giờ chỉ có 2 trạng thái: có `idleLayoutRef` hợp lệ
→ render `LayoutRenderer` (khớp chính xác Backdrop thật); không có → hiện thông báo "Chưa cấu hình
màn hình chào mừng" + **disable nút "Hiển thị màn hình chào mừng"** (trước đây luôn bật, bấm vào
lúc chưa cấu hình sẽ chỉ ép Backdrop về màn đen vô nghĩa) + **thêm nút mở thẳng Layout Designer**.

## Cách mở app khác từ trong Ceremony — không cần port mới

Cần 1 cách để `modules/ceremony` mở `modules/layout-designer` (1 app khác trong device-shell) mà
KHÔNG import chéo module (AGENTS.md §2.5 cấm). Khảo sát `@sonth87/device-layout` (thư viện shell,
không phải 1 "app" — import trực tiếp không vi phạm quy tắc) phát hiện `useStore()` đã có sẵn:
- `apps: Record<string, AppConfig>` — registry TOÀN CỤC mọi app đã đăng ký, đổ đầy 1 lần lúc shell
  khởi động qua `registerApps()` (nội bộ `<SkyDeviceLayout apps={[...]}>` ở
  `apps/shell-electron|shell-web/src/main.tsx`, đã có `layoutDesignerModule` ở cả 2 platform).
- `launchApp(appConfig: AppConfig, options?)` — mở app theo `AppConfig`, tự focus cửa sổ đã chạy
  thay vì mở trùng (mặc định, trừ khi `forceNewWindow: true`).

→ `IdlePanel.tsx` chỉ cần `useDeviceLayoutStore((s) => s.apps['layout-designer'])` tra ra
`AppConfig` rồi gọi `launchApp` — không cần port/capability mới, không đụng
`platform-electron`/`platform-web`. Tái dùng được cho bất kỳ chỗ nào khác trong Ceremony (hoặc
module khác) cần mở 1 app khác sau này.

## Đã kiểm chứng

`pnpm typecheck` 35/35 sạch, `module-ceremony` test 73/73, `electron-vite build` sạch.

**Chưa kiểm chứng bằng mắt:** màn đen thật trên Backdrop khi chưa cấu hình idle, nút disable +
nút mở Layout Designer trong `IdlePanel.tsx`, và việc bấm nút đó có thật sự mở/focus đúng cửa sổ
Layout Designer trong GUI thật hay không.
