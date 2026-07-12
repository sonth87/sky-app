---
status: done
owner: sonth87
created: 2026-07-11
target_version: GĐ1-7 (khởi tạo repo → Web parity)
supersedes: null
implemented_doc: ../../architecture/overview.md
---

# Kế hoạch gốc: Kiến trúc nền tảng Sky-App (GĐ1-7)

> **Trạng thái: Done — toàn bộ GĐ1-7 đã triển khai và verify.** Đây là kế hoạch kiến trúc gốc lập lúc khởi tạo repo (2026-07-11), giữ lại làm lịch sử quyết định. Tài liệu kiến trúc **hiện hành** (mô tả hệ thống đang chạy, cập nhật liên tục) nằm ở [`docs/architecture/overview.md`](../../architecture/overview.md) — đọc file đó để biết trạng thái mới nhất, không đọc file này.
>
> Nhật ký triển khai từng giai đoạn (ngày, chi tiết, bug đã fix): [`docs/dev/history.md`](../../dev/history.md).

## Context

**Tầm nhìn.** `sky-app` là một **nền tảng multi-app** (không phải 1 app), dùng **device-layout** làm lớp visualize (desktop-OS metaphor: cửa sổ/dock/menubar). Trao Bằng (Slide) + TTS chỉ là **2 app đầu tiên** trong nhiều app/service sẽ tích hợp dần. Yêu cầu nền tảng:
1. **Chạy cả Web lẫn Electron** — isomorphic-first: 1 codebase, 2 runtime adapter. Chấp nhận đánh đổi: một số tính năng chỉ có ở 1 môi trường, hoặc triển khai 2 lần (vd TTS: Electron = client gọi local service; Web = gọi backend service).
2. **Online + Offline** — offline-first, không bắt buộc mạng để chạy app đã cấp quyền.
3. **License/activation theo tính năng** — entitlement gating từng app/feature con, verify offline-capable (ký số + refresh online).
4. **Dễ mở rộng & tích hợp giữa các app con** — thêm app không sửa core; app giao tiếp/chia sẻ service với nhau qua contract rõ ràng. **Đây là ưu tiên số 1.**
5. Slide vẫn hỗ trợ đầy đủ **Control + Backdrop** như hiện tại.

**Nền tảng khảo sát (đã học pattern, không copy):**
- `device-layout` (React 19/Tailwind v4): window manager + desktop metaphor sẵn, nhưng app registry chỉ static `AppConfig[]`, messaging chỉ `CustomEvent`, KHÔNG có service registry / lifecycle contract / entitlement.
- `sdk-hub` (kernel `SDKHub.registerApp/mount/unmount`, `bootstrapSdkApp`, build-config kernel, auto-scan apps) — mô hình platform tốt nhất, **nhưng bind cứng `window` globals, thiếu tách môi trường**.
- `mfe-shell-app` (registry `ModuleRecord`, event bus sticky/replay, permission gating nhiều tầng) — server-driven, hợp web, KHÔNG offline.
- Bài học chung: cả sdk-hub và mfe-shell **thiếu lớp ports & adapters tách môi trường** và **thiếu lifecycle contract tường minh** → đây là 2 thứ sky-app đặt làm trung tâm.

**Tech stack (đã chốt):** React 19, TypeScript, Tailwind v4, shadcn/ui, TanStack Query, Zustand, Electron, Vite/electron-vite, pnpm workspace + Turborepo, Changesets. **KHÔNG** Module Federation (offline-first → static bundle đơn giản & tin cậy hơn micro-frontend runtime).

---

## Nguyên tắc kiến trúc

1. **Ports & Adapters (Hexagonal) ở tâm.** Mọi app/service viết theo **interface trung lập môi trường** (port). Runtime (Electron/Web) cấp **adapter**. App KHÔNG gọi `window.slide`/`ipcRenderer`/`fetch` trực tiếp — gọi qua port do Platform inject.
2. **Capability-based.** Mỗi app khai báo **capabilities cần** (`fs`, `tts`, `card-reader`, `secondary-display`, `network`...). Platform ở mỗi môi trường tự trả lời capability nào có; app tự degrade nếu thiếu.
3. **Offline-first, local-first registry.** Danh sách app + entitlement resolve được **offline** (từ file/license đã ký). Online chỉ để *refresh*, không phải để *chạy*.
4. **Core không biết app cụ thể.** `packages/kernel` chỉ biết "AppModule contract" + "service registry". Thêm app = thêm package, không sửa core (nguyên tắc R1 `multi-verse.md`).
5. **App độc lập, giao tiếp qua contract.** Không import chéo code app; giao tiếp qua **event bus** (sticky/replay) + **service registry** (typed). Chia sẻ chỉ qua `packages/*`.
6. **Tách dần, không big-bang.** Trao Bằng chạy y hệt sau mỗi bước.

---

## Monorepo layout (thiết kế ban đầu)

```
sky-app/  (pnpm workspace + Turborepo, /Users/skyline/PROJECTS/sky-app)
├── apps/
│   ├── shell-electron/       ← Electron host (main + preload + renderer bootstrap)
│   │   ├── electron/         ← main process: ServiceManager, window mgmt, adapter native
│   │   └── src/              ← renderer: <Platform><DeviceLayout/></Platform>
│   ├── shell-web/            ← Web host (Vite SPA) — cùng renderer, adapter web + backend proxy
│   └── tts-service/          ← Python TTS service (port nguyên từ trao-bang, HTTP)
│
├── packages/
│   ├── kernel/               ← 🔑 CORE: AppModule contract, PlatformContext, ServiceRegistry,
│   │                            EventBus, EntitlementGate, CapabilityMap. KHÔNG phụ thuộc app/env.
│   ├── platform-electron/    ← Adapter Electron: implement các port bằng IPC/preload/native
│   ├── platform-web/         ← Adapter Web: implement port bằng HTTP/backend/browser API
│   ├── device-shell/         ← Wrapper device-layout: nạp <DeviceLayout> + nối kernel registry
│   │                            (cài @sonth87/device-layout dạng DEPENDENCY — repo riêng, xem PHỤ LỤC A)
│   ├── ui/                   ← shadcn/ui primitives + tokens dùng chung mọi app (tsup)
│   ├── service-contracts/    ← Interface các service: TtsPort, DataPort, DisplayPort, LicensePort...
│   ├── licensing/            ← Entitlement verify (ký số Ed25519, offline + online refresh)
│   └── build-config/         ← Vite/electron-vite/tsup config factory dùng chung (build kernel)
│
├── modules/                  ← Các APP con (mỗi app = 1 package, implement AppModule)
│   ├── trao-bang/            ← Slide Control UI (port từ apps/slide/src/control) — sau đổi tên "ceremony"
│   ├── trao-bang-backdrop/   ← Backdrop renderer (giữ tách, chạy BrowserWindow/tab riêng)
│   └── tts-studio/           ← UI cấu hình TTS (shared service client)
│
├── pnpm-workspace.yaml  turbo.json  .changeset/
```

Lý do tách `shell-electron` vs `shell-web` là **2 app mỏng** (chỉ khác adapter + entry), còn `renderer` + toàn bộ `modules/*` + `packages/*` dùng chung → không nhân đôi UI.

---

## Các trục thiết kế cốt lõi

### 1. AppModule contract (packages/kernel)

Mở rộng `AppConfig` của device-layout (`src/types/app.ts`) thành contract đầy đủ có lifecycle + capability + entitlement:

```ts
interface AppModule {
  id: string;                       // 'trao-bang', 'tts-studio'
  name: string; icon: string;
  category?: string;
  // Visualize (device-layout window metadata)
  window?: { defaultSize; minSize; hasMenuBar; hasStatusBar; mobileFullscreen };
  // Yêu cầu môi trường
  requiredCapabilities: Capability[];   // ['tts','fs','secondary-display']
  requiredServices: string[];           // ['tts','data']
  entitlement?: string;                 // feature key để license gate (vd 'app.trao-bang')
  // Vòng đời (khoảng trống mà sdk-hub/mfe-shell thiếu)
  render: React.ComponentType<AppContentProps>;   // UI trong cửa sổ
  activate?(ctx: PlatformContext): Promise<void>;  // khởi tạo (mở service, state)
  deactivate?(): Promise<void>;                    // dọn (đóng cửa sổ phụ, gỡ listener)
}

interface AppContentProps {
  appId: string; windowId: string;
  platform: PlatformContext;   // inject: services, eventBus, capabilities, entitlements, host
}
```

`PlatformContext` được inject vào MỖI app qua React context tại `AppViewportProvider` (device-layout `AppRegistry.tsx:60` — điểm chèn đã xác định). App gọi `platform.services.tts.speak(...)` thay vì `window.slide.speak(...)`.

### 2. Ports & Adapters — giải bài toán Web/Electron

`packages/service-contracts` định nghĩa port trung lập; 2 platform package implement:

| Port | Electron adapter | Web adapter |
|---|---|---|
| `TtsPort` | client → local Python service qua IPC (`window.slide` re-expose) | HTTP → backend TTS service |
| `DataPort` (import/sync SV) | IPC → `ceremonyStore` local | REST API backend |
| `DisplayPort` (Backdrop màn ngoài) | Electron BrowserWindow kiosk | ⚠️ web: mở tab/popup hoặc **không khả dụng** (degrade) |
| `CardReaderPort` | native HID/serial qua main | ⚠️ WebHID (nếu browser hỗ trợ) hoặc không |
| `FsPort` | fs thật | OPFS/IndexedDB hoặc backend |
| `LicensePort` | đọc license file + keystore | gọi license server |

App chỉ thấy port. `requiredCapabilities` cho phép app biết trước cái gì thiếu (vd web không có `secondary-display` → ẩn nút Backdrop).

### 3. Service Registry & ServiceManager

- **ServiceManager** (Electron main, tổng quát hóa `python-server.ts`): spawn/health/restart service Python theo `requiredServices` của app đang mở. 1 instance dùng chung (`multi-verse.md` §7).
- **ServiceRegistry** (kernel, renderer): map `serviceId → client (typed port)`. App resolve service qua registry, không tự tạo.

### 4. Inter-app communication

- **EventBus** (kernel) — học từ mfe-shell `eventBus.ts`: `emit/on/off` + **sticky/replay** (`replayLatest`) cho app mount muộn. Tên event `{appId}:{action}` | `platform:{action}`. Electron: bus renderer + cầu IPC nếu app ở BrowserWindow riêng.
- **Typed service call** — app expose service cho app khác qua ServiceRegistry (vd trao-bang expose `student-data` cho 1 app báo cáo tương lai).

### 5. Licensing / Entitlement (packages/licensing)

- License = payload ký **Ed25519** chứa `{ entitlements: string[], expiry, deviceBinding? }`. Verify **offline** bằng public key nhúng trong app.
- `EntitlementGate` (kernel): trước khi launcher mở app hoặc app bật feature → check `entitlement` có trong license không. Thiếu → app hiện mờ/khóa ở dock (học gating nhiều tầng của mfe-shell `Sidebar.tsx`).
- Online refresh tùy chọn (license server) — cập nhật entitlement mới, KHÔNG chặn offline.
- Feature-flag trong app: `platform.entitlements.has('feature.x')`.

---

## Lộ trình triển khai (không big-bang; mỗi bước verify được)

**GĐ 1 — Kernel + contract (nền).** Dựng monorepo pnpm+Turbo. `packages/kernel` (AppModule, PlatformContext, ServiceRegistry, EventBus, EntitlementGate — interface + impl tối thiểu). `packages/service-contracts`. Chưa cần app thật. *Verify: unit test contract + 1 mock app.*

**GĐ 2 — device-layout thành lib + device-shell.** Refactor device-layout xuất bản library (chi tiết PHỤ LỤC A). `packages/device-shell` nối `<DeviceLayout>` với kernel registry (inject PlatformContext vào mỗi app). *Verify: web render desktop + 1 mock app dùng platform context.*

**GĐ 3 — Platform adapters + 2 shell mỏng.** `platform-electron` (electron-vite, main process + ServiceManager + adapter IPC) và `platform-web` (Vite SPA + adapter HTTP). `apps/shell-electron` + `apps/shell-web` render cùng renderer. *Verify: cùng 1 mock app chạy được cả `electron dev` lẫn web dev.*

**GĐ 4 — Port backend Trao Bằng.** Copy `apps/slide/electron/*` (socket-server WS8765, http-server 8080, python-server, ipc 78 handler, pregen-queue, stores...) + `apps/tts-service` Python vào sky-app, sau `TtsPort`/`DataPort`/`DisplayPort` của `platform-electron`. Giữ preload re-expose `window.slide` để 117 call-site chạy nguyên (bọc port dần). *Verify: main khởi động đủ service.*

**GĐ 5 — Trao Bằng thành module.** Port `apps/slide/src/control` → `modules/trao-bang` (React 18→**19**), bọc `ControlApp` thành `AppModule.render`. Backdrop → `modules/trao-bang-backdrop` (BrowserWindow kiosk riêng, ngoài device-layout, state qua Socket.IO). Xử lý **style isolation** Tailwind v4 (device-layout `@theme` vs Slide `@theme` — scope container/`@layer`). *Verify end-to-end vs apps/slide hiện tại: mở desktop → app Trao Bằng → import/sync → quét mã → Backdrop màn ngoài → TTS đọc tên. Chạy `env -u ELECTRON_RUN_AS_NODE npx electron-vite dev`.*

**GĐ 6 — TTS Studio + Licensing thật.** `modules/tts-studio` (tách UI cấu hình TTS shared). Cài `packages/licensing` verify Ed25519 + EntitlementGate gate app/feature. *Verify: app bị khóa khi thiếu entitlement; TTS đọc được từ tts-studio độc lập.*

**GĐ 7 — Web parity (tùy mức độ).** `platform-web` adapter thật cho các port khả thi trên web (TTS qua backend, data qua REST). App không hỗ trợ web (cần secondary-display/card-reader) degrade rõ ràng. *Verify: mở desktop trên browser, chạy app web-compatible.*

---

## PHỤ LỤC A — Refactor device-layout thành library (giữ song song Next.js)

Đã xác minh khả thi rẻ: 2/130 file dùng Next API (`src/app/page.tsx` `next/navigation`, `Taskbar.tsx` `next/image`); 96/130 đã `'use client'`; lõi (`components/hooks/store/config/types`) React/Zustand thuần; Tailwind v4 `@import "tailwindcss"` + `@theme`/`@custom-variant` inline (không config file) → khớp `@tailwindcss/vite`.

- **Giữ Next.js** (`src/app/`, `next.config.ts`, next-pwa) chạy web như cũ — không regression.
- **Thêm pipeline Vite lib**: `vite.config.ts` (`build.lib`, entry `src/lib.tsx`, external react), `@tailwindcss/vite`, **bỏ PWA** ở bản lib.
- **Mở rộng để nhận app ngoài** (3 điểm nối đã trace):
  - `AppConfig` (`src/types/app.ts`) thêm `render?: React.ComponentType` (component truyền thẳng, không qua registry key).
  - `AppRegistry.tsx:49` — ưu tiên `appConfig.render`, fallback `APP_COMPONENTS[component]`.
  - `ThemeProvider.tsx:52` — bỏ hardcode `registerApps(APPS_CONFIG)`, nhận app + `assetBaseUrl` + PlatformContext qua prop/context của `<DeviceLayout>`.
  - `AppViewportProvider` (`AppRegistry.tsx:60`) — điểm inject PlatformContext cho mỗi app.
- **Asset override**: `wallpapers.config.ts` + `Wallpaper.tsx`/`WallpaperPicker.tsx`/`LockScreen.tsx` nhận `assetBaseUrl` (default '' giữ hành vi Next).
- **Sửa 2 file Next-specific** để chạy cả Vite (state-redirect thay `next/navigation`; `<img>` thay `next/image`) — bản Next vẫn chạy.
- `package.json`: script `build:lib`, `exports`/`types` → `dist-lib/`, tên `@sonth87/device-layout`.

*Verify: `pnpm dev` (Next) chạy y hệt (regression); `vite build --mode lib` ra ESM+d.ts+css; test app nhỏ import `<DeviceLayout>`.*

---

## Rủi ro & lưu ý

- **Over-engineering sớm.** Kernel/ports/licensing là đầu tư lớn. Giảm rủi ro: GĐ1-3 chỉ dựng **interface + impl tối thiểu + 1 mock app**, chưa port Slide — nếu contract sai, sửa khi còn rẻ. Chỉ khi mock app chạy cả 2 môi trường mới port Slide thật.
- **Tailwind v4 style leakage** (device-layout `@theme` vs Slide `@theme`) — rủi ro tích hợp chính, xử lý GĐ5 (scope/`@layer`).
- **React 19 vs 18**: nâng Slide 18→19 (framer-motion/zustand/shadcn/sonner/i18next đều hỗ trợ).
- **`window.slide` bridge** (117 call-site/30 file, 78 IPC + 7 event-listener): giữ tên trong preload để chạy nguyên, bọc `TtsPort`/`DataPort` dần — không codemod 1 lần.
- **2 server + Python** (WS8765/HTTP8080/TTS) do shell-electron main giữ; port động tránh va chạm.
- **Backdrop** không thuộc device-layout — BrowserWindow kiosk riêng.
- **Web degrade**: secondary-display/card-reader không có trên web → capability check ẩn tính năng, không crash.
- **Licensing không phải chống crack tuyệt đối** — Ed25519 offline verify ngăn sửa entitlement thường; xác định rõ mức đe dọa để không over-invest.

## Quyết định đã chốt
- **device-layout**: giữ **repo riêng** (tái dùng nhiều dự án), build lib rồi tích hợp vào sky-app dạng **dependency** (`@sonth87/device-layout`) — không submodule, không copy source. sky-app pin version.

## Quyết định còn mở lúc lập kế hoạch (đã giải quyết dần qua từng GĐ — xem history.md)
- Backend cho bản Web (TTS/data): dùng lại tts-service Python deploy server, hay backend riêng?
- Cơ chế publish/version device-layout lib: npm registry riêng, hay pack tarball pin theo version?
- Cấp phát license key: hạ tầng gen/ký key (CLI nội bộ?) — GĐ6.

---

## Kết quả thật so với kế hoạch (tóm tắt — chi tiết đầy đủ ở history.md)

Toàn bộ GĐ1-7 đã hoàn thành đúng thứ tự đề ra, verify xanh từng bước, không big-bang. Tên module `trao-bang`/`trao-bang-backdrop` trong kế hoạch gốc thực tế đổi thành `ceremony`/`ceremony-backdrop` khi triển khai. Chi tiết từng giai đoạn, ngày tháng, bug đã gặp và fix: xem các mục `## 2026-07-11 — Giai đoạn N...` và `## 2026-07-12 — Giai đoạn N...` trong [`docs/dev/history.md`](../../dev/history.md).

Phát hiện trong quá trình audit GĐ7.5 (xem [`docs/roadmap/plans/`](./) mục audit): một số bước wiring trong GĐ4/GĐ5 (port backend) đã bị sót so với bản gốc `trao-bang-tot-nghiep-2026` — không phải sai lệch với *kế hoạch* này (kế hoạch không đặc tả từng dòng code), mà là sai lệch khi *thực thi* port. Xem chi tiết trong plan audit GĐ7.5 tương ứng.
