# 2026-07-11 — Giai đoạn 1: Kernel + contract implement xong, verify xanh

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
