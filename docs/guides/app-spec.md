# Sky-App — Quy chuẩn App con (App Spec)

> **Tài liệu gốc, đọc trước tiên khi TẠO MỚI hoặc SỬA một app con.** Đây là "hiến pháp" cho mọi app trong sky-app: một app *là gì*, *phải làm gì*, *không được làm gì*, chạm nền tảng *ra sao*, sống/chết *thế nào*, và verify *bằng cách nào*.
>
> Tài liệu này là **spine** — nó tổng hợp và trỏ tới các guide chuyên sâu, không lặp lại chúng:
> - Contract chính xác (interface): [reference/contract-reference.md](../reference/contract-reference.md) — *nhưng code thật là chân lý cuối cùng, xem §0*.
> - Các bước tạo app: [adding-an-app.md](./adding-an-app.md)
> - CSS/theme: [app-css-theming.md](./app-css-theming.md)
> - Port + adapter môi trường: [ports-and-adapters.md](./ports-and-adapters.md)
> - License gating: [licensing-entitlement.md](./licensing-entitlement.md)
> - Ranh giới shared/per-app: [../architecture/shared-vs-per-app.md](../architecture/shared-vs-per-app.md)
>
> Nếu bạn chỉ có 30 giây: đọc **§7 Checklist** và **§8 Anti-patterns**.

---

## §0. Nguyên tắc trên hết: code thật là chân lý

Nhiều doc trong repo (kể cả contract-reference) mang nhãn "interface DỰ KIẾN". **Luôn đọc code thật trước khi tin doc.** Nguồn chân lý theo thứ tự:

1. `packages/kernel/src/*.ts` — `AppModule`, `PlatformContext`, `Capability`, `EventBus`, `ServiceRegistry`, `EntitlementGate`.
2. `packages/device-shell/src/to-device-app-config.tsx` — nơi `AppModule` được **bọc thật** để cắm vào device-layout (quyết định hành vi dock, focus, gating).
3. `apps/shell-electron/src/main.tsx` + `apps/shell-web/src/main.tsx` — nơi app được **đăng ký thật**.
4. Một app thật đang chạy: `modules/ceremony` (đầy đủ) hoặc `modules/mock-app` (tối giản, dùng verify contract).

> ⚠️ Sai lệch doc-vs-code đã biết:
> - `adding-an-app.md` nói đăng ký app ở `apps/shell-electron/src/apps.ts` — **thực tế** đăng ký thẳng trong `main.tsx` qua prop `apps={[...]}` của `<SkyDeviceLayout>`.
> - `contract-reference.md` §AppContentProps thiếu field `isActive` — **code có** (`app-module.ts`). Xem §3.
> - App thiếu entitlement bị **ẩn khỏi dock** (device-layout lọc bỏ `AppConfig.disabled`), không phải hiện mờ như một số doc gợi ý.

---

## §1. Một app con LÀ GÌ

Một app con là **một package trong `modules/`** export đúng một object `AppModule`. Nó KHÔNG phải một web app độc lập:

- Nó render **bên trong cửa sổ ảo** của device-layout (window manager giả lập desktop-OS: có dock, menu bar, title bar, nhiều app mở song song).
- Nó **chung một trang** (`document`, `:root`, CSS cascade) với shell và mọi app khác đang mở.
- Nó chạm môi trường (fs, TTS, mạng, màn phụ, license) **chỉ qua `PlatformContext`** — không bao giờ gọi `ipcRenderer`, `window.slide`, `fetch(localhost)`, `document.documentElement` trực tiếp.
- Nó **offline-first**: phải chạy được không cần mạng (mạng chỉ để *refresh*, không phải để *chạy*).

**Ranh giới package (bất biến phụ thuộc):**

```
modules/<app>  →  packages/{ui, service-contracts, device-shell}  →  packages/kernel
```

- `modules/*` KHÔNG import `platform-electron`/`platform-web` (chỉ dùng port qua `platform`).
- `modules/*` KHÔNG import lẫn nhau (dùng EventBus/ServiceRegistry — xem §5).
- `kernel` KHÔNG import gì ở trên nó.

---

## §2. Hình dạng bắt buộc: `AppModule`

Mọi app export một `AppModule` (`packages/kernel/src/app-module.ts`):

```ts
export const myAppModule: AppModule = {
  id: 'my-app',                 // slug DUY NHẤT toàn nền tảng — dùng cho dock, EventBus namespace, entitlement
  name: 'My App',               // tên hiển thị (dock/title)
  icon: 'lucide:Star',          // 'lucide:IconName' | '/path/icon.svg'
  category: 'tools',            // nhóm ở launcher (tùy chọn)

  window: {                     // tùy chọn — device-layout dùng khi mở cửa sổ
    defaultSize: { width: 900, height: 600 },
    minSize: { width: 480, height: 360 },
    hasMenuBar: false,          // app tự vẽ menu bar riêng?
    hasStatusBar: false,
    mobileFullscreen: true,     // theme iOS/Android: luôn fullscreen
  },

  requiredCapabilities: ['network'],   // §4 — môi trường CẦN có để app chạy đầy đủ
  requiredServices: [],                // §5 — service (id) phải ready trước khi mở
  entitlement: 'app.my-app',           // §6 — license gate; BỎ QUA = miễn phí, luôn mở

  render: MyApp,                       // §3 — React component nhận AppContentProps
  async activate(ctx) { /* §3 vòng đời */ },
  async deactivate() { /* §3 vòng đời */ },
};
```

**Quy tắc đặt tên:**
- `id`: kebab-case, duy nhất. Là namespace cho EventBus (`my-app:something`) và tiền tố entitlement (`app.my-app`).
- `entitlement`: `app.<id>` cho toàn app; `app.<id>.<feature>` cho feature trả phí bên trong.

---

## §3. Render & vòng đời

### Component render

`render` là `ComponentType<AppContentProps>`. Shell inject 4 thứ:

```ts
interface AppContentProps {
  appId: string;
  windowId: string;
  platform: PlatformContext;   // §4 — cổng DUY NHẤT ra môi trường
  isActive: boolean;           // true khi app này đang focus (R2: chỉ 1 app active/lúc)
}
```

**`isActive` là bắt buộc phải tôn trọng** với mọi side-effect toàn cục:
- Global keyboard listener (vd đầu đọc thẻ HID), OS-menu action handler, hotkey → **chỉ chạy khi `isActive === true`**. Nếu không, app của bạn sẽ nuốt phím/ăn sự kiện của app khác đang focus. (Ceremony gate `useGlobalCardReader({ enabled: isActive })` chính vì vậy.)

### Vòng đời

| Hook | Khi nào chạy | Dùng để |
|---|---|---|
| `activate(ctx)` | app được kích hoạt (mở) | khởi tạo, mở kết nối service, đăng ký listener nền |
| `render` mount/unmount | cửa sổ app mở/đóng | UI + listener gắn với UI (dọn trong `useEffect` cleanup) |
| `deactivate()` | app tắt | dọn listener nền, đóng cửa sổ phụ, ngắt socket |

Quy tắc: **mở gì thì đóng nấy**. Mọi listener đăng ký trong `activate` phải gỡ trong `deactivate`; mọi thứ gắn với UI dọn trong `useEffect` return. Rò rỉ listener giữa các lần mở/đóng là bug thường gặp nhất.

> Lưu ý: `activate`/`deactivate` **tùy chọn**. App thuần UI không có side-effect nền (như mock-app ở mức tối thiểu) có thể bỏ qua.

---

## §4. Chạm môi trường: `PlatformContext` + Capability

`platform` là **cổng duy nhất** ra ngoài. Không có đường tắt.

```ts
interface PlatformContext {
  env: 'electron' | 'web';
  capabilities: CapabilitySet;   // .has('secondary-display')
  services: ServiceRegistry;     // .get<TtsPort>('tts')
  events: EventBus;              // §5 inter-app
  entitlements: EntitlementSet;  // .has('app.x.feature')
  assetUrl(path: string): string;// resolve asset theo môi trường
}
```

### Capability — kiểm TRƯỚC khi dùng, degrade nếu thiếu

`Capability` hiện có (`packages/kernel/src/capability.ts`):

```
network | fs | tts | tts-local | card-reader | secondary-display | keystore
```

- Khai vào `requiredCapabilities` những gì app cần để chạy **đầy đủ**.
- Nhưng vẫn phải **kiểm runtime** và **degrade** khi thiếu — đặc biệt trên web, nhiều capability không có:

```tsx
// ✅ ĐÚNG — kiểm rồi degrade
if (platform.capabilities.has('card-reader')) {
  enableScanner();
} else {
  // ẩn UI quét thẻ, KHÔNG crash
}

// ✅ asset resolve qua platform (Electron resources vs Web public/CDN khác nhau)
<img src={platform.assetUrl('logo.png')} />

// ❌ SAI — gọi thẳng môi trường
window.slide.speak(text);
ipcRenderer.invoke('tts:speak', text);
fetch('http://localhost:5000/tts');
```

> Web thiếu capability là **thiết kế**, không phải bug. App phải *degrade đúng* (ẩn tính năng, không vỡ), không được giả định luôn có `fs`/`tts-local`/`card-reader`/`secondary-display`.

### Port (service-contracts) — cách chạm chức năng thật

Chức năng "nặng" (TTS, đọc/ghi dữ liệu, màn phụ, đọc thẻ, file, license) là **port** trung lập môi trường trong `packages/service-contracts`, implement ở `platform-electron`/`platform-web`. App lấy qua registry:

```ts
const tts = platform.services.get<TtsPort>('tts');
if (tts) await tts.speak('Xin chào');
```

Thêm port mới hoặc adapter môi trường mới → theo [ports-and-adapters.md](./ports-and-adapters.md). **App không tự implement port**, chỉ tiêu thụ.

---

## §5. Giao tiếp giữa các app (KHÔNG import chéo)

App A cần dữ liệu/chức năng app B → **tuyệt đối không** `import` code app B. Hai cơ chế:

**1. ServiceRegistry** — B expose chức năng typed, A tiêu thụ:

```ts
// App B (trong activate): B.register
ctx.services.register<MyPort>('my-app:some-service', impl);
// App A: A.get
const svc = platform.services.get<MyPort>('my-app:some-service');
```

**2. EventBus** — bắn/nghe sự kiện, có **sticky/replay** cho subscriber mount muộn:

```ts
// bắn, giữ 5s để ai mount sau vẫn nhận được
platform.events.emit('ceremony:student-shown', student, { persistMs: 5000 });

// nghe, replay giá trị sticky mới nhất ngay khi đăng ký
const off = platform.events.on('ceremony:student-shown', handler, { replayLatest: true });
// ... nhớ off() khi unmount/deactivate
```

**Quy ước tên sự kiện:** `{appId}:{action}` (vd `ceremony:student-shown`) hoặc `platform:{action}` (vd `platform:license-changed`).

> ⚠️ `EventBus.once()` hiện gọi qua `this.on(...)` — an toàn khi dùng `platform.events.once(...)`, nhưng **vỡ nếu destructure** (`const { once } = platform.events`). Đừng destructure method của EventBus.

---

## §6. License & Entitlement

- App trả phí khai `entitlement: 'app.<id>'`. App miễn phí **bỏ trống** → `canOpen` luôn true.
- Gating tầng 1 (mở app) do device-shell làm tự động: thiếu entitlement → `AppConfig.disabled = true` → **device-layout ẩn app khỏi dock**.
- Gating tầng 2 (feature bên trong app) do **app tự làm**: `platform.entitlements.has('app.<id>.<feature>')` rồi ẩn/khóa UI.
- Verify **offline-capable** (chữ ký Ed25519 + refresh online). App **không** tự verify license — dùng entitlement đã resolve sẵn trong `platform`.

Chi tiết: [licensing-entitlement.md](./licensing-entitlement.md).

---

## §7. CSS & Theme (tóm tắt — chi tiết ở guide riêng)

App chung `document` với shell nên CSS **không tự cô lập**. Bắt buộc (đầy đủ + lý do + verify: [app-css-theming.md](./app-css-theming.md)):

1. Bọc toàn app trong **root class riêng** (`.<app>-root`); mọi biến theme + selector scope dưới nó. KHÔNG `:root`/`<html>`, KHÔNG set `.dark`/`data-theme` lên `document.documentElement`.
2. Nếu dùng Tailwind v4 `@theme`: **re-map `--color-*` trong root class** — nếu không, token emit ra `:root` nơi biến palette chưa tồn tại → **đổi palette không đổi màu**.
3. Root class tạo **containing block** (`transform`/`contain`) cho overlay `position: fixed` — nếu không, modal **tràn lên title bar**.
4. Radix Portal + `createPortal` route vào container root class (giữ theme).
5. Shell host phải `import` CSS của UI library Tailwind v4 (device-layout) + pin `@layer` order.

---

## §8. Đăng ký app vào shell

Đăng ký thật ở **cả hai** entry (`apps/shell-electron/src/main.tsx` và `apps/shell-web/src/main.tsx`), qua prop `apps` của `<SkyDeviceLayout>`:

```tsx
import { myAppModule } from '@sky-app/module-my-app';

<SkyDeviceLayout apps={[ceremonyModule, mockAppModule, myAppModule]} platform={platform} ... />
```

`platform` do `createElectronPlatform()` / `createWebPlatform()` tạo. `SkyDeviceLayout` → `toDeviceAppConfigs()` bọc mỗi `AppModule` thành `AppConfig` của device-layout (gắn `isActive`, gating, window config). **Không sửa core**, chỉ thêm vào mảng.

> Nếu app cần **cửa sổ phụ ngoài device-layout** (như Ceremony's Backdrop kiosk trên màn phụ): đó KHÔNG phải `AppModule` — host mount qua entry riêng (`backdrop.html` + `backdrop-main.tsx`), state đồng bộ qua Socket.IO/EventBus. Đây là use case nâng cao, tham khảo `modules/ceremony/src/backdrop/` + `apps/shell-electron/src/backdrop-main.tsx`.

---

## §9. Use case điển hình (chọn hình mẫu gần nhất rồi mô phỏng)

| App bạn định làm | Hình mẫu | Điểm cần lưu |
|---|---|---|
| UI thuần, không side-effect nền | `modules/mock-app` | Tối giản: chỉ `render`, không cần `activate/deactivate`. |
| App nghiệp vụ đầy đủ (form, dữ liệu, TTS, màn phụ) | `modules/ceremony` | Theme scoped, `isActive` gate card-reader, port TTS/Data, backdrop kiosk. |
| App dùng chung service TTS nhưng nghiệp vụ riêng | `modules/tts-studio` | Tiêu thụ `TtsPort.synthesizeBuffer()` qua registry (buffer thô, không tự phát); nghiệp vụ ở module, service ở shared. |
| App cần dữ liệu từ app khác | — | KHÔNG import chéo → EventBus/ServiceRegistry (§5). |
| App có cửa sổ phụ (màn ngoài) | Ceremony Backdrop | Entry riêng ngoài device-layout, không phải AppModule (§8). |
| App có feature trả phí | Ceremony (`app.ceremony`) | Gate tầng 2 trong app bằng `entitlements.has('app.<id>.<feature>')`. |

---

## §10. Flow: TẠO một app mới (end-to-end)

1. **Xác định tầng** (shared vs per-app): [shared-vs-per-app.md](../architecture/shared-vs-per-app.md). Nghiệp vụ riêng → `modules/`.
2. **Tạo package** `modules/<app>/` (dep đúng chiều: chỉ `packages/*`). Cấu trúc: [adding-an-app.md](./adding-an-app.md) §1.
3. **Implement `AppModule`** (§2) — khai đủ `requiredCapabilities`/`requiredServices`/`entitlement`.
4. **Viết UI** (§3, §4) — chỉ dùng `platform.*`; tôn trọng `isActive`; degrade khi thiếu capability.
5. **CSS/theme** (§7) — scope theo root class TRƯỚC khi viết CSS.
6. **Giao tiếp** (§5) nếu cần dữ liệu app khác — EventBus/ServiceRegistry, không import chéo.
7. **Đăng ký** (§8) vào cả `shell-electron` + `shell-web`.
8. **Capability/entitlement mới** nếu cần: thêm enum + implement 2 platform ([ports-and-adapters.md](./ports-and-adapters.md)); khai license ([licensing-entitlement.md](./licensing-entitlement.md)).
9. **Verify** (§11) ở CẢ Electron và Web.
10. **Ghi lại**: changeset (versioning), `docs/apps/<app>.md` (mô tả nghiệp vụ), 1 file mới trong `dev/history/` nếu là quyết định đáng kể.

## §11. Flow: SỬA một app đang có

1. **Đọc code thật trước** (§0) — đặc biệt `AppModule` của app đó + chỗ nó dùng `platform`/`isActive`/theme.
2. **Bug thuộc app hay thuộc nền tảng?**
   - Thuộc app → sửa trong `modules/<app>`.
   - Thuộc `@sonth87/device-layout` (window chrome, dock, title bar) → **sửa ở repo gốc device-layout**, không vá tạm trong sky-app.
   - Thuộc shared (`packages/*`) → cân nhắc ảnh hưởng mọi app.
3. **Nếu đụng CSS/theme**: nhớ 5 rule §7 — rất nhiều "bug lạ" (kẹt màu, tràn title bar, tooltip lệch, mất theme trong portal) là do vi phạm chúng.
4. **Nếu đụng side-effect toàn cục**: kiểm lại gate `isActive` (§3).
5. **Verify hồi quy** (§11) + cập nhật doc/history nếu thay đổi hành vi.

---

## §12. Verify (bắt buộc, ở CẢ 2 môi trường)

- **Chạy thật**: Electron (`env -u ELECTRON_RUN_AS_NODE npx electron-vite dev` ở `shell-electron`) và Web (`vite dev` ở `shell-web`) → app hiện ở dock, mở được.
- **Degrade**: ở web thiếu capability → tính năng ẩn/khóa đúng, **không crash**.
- **Theme**: đổi theme app → **chỉ vùng app** đổi màu (shell + app khác giữ nguyên); đổi palette → utility class đổi màu; mở modal → **không tràn title bar**; tooltip/menu → đúng vị trí; portal → giữ theme.
- **Focus**: mở 2 app → side-effect toàn cục (phím, menu) chỉ chạy ở app đang focus.
- **Vòng đời**: mở/đóng app nhiều lần → không rò rỉ listener/cửa sổ phụ.
- **Type/test/build sạch**: `pnpm -r run typecheck && pnpm -r run test && pnpm -r run build`.

> Mẹo verify CSS không cần chạy full app: build rồi load CSS đã compile vào Electron offscreen BrowserWindow, đọc `getComputedStyle` — xem [app-css-theming.md](./app-css-theming.md) §Rule 2/3.

---

## §13. Anti-patterns (đừng bao giờ)

- ❌ `import` code của app khác (`modules/a` → `modules/b`). Dùng EventBus/ServiceRegistry.
- ❌ Gọi thẳng môi trường: `window.slide.*`, `ipcRenderer.*`, `fetch('http://localhost...')`. Dùng port qua `platform`.
- ❌ Set theme lên `document.documentElement` / khai biến theme ở `:root`. Scope theo root class.
- ❌ Giả định luôn có `fs`/`tts-local`/`card-reader`/`secondary-display`. Kiểm capability + degrade.
- ❌ Side-effect toàn cục không gate `isActive` (nuốt phím của app khác).
- ❌ Đăng ký listener mà không dọn (rò rỉ giữa các lần mở/đóng).
- ❌ Destructure method của EventBus (`const { once } = events`) — vỡ vì `this`.
- ❌ Vá bug device-layout bằng CSS tạm trong sky-app thay vì sửa ở repo gốc.
- ❌ Kéo nghiệp vụ 1 app lên `packages/` khi chưa có app thứ 2 thật sự cần (tổng quát hóa sớm).

---

## Liên quan

- [adding-an-app.md](./adding-an-app.md) · [app-css-theming.md](./app-css-theming.md) · [ports-and-adapters.md](./ports-and-adapters.md) · [licensing-entitlement.md](./licensing-entitlement.md)
- [../architecture/overview.md](../architecture/overview.md) · [../architecture/shared-vs-per-app.md](../architecture/shared-vs-per-app.md) · [../architecture/web-vs-electron.md](../architecture/web-vs-electron.md)
- [../reference/contract-reference.md](../reference/contract-reference.md) · [../dev/history/](../dev/history/README.md)
