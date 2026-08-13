# 2026-07-28 — Icon trạng thái TTS trên menu bar (global) + nâng cấp device-layout

> Nối tiếp [`2026-07-28-tts-engine-port-dung-chung.md`](./2026-07-28-tts-engine-port-dung-chung.md) — vòng này thêm cách xem trạng thái TTS mà không cần mở Ceremony.

## Bối cảnh

Trạng thái tts-service trước đây chỉ xem được qua `TtsChip` trong status bar của Ceremony — dùng `window.slide.onPythonStatus`/`getTtsDebug` (IPC Electron-only, theo dõi trực tiếp subprocess Ceremony spawn). Vấn đề: TTS giờ là service dùng chung cho cả Ceremony lẫn TTS Studio, nhưng chỉ Ceremony xem được trạng thái — và phải MỞ Ceremony mới thấy.

Yêu cầu: 1 icon trạng thái trên menu bar cạnh đồng hồ (kiểu macOS menu bar extras), luôn hiện bất kể app nào đang mở, bấm vào ra popover với 3 phần (trạng thái/engine/thiết bị + lối tắt), và cửa sổ xem log riêng không chặn thao tác app khác.

## Việc 1 — Tag, push, kéo về device-layout

`device-layout` là repo riêng (`git@github.com:sonth87/device-layout.git`) do chính người dùng phiên này sở hữu — sửa tại nguồn thay vì hack DOM từ phía sky-app.

Theo đúng `docs/versioning.md` của repo đó: bump `0.3.4` → `0.4.0` (MINOR — thêm tính năng tương thích ngược), `pnpm build` (Next.js full build) + `pnpm build:lib` (dist-lib) đều sạch, commit, `git tag -a v0.4.0`, push commit + tag lên `origin/main`. Cập nhật `pnpm-workspace.yaml`'s `"@sonth87/device-layout": "github:sonth87/device-layout#v0.4.0"` rồi `pnpm install` để kéo về.

### Thay đổi trong device-layout

- **`menuBarExtras`** (mới) — prop trên `<DeviceLayout>`, nhận `MenuBarExtraItem[]` (`id`, `icon`, `status: 'ok'|'busy'|'error'|'neutral'`, `label`, `content`). Context/Provider theo đúng khuôn `update-actions.ts` đã có sẵn trong repo đó. Render ngay trước nhóm Wifi/Battery/ControlCenter trong `MenuBar.tsx` — đúng vị trí icon app nền trên menu bar macOS thật.
- **`FloatingWindow`** (mới, export) — tách từ `AboutDialog.tsx` cũ. Cửa sổ nổi kéo-thả kiểu "About This Mac", nhận `blocking?: boolean` (default `true`, giữ nguyên hành vi About cũ). `AboutDialog` giờ compose lại từ component này.
- **Fix bug thật**: kéo `AboutDialog` cũ đồng thời kích hoạt marquee-select của `IconGrid` (bôi đen icon desktop bên dưới). Nguyên nhân: `IconGrid.tsx`'s `handleWindowPointerDown` chỉ bỏ qua marquee-select cho phần tử có marker `data-windowchrome="true"` (hoặc `id^="window-"`, `data-menubar`, …) — `AboutDialog` cũ portal thẳng `document.body`, không có marker nào trong số đó. `FloatingWindow` thêm `data-windowchrome="true"` vào khung ngoài, fix cho cả About lẫn mọi component dùng lại sau này.
- Thêm cờ `SimpleModeFeatures.menuBar.extras` (default `true` — mang thông tin trạng thái thật của host, không phải trang trí OS, nên không tắt cùng simple mode như spotlight/controlCenter).

## Việc 2+3 — Icon trạng thái + nội dung popover + cửa sổ log

### Nguồn trạng thái — khảo sát trước khi thiết kế

Đọc `TtsChip.tsx`/`LogsChip.tsx` của Ceremony để biết chính xác đang hiển thị gì (dot màu, nút restart, status/detail, Engine/Voice/Enabled, khối Debug: PID/port/health/exit code/stderr/activity log phân trang) — làm chuẩn đối chiếu khi generalize.

Phát hiện quan trọng: Ceremony dùng `getTtsStatus()` (poll) + `onPythonStatus()` (push) — cả hai chỉ có trên Electron vì theo dõi trực tiếp subprocess. Tts-service **đã có sẵn** `GET /health` (`{"status":"ok"}`) — endpoint HTTP thuần, hoạt động trên MỌI nền tảng bất kể ai spawn service. Quyết định thiết kế: `getHealth()` (bắt buộc, mọi adapter) làm nền tảng chung; `getProcessStatus`/`onProcessStatus`/`getDebugInfo` (optional, chỉ Electron) bồi thêm chi tiết khi có — đúng pattern "required base + optional platform-specific" đã dùng cho các method khác của `TtsEnginePort`.

### Thay đổi mã nguồn (sky-app)

- **`slide-api.ts`**: trích 2 type đặt tên `TtsProcessStatus`/`TtsDebugInfo` (trước đó là inline type trên `onPythonStatus`/`getTtsStatus`/`getTtsDebug`) — để `service-contracts` tái dùng đúng chiều phụ thuộc sẵn có (service-contracts → slide-shared).
- **`TtsEnginePort`**: thêm `getHealth()` (bắt buộc), `getProcessStatus?`/`onProcessStatus?`/`getDebugInfo?` (optional).
- **Adapter Electron**: `getHealth()` map từ `getTtsStatus()` (không mở thêm kênh IPC mới — tái dùng cái đã có, tránh 2 nguồn thông tin cho cùng 1 việc). 3 method optional delegate thẳng `window.slide.*`.
- **Adapter Web**: chỉ `getHealth()` qua `fetch('/health')`.
- **`@sky-app/tts-engine-ui`** (package UI dùng chung, không phụ thuộc device-layout — xem quyết định kiến trúc bên dưới):
  - `useTtsStatus(port)` — Electron: subscribe `onProcessStatus` (push). Web: poll `getHealth()` mỗi 5s; chưa từng ready → `busy`, đã từng ready mà giờ fail → `error` (phân biệt "đang khởi động" với "mất kết nối" dù chỉ có tín hiệu ok/fail thuần).
  - `TtsStatusPanel` — nội dung popover (trạng thái + engine + thiết bị + 3 nút lối tắt), thuần presentational.
  - `TtsLogPanel` — nội dung cửa sổ log (PID/port/health/stderr/activity log, poll 1.5s khi mount), generalize từ đúng những gì `TtsChip` từng hiện. Hiện thông báo "không xem được trên nền tảng này" nếu `port.getDebugInfo` không tồn tại (Web).
  - `i18n-bootstrap.ts` (`ensureTtsEngineI18n`) — xem mục "Bug phát hiện giữa chừng" bên dưới.
- **`packages/device-shell/src/TtsStatusMenuBarItem.tsx`** (mới) — nơi DUY NHẤT lắp ráp `MenuBarExtraItem` + `FloatingWindow` từ các mảnh trên. Gọi từ `SkyDeviceLayout.tsx` (đã có sẵn `platform` prop), truyền `menuBarExtras={[item]}` vào `<DeviceLayout>`.

### Quyết định kiến trúc: `tts-engine-ui` không phụ thuộc `device-layout`

Cân nhắc lúc thiết kế: đặt `useTtsStatus`/`TtsStatusPanel`/`TtsLogPanel` ở đâu? `MenuBarExtraItem`/`FloatingWindow` là khái niệm riêng của device-layout — nếu để package "UI quản lý engine dùng chung" (vốn phải dùng được ở bất kỳ context nào, không riêng desktop chrome) phụ thuộc thẳng vào đó là rò rỉ kiến trúc. Quyết định: `tts-engine-ui` chỉ export nội dung THUẦN (presentational), không tự bọc Popover/FloatingWindow gì cả — `TtsStatusLevel` định nghĩa lại tại chỗ (cùng 4 giá trị `'ok'|'busy'|'error'|'neutral'` với `MenuBarExtraStatus` của device-layout, tương thích cấu trúc, không import). Việc LẮP RÁP (gắn vào Popover của device-layout, bọc `FloatingWindow`) dồn hết về `packages/device-shell` — nơi ĐÃ phụ thuộc device-layout sẵn, đúng vai trò "dịch" giữa thế giới AppModule/PlatformContext của sky-app và thế giới chrome của device-layout.

### Bug phát hiện giữa chừng: thứ tự khởi tạo i18next

Thiết kế ban đầu (Ceremony gọi `.init()` không điều kiện, TTS Studio gọi `.init()` có guard `isInitialized`) giả định Ceremony luôn init trước. Sai — `device-shell`'s `SkyDeviceLayout` giờ CŨNG cần i18next (cho `TtsStatusPanel`), và nó mount TRƯỚC MỌI app (Ceremony/TTS Studio lazy-load theo cửa sổ mở). Nếu device-shell init trước với guard `isInitialized`, thứ tự thực tế phụ thuộc app nào mở trước — có kịch bản Ceremony's `.init()` không điều kiện chạy sau, ghi đè sạch resource TTS Studio/device-shell vừa thêm (hoặc ngược lại, im lặng bỏ qua và thiếu string).

Fix: `ensureTtsEngineI18n()` (trong `tts-engine-ui`) — nơi gọi ĐẦU TIÊN mới `.init()` (resources rỗng), MỌI nơi (kể cả nơi gọi đầu) chỉ `addResourceBundle()` để LỚP thêm resource của mình, không đụng nơi khác. Ceremony's `i18n.ts` viết lại theo cùng nguyên tắc: `addResourceBundle` cho `vi.json`/`en.json` riêng, rồi `changeLanguage()` áp lại ngôn ngữ đã lưu (đè lựa chọn mặc định `'vi'` mà device-shell có thể đã set trước khi biết gì về Ceremony).

## Đã kiểm chứng

- `pnpm typecheck` toàn repo (33/33), `pnpm build`/`build:lib` device-layout sạch.
- `pnpm test` Ceremony: 73/73 pass (i18n viết lại không phá gì).
- Chạy dev thật: server + renderer lên sạch, `[TTS] Ready.`, không có `Uncaught`/`TypeError`/renderer crash trong log.
- Xác nhận `node_modules` đã kéo đúng `device-layout@0.4.0` (grep `dist-lib/lib.d.ts` thấy `MenuBarExtraItem`/`FloatingWindow`/`menuBarExtras`).

## CHƯA kiểm chứng

- **Chưa xem bằng mắt** — không có khả năng nhìn màn hình; cần người dùng tự mở app xác nhận: icon hiện đúng vị trí, đổi màu đúng theo trạng thái, popover hiện đủ 3 phần, cửa sổ log mở được và KHÔNG chặn thao tác cửa sổ khác (đúng mục đích sửa `blocking=false`), và bug marquee-select khi kéo cửa sổ log đã hết.
- Trạng thái `busy` hiện chỉ có nghĩa "đang khởi động/kết nối" — KHÔNG có nghĩa "đang xử lý 1 yêu cầu tổng hợp giọng" (Ceremony vốn cũng không có tín hiệu real-time đó, không tự thêm để tránh lấn phạm vi).
