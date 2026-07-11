# History — Nhật ký kỹ thuật

> Nhật ký **quyết định kỹ thuật + LÝ DO**, theo thứ tự thời gian (mới nhất trên cùng). Đây KHÔNG phải changelog (thứ đó cho người dùng, do Changesets sinh) — đây là ngữ cảnh cho **dev/AI tương lai** hiểu *vì sao* làm thế.
>
> **Cách ghi:** mỗi mục = ngày + tiêu đề + quyết định + lý do + (liên kết). Ghi khi có quyết định đáng kể (kiến trúc, đổi contract, chọn công nghệ, bỏ hướng đã cân nhắc).

---

## 2026-07-11 — Giai đoạn 4: Port backend Ceremony thật vào sky-app, chạy thật (WS/HTTP/Python/window.slide)

**Quyết định:** Port nguyên vẹn 19 file TypeScript (~6.500 dòng: `socket-server.ts`, `http-server.ts`, `python-server.ts`, `ipc.ts` 78 handler, `pregen-queue.ts`, `api-logger.ts`, `engine-installer.ts`, `download-task.ts`, `menu.ts`, `vieneu-tts.ts`, `windows.ts`, `session-store.ts`, `preload.ts`, `data/{paths,store,sync}.ts`, `lib/{customVariables,renderTemplate}.ts`) từ `apps/slide/electron/` (repo `trao-bang-tot-nghiep-2026`) vào `apps/shell-electron/electron/slide/`, cộng `apps/tts-service` (Python, chỉ `server/` — không copy `venv/`/`build/`/`dist/`, 1MB thay vì 600MB). Theo đúng nguyên tắc ports-and-adapters.md: **giữ nguyên bridge `window.slide`** song song `window.sky` (kernel), KHÔNG codemod 117 call-site ngay — bọc dần thành port ở GĐ5+.

**Port `@trao-bang/shared/node` thành `packages/slide-shared`** (quyết định đã hỏi trước khi làm): copy nguyên `types.ts`/`socket-events.ts`/`status.ts`/`format.ts`/`constants.ts` (576 dòng) — chỉ phần `/node` (không dùng React), độc lập hoàn toàn với repo gốc từ đây.

**Vấn đề gặp & fix:**
1. **Thiếu `electron/lib/` và `windows.ts` ở lần copy đầu** — khảo sát ban đầu bỏ sót, phát hiện khi `menu.ts`/`api-logger.ts` import `./windows` không tồn tại. Bài học: khảo sát bằng agent Explore vẫn có thể sót — luôn double-check import chain thực tế khi port, không chỉ tin danh sách file đã liệt kê.
2. **`noUncheckedIndexedAccess` (flag riêng của `@sky-app/tsconfig`, KHÔNG có trong tsconfig gốc của Slide) gây 27 lỗi type** ở code port — không phải bug logic thật, code gốc chạy đúng production với tsconfig ít nghiêm ngặt hơn. Đã hỏi người dùng, chọn **nới lỏng tsconfig cho `apps/shell-electron`** (tắt `noUncheckedIndexedAccess` toàn app, không sửa logic đã chạy thật) thay vì sửa 27 chỗ bằng `!`/guard — giữ code port nguyên vẹn 100%. `format.ts` trong `slide-shared` (package share, không phải app) vẫn sửa 1 chỗ bằng `!` có comment vì package đó cố tình giữ strict cao hơn.
3. **`ModuleNotFoundError: numpy`** khi Python server spawn — **không phải bug**, môi trường Python (`venv/`) cố tình không copy theo kế hoạch (407MB, tự setup khi cần chạy TTS thật). Bootstrap Slide backend vẫn thành công (không throw) vì `startPythonServer` là non-blocking, không chặn các service khác.
4. **Xung đột IPC channel: `Attempted to register a second handler for 'display:list'`** — cả `electron/ipc.ts` (kernel port, GĐ3) và `electron/slide/ipc.ts` (window.slide, GĐ4) đều dùng bare `'display:list'`/`'tts:speak'` cho 2 mục đích hoàn toàn khác nhau, cùng đăng ký vào 1 `ipcMain` global namespace. Fix: đổi channel của kernel port thành prefix `kernel:tts:*`/`kernel:display:*` (sửa `packages/platform-electron/src/adapters/{tts,display}.ts` + `apps/shell-electron/electron/ipc.ts` + test tương ứng), giữ nguyên `window.slide`'s bare `tts:*`/`display:*` (không đổi API 78-handler đã có).
5. **Test verify script tạm (Playwright, không phải test suite chính thức) gọi tên channel cũ** sau khi đổi namespace — chỉnh script, không phải bug code.

**Kết quả verify RUNTIME THẬT** (Playwright `connectOverCDP`, `electron-vite dev` thật):
- `[SocketServer] Listening on port 8765` — Socket.IO thật, xác nhận qua `curl http://localhost:8765/socket.io/...` → 200.
- `curl http://localhost:8080/health` → `{"ok":true}` — Express HTTP server thật.
- `[Python Server] Khởi chạy port=8093: python3 .../apps/tts-service/server/main.py` — `findMonoRoot()` (dò `pnpm-workspace.yaml`) tự tìm đúng `apps/tts-service/server` từ vị trí mới, logic port đúng nguyên vẹn không cần sửa.
- `window.slide.getMeta()` (bridge 78-handler thật) round-trip đúng qua IPC thật, trả `{"config":null,"ceremony":null,"students":[],...}` (rỗng vì chưa import data — đúng trạng thái ban đầu).
- `window.sky.invoke('kernel:tts:listVoices')` (kernel port GĐ3) vẫn hoạt động bình thường, không bị ảnh hưởng bởi việc thêm backend Slide — 2 bridge độc lập cùng tồn tại.
- **Toàn workspace: 21/21 turbo task xanh, 33/33 test pass.**

**Còn thiếu ở GĐ4 (để GĐ5):** chưa mở `createControlWindow()`/`createBackdropWindow()` (Slide UI thật) — renderer chính vẫn là `SkyDeviceLayout`+`mockAppModule` từ GĐ3. `ControlApp.tsx` (React 18, UI thật của Ceremony) chưa port, chưa trở thành 1 `AppModule`. Chưa test import/sync data thật (ZIP), chưa test TTS synthesize thật (cần setup Python venv), chưa xử lý style isolation Tailwind v4 (device-layout `@theme` vs Slide `@theme` — chỉ phát sinh khi Slide UI thật được nhúng).

---

## 2026-07-11 — Giai đoạn 3: platform-electron + platform-web + 2 shell mỏng, chạy thật cả Electron lẫn browser

**Quyết định:** Dựng `packages/platform-web`, `packages/platform-electron`, `apps/shell-web`, `apps/shell-electron` — mỗi platform implement `TtsPort` (+ `DisplayPort` cho Electron) và build `PlatformContext` với capability đúng thực tế môi trường. Mục tiêu GĐ3 theo overview.md §5: **cùng 1 `mock-app` chạy thật cả Electron lẫn Web**, không còn chỉ jsdom mock như GĐ1-2.

**Đã tạo:**
- `platform-web`: `createWebTtsPort` (fetch → `/api/tts/*`, chưa có backend thật — GĐ4+), `createWebPlatform` (capability chỉ `network`+`tts`, KHÔNG `secondary-display`/`card-reader`/`tts-local`/`keystore` — degrade đúng thiết kế).
- `platform-electron`: `bridge-types.ts` (interface `SkyBridge` dùng chung), `createElectronTtsPort`/`createElectronDisplayPort` (gọi `window.sky.invoke(channel, ...args)` — 1 hàm generic duy nhất, không method-per-port, đúng gợi ý ports-and-adapters.md), `createElectronPlatform` (đủ 7 capability).
- `apps/shell-web`: Vite SPA thuần, `main.tsx` render `<SkyDeviceLayout apps={[mockAppModule]} platform={createWebPlatform()}/>`.
- `apps/shell-electron`: electron-vite app — `electron/main.ts` (BrowserWindow + `registerIpcHandlers`), `electron/ipc.ts` (mock handler cho `tts:*`/`display:*`, chứng minh round-trip chứ chưa phải backend thật), `electron/preload.ts`, `src/main.tsx`.

**Chuỗi lỗi thật gặp khi verify Electron runtime (quan trọng — đọc trước khi đụng lại preload/electron-vite config):**
1. **Version bừa lại tái diễn** (đã cảnh báo ở GĐ2 nhưng vẫn mắc): ghi `electron@^38.7.1` không tồn tại (thật `43.1.0`), `jsdom@^27` (thật `29`), `@testing-library/react@^16.3.0` thiếu patch. Bài học nhắc lại: LUÔN `npm view <pkg> version` trước khi ghi version, kể cả khi "chỉ áng chừng".
2. **electron-vite@5 không hỗ trợ Vite 8** (peer `^5||^6||^7`). `shell-electron` phải dùng Vite 7.3.6 (không phải 8 như `shell-web`) + `@vitejs/plugin-react@5.2.0` (bản duy nhất hỗ trợ cả Vite 7 và 8, dùng chung cho cả 2 shell tránh lệch version). **2 shell KHÔNG bắt buộc cùng version Vite** — chúng độc lập, chỉ cần mỗi cái tương thích đúng tooling của nó.
3. **`onlyBuiltDependencies` thiếu `electron`** trong `pnpm-workspace.yaml` → binary Electron không tự tải khi `pnpm install` (pnpm mặc định chặn postinstall script của dependency lạ). Thêm `electron`+`esbuild` vào `onlyBuiltDependencies`. Ngay cả sau khi thêm, **`pnpm install` không tự rebuild package đã cài trước đó** — cần `pnpm rebuild electron` hoặc chạy thẳng `node .../electron/install.js` một lần.
4. **`electron.vite.config.ts` cần `input` tuyệt đối** (`resolve(__dirname, 'electron/main.ts')`), KHÔNG string tương đối (`'electron/main.ts'`) — string tương đối bị hiểu nhầm là bare specifier nên `externalizeDepsPlugin()` cố externalize chính entry file, lỗi "Entry module cannot be external". Xác nhận bằng cách đọc `apps/slide/electron.vite.config.ts` ở repo gốc — luôn dùng `resolve(__dirname, ...)`.
5. **Preload extension mismatch**: khi `apps/shell-electron/package.json` có `"type": "module"`, electron-vite build preload ra `preload.mjs`, nhưng `main.ts` gọi cứng `preload.js` → preload không load, `window.sky` không tồn tại (không có lỗi rõ ràng, chỉ im lặng thiếu global).
6. **Lỗi gốc nghiêm trọng nhất — Electron sandboxed preload KHÔNG hỗ trợ ESM `import`, kể cả file `.mjs`.** Console báo `SyntaxError: Cannot use import statement outside a module` dù extension đúng ESM — đây là giới hạn thật của `runPreloadScript`/`executeSandboxedPreloadScripts` trong Electron (không phải bug config). Fix bước 1: bỏ `"type": "module"` khỏi `shell-electron/package.json` → preload build ra CJS thật (`preload.js`, `require(...)`).
7. **Sau khi preload là CJS, `require("@sky-app/platform-electron/preload")` vẫn fail — "module not found"`, dù `node -e "require(...)"` chạy Node thường thành công.** Kết luận: **Electron's `preloadRequire` (sandbox) có module resolver RIÊNG, không đọc `exports` field / subpath export của package.json qua pnpm symlink** như Node/Vite làm — đây là giới hạn thật, đã verify chéo (Node thường OK, chỉ Electron sandbox fail). **Giải pháp đúng, không phải workaround**: preload KHÔNG được `require`/`import` runtime code từ package ngoài qua bare specifier — bundle logic trực tiếp trong `apps/shell-electron/electron/preload.ts` (chỉ `import type` cho type-only). Đây chính xác là pattern `apps/slide/electron/preload.ts` ở repo gốc đã dùng — xác nhận bằng cách đọc file đó (`import type {...} from '@trao-bang/shared/node'`, không bao giờ import runtime).
8. **Sau khi sửa preload, renderer lại vỡ**: Vite dev server (browser native ESM `import` qua `/@fs/...`) không đọc được named export CJS-style (`exports.createElectronPlatform = ...`) khi `platform-electron`'s package.json không có `"type"` field rõ ràng — thử `"type": "commonjs"` tường minh vẫn fail (native browser `import` trên đường dẫn `/@fs/` không tương thích CJS export dù có `__esModule` marker). **Fix đúng: trả `platform-electron` về ESM thuần** (`"type": "module"`, `tsconfig` dùng `module: ESNext` mặc định từ `react-library.json`, exports chỉ `"import"`) — khớp với `platform-web`/`kernel`/`device-shell` đã hoạt động đúng từ đầu. **Bài học tổng: một package KHÔNG thể vừa CJS (cho preload sandbox) vừa ESM (cho Vite renderer) qua cùng file `exports` map — 2 world có yêu cầu module system xung đột nhau. Giải pháp không phải "làm package dual-format", mà là tách: preload luôn viết logic in-app (không import runtime từ package khác); mọi package renderer-facing dùng ESM thuần nhất quán.**

**Kết quả verify runtime thật (không phải chỉ build/typecheck):**
- **shell-web**: dùng Playwright + Chrome hệ thống (`chromium.launch({executablePath: ...})`) kết nối `vite dev` thật. Xác nhận: desktop render (53KB), click mở Mock App window, `data-env="web"`, `tts:ready` (adapter fetch đã register), KHÔNG có request lỗi.
- **shell-electron**: `env -u ELECTRON_RUN_AS_NODE electron-vite dev -- --remote-debugging-port=9333`, Playwright `chromium.connectOverCDP(...)` bắt vào renderer world thật của app Electron đang chạy (không phải Chrome giả). Xác nhận: desktop render, mở Mock App, `data-env="electron"`, **`secondary-display:yes`** (khác web `:no` — capability degrade logic đúng), và **IPC round-trip thật**: `window.sky.invoke('tts:listVoices')` → preload → `ipcMain.handle` trong `electron/ipc.ts` → trả đúng `[{"id":"mock-voice-1","name":"Mock Voice"}]`.
- Thêm test còn thiếu cho `platform-web`/`platform-electron` (vitest coi "0 test file" là lỗi, không phải pass) — capability đúng theo môi trường, port đăng ký đúng, gọi đúng channel/endpoint.
- **Toàn workspace: 19/19 turbo task xanh, 33/33 test pass** (14 kernel + 6 platform-web + 5 platform-electron + 5 mock-app + 3 device-shell).

**Còn thiếu ở GĐ3 (để GĐ4+):** IPC handler trong `apps/shell-electron/electron/ipc.ts` toàn mock (chưa nối TTS Python service/window quản lý thật — đó là GĐ4-5). Chưa build production (`electron-vite build`) — mới verify dev mode. Chưa test `shell-web`/`shell-electron` tự động hoá trong CI (verify lần này làm thủ công qua Playwright script tạm, không phải test suite cố định).

---

## 2026-07-11 — Giai đoạn 2: device-layout thành lib + device-shell nối kernel, verify xanh

**Quyết định:** Refactor repo `device-layout` (riêng, `~/PROJECTS/device-layout`) để nó xuất bản một pipeline build **song song** với Next.js hiện có (giữ Next chạy y hệt), tạo `packages/device-shell` trong sky-app import bản build đó dạng dependency (tarball local, không submodule/copy source — đúng quyết định đã chốt).

**Thay đổi ở device-layout (2 commit: `7eee5b3` feat, `0f89f2f` fix):**
- `src/types/app.ts`: `AppConfig.component` chuyển thành optional, thêm `render?: ComponentType<AppContentProps>` — app ngoài truyền thẳng component, không cần đăng ký vào `APP_COMPONENTS` registry nội bộ. `AppContentProps` chuyển từ định nghĩa cục bộ trong `AppRegistry.tsx` sang nguồn chung ở `types/app.ts`.
- `AppRegistry.tsx`: `AppContent` ưu tiên `appConfig.render` nếu có, fallback logic cũ nếu không — additive, không phá app built-in (Finder/Terminal/...).
- `ThemeProvider.tsx`: nhận `apps?: AppConfig[]` qua prop, default `= APPS_CONFIG` — Next.js gọi `<ThemeProvider />` không tham số vẫn y hệt hành vi cũ; host lib truyền danh sách riêng.
- `src/lib/asset-base.ts` (mới): `AssetBaseProvider`/`useAssetBase`/`resolveAssetUrl` — cho phép override base URL wallpaper/icon, default `''` (giữ path tuyệt đối `/wallpapers/...` như Next hiện tại). Áp dụng ở `Wallpaper.tsx` + `LockScreen.tsx`.
- `Taskbar.tsx`: `next/image` → `<img>` (chỉ 28x28 icon, mất tối ưu không đáng kể) — cần thiết vì file này nằm trong lõi component mà lib import, `next/image` cần Next.js server không tồn tại trong Vite build.
- `src/lib.tsx` (mới): entry lib, export `<DeviceLayout>` (đổi tên public từ `ThemeProvider`) + types cần thiết. KHÔNG import gì từ `src/app/` — 2 pipeline hoàn toàn tách biệt.
- `vite.config.ts` (mới): `build.lib` → `dist-lib/` (ESM + `.d.ts` qua `vite-plugin-dts` + CSS qua `@tailwindcss/vite`). **`publicDir: false` bắt buộc** — mặc định Vite copy nguyên `public/` (wallpaper jpg + live-wallpaper mp4, hàng chục MB) vào output, phình gói từ 1.5MB lên 56MB; host tự cấp asset qua `assetBaseUrl`.
- `tsconfig.json`/`tsconfig.node.json`: loại `vite.config.ts` khỏi phạm vi typecheck Next (tránh Next `tsc` báo lỗi field lạ của config Vite — 2 pipeline, 2 tsconfig).

**Lỗi gặp khi dựng vite-plugin-dts:** dùng nhầm field cũ (`outDir` thay vì `outDirs`, và `rollupTypes` không tồn tại trong `unplugin-dts` v5 — API đổi giữa các major). Fix bằng cách đọc trực tiếp `.d.mts` của package đã cài thay vì đoán từ tài liệu/trí nhớ.

**Thay đổi ở sky-app:** `packages/device-shell` mới — `to-device-app-config.tsx` (bridge `AppModule` kernel → `AppConfig` device-layout, tiêm `platform: PlatformContext` vào component con qua closure vì `AppConfig.render` chỉ nhận `{appId, windowId}`), `SkyDeviceLayout.tsx` (component chính sky-app render). Cài `@sonth87/device-layout` qua `file:../../.vendor/*.tgz` — script `scripts/vendor-device-layout.sh` build + pack device-layout, `.vendor/*.tgz` gitignored (không commit binary từ repo khác).

**Bug nghiêm trọng phát hiện & fix: trùng phiên bản React.** `device-shell` test báo "Invalid hook call" — nguyên nhân: `kernel`/`mock-app` ghim `react@^19.2.4`, package khác resolve `19.2.7` mới nhất → 2 bundle React khác nhau cùng tồn tại trong `node_modules/.pnpm`, component từ bundle A gọi hook trong cây bundle B thì vỡ. Đây là bẫy kinh điển của monorepo dùng React làm peer dep — fix bằng `pnpm.overrides` ở root `package.json` ép toàn bộ workspace 1 version, cộng xóa sạch `node_modules`+lockfile cài lại (override không áp dụng cho resolution đã cache). Cũng phát hiện tôi ghi sai version cụ thể trong package.json vài chỗ (`@types/react-dom@^19.2.7` không tồn tại, bản thật `19.2.3`) — bài học: dù đã chọn "cài bản mới nhất" thay vì pin cứng, vẫn cần xác minh version ghi tay bằng `npm view <pkg> version` trước khi tin, không đoán số.

**Test bổ sung:** jsdom thiếu `ResizeObserver`/`window.matchMedia` (device-layout dùng thật ở `AppViewport`/`ThemeProvider`) → polyfill tối thiểu trong `vitest.setup.ts` của `device-shell`.

**Kết quả verify:** device-layout — `next build`/`next dev` không regression (HTTP 200), `pnpm build:lib` ra `dist-lib/` 1.5MB đầy đủ ESM+d.ts+CSS. sky-app — **10/10 turbo task xanh, 22/22 test pass** (14 kernel + 5 mock-app + 3 device-shell, trong đó có test render `mock-app` thật qua `SkyDeviceLayout` bằng `@testing-library/react` — chứng minh toàn bộ chuỗi kernel→device-shell→device-layout hoạt động end-to-end, không chỉ mock rời rạc).

**Còn thiếu ở GĐ2 (để GĐ3):** chưa có `apps/shell-electron`/`apps/shell-web` thật chạy `SkyDeviceLayout` trong Electron/browser thực — mới verify bằng jsdom test. Cơ chế publish device-layout vẫn là tarball thủ công (script), chưa CI/registry — theo đúng "quyết định còn mở" đã ghi ở lần trước.

---

## 2026-07-11 — Giai đoạn 1: Kernel + contract implement xong, verify xanh

**Quyết định:** Scaffold monorepo pnpm+Turbo thật (không chỉ docs) và implement `packages/kernel` + `packages/service-contracts` với interface đầy đủ + logic tối thiểu, cộng 1 `modules/mock-app` chứng minh contract dùng được end-to-end. Theo đúng nguyên tắc giảm rủi ro trong overview.md §5: mock-app-first, CHƯA đụng device-layout/Slide thật.

**Đã tạo:**
- Root: `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `modules/*`), `turbo.json`, root `package.json` (Changesets + turbo + typescript), `packages/tsconfig` (base.json ES2022/NodeNext/strict, react-library.json).
- `packages/kernel`: `capability.ts` (Capability union + CapabilitySet), `event-bus.ts` (EventBus với **sticky/replay** — học từ mfe-shell, `persistMs`+`replayLatest`, có test hết-hạn sticky), `service-registry.ts` (Map-based, typed get/register), `entitlement.ts` (EntitlementSet + EntitlementGate + `createAllowAllEntitlementSet` cho mock/dev), `app-module.ts` (AppModule/AppContentProps/PlatformContext — đúng contract-reference.md), `platform-context.ts` (`createPlatformContext` thật + `createMockPlatformContext` tiện cho test/mock app), `index.ts` export tổng.
- `packages/service-contracts`: 6 port thuần interface (TtsPort, DataPort, DisplayPort, CardReaderPort, FsPort, LicensePort) — verify KHÔNG import Electron/fetch/browser API, đúng nguyên tắc port trung lập.
- `modules/mock-app`: `MockApp.tsx` (component chỉ chạm platform.services/platform.capabilities, không gọi môi trường trực tiếp) + `index.ts` (AppModule đầy đủ, activate/deactivate có state).
- Test: 14 test kernel (event-bus sticky/replay/expiry, service-registry typed, entitlement gate open/blocked, capability) + 5 test mock-app (lifecycle, entitlement pass-through, resolve TtsPort qua registry, web vs electron capability khác nhau).

**Kết quả verify:** `pnpm install` sạch (156 package, node 20/pnpm 10.21/turbo 2.10.4/vitest 3.2.7/typescript 5.9.3 — bản mới nhất ổn định tại thời điểm cài). `turbo run typecheck` 5/5 package pass. `turbo run test` **19/19 test pass**.

**Lỗi gặp & fix:** comment JSDoc trong `MockApp.tsx` chứa chuỗi `window.*/ipcRenderer` — TypeScript parser hiểu `*/` là kết thúc block comment sớm → lỗi cú pháp. Sửa thành `window.x / ipcRenderer`. Bài học: tránh `*/` trong JSDoc.

**Còn thiếu ở GĐ1 (để làm tiếp — GĐ2/GĐ3):** chưa có `apps/shell-web` hay `apps/shell-electron` thật, chưa có device-layout tích hợp, chưa render React thật ra DOM (mock-app mới test bằng vitest node, chưa test bằng @testing-library/react hay browser).

---

## 2026-07-11 — Khởi tạo repo + chốt kiến trúc nền tảng

**Quyết định:** Dựng Sky-App làm nền tảng multi-app đa môi trường (web+electron, online+offline) có licensing, thay vì chỉ port Ceremony (khi đó còn gọi là Trao Bằng) vào device-layout.

**Lý do:** Người dùng định hình tầm nhìn lớn hơn — device-layout + Ceremony + TTS chỉ là phần đầu; cần nền tảng mở rộng được, tích hợp nhiều app/service, hỗ trợ cả web lẫn electron, có license theo tính năng.

**Các quyết định con:**
- **Ports & Adapters ở tâm** — vì học từ khảo sát `sdk-hub` + `mfe-shell-app`: cả 2 đều thiếu lớp tách môi trường và lifecycle contract tường minh. Sky-App đặt 2 thứ đó làm trung tâm để chạy được web+electron từ 1 codebase.
- **KHÔNG Module Federation** (dù sdk-hub/mfe dùng) — vì offline-first, static bundle đơn giản & tin cậy hơn micro-frontend runtime.
- **device-layout giữ repo riêng, tích hợp dạng dependency** — vì device-layout tái dùng cho nhiều dự án khác; không submodule/copy để tránh lệch nhánh.
- **device-layout giữ song song Next.js + thêm pipeline Vite lib** — xác minh rẻ: chỉ 2/130 file dùng Next API, 96/130 đã 'use client'. Không cần bỏ Next.
- **Licensing Ed25519 offline verify** — hợp offline-first; chấp nhận không chống crack tuyệt đối.
- **Monorepo pnpm+Turbo, React 19/shadcn/Tailwind v4/TanStack** — công nghệ mới, phổ biến, đồng bộ device-layout.

**Facts kỹ thuật quan trọng (dùng khi code):**
- Ceremony (trước đây gọi là Trao Bằng) bridge tên **`window.slide`** (không phải electronAPI), 117 call-site/30 file, 78 IPC channel + 7 event-listener trả unsubscribe. 2 renderer: Control (trong shell) + Backdrop (kiosk riêng, state Socket.IO). Main giữ WS8765+HTTP8080+Python TTS.
- Ceremony React 18 → cần nâng 19. Cả Slide + device-layout đều Tailwind v4 `@theme` global → rủi ro style leakage.
- Điểm nối device-layout nhận app ngoài: `AppRegistry.tsx` (AppContent/AppViewportProvider), `ThemeProvider.tsx` (bỏ hardcode registerApps), `types/app.ts` (thêm `render?`).

**Trạng thái:** chốt tài liệu kiến trúc + khởi tạo repo docs. CHƯA viết code. Lộ trình 7 GĐ ở [architecture/overview.md](../architecture/overview.md) §5.

**Liên quan:** dự án gốc `trao-bang-tot-nghiep-2026` `docs/multi-verse.md`, `docs/multi-app-roadmap.md`.

---

<!-- Thêm mục mới PHÍA TRÊN dòng này, giữ mới-nhất-trên-cùng -->
```
## YYYY-MM-DD — <tiêu đề>
**Quyết định:** ...
**Lý do:** ...
**Liên quan:** ...
```
