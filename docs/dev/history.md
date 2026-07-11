# History — Nhật ký kỹ thuật

> Nhật ký **quyết định kỹ thuật + LÝ DO**, theo thứ tự thời gian (mới nhất trên cùng). Đây KHÔNG phải changelog (thứ đó cho người dùng, do Changesets sinh) — đây là ngữ cảnh cho **dev/AI tương lai** hiểu *vì sao* làm thế.
>
> **Cách ghi:** mỗi mục = ngày + tiêu đề + quyết định + lý do + (liên kết). Ghi khi có quyết định đáng kể (kiến trúc, đổi contract, chọn công nghệ, bỏ hướng đã cân nhắc).

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

**Quyết định:** Dựng Sky-App làm nền tảng multi-app đa môi trường (web+electron, online+offline) có licensing, thay vì chỉ port Trao Bằng vào device-layout.

**Lý do:** Người dùng định hình tầm nhìn lớn hơn — device-layout + Trao Bằng + TTS chỉ là phần đầu; cần nền tảng mở rộng được, tích hợp nhiều app/service, hỗ trợ cả web lẫn electron, có license theo tính năng.

**Các quyết định con:**
- **Ports & Adapters ở tâm** — vì học từ khảo sát `sdk-hub` + `mfe-shell-app`: cả 2 đều thiếu lớp tách môi trường và lifecycle contract tường minh. Sky-App đặt 2 thứ đó làm trung tâm để chạy được web+electron từ 1 codebase.
- **KHÔNG Module Federation** (dù sdk-hub/mfe dùng) — vì offline-first, static bundle đơn giản & tin cậy hơn micro-frontend runtime.
- **device-layout giữ repo riêng, tích hợp dạng dependency** — vì device-layout tái dùng cho nhiều dự án khác; không submodule/copy để tránh lệch nhánh.
- **device-layout giữ song song Next.js + thêm pipeline Vite lib** — xác minh rẻ: chỉ 2/130 file dùng Next API, 96/130 đã 'use client'. Không cần bỏ Next.
- **Licensing Ed25519 offline verify** — hợp offline-first; chấp nhận không chống crack tuyệt đối.
- **Monorepo pnpm+Turbo, React 19/shadcn/Tailwind v4/TanStack** — công nghệ mới, phổ biến, đồng bộ device-layout.

**Facts kỹ thuật quan trọng (dùng khi code):**
- Trao Bằng bridge tên **`window.slide`** (không phải electronAPI), 117 call-site/30 file, 78 IPC channel + 7 event-listener trả unsubscribe. 2 renderer: Control (trong shell) + Backdrop (kiosk riêng, state Socket.IO). Main giữ WS8765+HTTP8080+Python TTS.
- Trao Bằng React 18 → cần nâng 19. Cả Slide + device-layout đều Tailwind v4 `@theme` global → rủi ro style leakage.
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
