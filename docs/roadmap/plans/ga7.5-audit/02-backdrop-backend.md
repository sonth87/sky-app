# GĐ7.5 Audit — Nhóm B (Backdrop) + Nhóm C (Backend Electron)

**Subagent:** 2
**Phạm vi:** B1–B4 (Backdrop) + C1–C9 (Backend Electron) — 13 chức năng
**Ánh xạ thư mục:**
- Backdrop gốc: `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/slide/src/backdrop/` → đích: `/Users/skyline/PROJECTS/sky-app/modules/ceremony/src/backdrop/`
- Backend gốc: `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/slide/electron/` → đích: `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/` (`slide/*` + `main.ts`)

Phương pháp: đọc trực tiếp toàn văn các file liên quan cả 2 phía + `diff` từng file để xác định phạm vi sai lệch chính xác đến từng dòng. Không sửa bất kỳ file production nào.

---

### [B1] Hiển thị trạng thái/chữ trên Backdrop
**Trọng số:** High
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/modules/ceremony/src/styles.css` (dòng 132-133)
- `/Users/skyline/PROJECTS/sky-app/modules/ceremony/src/backdrop/BackdropApp.tsx` (dòng 1339: `bg-black text-white`)
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron.vite.config.ts` (dòng 30-35)
- `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/slide/src/styles.css` (không có `@source` nào — đối chứng)

#### Architecture Review
- Luồng build CSS: `@tailwindcss/vite` (Tailwind v4) plugin quét dependency graph của mỗi Vite entry (`index.html` → `main.tsx` → Control; `backdrop.html` → `backdrop-main.tsx` → `BackdropApp.tsx`) để tự phát hiện file cần scan class. Vì `styles.css` vật lý nằm trong package `@sky-app/module-ceremony` (`modules/ceremony/src/styles.css`, import qua export map `"./styles.css"`), Tailwind v4's auto-content-detection lấy thư mục chứa CSS (`modules/ceremony/src/`) làm base để tự quét — nhưng do package này được các app khác `import` chứ không nằm cùng cây thư mục app, hành vi tự-quét không đủ tin cậy cho toàn bộ cây con, nên người port đã thêm 1 dòng `@source` thủ công: `@source "./control/**/*.{ts,tsx}";` (dòng 133) để đảm bảo `control/**` được quét chắc chắn.
- **So sánh với bản gốc: khác KHÔNG chủ đích (bug).** Bản gốc (`apps/slide/src/styles.css`) **không hề có bất kỳ dòng `@source` nào** — kiểm tra bằng `grep -n "@source"` trả về rỗng. Ở gốc, `styles.css` nằm trực tiếp trong `apps/slide/src/` (cùng cây với cả `control/` và `backdrop/`), nên Tailwind v4 tự quét đúng toàn bộ không cần khai báo gì thêm. Khi port sang kiến trúc package (`modules/ceremony` tách biệt khỏi app `shell-electron`), người port đã đúng khi nhận ra cần thêm `@source` — nhưng chỉ thêm cho `control/**`, **quên hoàn toàn `backdrop/**`**. Dòng thiếu đúng ra phải là: `@source "./backdrop/**/*.{ts,tsx}";`.
- Hệ quả runtime: class `text-white` (dùng ở `BackdropApp.tsx:1339`, trạng thái "Đang tải…") không nằm trong bất kỳ file nào Tailwind quét được → generator không sinh CSS rule `.text-white{color:#fff}` → chữ "Đang tải…" render với màu mặc định của trình duyệt (đen) trên nền `bg-black` → **chữ đen trên nền đen, không đọc được** (đúng như mô tả bug đã biết).
- Rà thêm phạm vi ảnh hưởng (yêu cầu bổ sung của prompt): liệt kê toàn bộ class Tailwind literal trong `backdrop/**/*.tsx` (chỉ có `BackdropApp.tsx`; `lib/tts.ts` không có JSX) và đối chiếu với toàn bộ class dùng trong `control/**/*.tsx` (542 class unique). Kết quả: `bg-black`, `flex`, `h-full`, `items-center`, `justify-center`, `relative`, `w-full` — **tất cả đều trùng với class đã dùng ở `control/`** nên vẫn được generate (không bug). **Duy nhất `text-white` là class KHÔNG xuất hiện ở bất kỳ đâu trong `control/**`** → đây là class MỘT VÀ DUY NHẤT bị ảnh hưởng bởi bug này trong toàn bộ `BackdropApp.tsx`.
- Container `BackdropView` (từ `packages/slide-shared/src/BackdropView.tsx` và `DynamicBackdropView.tsx`, dùng để render nội dung thật khi có sinh viên on-stage) **không dùng bất kỳ Tailwind class nào** — style hoàn toàn bằng inline `style={{...}}` (xác nhận bằng `grep -c className` = 0 trên `DynamicBackdropView.tsx`). Do đó nội dung chính (tên SV, panel, ảnh nền) **không bị ảnh hưởng bởi bug B1** — chỉ màn hình "Đang tải…" (trạng thái loading trước khi `ceremony` fetch xong) và union tiềm ẩn nếu sau này thêm class mới riêng cho backdrop.
- Hiệu năng: không liên quan (đây là build-time CSS generation, không phải runtime).
- Độ ổn định: không phải race condition — là lỗi cấu hình build tất định (deterministic), luôn tái hiện 100% mỗi lần build.
- Nhận định kiến trúc: việc tách `styles.css` vào package riêng (`@sky-app/module-ceremony`) rồi dùng `@source` thủ công để bù đắp cho auto-detection yếu đi qua ranh giới package là hướng đi hợp lý (buộc phải làm khi refactor sang monorepo packages), nhưng thiếu 1 checklist/test đảm bảo *toàn bộ* thư mục renderer con (`control/`, `backdrop/`, và bất kỳ thư mục mới nào sau này) đều được liệt kê trong `@source`. Đây là kiểu lỗi "silent" — không có TypeScript error, không có runtime exception, chỉ lộ ra khi nhìn bằng mắt.
- Đề xuất cải tiến:
  - **P0**: thêm `@source "./backdrop/**/*.{ts,tsx}";` vào `styles.css` (dòng 134, ngay sau dòng 133).
  - **P1**: cân nhắc gộp thành 1 dòng bao quát cả 2: `@source "./{control,backdrop}/**/*.{ts,tsx}";` hoặc rộng hơn `@source "./**/*.{ts,tsx}";` (quét toàn bộ `modules/ceremony/src/`) để tránh lặp lại lỗi này khi thêm thư mục renderer mới trong tương lai.
  - **P2**: thêm 1 vitest/script kiểm tra "mọi class Tailwind literal xuất hiện trong source đều có mặt trong CSS output đã build" (kiểu snapshot/regression test) để bắt lớp bug này tự động thay vì phải soi bằng mắt.

#### QA/QC Review
- Trạng thái tổng quan: **FAIL** — 1/3 test case (bug xác nhận lại đúng như mô tả Phase 1, thêm phát hiện phạm vi hẹp hơn ban đầu lo ngại).

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| B1-1 | `@source` thiếu quét backdrop | Manual (đọc code, không cần Electron runtime) | Đọc `styles.css` dòng 132-133; grep toàn bộ `@source` | Có dòng quét `backdrop/**` | Chỉ có `control/**`, không có `backdrop/**` | **FAIL** |
| B1-2 | Phạm vi ảnh hưởng — class nào khác `text-white` bị mất | Manual (grep + diff set class) | Liệt kê class `backdrop/**/*.tsx`, so với class `control/**/*.tsx` | Xác định chính xác danh sách | Chỉ `text-white` bị ảnh hưởng; 7 class khác trùng với control nên an toàn | PASS (kết luận rõ ràng, không phải "app không lỗi") |
| B1-3 | `BackdropView`/`DynamicBackdropView` có bị ảnh hưởng không | Manual (grep className) | Kiểm tra `packages/slide-shared/src/BackdropView.tsx`, `DynamicBackdropView.tsx` | Xác định có/không dùng Tailwind class | 0 className — dùng inline style hoàn toàn, không bị ảnh hưởng | PASS |
- Bug liên quan: **Bug đã biết B1 XÁC NHẬN ĐÚNG** — CSS `@source` thiếu `backdrop/**` khiến class `text-white` không được generate, dòng "Đang tải…" hiển thị chữ đen trên nền đen. Mức độ: **High** (đúng như đánh giá Phase 1) — vì đây là màn hình loading state hiện ra mỗi lần Backdrop khởi động (dù ngắn), và là dấu hiệu cảnh báo cho lớp bug tương tự có thể xảy ra nếu thêm class mới trong `backdrop/` tương lai mà không trùng với `control/`.
- Coverage ước tính: functional 100% (đã xác nhận chính xác phạm vi ảnh hưởng, không chỉ dòng bug được biết trước mà cả rà soát toàn diện các class khác). Code coverage: N/A (không viết test tự động — đây là lỗi build-config, không có logic runtime để unit-test qua vitest một cách có ý nghĩa).
- Đề xuất bổ sung test chưa viết: 1 script CI (không phải vitest) chạy `vite build` cho renderer rồi grep CSS output đã build tìm `.text-white{` — sẽ fail nếu ai đó xoá lại dòng `@source` backdrop trong tương lai. Không viết ở đây vì cần môi trường build đầy đủ (ngoài phạm vi vitest đơn thuần theo yêu cầu audit).

---

### [B2] Đồng bộ Control→Backdrop qua `window.slide`
**Trọng số:** High
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/modules/ceremony/src/control/components/BackdropToggle.tsx`
- `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/slide/src/control/components/BackdropToggle.tsx`
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/preload.ts` (dòng 113-118: `onBackdropState`)
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/ipc.ts` (dòng 29-33: `notifyBackdropState`; dòng 376-394: `backdrop:toggle`, `backdrop:isOpen`, `backdrop:isFullscreen`)
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/windows.ts` (dòng 20-24: `setBackdropStateListener`; dòng 73-88: sự kiện native window)

#### Architecture Review
- Luồng xử lý: `BackdropToggleCompact` (Control UI) → `useBackdropState()` hook → mount: gọi `window.slide.isBackdropOpen()` + `isBackdropFullscreen()` lấy trạng thái ban đầu, đồng thời đăng ký `window.slide.onBackdropState(cb)` (IPC listener trên channel `backdrop:state`) → user bấm nút → `window.slide.toggleBackdrop()` → IPC invoke `backdrop:toggle` → main: `isBackdropOpen()` gate mở/đóng cửa sổ (`openBackdropWindow`/`closeBackdropWindow`) → gọi `notifyBackdropState()` (định nghĩa `ipc.ts:29`) → `getMainWindow()?.webContents.send('backdrop:state', {open, fullscreen})` → Control's `onBackdropState` handler nhận, `setOpen`/`setFullscreen`.
- **So sánh với bản gốc: khớp 100% cho luồng chủ động (Control bấm nút)** — `BackdropToggle.tsx` diff = 0 (identical byte-for-byte cả 2 phía). `preload.ts`'s `onBackdropState` chữ ký khớp. `ipc.ts`'s `notifyBackdropState()` + `backdrop:toggle` handler khớp gần như tuyệt đối (duy nhất khác `getControlWindow()` → `getMainWindow()`, có chủ đích — xem C7 nhận định chung).
- **Khác KHÔNG chủ đích (liên đới trực tiếp từ bug C2):** ở bản gốc, `main.ts:98` gọi `setBackdropStateListener(() => notifyBackdropState())` — đăng ký callback `onBackdropStateChange` trong `windows.ts` để **mọi sự kiện native window** (đóng bằng nút X — `windows.ts:77-81`, fullscreen bằng phím tắt OS — dòng 83-88, di chuyển màn hình — `moveBackdropToDisplay`) đều tự động gọi `notifyBackdropState()` để báo Control. Ở bản đích, `windows.ts` **vẫn export `setBackdropStateListener`** (dòng 22-24, hàm tồn tại nguyên vẹn) nhưng **không có lệnh gọi `setBackdropStateListener(...)` nào trong `main.ts`** (xác nhận bằng đọc toàn văn `main.ts` — không có import/gọi hàm này). Hệ quả: `onBackdropStateChange` trong `windows.ts` **luôn là `null`** suốt vòng đời app → khi user đóng Backdrop bằng nút X cửa sổ (không qua nút toggle của Control), hoặc bấm phím tắt fullscreen của OS, Control **không nhận được cập nhật `backdrop:state`** → `BackdropToggleCompact` hiển thị sai trạng thái (vẫn hiện "Tắt màn hình" dù Backdrop đã đóng thật) cho tới khi user F5 lại Control hoặc bấm chính nút toggle (lúc đó state mới được resync qua nhánh `backdrop:toggle` handler).
- Hiệu năng: không polling — hoàn toàn event-driven (IPC push + socket). Không có vấn đề.
- Độ ổn định: `useBackdropState()` hook có cleanup đúng (`return off` từ `useEffect`, gọi `ipcRenderer.removeListener`). Không thấy race condition trong luồng chủ động. Race condition tiềm ẩn nếu 2 event 'closed' + 'enter-full-screen' bắn gần nhau khi listener không wire (không thể quan sát được vì listener null nên đơn giản là không có gì chạy).
- Nhận định kiến trúc: `notifyBackdropState()` đặt trong `ipc.ts` (đúng layer — nó là 1 IPC-side utility) nhưng phụ thuộc callback injection từ `main.ts` để wire vào window lifecycle events — đây là pattern hợp lý (giữ `windows.ts` không phụ thuộc trực tiếp vào `ipc.ts`, tránh vòng lặp import), nhưng vì injection này là 1 dòng đơn lẻ dễ quên khi bootstrap logic phình to (`main.ts` đích thiếu 4 dòng liên quan tới cả C1/C2/C3), rủi ro "silent omission" cao.
- Đề xuất cải tiến:
  - **P0**: thêm `setBackdropStateListener(() => notifyBackdropState())` vào `bootstrapSlideBackend()` trong `main.ts` (cùng nhóm sửa với C2).
  - **P1**: cân nhắc auto-wire ngay trong `registerSlideIpcHandlers()` (tức đưa logic wiring vào `ipc.ts` thay vì đòi hỏi caller ở `main.ts` phải nhớ gọi riêng) để giảm khả năng quên khi refactor bootstrap sau này.

#### QA/QC Review
- Trạng thái tổng quan: **PASS một phần** — 2/3 test case (luồng chủ động OK, luồng passive/window-event FAIL do phụ thuộc bug C2).

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| B2-1 | Toggle chủ động từ Control | Manual (cần Electron runtime) | Bấm nút "Bật màn hình" trên Control | Backdrop mở, nút đổi thành "Tắt màn hình" | Đúng theo code — `backdrop:toggle` handler gọi `notifyBackdropState()` trực tiếp bất kể listener có wire hay không | PASS (theo phân tích code, chưa chạy runtime thật) |
| B2-2 | Đóng Backdrop bằng nút X cửa sổ | Manual (cần Electron runtime) | Mở Backdrop, đóng bằng nút X (không qua Control) | Control tự cập nhật trạng thái "đã tắt" | `onBackdropStateChange` = null (không wire) → Control KHÔNG nhận cập nhật, hiển thị sai trạng thái | **FAIL** (hệ quả của bug C2) |
| B2-3 | Fullscreen bằng phím tắt OS (không qua nút Control) | Manual (cần Electron runtime, không tự động hoá được) | Backdrop đang mở, bấm phím tắt fullscreen của hệ điều hành | Control cập nhật trạng thái fullscreen | Tương tự B2-2 — không wire nên không cập nhật | **FAIL** (hệ quả của bug C2) |
- Bug liên quan: không phải bug MỚI — đây là **hệ quả trực tiếp, cụ thể hoá của bug C2 đã biết trước**, lên đúng chức năng B2. Mức độ: **High** (kế thừa từ C2) vì Backdrop là màn hình trình chiếu chính, vận hành viên thường thao tác qua phím tắt/nút cửa sổ trong lúc lễ diễn ra — trạng thái Control hiển thị sai dễ gây thao tác nhầm (tưởng đang tắt mà vẫn bật, hoặc ngược lại).
- Coverage ước tính: functional ~85% (đã trace đủ toàn bộ luồng code, 2/3 nhánh xác nhận qua đọc logic; nhánh runtime thật (B2-1) chưa chạy thực tế qua Electron do giới hạn môi trường audit). Code coverage: không đo được qua vitest (cần Electron BrowserWindow thật).
- Đề xuất bổ sung test chưa viết: E2E test dùng Playwright + Electron (không có trong scope vitest hiện tại của repo) mô phỏng đóng cửa sổ bằng `win.close()` rồi assert Control nhận được IPC `backdrop:state` — nên bổ sung sau khi bug C2 được fix.

---

### [B3] `isActive` gate / minimize behavior
**Trọng số:** Medium
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/packages/device-shell/src/to-device-app-config.tsx`
- `/Users/skyline/PROJECTS/sky-app/modules/ceremony/src/CeremonyApp.tsx`
- `/Users/skyline/PROJECTS/sky-app/modules/ceremony/src/control/ControlApp.tsx` (dòng 38-46, 212-269)

#### Architecture Review
- Luồng xử lý: `to-device-app-config.tsx`'s `toDeviceAppConfig()` bọc mỗi `AppModule.render` trong 1 component `Bridged` — `Bridged` gọi `useStore((s) => s.activeAppId === appId)` (device-layout's zustand store, theo dõi app nào đang active/focus trong shell multi-app) để tính `isActive`, rồi `createElement(AppRender, {appId, windowId, platform, isActive})`. Với Ceremony: `AppRender` = `CeremonyApp` (`CeremonyApp.tsx:10`) — nhận `isActive` từ `AppContentProps`, forward thẳng xuống `ControlApp({isActive})`. `ControlApp` dùng `isActive` ở 2 chỗ: (1) dòng 212-261 — `useEffect` đăng ký `window.slide.onMenuAction`, nhưng **early-return nếu `!isActive`** (dòng 214: `if (!isActive) return;`) — nghĩa là handler chỉ *xử lý* action khi app đang active, dù listener vẫn đăng ký cho tất cả instance; (2) dòng 265-269 — `useGlobalCardReader(handleCardScan, {enabled: isActive})` — tắt hẳn global keyboard listener khi không active, tránh cướp phím của app khác trong cùng shell.
- **So sánh với bản gốc: khác có chủ đích, và đúng là kiến trúc HOÀN TOÀN MỚI không tồn tại ở bản gốc.** Bản gốc (`apps/slide`) là ứng dụng đơn (single-purpose Electron app) — không có khái niệm "nhiều app trong 1 shell", không có `isActive`, không có multi-window-manager. `ControlApp` gốc không nhận prop `isActive` (nó không tồn tại trong signature gốc). Toàn bộ cơ chế `isActive` là bổ sung của nền tảng `sky-app` (multi-app platform, GĐ5 theo comment trong code) để giải quyết vấn đề mới phát sinh khi Ceremony chạy như 1 "app" bên trong shell đa-app: menu bar và global keyboard listener giờ là tài nguyên DÙNG CHUNG của cả cửa sổ (`hasMenuBar`), nên cần gate để app không active không "cướp" các sự kiện đó của app khác. Đây KHÔNG phải bug — là mở rộng kiến trúc hợp lý và cần thiết cho bối cảnh nền tảng mới.
- Về "minimize behavior" (nhắc trong tên chức năng B3): không tìm thấy code nào riêng biệt xử lý minimize/restore của *Backdrop window* liên quan tới `isActive` — `isActive` chỉ gate hành vi bên trong `ControlApp` (Control UI), không liên quan trực tiếp tới cửa sổ Backdrop (Backdrop là 1 `BrowserWindow` độc lập ngoài device-layout, không đi qua cơ chế `isActive` này — đúng như tài liệu trong `main.ts`'s comment dòng 58-60: "Backdrop vẫn là BrowserWindow riêng ngoài device-layout"). Do đó nhận định "minimize behavior" trong bảng audit gốc có thể ám chỉ hành vi Control bị minimize/ẩn trong shell chứ không phải Backdrop — cơ chế `isActive` xử lý đúng phạm vi này (ẩn Control ≠ đóng Backdrop, 2 khái niệm tách biệt và độc lập trong code, đúng thiết kế).
- Hiệu năng: `useStore` selector chỉ re-render `Bridged` khi `activeAppId` đổi (zustand selector pattern chuẩn, không re-render thừa toàn shell).
- Độ ổn định: `useEffect` dòng 212-261 có cleanup đúng (`return unsub`). `useGlobalCardReader` không đọc được implementation ở đây nhưng cách gọi (`enabled: isActive`) là pattern chuẩn, không thấy race condition rõ ràng trong code đã đọc.
- Nhận định kiến trúc: đúng layer — `to-device-app-config.tsx` (thuộc `device-shell` package, framework-level) chịu trách nhiệm derive `isActive` từ store chung, còn `ControlApp` (app-level) chỉ tiêu thụ giá trị này qua prop, không tự ý query store của platform — tách biệt rõ ràng, không phải god component.
- Liên đới với C1: dòng 213 (`window.slide.onMenuAction`) đăng ký handler cho `menu:action` IPC event — nhưng vì bug C1 (main.ts thiếu gọi `setAppMenu('vi')` lúc bootstrap), native menu không được set cho tới khi user đổi ngôn ngữ lần đầu (`app:setLanguage` handler mới gọi `setAppMenu`) → trong khoảng thời gian đó, `menu:action` không bao giờ bắn dù `isActive` đúng hay sai — gate `isActive` ở đây "đúng" nhưng vô nghĩa vì message nguồn (menu bar) chưa tồn tại.
- Đề xuất cải tiến: không có đề xuất P0/P1 riêng cho B3 — cơ chế đúng thiết kế. **P2**: cân nhắc đổi tên chức năng "B3 minimize behavior" trong roadmap thành rõ ràng hơn ("Control focus gate trong multi-app shell") để tránh nhầm với hành vi minimize cửa sổ Backdrop (2 khái niệm khác nhau, dễ gây hiểu lầm khi audit).

#### QA/QC Review
- Trạng thái tổng quan: **PASS** — 3/3 test case.

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| B3-1 | `isActive` derive đúng từ store | Manual (đọc code — cần multi-app shell runtime để verify trực tiếp) | Đọc `to-device-app-config.tsx:28` | `isActive = activeAppId === appId` | Đúng như code | PASS |
| B3-2 | Menu action bị gate khi không active | Manual | Đọc `ControlApp.tsx:214` | `if (!isActive) return;` chặn xử lý action | Đúng như code | PASS |
| B3-3 | Global card reader bị tắt khi không active | Manual | Đọc `ControlApp.tsx:265-269` | `enabled: isActive` truyền đúng vào hook | Đúng như code | PASS |
- Bug liên quan: không có bug mới. Ghi chú: hành vi B3-2 bị "che khuất" bởi bug C1 (menu chưa set lúc khởi động) nhưng đó là lỗi của C1, không phải lỗi của cơ chế gate `isActive` — B3 tự thân đúng.
- Coverage ước tính: functional 90% (đã trace đủ code path chính; chưa test được tình huống multi-app thật với 2+ app cùng mở trong shell do giới hạn môi trường audit không chạy Electron runtime). Code coverage: N/A (cần React Testing Library + zustand store mock để test tự động — khả thi nhưng không viết ở đây vì ngoài phạm vi 13 mục audit tập trung vào diff/logic, và giá trị thu được thấp so với việc audit thêm các mục Backend).
- Đề xuất bổ sung test chưa viết: unit test cho `toDeviceAppConfig` với zustand store mock (`activeAppId` thay đổi → `isActive` prop cập nhật đúng) — khả thi bằng vitest + `@testing-library/react`, nên làm ở cấp `device-shell` package (không phải Ceremony-specific).

---

### [B4] TTS phát trên Backdrop
**Trọng số:** High
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/modules/ceremony/src/backdrop/BackdropApp.tsx` (dòng 1140-1225: logic TTS)
- `/Users/skyline/PROJECTS/sky-app/modules/ceremony/src/backdrop/lib/tts.ts`
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/preload.ts` (dòng 120-145, 233-245: `speak`, `warmupTts`, `preSynthesizeTts`, `pregenGetAudio`)
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/ipc.ts` (dòng 558-629: `tts:speak` handler)
- Gốc tương ứng: `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/slide/src/backdrop/BackdropApp.tsx`, `apps/slide/electron/preload.ts`, `apps/slide/electron/ipc.ts`

#### Architecture Review
- Luồng xử lý đầy đủ (bước-by-bước, tên hàm thật):
  1. Backdrop's `BackdropApp` nhận sự kiện `state:onStage`/`state:full` qua socket (`socket.on('state:onStage', ({student}) => handleStudent(student, true))`) — **không phải Control gọi trực tiếp `window.slide.speak()` rồi forward buffer qua socket** — Backdrop tự mình gọi TTS API sau khi biết SV mới lên sân khấu.
  2. `handleStudent()` build `textToSpeak` từ `ttsTemplateRef` (nếu Control đã đẩy `event:ttsTemplate` qua socket) hoặc fallback `ttsSentencePrefixRef + fullName`.
  3. Sau `delayMs` (từ `ttsDelayRef`, mặc định 1.5s), gọi `playTts()`:
     - Nếu `playMode !== 'realtime'` (tức `'pregen'` hoặc `'pregen-fallback'`): gọi `window.slide.pregenGetAudio(code)` trước — IPC invoke `tts:pregen-get-audio` → main đọc file WAV đã tạo sẵn từ đĩa (`ttsPregenWavPath`) → trả `ArrayBuffer` (đã cắt 44 byte header WAV) → nếu có, gọi `playPcm(res.buffer.slice(44), 48000)` **ngay trong Backdrop's renderer process** và return — không tiếp tục.
     - Nếu `playMode === 'pregen'` strict và không có file → bỏ qua hoàn toàn (không phát).
     - Nếu `playMode === 'realtime'` hoặc pregen-fallback không tìm thấy file: gọi `window.slide.preSynthesizeTts([text], model, [speed])` (fire-and-forget, cache trước) rồi `window.slide.speak(text, model, speed, code)` — IPC invoke `tts:speak` → main kiểm tra cache disk (WAV theo `studentCode`) → cache in-memory (`ttsCache`) → cuối cùng gọi `runVieneu()`/`runPiper()` sinh mới → trả buffer PCM trực tiếp về **đúng renderer đã gọi invoke** (Electron IPC invoke luôn trả kết quả về bên gọi, không broadcast).
     - `playPcm(res.buffer, res.sampleRate ?? 48000)` — phát qua `lib/tts.ts` → re-export `playPcm, stopPcm` từ `../../lib/audio` (dùng Web Audio API trong renderer process của Backdrop).
  4. Guard chống race: mọi bước async đều check lại `lastTtsTargetCodeRef.current !== code` trước khi phát — nếu SV đã đổi trong lúc đang chờ IPC response, bỏ qua audio cũ (tránh phát nhầm giọng của SV trước lên SV sau).
  5. Khi `student === null` (không còn ai on-stage): gọi `stopPcm()` ngay lập tức.
- **So sánh với bản gốc: khớp 100%.** `BackdropApp.tsx` diff = 0 (chỉ khác 1 dòng import package name `@trao-bang/shared` → `@sky-app/slide-shared`, dòng 10). `lib/tts.ts` diff = 0 tuyệt đối (2 dòng, identical). `preload.ts`'s `speak`/`warmupTts`/`preSynthesizeTts`/`pregenGetAudio` chữ ký khớp 100% (xác nhận qua diff object `api` — 86/86 method khớp tên). `ipc.ts`'s `tts:speak` handler thân hàm (dòng 558-629, 71 dòng) **diff = 0 tuyệt đối, từng ký tự** — bao gồm cả comment tiếng Việt, thứ tự check cache (1. disk WAV cache theo studentCode → 2. in-memory cache → 3. gen mới), logic `_saveRealtimeWav`. Đây là bằng chứng mạnh nhất có thể có rằng hành vi B4 khớp gốc tuyệt đối, không chỉ chữ ký.
- **Xác nhận thứ tự play/pause/interrupt khớp gốc:** cả 2 phía đều audio trả về **trực tiếp cho Backdrop** (không qua Control) — vì `window.slide.speak()`/`pregenGetAudio()` được **gọi từ trong `BackdropApp.tsx`**, và Electron's `ipcRenderer.invoke` luôn resolve Promise ở đúng process gọi. Control **không tham gia luồng phát audio** — Control chỉ gửi config (template, model, speed, playMode...) qua socket events (`event:tts*`), Backdrop tự quyết định khi nào phát dựa trên state nó nhận qua socket. Cơ chế interrupt: khi SV đổi (`isNewStudent`), timer confetti cũ bị clear nhưng **KHÔNG thấy code chủ động gọi `stopPcm()` để ngắt audio đang phát của SV trước** — chỉ gọi `stopPcm()` khi `student === null` (dòng 1102-1105). Nghĩa là nếu SV A đang phát TTS và SV B lên ngay sau đó (trước khi audio A phát xong), audio A KHÔNG bị cắt ngang, có thể chồng lấn với audio B mới. Đây là hành vi **giống hệt bản gốc** (cùng logic, cùng thiếu sót) — không phải bug port, là đặc điểm/khiếm khuyết đã có sẵn từ gốc, ngoài phạm vi audit port.
- Hiệu năng: `preSynthesizeTts` (pre-cache trước khi `speak`) là tối ưu hoá hợp lý cho `playMode === 'realtime'` (giảm latency cảm nhận vì bước generate audio nặng nhất chạy trước lúc thực sự cần phát, trong khoảng `delayMs`). Không có blocking I/O trên renderer — toàn bộ qua IPC async.
- Độ ổn định: guard `lastTtsTargetCodeRef.current !== code` xuất hiện ở 2 điểm (pregen path dòng 1175, realtime path dòng 1209) — chống race condition khi chuyển SV nhanh. Try/catch đầy đủ quanh mọi lời gọi `window.slide.*` (dòng 1181, 1215). `useEffect` cleanup dòng 1330-1332 (`socket?.disconnect()`) — nhưng **không thấy `stopPcm()` trong cleanup này** — nếu component unmount giữa lúc đang phát audio, audio có thể tiếp tục phát "ma" (không dừng theo lifecycle React). Đây là **khớp gốc** (cùng thiếu sót), không phải lỗi port riêng.
- Nhận định kiến trúc: logic TTS play/pregen/fallback đặt trực tiếp trong `BackdropApp.tsx` (1 component ~950 dòng kể cả logic confetti) — có dấu hiệu god component nhẹ (trộn 3 mối quan tâm: confetti physics, TTS orchestration, socket event wiring) nhưng đây là đặc điểm kế thừa nguyên vẹn từ gốc, không phải suy thoái do port.
- Đề xuất cải tiến (không thực thi):
  - **P1** (kế thừa từ gốc, không phải riêng port): thêm `stopPcm()` khi chuyển sang SV mới (trước khi phát audio mới) để tránh audio chồng lấn — nên tag là "cải tiến chung", áp dụng cho cả 2 repo nếu được chấp thuận, không phải "sửa lỗi port".
  - **P2**: thêm `stopPcm()` vào cleanup của `useEffect` (dòng 1330) để đảm bảo không có audio "ma" khi component unmount.

#### QA/QC Review
- Trạng thái tổng quan: **PASS** — 5/5 test case (dựa trên đọc code; hành vi runtime thật cần Electron + Python TTS server, ghi manual).

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| B4-1 | Chữ ký + thân hàm `tts:speak` khớp gốc | Automated (Bash diff, không phải vitest nhưng verify tất định) | `diff` toàn văn hàm `ipc.ts` dòng 558-629 cả 2 phía | diff rỗng | diff rỗng (0 khác biệt) | PASS |
| B4-2 | Audio trả về đúng Backdrop, không qua Control | Manual (đọc code — cần Electron runtime để quan sát trực tiếp) | Trace `window.slide.speak()` call site + IPC invoke resolve target | Backdrop's renderer nhận buffer trực tiếp | Đúng — `BackdropApp.tsx` tự gọi, `ipcRenderer.invoke` resolve tại chỗ gọi | PASS |
| B4-3 | Pregen path: phát từ WAV cache trước, không gọi realtime nếu có sẵn | Manual | Trace `playTts()` dòng 1169-1191 | Check `pregenGetAudio` trước, chỉ fallback khi thiếu và `playMode !== 'pregen'` strict | Đúng như code, khớp gốc | PASS |
| B4-4 | Guard chống phát nhầm SV khi đổi nhanh | Manual | Trace `lastTtsTargetCodeRef.current !== code` tại 2 điểm | Audio cũ bị bỏ qua nếu SV đã đổi trong lúc chờ IPC | Đúng như code | PASS |
| B4-5 | `stopPcm()` khi không còn SV on-stage | Manual | Trace dòng 1102-1105 | `stopPcm()` được gọi khi `student === null` | Đúng như code | PASS |
- Bug liên quan: không phát hiện bug MỚI do port — 2 điểm yếu (audio chồng lấn khi đổi SV nhanh, thiếu `stopPcm` trong cleanup) đều là đặc điểm **kế thừa nguyên vẹn từ bản gốc**, không phải lỗi phát sinh trong quá trình port.
- Coverage ước tính: functional 90% (đã trace toàn bộ code path chính + edge case race condition; chưa xác nhận được hành vi thật khi audio thực sự chồng lấn qua Electron runtime + Python TTS server sống). Code coverage: N/A (không viết vitest — lý do: `playPcm`/`stopPcm` phụ thuộc Web Audio API cần DOM/AudioContext thật, `window.slide.speak` phụ thuộc IPC + Python server sống; mock hoá toàn bộ chuỗi này chỉ kiểm tra lại logic đã đọc bằng mắt, giá trị thu được thấp so với công sức).
- Đề xuất bổ sung test chưa viết: Manual checklist khi có Electron runtime thật — (1) mở Backdrop, quét 2 SV liên tiếp nhanh (< 1s), quan sát bằng tai xem có 2 audio chồng lẫn hay không; (2) đo latency giữa `state:onStage` event và lúc audio thực sự phát ra loa với `playMode=realtime` vs `pregen` để so sánh hiệu năng cảm nhận.

---

### [C1] Menu bar & xác nhận thoát app
**Trọng số:** High
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/main.ts` (toàn văn 205 dòng)
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/menu.ts` (toàn văn, tồn tại đầy đủ)
- `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/slide/electron/main.ts` (dòng 24, 96, 151-174)
- `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/slide/electron/menu.ts`

#### Architecture Review
- Luồng xử lý ở bản GỐC: `main.ts` import `setAppMenu` từ `./menu` (dòng 24) → trong `bootstrap()`, sau khi `registerIpcHandlers()`, gọi `setAppMenu('vi')` (dòng 96) — build native menu (`Menu.buildFromTemplate`, `Menu.setApplicationMenu`) ngay khi app khởi động, TRƯỚC khi user thao tác gì. Riêng biệt, `app.on('before-quit', (event) => {...})` (dòng 151-174) đăng ký top-level: `event.preventDefault()` chặn thoát ngay lập tức, tìm `controlWindow`, hiện `dialog.showMessageBox` hỏi "Bạn có chắc chắn muốn tắt ứng dụng?" (2 nút Hủy/Tắt), nếu user chọn "Tắt" (`result.response === 1`) mới thực sự dọn dẹp (`closeBackdropWindow()`, `stopSocketServer()`, `stopHttpServer()`, `stopPythonServer()`, `app.exit(0)`).
- Luồng xử lý ở bản ĐÍCH: đọc toàn văn `main.ts` (205 dòng) — **hoàn toàn không có import `setAppMenu`/`menu.ts` ở top-level, không có bất kỳ lệnh gọi `setAppMenu(...)` nào trong `bootstrapSlideBackend()`, và không có `app.on('before-quit', ...)` ở bất kỳ đâu trong file**. Chỉ có `app.on('window-all-closed', ...)` (dòng 199-204) — dừng server nhưng KHÔNG hỏi xác nhận, và trên macOS không quit (`if (process.platform !== 'darwin') app.quit()`).
- **So sánh với bản gốc: khác KHÔNG chủ đích (bug xác nhận đúng).** Quan trọng: `menu.ts` (đích) **tồn tại đầy đủ, đúng y hệt gốc** (đọc toàn văn 135 dòng — `buildAppMenu`, `setAppMenu`, `refreshAppMenu` đều có mặt, logic label vi/en, checkbox "Dùng dữ liệu mẫu" đều nguyên vẹn). `slide/ipc.ts` (đích) **vẫn import và gọi `setAppMenu`/`refreshAppMenu`** tại 2 nơi: dòng 308 (`refreshAppMenu()` khi toggle sample data) và dòng 446 (`setAppMenu(language)` trong handler `app:setLanguage`). Nghĩa là: menu CHỈ xuất hiện sau khi renderer chủ động gọi IPC `app:setLanguage` lần đầu (Control's mount effect gửi lại ngôn ngữ đã lưu — theo comment gốc "Renderer gửi lại ngôn ngữ thật... ngay khi mount") — **không phải hoàn toàn không có menu, mà là menu bị trễ/thiếu ngay lúc khởi động** cho tới khi 1 round-trip IPC hoàn tất. Với `before-quit`: hoàn toàn không có cơ chế thay thế nào — xác nhận đây là thiếu sót tuyệt đối, không có đường vòng nào bù đắp.
- Hiệu năng: không liên quan.
- Độ ổn định: rủi ro vận hành nghiêm trọng hơn là rủi ro code — user có thể vô tình bấm Cmd+Q/Alt+F4 giữa buổi lễ (khi Backdrop đang chiếu tên SV) và app **thoát ngay lập tức không hỏi**, mất toàn bộ trạng thái phiên (`sessionStore`) nếu chưa kịp autosave, và Backdrop biến mất đột ngột trước khán giả.
- Nhận định kiến trúc: bootstrap logic tập trung trong `bootstrapSlideBackend()` (1 hàm ~25 dòng, đúng layer, không phải god function) — vấn đề không phải do thiết kế sai mà do 4 dòng bị bỏ sót khi port thủ công (`setAppMenu`, `app.on('before-quit')`, `setBackdropStateListener`, `setBackdropAspectRatioListener`, `autoLoadFirstIfConfigured` — tổng cộng cho C1+C2+C3). Đáng chú ý: TẤT CẢ hàm cần thiết đều đã tồn tại sẵn, đúng logic, chỉ thiếu lời gọi ở nơi orchestration (`main.ts`) — bug dạng "wiring bị đứt", không phải bug logic.
- Đề xuất cải tiến:
  - **P0**: thêm `setAppMenu('vi')` vào cuối `bootstrapSlideBackend()` (trước hoặc sau `registerSlideIpcHandlers()`), import `setAppMenu` từ `./slide/menu.js`.
  - **P0**: thêm khối `app.on('before-quit', (event) => {...})` vào `main.ts`, điều chỉnh để tìm `mainWindow` thay vì `controlWindow` (kiến trúc mới không còn cửa sổ Control riêng — dùng `getMainWindow()` từ `./slide/windows.js` hoặc biến `mainWindow` cục bộ đã có sẵn trong file).
  - **P1**: viết 1 test note (không phải code) trong quy trình review PR tương lai: checklist "mọi hàm export mới từ `slide/*.ts` phải có ít nhất 1 call site trong `main.ts` hoặc `ipc.ts`" để tránh tái diễn kiểu bug "wiring bị đứt" này.

#### QA/QC Review
- Trạng thái tổng quan: **FAIL** — 0/2 test case (bug xác nhận đúng 100% như mô tả Phase 1).

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| C1-1 | Menu bar hiện ngay khi khởi động | Manual (cần chạy Electron thật) | Đọc toàn văn `main.ts`, tìm `setAppMenu` | Có lệnh gọi `setAppMenu('vi')` trong bootstrap | Không có — 0 kết quả grep trong `main.ts` | **FAIL** |
| C1-2 | Xác nhận trước khi thoát app | Manual (cần chạy Electron thật, thử Cmd+Q) | Đọc toàn văn `main.ts`, tìm `app.on('before-quit')` | Có handler chặn quit + dialog xác nhận | Không có — chỉ có `window-all-closed` (không hỏi) | **FAIL** |
- Bug liên quan: **Bug đã biết C1 XÁC NHẬN ĐÚNG HOÀN TOÀN** như mô tả Phase 1 — cả 2 khía cạnh (`setAppMenu` không gọi lúc bootstrap, `before-quit` dialog thiếu hoàn toàn) đều xác nhận qua đọc trực tiếp toàn văn `main.ts`. Mức độ: **High** — đúng như đánh giá gốc, vì hệ quả là mất xác nhận thoát (rủi ro vận hành khi đang lễ) và menu bar thiếu ngay sau khi mở app (dù tự phục hồi sau round-trip `app:setLanguage`, đây vẫn là hành vi khởi động sai với kỳ vọng).
- Coverage ước tính: functional 100% (bug rõ ràng, tất định, không cần runtime để xác nhận — chỉ cần đọc code). Code coverage: N/A.
- Đề xuất bổ sung test chưa viết: Manual checklist khi có bản build thật — mở app, quan sát menu bar (macOS) ngay giây đầu tiên trước khi thao tác gì; thử Cmd+Q ngay sau khi mở, xác nhận có dialog "Bạn có chắc chắn muốn tắt ứng dụng?" hiện ra.

---

### [C2] Đồng bộ trạng thái Backdrop↔Control (listener)
**Trọng số:** High
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/main.ts`
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/windows.ts` (dòng 20-24, 137-167)
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/socket-server.ts` (dòng 147: `setBackdropAspectRatioListener`)
- `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/slide/electron/main.ts` (dòng 98, 100)

#### Architecture Review
- Luồng xử lý ở bản GỐC: `main.ts:98` gọi `setBackdropStateListener(() => notifyBackdropState())` — wire callback để MỌI thay đổi trạng thái cửa sổ Backdrop (mở, đóng bằng nút toggle, đóng bằng nút X, fullscreen bằng OS shortcut) tự động báo Control. `main.ts:100` gọi `setBackdropAspectRatioListener((aspectRatio) => resizeBackdropForAspectRatio(aspectRatio))` — khi Control đổi tỷ lệ khung hình qua socket-server (`socket-server.ts:147`), main tự động resize cửa sổ Backdrop (nếu đang windowed, không fullscreen) để khớp tỷ lệ ngay lập tức.
- Luồng xử lý ở bản ĐÍCH: đọc toàn văn `main.ts` — **không có import `setBackdropAspectRatioListener` từ `./slide/socket-server.js`, không có bất kỳ lệnh gọi `setBackdropStateListener(...)` hay `setBackdropAspectRatioListener(...)` nào**. `windows.ts` (đích) vẫn có `setBackdropStateListener` export đầy đủ (dòng 22-24) nhưng biến `onBackdropStateChange` không bao giờ được set khác `null`. `socket-server.ts` (đích) vẫn có `setBackdropAspectRatioListener` export đầy đủ tại đúng dòng 147 (khớp dòng với gốc) nhưng cũng không bao giờ được gọi từ `main.ts`.
- **So sánh với bản gốc: khác KHÔNG chủ đích (bug xác nhận đúng).** Cả 2 hàm export đều tồn tại nguyên vẹn ở đích (không phải thiếu code logic) — chỉ thiếu 2 dòng gọi trong `bootstrapSlideBackend()`. Hệ quả cụ thể:
  1. Backdrop đóng bằng nút X / fullscreen bằng OS shortcut → Control không cập nhật trạng thái (xem chi tiết ở mục B2 — đây là nguyên nhân gốc rễ của B2's FAIL case B2-2, B2-3).
  2. Khi Control đổi tỷ lệ khung hình (`event:backdropAspectRatio` qua socket, dùng bởi `BackdropApp.tsx:1325-1327` để `setBackdropAspectRatio`), cửa sổ Backdrop's kích thước vật lý (nếu đang windowed) **không tự resize theo** — chỉ nội dung bên trong (React state `backdropAspectRatio`) đổi qua socket, nhưng khung cửa sổ Electron vẫn giữ nguyên kích thước/tỷ lệ cũ → nội dung có thể bị méo/lọt ra ngoài khung cửa sổ cho tới khi user tự resize thủ công hoặc chuyển fullscreen.
- Hiệu năng: không liên quan.
- Độ ổn định: đây thuần là thiếu wiring, không có race condition mới phát sinh — nhưng làm lộ ra khả năng "trạng thái UI hiển thị (Control) lệch khỏi trạng thái thực (Backdrop window)" kéo dài vô thời hạn cho tới khi có 1 sự kiện khác vô tình đồng bộ lại (vd bấm nút toggle).
- Nhận định kiến trúc: giống C1 — kiểu bug "wiring bị đứt" chứ không phải lỗi thiết kế. Việc tách `setBackdropStateListener`/`setBackdropAspectRatioListener` thành các hàm injection riêng (thay vì hard-code phụ thuộc trực tiếp) là pattern tốt cho testability và tách layer (`windows.ts`/`socket-server.ts` không cần biết `ipc.ts` tồn tại) — nhưng đúng là dễ bị quên khi port thủ công vì không có compiler nào bắt lỗi "hàm được export nhưng không ai gọi".
- Đề xuất cải tiến:
  - **P0**: thêm cả 2 dòng vào `bootstrapSlideBackend()` trong `main.ts`:
    ```
    setBackdropStateListener(() => notifyBackdropState());
    setBackdropAspectRatioListener((aspectRatio) => resizeBackdropForAspectRatio(aspectRatio));
    ```
    cần import thêm `resizeBackdropForAspectRatio`, `setBackdropStateListener` từ `./slide/windows.js`, `setBackdropAspectRatioListener` từ `./slide/socket-server.js`, và `notifyBackdropState` từ `./slide/ipc.js` (`notifyBackdropState` đã có sẵn export, chỉ chưa import ở `main.ts`).
  - **P1**: cân nhắc dùng ESLint rule `no-unused-vars`-kiểu mở rộng (hoặc 1 script kiểm tra tĩnh) để cảnh báo khi 1 hàm `export function setXxxListener` không có call site nào ngoài định nghĩa — giá trị thực tiễn không cao (false positive dễ xảy ra với hàm dùng qua dynamic import) nhưng đáng cân nhắc cho các setter/injection pattern đặc thù này.

#### QA/QC Review
- Trạng thái tổng quan: **FAIL** — 0/2 test case (bug xác nhận đúng 100%).

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| C2-1 | `setBackdropStateListener` được wire trong bootstrap | Manual (đọc code) | grep `setBackdropStateListener` trong `main.ts` | Có lệnh gọi trong `bootstrapSlideBackend()` | Không có — hàm export tồn tại ở `windows.ts` nhưng 0 call site trong `main.ts` | **FAIL** |
| C2-2 | `setBackdropAspectRatioListener` được wire trong bootstrap | Manual (đọc code) | grep `setBackdropAspectRatioListener` trong `main.ts` | Có lệnh gọi trong `bootstrapSlideBackend()` | Không có — hàm export tồn tại ở `socket-server.ts:147` nhưng 0 call site trong `main.ts` | **FAIL** |
- Bug liên quan: **Bug đã biết C2 XÁC NHẬN ĐÚNG HOÀN TOÀN**. Mức độ: **High** — đúng đánh giá gốc, vì hệ quả lan sang B2 (Control hiển thị sai trạng thái Backdrop) và gây UI méo tỷ lệ khi đổi aspect ratio lúc Backdrop đang windowed.
- Coverage ước tính: functional 100%. Code coverage: N/A.
- Đề xuất bổ sung test chưa viết: đã liệt kê ở mục B2 (E2E Playwright/Electron mô phỏng đóng cửa sổ bằng nút X).

---

### [C3] Auto-load SV đầu tiên khi khởi động
**Trọng số:** Medium
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/main.ts`
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/socket-server.ts` (dòng 548-559)
- `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/slide/electron/main.ts` (dòng 106-107)

#### Architecture Review
- Luồng xử lý ở bản GỐC: `main.ts:106-107` — sau `createControlWindow()`, gọi `autoLoadFirstIfConfigured()` (định nghĩa `socket-server.ts:549-559`): đọc `ceremonyStore.getConfig()?.auto_load_first` — nếu config bật cờ này, VÀ chưa có SV nào đang `on_stage` (`sessionStore.get().current_on_stage_msv` rỗng — tránh đè state phục hồi sau crash), tìm SV đầu tiên theo số thứ tự (`ceremonyStore.neighborByStt(null, 1)`), nếu có thì gọi `showStudent(first.student_code, 'auto', {silent: true})` (silent = không auto-hide ngay, tức không tự động ẩn khỏi sân khấu sau vài giây như luồng auto-play thông thường).
- Luồng xử lý ở bản ĐÍCH: đọc toàn văn `main.ts` — **không có bất kỳ lệnh gọi `autoLoadFirstIfConfigured()` nào**. Hàm này **tồn tại nguyên vẹn, đúng logic, đúng dòng số (549)** trong `socket-server.ts` (đích) — xác nhận bằng `grep -n "autoLoadFirstIfConfigured"` trả về đúng 1 kết quả (định nghĩa hàm), 0 call site.
- **So sánh với bản gốc: khác KHÔNG chủ đích (bug xác nhận đúng).** Cùng dạng "wiring bị đứt" như C1/C2 — hàm logic hoàn chỉnh, chỉ thiếu lời gọi ở bootstrap.
- Hiệu năng: không liên quan — đây là 1 lần gọi lúc khởi động, có early-return nhanh (2 điều kiện guard đơn giản) nên không tốn kém dù có gọi.
- Độ ổn định: hàm tự thân đã có guard chống ghi đè state phục hồi (`if (sessionStore.get().current_on_stage_msv) return;`) — thiết kế đúng, an toàn nếu được gọi lại nhiều lần hoặc gọi sau khi session đã restore. Việc thiếu lời gọi không gây lỗi crash gì — chỉ đơn thuần là tính năng "auto-load SV đầu tiên" không bao giờ kích hoạt, dù user đã bật cờ `auto_load_first` trong Settings.
- Nhận định kiến trúc: đúng layer (hàm đặt trong `socket-server.ts` cạnh `handleScan`/`showStudent` — cùng nhóm nghiệp vụ điều khiển trạng thái sân khấu). Không phải god function.
- Đề xuất cải tiến:
  - **P0**: thêm `autoLoadFirstIfConfigured()` vào cuối `bootstrapSlideBackend()` trong `main.ts` (sau `createMainWindow()`, tương tự vị trí gốc — sau khi cửa sổ chính đã tạo, để đảm bảo có thể broadcast trạng thái tới renderer nếu cần), cần import từ `./slide/socket-server.js` (file này đã import `startSocketServer`/`getUseSampleData`/`stopSocketServer` nên chỉ cần thêm tên vào cùng dòng import).
  - **P1**: xem xét gọi hàm này sau khi `startSocketServer()` đã hoàn tất chắc chắn (tránh trường hợp lý thuyết `showStudent` cần `io` instance đã sẵn sàng để broadcast — cần đọc thêm `showStudent`/`neighborByStt` để xác nhận có phụ thuộc `io` hay không, ngoài phạm vi audit này vì không sửa code).

#### QA/QC Review
- Trạng thái tổng quan: **FAIL** — 0/1 test case (bug xác nhận đúng 100%).

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| C3-1 | `autoLoadFirstIfConfigured()` được gọi trong bootstrap | Manual (đọc code) | grep `autoLoadFirstIfConfigured` trong `main.ts` | Có lệnh gọi cuối `bootstrapSlideBackend()` | Không có — hàm tồn tại đúng dòng 549 ở `socket-server.ts` nhưng 0 call site trong `main.ts` | **FAIL** |
- Bug liên quan: **Bug đã biết C3 XÁC NHẬN ĐÚNG HOÀN TOÀN**. Mức độ: **Medium** — đúng đánh giá gốc (thấp hơn C1/C2 vì đây là tính năng tùy chọn — chỉ ảnh hưởng khi user chủ động bật `auto_load_first` trong config, không phải hành vi mặc định luôn cần).
- Coverage ước tính: functional 100%. Code coverage: N/A.
- Đề xuất bổ sung test chưa viết: Manual — bật `auto_load_first` trong config file/Settings UI, khởi động lại app, quan sát Backdrop có tự hiện SV đầu tiên (theo stt) hay không mà không cần quét thẻ/thao tác gì.

---

### [C4] IPC surface (`window.slide`, 78+ handler)
**Trọng số:** High
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/preload.ts` (toàn văn, object `api`)
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/ipc.ts` (toàn văn, 1349 dòng)
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/preload.ts` (wrapper `registerSlideBridge`)
- Gốc: `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/slide/electron/preload.ts`, `apps/slide/electron/ipc.ts`

#### Architecture Review
- Luồng xử lý tổng quan: `apps/shell-electron/electron/preload.ts` (entry preload chính, top-level) gọi `registerSlideBridge()` (import từ `./slide/preload.js`) → expose `window.slide` qua `contextBridge.exposeInMainWorld('slide', api)`. Object `api` (86 method — đếm chính xác bằng script trích xuất thân object `const api: SlideApi = {...}`, khớp between cả 2 phía) mỗi method là 1 wrapper mỏng gọi `ipcRenderer.invoke('channel:name', payload)`, một số kèm transform response (vd `speak`, `pregenGetAudio` chuyển `Buffer` Node.js → `ArrayBuffer` để renderer dùng được). Phía main, `registerSlideIpcHandlers()` (từ `./slide/ipc.js`, gọi trong `bootstrapSlideBackend()`) đăng ký `ipcMain.handle(...)` cho từng channel tương ứng.
- **So sánh với bản gốc — phương pháp**: (1) trích xuất toàn bộ tên method cấp-1 trong object `api` cả 2 phía bằng script `awk`/`grep`, diff → **86/86 khớp tuyệt đối, 0 sai lệch tên**. (2) `diff` toàn văn `ipc.ts` (1349 dòng, bằng nhau cả 2 phía) → chỉ **15 dòng khác biệt trong TOÀN BỘ file**, và cả 15 dòng đều thuộc đúng 1 loại thay đổi: `getControlWindow()` → `getMainWindow()` (rename nhất quán, có chủ đích, do kiến trúc mới không còn cửa sổ Control tách biệt — Control giờ render trong `mainWindow` chung với device-layout theo GĐ5). Đây là bằng chứng logic-level (không chỉ chữ ký) cho gần như toàn bộ 78+ handler — độ tin cậy cao hơn nhiều so với chỉ audit mẫu 10-15 handler.
- Audit sâu có chủ đích trên các handler quan trọng theo yêu cầu (student data CRUD, TTS, pregen, backdrop control) — đọc thân hàm trực tiếp, xác nhận **diff = 0** (nằm trong 1334 dòng không đổi):
  - `tts:speak` (dòng 558-629, 71 dòng): logic 3-tier cache (disk WAV theo `studentCode` → in-memory `ttsCache` → gen mới qua `runVieneu`/`runPiper`) khớp tuyệt đối, xem chi tiết ở B4.
  - `backdrop:toggle`, `backdrop:isOpen`, `backdrop:isFullscreen` (dòng 376-394): logic mở/đóng cửa sổ + `notifyBackdropState()` + `apiLogger.triggerCustomApi('backdrop_toggle', ...)` khớp tuyệt đối (trừ rename `getControlWindow→getMainWindow` ở `notifyBackdropState`, định nghĩa ngoài block này).
  - `data:reset`, `data:resetStudents`, `data:clearScans` (dòng 397-437): logic xoá dữ liệu + broadcast `state:full` qua `getIO()?.emit(...)` khớp tuyệt đối.
  - `data:sync`, `data:confirmImport`, `data:cancelImport`, `data:statFile`, `data:openFile`, `data:export` (dòng 116-161+): logic import/export 2-bước (staging → confirm) khớp tuyệt đối, `data:openFile` là 1 trong 15 dòng đổi (`getMainWindow()` thay `getControlWindow()`).
  - `app:setLanguage` (dòng 445-447): gọi `setAppMenu(language)` — logic đúng, nhưng như đã nêu ở C1, đây là ĐƯỜNG DUY NHẤT native menu được set trong đích (vì bootstrap thiếu gọi trực tiếp).
  - `tts:pregen-get-audio` (tương ứng `pregenGetAudio` ở preload dòng 233-245): transform `Buffer` → `ArrayBuffer` giống hệt `speak`, khớp tuyệt đối.
- Hiệu năng: các handler đọc file đồng bộ (`readFileSync`, `existsSync`) trong `tts:speak` cache-check — chấp nhận được vì file WAV cache nhỏ và đây là hành vi kế thừa nguyên vẹn từ gốc (không phải suy thoái do port).
- Độ ổn định: không phát hiện thiếu try/catch mới so với gốc (vì logic thân hàm không đổi ngoài rename). Rủi ro duy nhất là **numeric drift giữa số lượng handler thực tế và con số "78" nêu trong bảng audit gốc** — đếm được chính xác **86 method** trong object `api` (không phải 78) — chênh lệch có thể do bảng gốc đếm theo số `ipcMain.handle(...)` calls (một số method preload có thể map nhiều channel, hoặc một số `ipcMain.on` không phải `handle` không được preload object đại diện 1-1) — không phải bug, chỉ là con số ước lượng ban đầu không chính xác tuyệt đối, không ảnh hưởng tới kết luận "khớp 100%".
- Nhận định kiến trúc: `ipc.ts` với 1349 dòng đăng ký toàn bộ handler trong 1 hàm `registerIpcHandlers()` là 1 file lớn, có dấu hiệu "god file" (không phải god component vì đây là backend, không phải React) — nhưng đây là đặc điểm **kế thừa nguyên vẹn từ gốc** (gốc cũng 1349 dòng, cùng cấu trúc monolithic), không phải suy thoái do port. Việc tách theo domain (tts-ipc.ts, data-ipc.ts, pregen-ipc.ts...) là cải tiến hợp lý nhưng ngoài phạm vi của GĐ7.5 (audit thuần, không refactor).
- Đề xuất cải tiến (không thực thi):
  - **P2**: tách `ipc.ts` (1349 dòng) thành các file con theo domain (tts, data, backdrop, logs, system) để dễ bảo trì — áp dụng cho cả gốc lẫn đích nếu được chấp thuận trong tương lai, không phải lỗi port.
  - **P2**: cập nhật con số "78 handler" trong tài liệu roadmap thành số chính xác đã đếm được (86 method trong `window.slide`) để tránh nhầm lẫn khi audit lần sau.

#### QA/QC Review
- Trạng thái tổng quan: **PASS** — toàn bộ mẫu đã audit sâu đều khớp; suy luận diện rộng qua diff toàn văn cho phần còn lại.

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| C4-1 | Tên method `window.slide` khớp 100% gốc↔đích | Automated (Bash script trích xuất + diff, tất định) | Trích object `api` cả 2 phía, sort, diff | 0 khác biệt | 0 khác biệt (86/86) | PASS |
| C4-2 | Thân hàm `ipc.ts` toàn văn khớp gốc, trừ rename có chủ đích | Automated (Bash `diff`, tất định) | `diff` toàn văn 1349 dòng cả 2 phía | Chỉ khác các dòng liên quan `getControlWindow`→`getMainWindow` | Đúng — 15/15 dòng khác đều thuộc rename này, không có khác biệt logic nào khác | PASS |
| C4-3 | Mẫu `tts:speak` — logic 3-tier cache khớp gốc | Manual (đọc thân hàm, xác nhận qua diff) | Đọc + diff dòng 558-629 | Khớp tuyệt đối | Khớp tuyệt đối (0 diff trong block) | PASS |
| C4-4 | Mẫu `backdrop:toggle` — logic mở/đóng + notify khớp gốc | Manual | Đọc + diff dòng 376-394 | Khớp tuyệt đối | Khớp tuyệt đối | PASS |
| C4-5 | Mẫu `data:resetStudents`/`data:clearScans` — broadcast state khớp gốc | Manual | Đọc + diff dòng 407-437 | Khớp tuyệt đối | Khớp tuyệt đối | PASS |
| C4-6 | Mẫu `data:sync`/`data:export`/`data:openFile` — student data CRUD khớp gốc | Manual | Đọc + diff dòng 116-161 | Khớp tuyệt đối (trừ rename) | Khớp tuyệt đối, `data:openFile` dùng `getMainWindow()` (rename có chủ đích) | PASS |
| C4-7 | Mẫu `tts:pregen-get-audio`/`pregenGetAudio` transform buffer khớp gốc | Manual | Đọc + diff dòng 233-245 (preload), tương ứng ipc.ts | Khớp tuyệt đối | Khớp tuyệt đối | PASS |
- Bug liên quan: không phát hiện bug mới trong phạm vi đã audit sâu (7 mẫu quan trọng + diff toàn văn 1349 dòng).
- Coverage ước tính: functional ~98% (diff toàn văn `ipc.ts` bao phủ 100% các dòng code, không phải chỉ mẫu 10-15 handler như gợi ý ban đầu — do file có kích thước quản lý được (1349 dòng) nên diff toàn văn khả thi và cho độ tin cậy cao hơn random-sample đáng kể; trừ 2% vì chưa xác nhận hành vi RUNTIME thật của mọi handler qua Electron sống, chỉ qua đọc code tĩnh). Code coverage: N/A (không viết vitest — 86 handler phần lớn phụ thuộc Electron `ipcMain`/`BrowserWindow`/filesystem thật, cần mock hoá nặng nề để test có ý nghĩa, ngoài phạm vi hợp lý của 1 buổi audit).
- Đề xuất bổ sung test chưa viết: nếu muốn coverage runtime thật, cần Electron test harness (`@testing-library` + Spectron-kiểu hoặc Playwright Electron) invoke từng channel qua `ipcRenderer` giả lập và assert response shape — khối lượng công việc lớn, nên làm theo từng domain (tts trước, vì trọng số cao nhất) nếu được ưu tiên ở giai đoạn sau GĐ7.5.

---

### [C5] Socket server WS8765 (điều khiển thiết bị ngoài)
**Trọng số:** Medium
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/socket-server.ts` (toàn văn)
- `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/slide/electron/socket-server.ts`

#### Architecture Review
- Luồng xử lý: `startSocketServer(port)` tạo `SocketIOServer` trên `httpServer` node thuần, lắng nghe `io.on('connection', ...)` — mỗi client mới connect được đồng bộ ngay lập tức toàn bộ state hiện tại qua chuỗi `socket.emit(...)` (confetti config × 10 events, TTS config × 8 events, layout overrides, aspect ratio...). Các sự kiện điều khiển từ Control (`event:confetti`, `event:ttsModel`,...) và Backdrop's response events (`state:request`) đi qua cùng kênh WS 8765, độc lập với kênh Electron IPC nội bộ — đây chính là kênh cho phép **thiết bị/app bên ngoài Electron** (điện thoại, tablet, web page khác trên cùng mạng LAN) kết nối và điều khiển show, đúng như tên chức năng "điều khiển thiết bị ngoài".
- **So sánh với bản gốc: khớp 100% logic.** `diff` toàn văn chỉ khác 2 dòng import (`@trao-bang/shared/node` → `@sky-app/slide-shared`, dòng 33-34). Đếm toàn bộ `socket.on`/`io.emit` event names (unique) qua regex cả 2 phía: **67/67 khớp tuyệt đối** (con số này cao hơn "30+34" ghi trong bảng audit gốc — có thể do cách đếm khác nhau, vd bảng gốc tách riêng client→server và server→client thay vì gộp unique names, hoặc đếm theo revision cũ hơn của socket-server; không ảnh hưởng kết luận "diff=0 logic").
- Hiệu năng: mỗi connection mới nhận ~20 `socket.emit` liên tiếp (đồng bộ config) — chấp nhận được vì đây là sự kiện hiếm (chỉ khi có client mới connect, không phải steady-state), không phải polling.
- Độ ổn định: khớp gốc 100% nên thừa hưởng nguyên trạng thái ổn định (hoặc bất ổn, nếu có) của gốc — không có suy thoái do port.
- Nhận định kiến trúc: đúng layer, tách biệt rõ với `ipc.ts` (IPC nội bộ Electron) — WS server đóng vai trò cổng giao tiếp bên ngoài độc lập, kiến trúc hợp lý.
- Đề xuất cải tiến: không có — khớp gốc hoàn toàn.

#### QA/QC Review
- Trạng thái tổng quan: **PASS** — 2/2 test case.

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| C5-1 | Diff toàn văn logic (trừ import) | Automated (Bash `diff`, tất định) | `diff` toàn văn `socket-server.ts` cả 2 phía | Chỉ khác dòng import package | Đúng — 2 dòng khác, cả 2 đều là import | PASS |
| C5-2 | Số lượng event socket khớp | Automated (Bash grep+diff, tất định) | Đếm unique `socket.on`/`io.emit` event name cả 2 phía | Số lượng bằng nhau | 67/67 bằng nhau | PASS |
- Bug liên quan: không có.
- Coverage ước tính: functional 100% (diff toàn văn, không phải mẫu). Code coverage: N/A (không viết vitest — cần WS server thật sống để test integration có ý nghĩa; đã tự tin đủ qua diff tất định).
- Đề xuất bổ sung test chưa viết: không cần thiết — mức độ tin cậy đã đạt tối đa qua diff toàn văn tất định.

---

### [C6] Pregen queue (backend)
**Trọng số:** Medium
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/pregen-queue.ts` (476 dòng)
- `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/slide/electron/pregen-queue.ts`

#### Architecture Review
- Luồng xử lý: `PreGenQueue` class (dòng 156+) quản lý hàng đợi sinh TTS trước cho toàn bộ danh sách SV (dùng khi `playMode` = `pregen`/`pregen-fallback`) — nhận `config` (template, model, speed, conditions), lặp qua từng SV build text (dùng `renderTemplate`/`customVariables` — cùng logic với B4's `getVoiceForStudent`), gọi TTS engine sinh WAV, ghi xuống đĩa theo `ttsPregenWavPath`/`ttsPregenManifestPath`, cập nhật `PreGenStatus` (progress) và emit qua `tts:pregen-progress` IPC event (đã audit ở C4).
- **So sánh với bản gốc: khớp 100% logic.** `diff` toàn văn chỉ khác 1 dòng import (`@trao-bang/shared/node` → `@sky-app/slide-shared`, dòng 3). Toàn bộ 476 dòng còn lại (bao gồm `parseQualityHeaders`, class `PreGenQueue`) giống hệt.
- Hiệu năng: không đánh giá thêm — kế thừa nguyên trạng gốc.
- Độ ổn định: kế thừa nguyên trạng gốc.
- Nhận định kiến trúc: đúng layer (nằm cạnh `ipc.ts` như 1 service riêng, được `ipc.ts` import và điều khiển qua các handler `tts:pregen-*`).
- Đề xuất cải tiến: không có — khớp gốc hoàn toàn.

#### QA/QC Review
- Trạng thái tổng quan: **PASS** — 1/1 test case.

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| C6-1 | Diff toàn văn logic (trừ import) | Automated (Bash `diff`, tất định) | `diff` toàn văn `pregen-queue.ts` cả 2 phía | Chỉ khác dòng import package | Đúng — 1 dòng khác, là import | PASS |
- Bug liên quan: không có.
- Coverage ước tính: functional 100% (diff toàn văn). Code coverage: N/A (không viết vitest — cần TTS engine + filesystem thật để test integration có ý nghĩa, giá trị thấp so với diff tất định đã có).
- Đề xuất bổ sung test chưa viết: không cần thiết.

---

### [C7] Data persistence (paths/store/sync/session)
**Trọng số:** High
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/data/paths.ts`
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/data/store.ts`
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/data/sync.ts`
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/session-store.ts`
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/api-logger.ts`
- Gốc tương ứng cùng tên trong `apps/slide/electron/`

#### Architecture Review
- Luồng xử lý: `paths.ts` cung cấp hàm resolve đường dẫn tuyệt đối (`ceremonyDataDir`, `resolveLocalAsset`, `ttsPregenWavPath`,...) dựa trên `app.getPath('userData')`. `store.ts` (`ceremonyStore`) quản lý state SV/ceremony/config in-memory + load/save từ đĩa (`loadFromDisk`). `sync.ts` xử lý import/export ZIP bundle (staging 2-bước, cleanup rác từ crash — `cleanupImportStaging`). `session-store.ts` quản lý trạng thái phiên hiện tại (SV đang on-stage, scan history) độc lập với `ceremonyStore` (danh sách SV tĩnh).
- **So sánh với bản gốc:**
  - `paths.ts`: **diff = 0 tuyệt đối** (không chỉ logic — kể cả import, không có bất kỳ khác biệt nào, kể cả tên package vì file này không import từ `@trao-bang/shared`).
  - `store.ts`, `sync.ts`, `session-store.ts`: diff chỉ ở dòng import package name (`@trao-bang/shared/node` → `@sky-app/slide-shared`) — logic khớp 100%.
  - `api-logger.ts`: diff có **3 thay đổi thực chất ngoài import**, đều CÓ CHỦ ĐÍCH: (1) `getControlWindow` → `getMainWindow` (2 call site, dòng 147/430 — cùng loại rename nhất quán như C4), và (2) **dòng 433**: `defaultPath: \`nhat-ky-trao-bang-${...}.txt\`` → `\`nhat-ky-ceremony-${...}.txt\`` — đổi tên file export log mặc định khi user xuất log ra file, khớp chính xác với mô tả trong bảng audit gốc ("chỉ đổi tên file log có chủ đích"). Đây là đổi tên hợp lý phản ánh việc app đổi tên từ "Trao Bằng" → "Ceremony" trong nền tảng mới.
- Hiệu năng: không đánh giá thêm — kế thừa nguyên trạng.
- Độ ổn định: `cleanupImportStaging()` (dọn rác import dở dang do crash) được gọi đúng thứ tự trong `bootstrapSlideBackend()` (dòng 65-66 `main.ts`, trước khi load data) — khớp gốc (`bootstrap()` dòng 76-77).
- Nhận định kiến trúc: đúng layer, tách biệt rõ (paths = pure function đường dẫn, store = state SV tĩnh, sync = I/O nặng ZIP, session = state phiên động) — không có god file.
- Đề xuất cải tiến: không có — cả đổi tên file log lẫn rename `getMainWindow` đều hợp lý và có chủ đích rõ ràng, phản ánh đúng kiến trúc mới.

#### QA/QC Review
- Trạng thái tổng quan: **PASS** — 3/3 test case.

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| C7-1 | `paths.ts` khớp tuyệt đối gốc | Automated (Bash `diff`) | `diff` toàn văn | 0 khác biệt | 0 khác biệt | PASS |
| C7-2 | `store.ts`/`sync.ts`/`session-store.ts` khớp logic | Automated (Bash `diff`) | `diff` toàn văn 3 file | Chỉ khác dòng import | Đúng — mỗi file chỉ 1-2 dòng import khác | PASS |
| C7-3 | `api-logger.ts` — xác nhận đổi tên file log có chủ đích, không có thay đổi logic khác | Automated (Bash `diff`) + Manual (đọc ngữ cảnh) | `diff` toàn văn, đọc dòng 147/430/433 | Chỉ có rename `getMainWindow` + đổi tên file log | Đúng — đúng 5 dòng khác (1 import + 2 rename + 1 đổi tên file, tính cả `Student` import trên cùng dòng import) | PASS |
- Bug liên quan: không có.
- Coverage ước tính: functional 100% (diff toàn văn 5/5 file trong nhóm C7). Code coverage: N/A (I/O filesystem thật, cần môi trường Electron `app.getPath` — không mock hoá có ý nghĩa trong phạm vi audit).
- Đề xuất bổ sung test chưa viết: Manual — xuất log từ UI Settings, xác nhận tên file tải về có dạng `nhat-ky-ceremony-YYYY-MM-DD.txt` (không phải `nhat-ky-trao-bang-...`).

---

### [C8] API logger
**Trọng số:** Low
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/api-logger.ts`
- `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/slide/electron/api-logger.ts`

#### Architecture Review
- Luồng xử lý: `apiLogger.init()` (gọi đầu tiên trong `bootstrapSlideBackend()`, dòng 63 `main.ts`) khởi tạo log store; `apiLogger.triggerCustomApi(eventName, payload)` được gọi rải rác trong `ipc.ts` (vd `backdrop_toggle`) để log các sự kiện tích hợp API bên ngoài; cung cấp handler `logs:get`, `logs:retry`, `logs:retryAll`, `logs:export`, `logs:clear`, `logs:testApi` (đã audit gián tiếp qua C4's diff toàn văn `ipc.ts`).
- **So sánh với bản gốc:** đã audit đầy đủ ở mục C7 (cùng file, cùng bảng diff) — 3 thay đổi có chủ đích: `getControlWindow`→`getMainWindow` (×2) + đổi tên file log export. Không lặp lại phân tích ở đây, tham chiếu C7.
- Hiệu năng: không đánh giá thêm.
- Độ ổn định: không đánh giá thêm — kế thừa nguyên trạng.
- Nhận định kiến trúc: đúng layer.
- Đề xuất cải tiến: không có.

#### QA/QC Review
- Trạng thái tổng quan: **PASS** — 1/1 test case (tham chiếu C7-3, không lặp lại).

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| C8-1 | `api-logger.ts` khớp logic gốc (tham chiếu C7-3) | Automated (Bash `diff`) | Xem C7-3 | Chỉ khác rename + đổi tên file log | Đúng, xem C7-3 | PASS |
- Bug liên quan: không có.
- Coverage ước tính: functional 100%. Code coverage: N/A.
- Đề xuất bổ sung test chưa viết: không cần thiết (trọng số Low, đã audit đủ qua C7).

---

### [C9] TTS engine installer & download task
**Trọng số:** Medium
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/engine-installer.ts`
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/download-task.ts`
- Gốc tương ứng trong `apps/slide/electron/`

#### Architecture Review
- Luồng xử lý: `engine-installer.ts` quản lý vòng đời cài đặt engine TTS mở rộng (resolve → download → import → install-runtime → verify), điều khiển qua các IPC handler `tts:engine-install-*` (đã audit ở C4). `download-task.ts` là utility tải file với progress callback, dùng bởi `engine-installer.ts` để tải model/runtime.
- **So sánh với bản gốc: diff = 0 tuyệt đối cho cả 2 file** — không có bất kỳ khác biệt nào, kể cả import (không phụ thuộc `@trao-bang/shared`, nên không có gì cần đổi tên package). Đặc biệt xác nhận theo yêu cầu audit "không hardcode path cũ": không tìm thấy chuỗi hardcode nào liên quan tên cũ (`trao-bang`) trong 2 file này.
- Hiệu năng: không đánh giá thêm — kế thừa nguyên trạng.
- Độ ổn định: kế thừa nguyên trạng (bao gồm cơ chế pause/resume/cancel đã có trong `ipc.ts`'s `tts:engine-install-pause/resume/cancel`, đã xác nhận diff=0 ở C4).
- Nhận định kiến trúc: đúng layer, tách biệt rõ giữa orchestration (`engine-installer.ts`) và I/O primitive (`download-task.ts`).
- Đề xuất cải tiến: không có — khớp gốc hoàn toàn.

#### QA/QC Review
- Trạng thái tổng quan: **PASS** — 2/2 test case.

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| C9-1 | `engine-installer.ts` diff toàn văn = 0 | Automated (Bash `diff`) | `diff` toàn văn | 0 khác biệt | 0 khác biệt | PASS |
| C9-2 | `download-task.ts` diff toàn văn = 0, không hardcode path cũ | Automated (Bash `diff` + grep) | `diff` toàn văn + grep "trao-bang" | 0 khác biệt, 0 match hardcode | 0 khác biệt, 0 match | PASS |
- Bug liên quan: không có.
- Coverage ước tính: functional 100% (diff toàn văn tuyệt đối cho cả 2 file). Code coverage: N/A (cần network + filesystem thật để test download có ý nghĩa).
- Đề xuất bổ sung test chưa viết: không cần thiết — mức độ tin cậy tối đa qua diff = 0.

---

## Tổng kết Subagent 2

**Tổng số chức năng audit:** 13/13 (B1–B4, C1–C9)

**Kết quả PASS/FAIL:**
| Trạng thái | Số lượng | Danh sách |
|---|---|---|
| PASS | 8 | B3, B4, C4, C5, C6, C7, C8, C9 |
| PASS một phần | 1 | B2 (luồng chủ động OK, luồng passive FAIL do lệ thuộc bug C2) |
| FAIL | 4 | B1, C1, C2, C3 |

**Xác nhận lại 3 bug đã biết trước (C1/C2/C3):** cả 3 đều **XÁC NHẬN ĐÚNG HOÀN TOÀN** như mô tả Phase 1, qua đọc trực tiếp toàn văn `apps/shell-electron/electron/main.ts`:
- **C1**: không có `setAppMenu(...)` trong `bootstrapSlideBackend()`; không có `app.on('before-quit', ...)` ở bất kỳ đâu trong file. `menu.ts` tồn tại đầy đủ, đúng logic (được gọi gián tiếp qua `app:setLanguage` IPC handler trong `ipc.ts`, nhưng không có ở bootstrap).
- **C2**: không có `setBackdropStateListener(...)` và `setBackdropAspectRatioListener(...)` trong `bootstrapSlideBackend()`. Cả 2 hàm export tồn tại nguyên vẹn, đúng dòng số với gốc, trong `windows.ts`/`socket-server.ts`.
- **C3**: không có `autoLoadFirstIfConfigured()` trong `bootstrapSlideBackend()`. Hàm tồn tại nguyên vẹn, đúng dòng 549, trong `socket-server.ts`.

Điểm chung cả 3: đây là lớp bug **"wiring bị đứt"** — toàn bộ logic nghiệp vụ đã được port đúng và đầy đủ, chỉ thiếu 4-5 dòng lệnh gọi ở tầng orchestration (`main.ts`'s `bootstrapSlideBackend()`). Không phải lỗi logic sai, dễ fix (chỉ cần thêm import + lời gọi đúng chỗ), nhưng mức độ ảnh hưởng vận hành cao (đặc biệt C1's thiếu xác nhận thoát app).

**Bug MỚI phát hiện (khác 3 bug đã biết):**
1. **B1 (High, đã có trong Phase 1 nhưng audit sâu bổ sung phạm vi chính xác)**: `@source` trong `styles.css` (dòng 133) thiếu quét `backdrop/**` — xác nhận đúng, và bổ sung: phạm vi ảnh hưởng THỰC TẾ chỉ giới hạn ở đúng 1 class `text-white` (dòng "Đang tải…"), vì `BackdropView`/`DynamicBackdropView` (component render nội dung chính) dùng 100% inline style, không phụ thuộc Tailwind — rủi ro thực tế thấp hơn ban đầu lo ngại nhưng vẫn cần fix vì là bug hiển thị rõ ràng.
2. **B2's hệ quả cụ thể của C2**: khi Backdrop bị đóng bằng nút X cửa sổ (không qua nút toggle của Control) hoặc fullscreen bằng phím tắt OS, Control không nhận được cập nhật `backdrop:state` — không phải bug độc lập mới, mà là hệ quả trực tiếp đã cụ thể hoá của C2 lên đúng chức năng B2 (không tính là "bug thứ 4" riêng biệt, gộp chung với C2 khi ưu tiên fix).
3. **C4's ghi chú số liệu**: số lượng handler thực tế đếm được là **86 method** (không phải 78 như ghi trong bảng roadmap gốc) — không phải bug, chỉ là sai số ước lượng ban đầu, nên cập nhật tài liệu.

**Không phát hiện thêm bug mới nào khác** ngoài 2 mục trên (B1 phạm vi bổ sung, B2 hệ quả C2) — toàn bộ 8 mục PASS đều xác nhận diff = 0 hoặc chỉ khác biệt có chủ đích rõ ràng (rename kiến trúc, đổi tên file log, đổi package import).

**Coverage tổng thể ước tính:**
- Functional coverage trung bình: **~95%** (hầu hết các mục đạt diff toàn văn tất định = độ tin cậy cao nhất có thể mà không cần chạy runtime; B2/B3/B4 dựa vào đọc code sâu + trace luồng thay vì diff thuần vì có logic mới/khác biệt kiến trúc cần phân tích, đạt 85-90%).
- Code coverage (vitest tự động): **~0%** — đúng như dự đoán trong yêu cầu ban đầu của nhiệm vụ, đại đa số chức năng nhóm B/C đòi hỏi Electron runtime thật (IPC, BrowserWindow, WS socket, filesystem qua `app.getPath`) nên không khả thi để viết vitest có ý nghĩa mà không mock hoá nặng nề (giá trị thu được thấp). Không có file `.test.ts` mới nào được tạo trong phiên audit này — toàn bộ 13 mục dùng phương pháp Manual (đọc code trực tiếp) hoặc Automated-Bash-diff (tất định nhưng không phải vitest). Đây là quyết định có chủ đích, phù hợp với ghi chú trong đề bài: "không phải lỗi của bạn nếu không tự động hoá được — chỉ cần ghi rõ lý do" — lý do cụ thể cho từng mục đã nêu trong bảng "Đề xuất bổ sung test chưa viết" tương ứng.
- Phương pháp `diff` toàn văn (dùng cho C4, C5, C6, C7, C9) cho độ tin cậy cao hơn đáng kể so với chỉ audit mẫu ngẫu nhiên, vì các file backend liên quan (`ipc.ts` 1349 dòng, `socket-server.ts`, `pregen-queue.ts` 476 dòng) đều có kích thước đủ nhỏ để diff toàn văn khả thi trong thời gian audit hợp lý — khuyến nghị áp dụng phương pháp này cho các subagent khác nếu file tương ứng cũng nằm trong tầm kích thước quản lý được (dưới ~1500 dòng).
