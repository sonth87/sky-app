# 2026-07-12 — Giai đoạn 6 (phần 1): Licensing thật — packages/licensing + gate dock hoạt động end-to-end

**Quyết định:** Chỉ làm phần Licensing của GĐ6, **hoãn `modules/tts-studio`**. Lý do: UI cấu hình TTS hiện nằm sâu trong Ceremony Control (~1.860 dòng qua 7 component, dùng chung store/socket) — tách thành module độc lập lúc này là refactor lớn dựa trên suy đoán (chỉ có 1 app dùng TTS, chưa có điểm dữ liệu thứ 2 để biết đúng ranh giới interface). Giữ nguyên trong Ceremony, tách khi có app thứ 2 thật cần dùng chung. Licensing không phụ thuộc quyết định này, có giá trị độc lập, rủi ro thấp.

**`packages/licensing`** (mới) — verify Ed25519 offline theo đúng thiết kế đã chốt ở `docs/guides/licensing-entitlement.md`:
- Dùng **`@noble/ed25519`** (không phải `node:crypto`) vì cần chạy được cả Electron renderer lẫn Web (browser không có `node:crypto`).
- `verify.ts`: license key = `base64url(JSON payload) + "." + base64url(signature)`, verify chữ ký trên UTF-8 bytes của JSON payload (không re-serialize sau khi parse — tránh lệch nếu key order/whitespace khác giữa lúc ký và verify).
- `license.ts`: `isPayloadValid()` tách riêng khỏi verify chữ ký — kiểm expiry + deviceBinding, nhận `now`/`deviceId` để test được (không đọc `Date.now()`/thiết bị thật ngầm).
- `license-port.ts`: `createLicensePort()` nhận `LicenseStorage` (chỉ `read()`/`write()`) làm tham số — package không tự chạm fs/localStorage, đúng ports & adapters. `refresh()` offline-first: lỗi mạng/server hoặc license mới không hợp lệ đều fallback về license cũ đang verify được, không throw.
- `sign.ts`: chỉ dùng phía phát hành (CLI/test) — `generateLicenseKeyPair()` + `signLicense()`.
- 21 test (round-trip, tamper detection, wrong-key rejection, expiry, deviceBinding, storage side-effect, refresh offline-first).

**Nối vào `packages/device-shell`**: `toDeviceAppConfig()` dùng `createEntitlementGate(platform.entitlements)` set `AppConfig.disabled` theo `app.entitlement`. **Phát hiện hành vi thật khác thiết kế dự kiến khi verify runtime**: guide mô tả app thiếu quyền "hiện mờ + khóa" (học gating của mfe-shell), nhưng device-layout's `IconGrid.tsx:137` (`apps.filter((a) => !a.disabled)`) **lọc bỏ hẳn** app disabled khỏi dock — không hiện mờ. Đã sửa comment/guide khớp hành vi thật thay vì sửa device-layout (repo riêng, có thể ảnh hưởng dự án khác dùng chung lib) — gate vẫn đúng chức năng (app không license không mở được), chỉ khác UX (ẩn thay vì mờ).

**`createElectronPlatform` đổi thành `async`** — quyết định so 2 phương án: (A) async, verify license trước `render()`; (B) `EntitlementSet` reactive (`subscribe()`) để không chặn UI. Chọn (A): đọc + verify license là I/O file local (không gọi mạng), độ trễ không đáng kể so với các bước bootstrap Electron khác; (B) thêm độ phức tạp thật (sửa kernel contract, `useSyncExternalStore`) để giải quyết vấn đề chưa có use case cụ thể (đổi license giữa chừng không cần restart) — để dành đến khi cần thật.

**Electron license storage**: renderer không có fs trực tiếp (contextIsolation) → thêm `kernel:license:read`/`kernel:license:write` IPC handler (`apps/shell-electron/electron/ipc.ts`), đọc/ghi `userData/license.key`. `packages/platform-electron/src/adapters/license.ts`'s `createElectronLicensePort()` gọi qua `window.sky.invoke` (bridge đã có từ GĐ3), dùng chung `createLicensePort()` từ `packages/licensing`.

**Dev key + script cấp license**: `apps/shell-electron/src/license-config.ts` nhúng 1 **DEV public key** (ghi rõ KHÔNG phải key sản xuất thật). `scripts/gen-dev-license.mjs` ký license bằng DEV private key tương ứng — chỉ để test/dev, key sản xuất thật phải `generateLicenseKeyPair()` riêng và giữ private key ngoài repo hoàn toàn.

**`ceremonyModule.entitlement = 'app.ceremony'`** — gate thật lần đầu tiên trên 1 app thật, không chỉ hạ tầng.

**Kết quả verify (qua CDP, cả 3 trạng thái)**:
- Không có `license.key` trong `userData` → Ceremony ẩn khỏi dock, Mock App (không khai entitlement) vẫn hiện.
- License hợp lệ với `entitlements: ['app.ceremony']` → Ceremony xuất hiện lại.
- License hợp lệ (chữ ký đúng) nhưng entitlement sai (`app.some-other-app`) → Ceremony vẫn ẩn.

`pnpm -r run typecheck` 13/13 sạch, `pnpm -r run test` **62/62 pass** (14 kernel + 5 mock-app + 6 platform-web + 21 licensing + 8 platform-electron + 8 device-shell), `pnpm -r run build` sạch.

**Còn thiếu (để sau)**: `modules/tts-studio` (hoãn có chủ đích, xem trên). Web (`platform-web`) chưa nối licensing thật — vẫn `entitlements: 'all'`, hợp lý vì chưa có license server (đó là việc GĐ7 web parity). Chưa có CLI cấp phát license "thật" cho khách (chỉ có dev script) — theo đúng "quyết định còn mở" đã ghi trong `docs/architecture/overview.md`.
