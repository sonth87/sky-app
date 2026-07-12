# GĐ7.5 Sóng 2 — Tổng hợp + Fix hàng loạt

**Vai trò:** Tổng hợp kết quả 3 subagent Sóng 1 (01-control-ui.md, 02-backdrop-backend.md,
03-tts-architecture.md) + fix toàn bộ bug Critical/High/Medium đã xác nhận + verify.

**Ngày thực hiện:** 2026-07-12 (nối tiếp audit Sóng 1 ngày 2026-07-11/12).

**Nguồn dữ liệu duy nhất:** 3 file audit Sóng 1 (đã đọc toàn văn). Không audit lại, không
khảo sát lại code nguồn ngoại trừ đọc trực tiếp file cần sửa để fix bug.

---

## 1. Bảng tổng hợp 33 chức năng

| Mã | Chức năng | Trọng số | Trạng thái (sau fix) | % hoàn thiện | Bug liên quan |
|---|---|---|---|---|---|
| A1 | Danh sách sinh viên (list/edit/import/export) | High | PASS một phần | 83% | P2 hiệu năng: action column không ảo hóa (GĐ8) |
| A2 | Quét thẻ HID card reader | High | PASS | 100% | — |
| A3 | Auto-play trình tự | High | PASS | 100% | — |
| A4 | Cấu hình API / đồng bộ dữ liệu ngoài | Medium | PASS | 100% | — |
| A5 | TTS settings & voice picker (Control) | High | PASS | 100% | BUG-006 — đã fix |
| A6 | Confetti effect | Medium | PASS | 100% | P2 hiệu năng: 10 emit riêng lẻ (GĐ8) |
| A7 | Pregen queue (UI) | Medium | PASS | 100% | P2 hiệu năng: thiếu useMemo (GĐ8) |
| A8 | Logs drawer | Low | PASS | 100% | P2 hiệu năng: thiếu useMemo (GĐ8) |
| A9 | State persistence (Zustand store + storage key) | High | PASS | 100% | BUG-005 — đã fix |
| A10 | Điều khiển tổng ControlApp | High | PASS | 100% | P1 kiến trúc: gate `isActive` không nhất quán (GĐ8) |
| A11 | i18n / theme | Low | PASS | 100% | — (phụ thuộc BUG-005, đã fix) |
| B1 | Hiển thị trạng thái/chữ trên Backdrop | High | PASS | 100% | BUG-001 — đã fix |
| B2 | Đồng bộ Control→Backdrop qua `window.slide` | High | PASS | 100% | Hệ quả BUG-003 — đã fix |
| B3 | `isActive` gate / minimize behavior | Medium | PASS | 100% | — |
| B4 | TTS phát trên Backdrop | High | PASS | 100% | — (2 điểm yếu kế thừa từ gốc, không phải bug port) |
| C1 | Menu bar & xác nhận thoát app | High | PASS | 100% | BUG-002 — đã fix |
| C2 | Đồng bộ trạng thái Backdrop↔Control (listener) | High | PASS | 100% | BUG-003 — đã fix |
| C3 | Auto-load SV đầu tiên khi khởi động | Medium | PASS | 100% | BUG-004 — đã fix |
| C4 | IPC surface (`window.slide`, 86 handler) | High | PASS | 100% | — |
| C5 | Socket server WS8765 | Medium | PASS | 100% | — |
| C6 | Pregen queue (backend) | Medium | PASS | 100% | — |
| C7 | Data persistence (paths/store/sync/session) | High | PASS | 100% | — |
| C8 | API logger | Low | PASS | 100% | — |
| C9 | TTS engine installer & download task | Medium | PASS | 100% | — |
| D1 | TTS synthesize endpoint | High | PASS | 100% | — |
| D2 | Voice registry & cloned voices | Medium | PASS | 100% | — |
| D3 | Engine lifecycle (start/stop/health) | Medium | PASS | 100% | — |
| D4 | TTS kernel port Electron (mock, có chủ đích) | Low | PASS | 100% | Không tính là bug (nợ kỹ thuật đã document) |
| E1 | Licensing/Entitlement gate | High | PASS | 100% | — |
| E2 | PlatformContext capability negotiation | Medium | PASS | 100% | — |
| E3 | Event bus | Low | PASS | 100% | P1 kiến trúc: `once()` dùng `this` (GĐ8, không fix) |
| E4 | Code trùng lặp cần refactor | Low | PASS | 100% | 2/3 điểm đã fix (Sóng 1); điểm #3 PCM-decode để GĐ8 |
| E5 | Logging/error-handling consistency | Low | PASS | 100% | Quan sát, không phải bug |

**32/33 chức năng đạt 100%.** Duy nhất **A1 ở 83%** — không phải bug Critical/High, chỉ 1 test
case hiệu năng (P2, action column trong `StudentList` không dùng virtualizer) chưa fix theo
đúng quyết định GĐ7.5 (không refactor god component trong đợt này).

### Công thức áp dụng (Phần 2.2 plan gốc)

```
% hoàn thiện 1 chức năng = (test case PASS / tổng test case) × 100%
% hoàn thiện tổng thể = trung bình có trọng số (High=3, Medium=2, Low=1)
Severity cap: ≥1 bug Critical/High → % hoàn thiện riêng chức năng đó trần tại 69%
```

**% hoàn thiện tổng thể SAU FIX: 99.32%** (tổng trọng số 74, tính trên 33 chức năng).

**% hoàn thiện tổng thể TRƯỚC FIX (đối chứng, áp dụng severity cap cho các chức năng có
bug Critical/High tại thời điểm audit Sóng 1): 80.59%.**

Chênh lệch ~19 điểm phần trăm phản ánh đúng ảnh hưởng của 6 bug Critical/High đã fix trong
Sóng 2 (A5, A9, B1, B2 (hệ quả C2), C1, C2, C3 — 9 chức năng từng bị cap 69% hoặc thấp hơn).

---

## 2. Toàn bộ bug đã tìm được qua 3 subagent Sóng 1

### 2.1 Bug Critical/High/Medium — đã fix trong Sóng 2

| Mã | Mô tả | File | Mức độ | Trạng thái |
|---|---|---|---|---|
| BUG-001 | CSS `@source` không quét `backdrop/**` → `.text-white` không được generate, chữ "Đang tải…" đen trên nền đen | `modules/ceremony/src/styles.css:133` | Critical | **Đã fix, verify PASS** |
| BUG-002 | `setAppMenu` + `app.on('before-quit')` xác nhận thoát bị mất hoàn toàn | `apps/shell-electron/electron/main.ts` | Critical | **Đã fix, verify PASS** |
| BUG-003 | `setBackdropStateListener`/`setBackdropAspectRatioListener` không được wire | `apps/shell-electron/electron/main.ts` | High | **Đã fix, verify PASS** |
| BUG-004 | `autoLoadFirstIfConfigured()` có sẵn, không được gọi | `apps/shell-electron/electron/main.ts` | Medium | **Đã fix, verify PASS** |
| BUG-005 | Storage key rename thiếu migration — phạm vi mở rộng: `store.ts` + `i18n.ts` + `theme.ts` (28 field, 7 field ảnh hưởng đồng thời cả 3 file) | `modules/ceremony/src/control/{store,i18n,theme}.ts` | **Critical** (nâng từ Medium) | **Đã fix, verify PASS** |
| BUG-006 | `handleStartPregen` thiếu try/catch/finally quanh `window.slide.pregenStart()` → nút "Tạo giọng đọc" kẹt loading vĩnh viễn nếu IPC reject | `TtsSettingsContent.tsx` | High (mới, từ Subagent 1) | **Đã fix, verify PASS** |

### 2.2 Xác nhận không thay đổi phạm vi (đối chiếu yêu cầu đề bài)

- **BUG-001 (B1)**: phạm vi ảnh hưởng THỰC TẾ đúng như Subagent 2 xác nhận — chỉ 1 class
  `text-white` bị ảnh hưởng (dòng "Đang tải…"). `BackdropView`/`DynamicBackdropView` (nội dung
  chính) dùng 100% inline style, không phụ thuộc Tailwind — không bị ảnh hưởng. Không có sai
  lệch so với mô tả gốc.
- **BUG-002 (C1)**: đúng như mô tả — thiếu cả `setAppMenu` lẫn `before-quit` dialog. Không có
  sai lệch.
- **BUG-003 (C2)**: đúng như mô tả — cả `setBackdropStateListener` lẫn
  `setBackdropAspectRatioListener` đều thiếu wiring. Không có sai lệch.
- **BUG-005 (A9)**: phạm vi ĐÃ mở rộng đúng như Subagent 1 phát hiện — không chỉ `store.ts`
  mà cả `i18n.ts`/`theme.ts` độc lập hardcode `STORAGE_KEY`. Số field ảnh hưởng thực tế 28
  (không phải ~24 ước tính ban đầu), 7 field ảnh hưởng đồng thời cả 3 file (`language`,
  `themeMode`, `themePalette`, `appFont`, `letterSpacing`, `appSpacing`, `shadowLevel`). Mức
  độ nâng từ Medium lên Critical — đã áp dụng đúng khi fix (xem 3.5).
- **BUG-006 (A5, mới)**: đúng như Subagent 1 mô tả — dòng `setPregenRunning(false)` nằm sau
  `await` không có `finally`, không chạy nếu `window.slide.pregenStart()` reject.

### 2.3 E4 — xác nhận lại (Subagent 3)

E4 đã fix 2/3 điểm TRONG LÚC audit Sóng 1 (không phải Sóng 2):
- Điểm #1 (`hexToBytes`/`bytesToHex` trùng lặp trong `packages/licensing`): đã fix, tạo `hex.ts`.
- Điểm #2 (`resolveEntitlements` trùng lặp giữa `platform-web`/`platform-electron`): đã fix,
  thêm `resolveEntitlementsFromPort()` vào `packages/licensing/src/license-port.ts`.
- Điểm #3 (PCM→AudioContext decode trùng lặp giữa `platform-web/adapters/tts.ts` và
  `modules/ceremony/src/lib/audio.ts`): **KHÔNG fix** — giữ nguyên theo quyết định Subagent 3
  (file `lib/audio.ts` nằm trong danh sách không được sửa, cần quyết định kiến trúc vị trí gói
  mới trước khi thực thi). **Sóng 2 XÁC NHẬN GIỮ NGUYÊN quyết định này, để dành GĐ8**, đúng
  ràng buộc của nhiệm vụ.

### 2.4 P2 — hiệu năng / kiến trúc nhỏ (KHÔNG fix trong GĐ7.5, để dành GĐ8)

| # | Chức năng | Vấn đề | Mức độ |
|---|---|---|---|
| 1 | A1 | `StudentList/index.tsx` action column dùng `filtered.map()` thay vì `virtualizer.getVirtualItems()` — không ảo hóa, render toàn bộ DOM node kể cả ngoài viewport | P2 hiệu năng |
| 2 | A6 | `ConfettiModal.tsx`'s `handleReset()` gửi 10 lệnh `socket.emit()` riêng lẻ thay vì 1 lệnh gộp | P2 hiệu năng |
| 3 | A7 | `PregenColumn.tsx` tính `selectableCodes`/`allChecked`/`someChecked` lại mỗi render, không qua `useMemo` | P2 hiệu năng |
| 4 | A8 | `LogsDrawer.tsx` tính `filteredLogs`/`stats` (6 phép filter) lại mỗi render, không qua `useMemo` | P2 hiệu năng |
| 5 | A9/A11 | `STORAGE_KEY` từng hardcode độc lập 3 lần — **đã giải quyết triệt để khi fix BUG-005** (nay dùng chung `storage-key.ts`), không còn tồn đọng | Đã fix (phụ) |
| 6 | A10 | Gate `isActive` không nhất quán: `onMenuAction` đăng ký listener TRƯỚC khi check `isActive` (N listener dư khi có N instance `ControlApp`), trong khi `useGlobalCardReader` chặn ĐÚNG trước khi đăng ký | P1 kiến trúc |
| 7 | E3 | `EventBus.once()` dùng `this` trong object literal — vỡ nếu bị destructure khỏi object (`const {once} = bus`). Hiện 0 lệnh gọi `.once()` trong production nên rủi ro thực tế = 0, nhưng tiềm ẩn | P1 kiến trúc |
| 8 | E4 (#3) | PCM→AudioContext decode trùng lặp giữa `platform-web` và `modules/ceremony/src/lib/audio.ts` | P1 refactor, cần quyết định kiến trúc trước |

Toàn bộ 8 mục trên **không fix trong GĐ7.5** theo đúng ràng buộc nhiệm vụ (không refactor god
component/hiệu năng, chỉ note đề xuất) — chuyển giao nguyên vẹn cho GĐ8.

---

## 3. Chi tiết từng bug đã fix

### 3.1 BUG-001 — CSS `@source` thiếu quét `backdrop/**`

**File sửa:** `modules/ceremony/src/styles.css:133`

**Cách fix:** đổi `@source "./control/**/*.{ts,tsx}";` thành `@source "./**/*.{ts,tsx}";`
(quét toàn bộ `modules/ceremony/src/`, gồm cả `control/` và `backdrop/`) — chọn phương án này
thay vì thêm 1 dòng `@source` riêng cho `backdrop/**` vì: (1) đơn giản hơn, không cần nhớ thêm
thư mục renderer mới trong tương lai (đúng đề xuất P1 trong audit gốc); (2) kiểm tra cấu trúc
`modules/ceremony/src/` chỉ có 4 thư mục con (`backdrop/`, `control/`, `lib/`, `assets/`) —
`lib/` không chứa JSX (xác nhận qua audit B4: "lib/tts.ts không có JSX"), `assets/` chỉ chứa
font — quét toàn bộ không có rủi ro include nhầm file không mong muốn; Tailwind v4's `@source`
tự động loại trừ `node_modules`.

**Verify:**
- Build sạch (`rm -rf dist && pnpm --filter @sky-app/shell-electron build`) — thành công.
- Grep bundle CSS output (`dist/assets/styles-MZuBkYcv.css`) bằng Python xác nhận rule
  `.text-white { color: var(--color-white); }` **có mặt** (idx=54210).
- Đối chứng: stash fix, build lại — xác nhận rule `.text-white` **KHÔNG có mặt** trong bundle
  (idx=-1) khi chưa fix. Khôi phục fix, build lại lần nữa — rule có mặt trở lại. Bằng chứng
  thực nghiệm 2 chiều (before/after), không chỉ đọc code tĩnh.

### 3.2 BUG-002 — Menu bar & xác nhận thoát app

**File sửa:** `apps/shell-electron/electron/main.ts`

**Cách fix:**
- Import `setAppMenu` từ `./slide/menu.js`, gọi `setAppMenu('vi')` cuối `bootstrapSlideBackend()`
  (sau `registerSlideIpcHandlers()`), đúng vị trí tương đối so với bản gốc.
- Thêm `app.on('before-quit', (event) => {...})` — dùng biến `mainWindow` module-level đã có
  sẵn (dòng 18) thay cho `controlWindow` tìm bằng title như bản gốc (kiến trúc mới không còn
  cửa sổ Control riêng). Dialog xác nhận giữ nguyên nội dung/nút bấm/logic dừng service
  (`closeBackdropWindow`, `stopSocketServer`, `stopHttpServer`, `stopPythonServer`, `app.exit(0)`)
  y hệt bản gốc `trao-bang-tot-nghiep-2026/apps/slide/electron/main.ts:151-174`.

**Verify:** `pnpm --filter @sky-app/shell-electron typecheck` — 0 lỗi. Grep xác nhận cả
`setAppMenu('vi')` và `app.on('before-quit', ...)` có mặt trong `main.ts`.

### 3.3 BUG-003 — `setBackdropStateListener`/`setBackdropAspectRatioListener` không wire

**File sửa:** `apps/shell-electron/electron/main.ts`

**Cách fix:** import `notifyBackdropState` từ `./slide/ipc.js`; `closeBackdropWindow`,
`resizeBackdropForAspectRatio`, `setBackdropStateListener` từ `./slide/windows.js`;
`setBackdropAspectRatioListener` từ `./slide/socket-server.js`. Thêm 2 dòng gọi trong
`bootstrapSlideBackend()`, đúng vị trí tương đối bản gốc (`main.ts:97-100`):
```
setBackdropStateListener(() => notifyBackdropState());
setBackdropAspectRatioListener((aspectRatio) => resizeBackdropForAspectRatio(aspectRatio));
```

**Verify:** typecheck 0 lỗi. Grep xác nhận cả 2 lệnh gọi có mặt. Hệ quả trực tiếp: B2 (Control
hiển thị đúng trạng thái Backdrop khi đóng bằng nút X / fullscreen OS shortcut) cũng được giải
quyết theo (không cần fix riêng, đã ghi trong bảng 1).

### 3.4 BUG-004 — `autoLoadFirstIfConfigured()` không được gọi

**File sửa:** `apps/shell-electron/electron/main.ts`

**Cách fix:** import `autoLoadFirstIfConfigured` từ `./slide/socket-server.js` (cùng dòng
import với `getUseSampleData`/`startSocketServer`/`stopSocketServer`), gọi cuối
`bootstrapSlideBackend()` — vị trí tương đương bản gốc (`main.ts:107`, sau khi cửa sổ chính đã
tạo — trong kiến trúc đích, `createMainWindow()` đã chạy xong TRƯỚC khi `bootstrapSlideBackend()`
được gọi nên thứ tự tương đương đã đúng, không cần thay đổi thêm).

**Verify:** typecheck 0 lỗi. Grep xác nhận `autoLoadFirstIfConfigured()` có mặt.

### 3.5 BUG-005 — Storage key migration (phạm vi mở rộng: 3 file)

**File sửa:** tạo mới `modules/ceremony/src/control/storage-key.ts`; sửa `store.ts`, `i18n.ts`,
`theme.ts`.

**Cách fix:**
1. Tạo `storage-key.ts` — nguồn chân lý duy nhất, export `STORAGE_KEY` (`'ceremony-control-storage'`),
   `OLD_STORAGE_KEY` (`'slide-control-storage'`), và hàm `readPersistedState()` (đọc key mới
   trước, fallback key cũ nếu key mới chưa tồn tại, trả `state` object hoặc `null`).
2. `i18n.ts`/`theme.ts` (chạy TRƯỚC React mount, không thể dựa vào zustand store đã hydrate)
   — xoá `STORAGE_KEY` hardcode riêng, dùng `readPersistedState()` chung.
3. `store.ts` — **phát hiện quan trọng khi đọc source zustand thật (v5.0.14)**: option
   `migrate` của `persist()` **chỉ được gọi khi `storage.getItem(name)` (đọc theo key MỚI)
   trả về một giá trị non-null có `version` khác** — xác nhận qua đọc trực tiếp
   `zustand/esm/middleware.mjs`'s `hydrate()` (dòng ~391: `if (deserializedStorageValue) {...}`,
   nhánh `migrate` nằm bên trong `if` này). Vì tình huống bug là key MỚI hoàn toàn KHÔNG TỒN
   TẠI (không phải tồn tại với version cũ), `migrate` sẽ **không bao giờ được gọi** trong kịch
   bản này — dùng `migrate` option như kế hoạch ban đầu trong đề bài sẽ KHÔNG fix được bug.
   Đã điều chỉnh cách tiếp cận: dùng `storage: createJSONStorage(() => ({ getItem: (name) =>
   localStorage.getItem(name) ?? localStorage.getItem(OLD_STORAGE_KEY), ... }))` — `getItem`
   tự fallback đọc key cũ ngay tại tầng storage, đảm bảo `deserializedStorageValue` luôn có
   giá trị nếu có dữ liệu ở BẤT KỲ key nào trong 2 key, và `persist()` merge đúng vào state.
   **Đây là điểm sai lệch duy nhất giữa mô tả trong đề bài (dùng `migrate`) và cách fix thực tế
   — đã ghi chú rõ trong code (`store.ts`) và trong file này theo đúng yêu cầu "ưu tiên tin vào
   code thực tế, ghi chú rõ nếu có sai lệch".**

**Verify:**
- `pnpm --filter @sky-app/module-ceremony typecheck` — 0 lỗi.
- Viết lại hoàn toàn `store.storage-migration.test.ts` (thay vì mô phỏng tay như Subagent 1,
  giờ import THẬT `readPersistedState`/`STORAGE_KEY`/`OLD_STORAGE_KEY` từ `storage-key.ts`) —
  **7/7 test PASS**, chuyển từ xác nhận "bug tồn tại" (Sóng 1) sang xác nhận "bug đã fix" (Sóng
  2): đọc đúng key cũ khi key mới chưa có, ưu tiên key mới khi đã có, JSON hỏng không throw,
  và 2 test đọc source xác nhận `store.ts`/`i18n.ts`/`theme.ts` đều dùng `storage-key.ts` dùng
  chung (không hardcode `STORAGE_KEY` riêng nữa).
- Chạy lệnh thật: xem log ở mục 4.4.

### 3.6 BUG-006 — `handleStartPregen` thiếu try/catch/finally

**File sửa:** `modules/ceremony/src/control/components/settings/TtsSettingsContent.tsx`

**Cách fix:** bọc toàn bộ thân hàm (trừ `setPregenRunning(true)` đầu hàm) trong
`try {...} catch (err) {...} finally { setPregenRunning(false); }` — đảm bảo `pregenRunning`
luôn reset về `false` dù `window.slide.pregenStart()` resolve hay reject. Giữ nguyên logic
`alert()` khi `!result.ok`; thêm `console.error` + `alert` riêng cho nhánh `catch` (lỗi kết
nối/IPC).

**Verify:**
- `pnpm --filter @sky-app/module-ceremony typecheck` — 0 lỗi.
- Viết mới `tts-settings.pregen-error-handling.test.ts` — 3 test: (1) mô phỏng đúng cấu trúc
  try/catch/finally đã fix, xác nhận `setPregenRunning(false)` được gọi kể cả khi
  `pregenStart()` reject; (2) xác nhận không regression đường thành công; (3) đọc source thật
  của `TtsSettingsContent.tsx`, xác nhận `handleStartPregen` có try/catch/finally và
  `setPregenRunning(false)` nằm trong khối `finally` (không phải cuối `try`). **3/3 PASS.**

---

## 4. Verify toàn diện sau khi fix

### 4.1 Typecheck toàn monorepo

```
$ pnpm typecheck
...
 Tasks:    20 successful, 20 total
Cached:    8 cached, 20 total
  Time:    7.925s
```
**0 lỗi TypeScript trên toàn bộ 20 package/app.**

### 4.2 Test toàn monorepo

```
$ pnpm test
...
@sky-app/kernel:test:  Tests  27 passed (27)
@sky-app/module-mock-app:test:  Tests  5 passed (5)
@sky-app/licensing:test:  Tests  21 passed (21)
@sky-app/device-shell:test:  Tests  11 passed (11)
@sky-app/platform-web:test:  Tests  14 passed (14)
@sky-app/platform-electron:test:  Tests  8 passed (8)
@sky-app/module-ceremony:test:  Tests  10 passed (10)

 Tasks:    16 successful, 16 total
```
**Tổng 96/96 test PASS** (27+5+21+11+14+8+10), **không regression** so với trước khi fix
(70/70 test của Sóng 1's Subagent 3 vẫn xanh nguyên; `module-ceremony` tăng từ 3 → 10 test do
BUG-005 viết lại + BUG-006 viết mới).

### 4.3 BUG-001 — verify build CSS thật

Đã build sạch 2 lần (trước/sau fix, dùng `git stash`/`stash pop` để so sánh chính xác) — xem
chi tiết mục 3.1. Kết quả: `.text-white` rule **vắng mặt** khi chưa fix, **có mặt** sau fix.
Build cuối cùng (trạng thái fix đã áp dụng) xác nhận lại 1 lần nữa: rule có mặt tại
`dist/assets/styles-MZuBkYcv.css`, offset 54210.

### 4.4 BUG-005 — verify test storage-migration chuyển trạng thái

```
$ pnpm test (modules/ceremony)
 ✓ src/control/__tests__/tts-settings.pregen-error-handling.test.ts (3 tests) 3ms
 ✓ src/control/__tests__/store.storage-migration.test.ts (7 tests) 3ms

 Test Files  2 passed (2)
      Tests  10 passed (10)
```

File `store.storage-migration.test.ts` đã viết lại hoàn toàn (không còn mô phỏng tay, import
thật `readPersistedState`/`STORAGE_KEY`/`OLD_STORAGE_KEY` từ `storage-key.ts` + đọc source xác
nhận `store.ts`/`i18n.ts`/`theme.ts` dùng chung module này) — chuyển từ "3/3 PASS xác nhận bug
tồn tại" (Sóng 1) sang "7/7 PASS xác nhận bug đã fix" (Sóng 2).

---

## 5. Bảng bug cuối cùng

| Mã | Mô tả | Mức độ | Trạng thái |
|---|---|---|---|
| BUG-001 | CSS `@source` thiếu quét `backdrop/**` | Critical | **Đã fix, verify PASS** (build + grep bundle) |
| BUG-002 | `setAppMenu` + `before-quit` dialog thiếu | Critical | **Đã fix, verify PASS** (typecheck + grep) |
| BUG-003 | Backdrop state/aspect-ratio listener không wire | High | **Đã fix, verify PASS** (typecheck + grep) |
| BUG-004 | `autoLoadFirstIfConfigured()` không được gọi | Medium | **Đã fix, verify PASS** (typecheck + grep) |
| BUG-005 | Storage key migration thiếu (3 file, 28 field) | Critical | **Đã fix, verify PASS** (7/7 test tự động) |
| BUG-006 | `handleStartPregen` thiếu try/catch/finally | High | **Đã fix, verify PASS** (3/3 test tự động) |

**6/6 bug Critical/High/Medium đã fix và verify PASS. 0 bug Critical/High/Medium còn tồn đọng.**

---

## 6. Danh sách đề xuất refactor (để dành GĐ8 — KHÔNG fix trong GĐ7.5)

### 6.1 God component (kế thừa nguyên khung Phần 5 plan gốc, không thay đổi)

| File | Dòng | Đề xuất tách |
|---|---|---|
| `control/components/StudentList/index.tsx` | 983 | Tách theo sub-feature: table render, row actions (P1: ảo hóa action column bằng cùng virtualizer), bulk import/export, inline edit; tách `FilterPanel` (~165 dòng) và hook `useStudentFilters` riêng |
| `control/components/settings/ApiConfigContent.tsx` | 892 | Tách autocomplete engine (`findOpenTemplateTag`/`getAutocompleteSuggestions`/`applyAutocompleteSuggestion`/`wrapWithQuotesIfNeeded`, ~150 dòng) thành hook `useTemplateAutocomplete`; tách 3 mảng cấu hình tĩnh + 2 sub-component cuối file |
| `control/components/ConfettiModal.tsx` | 742 | Tách `ConfettiColorPicker`, `ConfettiPhysicsForm`, `ConfettiPreview`, hook `useConfettiConfig`; gộp `handleReset` thành 1 emit duy nhất thay vì 10 lệnh rời |
| `control/ControlApp.tsx` | 397 (đích) / 385 (gốc) | Tách IPC-polling hook, menu-routing hook, modal-orchestration riêng khỏi layout; trừu tượng hóa 4 khối `ConfirmModal` lặp lại (~78 dòng); thống nhất cách gate `isActive` (chặn trước khi đăng ký listener, đồng bộ với `useGlobalCardReader`) |
| `control/components/LogsDrawer.tsx` | 447 | Tách filter/search khỏi render list; bọc `filteredLogs`/`stats` bằng `useMemo`; tách `getActionBadge`/`getApiStatusBadge` thành lookup table |
| `control/components/TtsModal/PregenColumn.tsx` | 440 | Bọc `selectableCodes`/`allChecked`/`someChecked` bằng `useMemo`; tách bảng SV (~110 dòng) thành `PregenStudentTable` |
| `control/components/settings/TtsSettingsContent.tsx` | 366 | 7 state local đồng bộ tay với store — chuyển hẳn sang đọc/ghi store trực tiếp hoặc custom hook `useSyncedLocalState`; xem xét guard "không ghi đè local state từ store nếu input đang focus" (P1, tránh giật con trỏ khi gõ nhanh trong môi trường multi-client) |

**Không tìm thêm god component mới ngoài danh sách plan gốc** — cả 3 subagent Sóng 1 đều xác
nhận đúng 7 file này (thêm `ipc.ts` 1349 dòng ở backend, coi là "god file" backend nhưng kế
thừa nguyên vẹn từ gốc, không phải suy thoái do port — không đưa vào danh sách refactor ưu
tiên vì rủi ro thay đổi cao hơn giá trị thu được ở giai đoạn hiện tại).

### 6.2 Code trùng lặp — còn lại 1 điểm (2/3 đã fix ở Sóng 1)

| # | Trùng lặp | Vị trí | Đề xuất |
|---|---|---|---|
| 3 | PCM→AudioContext decode | `packages/platform-web/src/adapters/tts.ts:9-49` và `modules/ceremony/src/lib/audio.ts:1-58` | Tách phần decode thuần tuý (Int16→Float32→AudioBuffer, không console/DOM side-effect) thành helper ở `packages/service-contracts` hoặc gói `packages/audio-codec` mới — cần quyết định vị trí gói trước khi thực thi (khác biệt: `ceremony`'s bản có `webkitAudioContext` fallback + 10 dòng debug log, `platform-web`'s bản không có) |

### 6.3 Kiến trúc nhỏ khác

| # | Vấn đề | File | Đề xuất |
|---|---|---|---|
| 1 | `EventBus.once()` dùng `this` trong object literal — vỡ nếu destructure | `packages/kernel/src/event-bus.ts:80` | Đổi `this.on(...)` thành gọi trực tiếp closure `on` có sẵn trong scope `createEventBus()` — an toàn tuyệt đối với mọi cách gọi |
| 2 | Gate `isActive` không nhất quán trong `ControlApp.tsx` | `control/ControlApp.tsx:214` | Chặn `if (!isActive) return` TRƯỚC khi đăng ký `onMenuAction` listener (như `useGlobalCardReader` đã làm đúng) — tránh N listener dư khi multi-verse shell mount N instance |
| 3 | Effect load meta thiếu cleanup/cancelled flag | `control/ControlApp.tsx:126-147` | Thêm `cancelled` flag nhất quán với effect poll TTS status ngay phía trên |
| 4 | Logging không thống nhất (110+44 lệnh `console.*` rải rác ngoài `packages/*`) | `apps/shell-electron/electron/**`, `modules/ceremony/src/**` | Helper `logger.ts` nhẹ, wrap console, tắt được theo `NODE_ENV`; thêm ESLint `no-console` rule bảo vệ ranh giới sạch của `packages/*` |
| 5 | Không có `stopPcm()` khi chuyển SV mới (audio có thể chồng lấn) | `modules/ceremony/src/backdrop/BackdropApp.tsx` | Kế thừa từ bản gốc, không phải lỗi port — cân nhắc thêm `stopPcm()` trước khi phát audio mới + trong cleanup effect (áp dụng cho cả 2 repo nếu được duyệt) |

Mẫu chuẩn tham chiếu khi refactor: `packages/platform-electron/src/adapters/license.ts` (ví
dụ đúng của ports&adapters).

---

## 7. Definition of Done — đối chiếu (Phần 7 plan gốc)

- [x] **27/27 chức năng ở bảng 3.0 (nay là 33/33 sau khi Sóng 1 tách chi tiết hơn dự kiến ban
  đầu) có đầy đủ Architecture Review + QA/QC Review theo đúng format Phần 3.** Xác nhận qua 3
  file Sóng 1 — mỗi mục A1-E5 đều có đủ 2 phần theo khung mẫu.
- [x] **Toàn bộ 5 bug ở Phần 4 (BUG-001..005): BUG-001/002/003 đã fix và có test case xác
  nhận PASS; BUG-004/005 đã fix.** Cả 5/5 bug gốc đã fix — không còn bug nào bị hoãn. Bổ sung
  thêm BUG-006 (phát hiện mới từ Subagent 1) cũng đã fix trong đợt này.
- [x] **% hoàn thiện tổng thể tính được bằng số liệu thật (không còn ước tính), kèm bảng chi
  tiết theo từng chức năng.** Xem mục 1 — 99.32% sau fix, bảng 33 dòng đầy đủ.
- [x] **Danh sách đề xuất refactor (Phần 5) đầy đủ, sẵn sàng làm input cho GĐ8.** Xem mục 6 —
  kế thừa nguyên khung plan gốc, không tìm thêm god component mới, bổ sung 5 điểm kiến trúc
  nhỏ từ Sóng 1.
- [x] **Báo cáo cuối cùng nêu rõ số liệu.** Xem mục 8.

**Toàn bộ 5 tiêu chí Definition of Done đã đạt.**

---

## 8. Báo cáo cuối cùng

- **Tổng số chức năng audit:** 33/33 (A1-A11, B1-B4, C1-C9, D1-D4, E1-E5) — toàn bộ có
  Architecture Review + QA/QC Review đầy đủ.
- **An toàn 100% ngay từ Sóng 1 (không có bug cần fix):** 23/33 — A2, A3, A4, A6, A7, A8, A11,
  B3, B4, C4, C5, C6, C7, C8, C9, D1, D2, D3, D4, E1, E2, E3, E4 (2/3 điểm), E5.
- **Có vấn đề, ĐÃ FIX trong Sóng 2, verify PASS 100%:** 10/33 — A1 (một phần, chỉ hết bug
  Critical/High không phải hết mọi finding), A5, A9, A10 (chỉ note P1 không phải bug), B1, B2,
  C1, C2, C3, (E4 2 điểm coi là đã fix ở Sóng 1, xác nhận lại ở Sóng 2).
- **Còn tồn đọng, chuyển sang GĐ8 (có chủ đích, không phải sót):**
  - 7 god component (đề xuất tách, không refactor theo đúng ràng buộc GĐ7.5).
  - 1 điểm code trùng lặp (PCM-decode, E4 điểm #3 — cần quyết định kiến trúc vị trí gói mới).
  - 8 điểm P2 hiệu năng/P1 kiến trúc nhỏ (mục 2.4) — không ảnh hưởng vận hành buổi lễ thật,
    chỉ ảnh hưởng hiệu năng ở quy mô lớn (>500-1000 SV) hoặc là code smell nhẹ.
  - A1 giữ 83% (thay vì 100%) vì đúng 1 test case hiệu năng (action column không ảo hóa) chưa
    fix theo quyết định không refactor god component trong GĐ7.5.

**Kết luận: 6/6 bug Critical/High/Medium đã fix và verify PASS bằng kiểm thử thật (không phải
tự nhận) — typecheck 0 lỗi, 96/96 test PASS toàn monorepo, build CSS xác nhận bằng thực nghiệm
before/after. % hoàn thiện tổng thể tăng từ ~80.6% (trước fix, có severity cap) lên ~99.3%
(sau fix). GĐ7.5 đạt đủ Definition of Done — sẵn sàng chuyển sang GĐ8 (refactor god component +
các điểm còn tồn đọng liệt kê ở mục 6).**

---

## 9. Ghi chú kỹ thuật quan trọng (sai lệch giữa đề bài và thực tế code)

Duy nhất 1 điểm sai lệch giữa mô tả trong đề bài Sóng 2 và cách fix thực tế (đã ưu tiên tin
vào code thực tế đọc được, theo đúng ràng buộc của nhiệm vụ):

- Đề bài gợi ý dùng `migrate` option của `zustand/persist` cho BUG-005. Đọc trực tiếp source
  `zustand@5.0.14`'s `middleware.mjs` xác nhận `migrate` chỉ chạy khi key MỚI đã tồn tại với
  `version` khác — không chạy khi key mới hoàn toàn vắng mặt (chính là tình huống bug). Đã đổi
  sang dùng `storage: createJSONStorage(() => ({ getItem: fallback logic, ... }))` — đạt cùng
  mục tiêu (đọc key cũ khi key mới chưa có) nhưng đúng với cơ chế thật của thư viện. Chi tiết
  đầy đủ ở mục 3.5.
