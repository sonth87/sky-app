# Kiến trúc tổng quan Sky-App

> Tài liệu **kiến trúc hệ thống** — tầm nhìn, nguyên tắc, monorepo layout, các trục thiết kế cốt lõi, lộ trình. Đây là tài liệu gốc; chi tiết thao tác nằm ở [guides/](../guides/), interface chính xác ở [reference/contract-reference.md](../reference/contract-reference.md).
>
> **Trạng thái:** thiết kế — chưa triển khai code.
>
> **Nguồn gốc:** tiến hóa từ định hướng multi-app của dự án `trao-bang-tot-nghiep-2026` (`docs/multi-verse.md` bên repo đó), nâng từ "Electron shell 1-process" lên "nền tảng web+electron, online+offline, có licensing".

---

## 1. Tầm nhìn

Sky-App là một **nền tảng multi-app** (không phải 1 app), dùng [`device-layout`](https://github.com/sonth87/device-layout) làm lớp visualize (cửa sổ/dock/menubar kiểu desktop OS). Ceremony (trước đây gọi là Trao Bằng, port từ dự án `apps/slide`) + TTS chỉ là **2 app đầu tiên** trong nhiều app/service tích hợp dần.

**Yêu cầu nền tảng:**
1. **Chạy cả Web lẫn Electron** — isomorphic-first: 1 codebase, 2 runtime adapter. Đánh đổi: một số tính năng chỉ có ở 1 môi trường, hoặc triển khai 2 lần (vd TTS: Electron = client gọi local service; Web = gọi backend service). Chi tiết: [web-vs-electron.md](./web-vs-electron.md).
2. **Online + Offline** — offline-first, không bắt buộc mạng để chạy app đã cấp quyền.
3. **License/activation theo tính năng** — entitlement gating từng app/feature, verify offline-capable (ký số + refresh online). Chi tiết: [guides/licensing-entitlement.md](../guides/licensing-entitlement.md).
4. **Dễ mở rộng & tích hợp giữa app con** — thêm app không sửa core; app giao tiếp qua contract. **Ưu tiên số 1.**
5. Ceremony vẫn hỗ trợ đầy đủ **Control + Backdrop** như hiện tại.

---

## 2. Nguyên tắc kiến trúc

> Đây là các ràng buộc BẤT DI BẤT DỊCH. AI agent xem thêm [`AGENTS.md`](../../AGENTS.md) §2.

1. **Ports & Adapters (Hexagonal) ở tâm.** Mọi app/service viết theo **interface trung lập môi trường** (port). Runtime cấp **adapter**. App KHÔNG gọi `window.*`/`ipcRenderer`/`fetch` trực tiếp — gọi qua port do Platform inject.
2. **Capability-based.** Mỗi app khai **capabilities cần** (`fs`, `tts`, `card-reader`, `secondary-display`...). Platform mỗi môi trường trả lời cái nào có; app tự degrade nếu thiếu.
3. **Offline-first, local-first registry.** Danh sách app + entitlement resolve được **offline**. Online chỉ *refresh*.
4. **Core không biết app cụ thể.** `packages/kernel` chỉ biết contract + service registry. Thêm app = thêm package, không sửa core.
5. **App độc lập, giao tiếp qua contract.** Không import chéo code app; giao tiếp qua **EventBus** (sticky/replay) + **ServiceRegistry** (typed). Chia sẻ chỉ qua `packages/*`.
6. **Tách dần, không big-bang.** Các app hiện có chạy y hệt sau mỗi bước.

---

## 3. Monorepo layout

```
sky-app/  (pnpm workspace + Turborepo)
├── apps/
│   ├── shell-electron/   ← Electron host (main + preload + renderer bootstrap)
│   ├── shell-web/        ← Web host (Vite SPA) — cùng renderer, adapter web
│   └── tts-service/      ← Python TTS service (HTTP)
│
├── packages/
│   ├── kernel/           ← 🔑 CORE: AppModule, PlatformContext, ServiceRegistry,
│   │                        EventBus, EntitlementGate, CapabilityMap. Không phụ thuộc app/env.
│   ├── platform-electron/← Adapter Electron: port → IPC/preload/native
│   ├── platform-web/     ← Adapter Web: port → HTTP/backend/browser API
│   ├── device-shell/     ← Wrapper device-layout + nối kernel registry (dep @sonth87/device-layout)
│   ├── ui/               ← shadcn/ui primitives + tokens dùng chung (tsup)
│   ├── service-contracts/← Interface port: TtsPort, DataPort, DisplayPort, LicensePort...
│   ├── licensing/        ← Entitlement verify (Ed25519 offline + online refresh)
│   └── build-config/     ← Vite/electron-vite/tsup config factory (build kernel)
│
├── modules/              ← APP con (mỗi app = 1 package implement AppModule)
│   ├── ceremony/         ← Control UI (trước đây gọi là Trao Bằng, port từ apps/slide)
│   ├── ceremony-backdrop/← Backdrop renderer (BrowserWindow/tab riêng)
│   └── tts-studio/       ← UI cấu hình TTS
```

Ranh giới chi tiết chung-vs-riêng: [shared-vs-per-app.md](./shared-vs-per-app.md).

Chiều phụ thuộc (1 chiều, không vòng): `modules/* → packages/{ui,service-contracts,device-shell} → packages/kernel`. `platform-*` implement contract của `kernel`/`service-contracts`, chỉ được nạp ở tầng `apps/shell-*`.

---

## 4. Các trục thiết kế cốt lõi

### 4.1 AppModule contract
Mỗi app con implement `AppModule` (id, name, icon, window metadata, `requiredCapabilities`, `requiredServices`, `entitlement`, `render`, `activate/deactivate`). `PlatformContext` inject vào mỗi app qua React context. Interface đầy đủ: [reference/contract-reference.md](../reference/contract-reference.md). Cách thêm app: [guides/adding-an-app.md](../guides/adding-an-app.md).

### 4.2 Ports & Adapters
`service-contracts` định nghĩa port trung lập; `platform-electron`/`platform-web` implement. App chỉ thấy port. Bảng port + degrade: [web-vs-electron.md](./web-vs-electron.md). Cách viết port mới: [guides/ports-and-adapters.md](../guides/ports-and-adapters.md).

### 4.3 Service Registry & ServiceManager
- **ServiceManager** (Electron main): spawn/health/restart service Python theo `requiredServices`. 1 instance dùng chung.
- **ServiceRegistry** (kernel): map `serviceId → client (typed port)`. App resolve qua registry.

### 4.4 Inter-app communication
- **EventBus** (kernel): `emit/on/off` + **sticky/replay** cho app mount muộn. Tên event `{appId}:{action}` | `platform:{action}`.
- **Typed service call**: app expose service cho app khác qua ServiceRegistry.

### 4.5 Licensing / Entitlement
License ký **Ed25519** chứa `{ entitlements[], expiry, deviceBinding? }`, verify **offline**. `EntitlementGate` chặn mở app/feature khi thiếu. Chi tiết: [guides/licensing-entitlement.md](../guides/licensing-entitlement.md).

---

## 5. Lộ trình triển khai (không big-bang; mỗi bước verify được)

| GĐ | Nội dung | Verify |
|---|---|---|
| **1** | Kernel + contract: monorepo, `packages/kernel` (interface + impl tối thiểu), `service-contracts` | unit test contract + 1 mock app |
| **2** | device-layout thành lib + `packages/device-shell` nối kernel registry | web render desktop + mock app dùng platform context |
| **3** | `platform-electron` + `platform-web` + 2 shell mỏng render cùng renderer | 1 mock app chạy cả electron dev lẫn web dev |
| **4** | Port backend Ceremony (socket/http/python/ipc) sau các port | main khởi động đủ service |
| **5** | Ceremony thành module (React 18→19), Backdrop kiosk riêng, xử lý style isolation | end-to-end vs `apps/slide` gốc: quét mã → backdrop → TTS |
| **6** | TTS Studio tách + Licensing thật (Ed25519 + EntitlementGate) | app khóa khi thiếu entitlement |
| **7** | Web parity: adapter web thật cho port khả thi; app không hỗ trợ web degrade | mở desktop trên browser, chạy app web-compatible |

**Nguyên tắc giảm rủi ro:** GĐ1-3 chỉ dựng interface + impl tối thiểu + **1 mock app**, CHƯA port Slide. Chỉ khi mock app chạy cả 2 môi trường mới port app thật — nếu contract sai, sửa khi còn rẻ.

---

## 6. Quyết định & rủi ro chính

**Đã chốt:** ports&adapters · entitlement Ed25519 offline · monorepo pnpm+Turbo · React 19/shadcn/Tailwind v4/TanStack · **KHÔNG Module Federation** (offline-first → static bundle) · device-layout giữ repo riêng, tích hợp dạng **dependency**.

**Rủi ro chính:**
- **Over-engineering sớm** → giảm bằng mock-app-first (GĐ1-3).
- **Tailwind v4 style leakage** (device-layout `@theme` vs app `@theme`) → scope/`@layer`, xử lý GĐ5.
- **React 19 vs 18** (Slide) → nâng 18→19.
- **`window.slide` bridge** Slide (117 call-site, 78 IPC + 7 event-listener) → giữ tên trong preload, bọc port dần.
- **Licensing không chống crack tuyệt đối** — Ed25519 ngăn sửa entitlement thường; không over-invest.

**Còn mở:** backend web (reuse tts-service hay riêng?) · publish/version device-layout lib · hạ tầng cấp phát license key.

*Lịch sử quyết định chi tiết: [dev/history.md](../dev/history.md).*
