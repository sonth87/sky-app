# 2026-07-12 — Built-in demo apps trở lại + true macOS fullscreen trong device-layout

**Bối cảnh:** Sau GĐ5-6, desktop chỉ còn Ceremony + Mock App — các app demo mặc định của device-layout (Finder, Notes, Calendar, Photos, Music, Terminal, Settings, Browser, TextEdit, Clock, Messages) đã biến mất. Điều tra: đây là hành vi thiết kế đúng, không phải bug — `ThemeProvider({ apps = APPS_CONFIG })` chỉ dùng default khi KHÔNG truyền `apps` prop; `SkyDeviceLayout` luôn truyền `apps` tường minh (chỉ AppModule đã đăng ký) nên override hoàn toàn. Quyết định: muốn có lại demo apps, mặc định bật, tắt được theo từng app hoặc tất cả, khai báo type-safe.

**`packages/device-shell`**: `APPS_CONFIG` trước đây KHÔNG export từ `device-layout`'s `lib.tsx` (chỉ export types) — thêm export (xem commit riêng bên device-layout). `SkyDeviceLayout` thêm prop `builtInApps?: boolean | { exclude: BuiltInAppId[] }` — mặc định `true` (giữ đúng hành vi ThemeProvider không truyền `apps`), `false` ẩn hết, `{ exclude: [...] }` ẩn từng app theo id (autocomplete qua `BUILT_IN_APP_IDS` — 11 id liệt kê thủ công trong `built-in-apps.ts`, không có coupling runtime với device-layout, chỉ để type-safety). 3 test mới verify qua `useStore.getState().apps`.

**device-layout (repo riêng): true macOS fullscreen** — nhân tiện sửa 1 gap UX macOS phát hiện khi thao tác thật: nút xanh lá (traffic light) trước gọi chung `toggleMaximize` với double-click title bar, không có khái niệm fullscreen thật (ẩn menu bar + dock, chiếm toàn viewport) như macOS. Thêm `WindowState.isFullScreen` tách biệt hẳn `isMaximized`:
- `window-slice.ts`: `enterFullScreen`/`exitFullScreen`/`toggleFullScreen`. Zoom lúc đang fullscreen tự thoát fullscreen trước (không giữ đồng thời cả 2).
- `WindowChrome.tsx`: nút xanh lá → `toggleFullScreen`; double-click title bar vẫn `toggleMaximize` — theo đúng macOS thật (2 hành vi khác nhau, quyết định đã hỏi trước khi làm thay vì đoán).
- `MacOSTheme.tsx`: menu bar giờ CŨNG auto-hide (trước chỉ dock) khi có window fullscreen — hover mép trên (20px) hiện lại, tự ẩn sau 3s rời chuột. Dock auto-hide mở rộng theo cả `isMaximized` LẪN `isFullScreen` (trước chỉ maximized).
- `Window.tsx`: Escape thoát fullscreen (không có title bar để bấm lại nút xanh lá) — chỉ áp dụng window đang `isFocused`.
- `url-codec.ts`/`useWindowUrlSync.ts`: thêm bit 4 = fullscreen vào URL persistence.

**Kết quả verify (CDP, Electron thật, cả chuỗi)**: click xanh lá → menu bar + dock biến mất, window chiếm toàn viewport → hover mép trên (y≈2) → menu bar trượt xuống đè lên nội dung → rời chuột 3.5s → tự trượt lên ẩn → Escape → về windowed đúng (title bar + menu bar + dock hiện lại bình thường). Double-click title bar (zoom) xác nhận KHÔNG ảnh hưởng menu bar (tách biệt đúng 2 hành vi).

`pnpm -r run typecheck` 13/13 sạch, `pnpm -r run test` 65/65 pass (không regression), `tsc --noEmit` + `pnpm build:lib` sạch bên device-layout.
