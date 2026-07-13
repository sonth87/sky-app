# Guide: Thêm một app con mới

> Hướng dẫn **từng bước** tạo 1 app con mới cắm vào nền tảng. Đây là luồng quan trọng nhất cho mục tiêu "dễ mở rộng".
>
> 📖 Đọc [app-spec.md](./app-spec.md) TRƯỚC — đó là quy chuẩn đầy đủ (một app *là gì*, *phải/không được làm gì*, vòng đời, capability, giao tiếp, anti-patterns). Guide này chỉ là các **bước thao tác** cụ thể của flow §10 trong app-spec.
>
> ⚠️ Một số chi tiết dưới là *thiết kế dự kiến* — code thật là chân lý (xem app-spec §0). Ví dụ: đăng ký app thật ở `main.tsx` qua prop `apps={[...]}`, không phải file `apps.ts`.

## Nguyên tắc: thêm app = thêm 1 package, KHÔNG sửa core

Core (`packages/kernel`) và shell không cần biết app mới. App tự khai báo mọi thứ qua `AppModule`.

## Các bước

### 1. Tạo package trong `modules/`

```
modules/my-app/
├── package.json          # @sky-app/module-my-app, dep: @sky-app/kernel, @sky-app/ui
├── src/
│   ├── index.ts          # export const myAppModule: AppModule
│   ├── MyApp.tsx         # UI chính (render trong cửa sổ)
│   └── ...
└── tsconfig.json
```

### 2. Implement `AppModule`

```ts
// modules/my-app/src/index.ts
import type { AppModule } from '@sky-app/kernel';
import { MyApp } from './MyApp';

export const myAppModule: AppModule = {
  id: 'my-app',
  name: 'My App',
  icon: 'lucide:Star',
  category: 'tools',
  window: { defaultSize: { width: 900, height: 600 }, minSize: { width: 480, height: 360 } },

  requiredCapabilities: ['network'],        // cái app cần từ môi trường
  requiredServices: [],                     // service (vd 'tts') cần sẵn sàng
  entitlement: 'app.my-app',                // để license gate (bỏ nếu miễn phí)

  render: MyApp,                            // component nhận AppContentProps
  async activate(ctx) { /* khởi tạo, mở service, đăng ký listener */ },
  async deactivate() { /* dọn listener, đóng cửa sổ phụ */ },
};
```

### 3. Viết UI dùng PlatformContext (KHÔNG gọi môi trường trực tiếp)

```tsx
// modules/my-app/src/MyApp.tsx
import type { AppContentProps } from '@sky-app/kernel';

export function MyApp({ platform }: AppContentProps) {
  // ✅ ĐÚNG: qua port
  const canRead = platform.capabilities.has('card-reader');
  const tts = platform.services.get('tts');           // typed TtsPort | undefined

  // ❌ SAI: window.slide.speak(...), ipcRenderer.invoke(...), fetch('http://localhost...')
  return <div>{/* ... */}</div>;
}
```

### 4. Đăng ký app vào shell

App được truyền vào `<DeviceLayout apps={[...]}>` qua `device-shell`. Thêm module vào danh sách đăng ký của shell (điểm tập trung, không phải sửa core):

```ts
// apps/shell-electron/src/apps.ts  (và tương tự shell-web)
import { ceremonyModule } from '@sky-app/module-ceremony';
import { myAppModule } from '@sky-app/module-my-app';
export const APPS = [ceremonyModule, myAppModule];
```

### 5. (Tùy chọn) Khai capability/entitlement mới

- Nếu app cần capability chưa có → thêm vào enum `Capability` ([reference](../reference/contract-reference.md)) + implement ở cả 2 `platform-*` (hoặc để web trả `false`).
- Nếu app có tính năng trả phí → khai `entitlement` + xem [licensing-entitlement.md](./licensing-entitlement.md).

### 5.5. Scope CSS & theme (BẮT BUỘC nếu app có style riêng)

App render **trong cùng trang** với shell và app khác — CSS không tự cô lập. Phải scope theme theo root class riêng, re-map token `--color-*` của Tailwind, và cho overlay `position: fixed` neo trong vùng nội dung (không tràn title bar). Đây là các bug đã trả giá thật — làm theo [app-css-theming.md](./app-css-theming.md) **trước khi** viết CSS.

### 6. Verify

- Chạy web (`vite dev` ở `shell-web`) và Electron (`electron-vite dev` ở `shell-electron`) → app xuất hiện ở dock, mở được.
- Đổi theme app → chỉ vùng app đổi màu (shell + app khác giữ nguyên); mở modal → không tràn title bar; đổi palette → utility class đổi màu. Xem [app-css-theming.md](./app-css-theming.md).
- Nếu app cần capability web thiếu → kiểm nó **degrade** đúng (ẩn UI, không crash).
- Cập nhật [dev/versioning.md](../dev/versioning.md) + tạo changeset + ghi [dev/history.md](../dev/history.md) nếu là quyết định đáng kể.

## Checklist thêm app

- [ ] Package trong `modules/`, dep đúng chiều (chỉ `packages/*`, không app khác)
- [ ] `AppModule` khai đủ `requiredCapabilities`/`requiredServices`/`entitlement`
- [ ] UI chỉ dùng `platform.*`, không gọi môi trường trực tiếp
- [ ] CSS/theme scope theo root class app — theo [app-css-theming.md](./app-css-theming.md) (không rò rỉ shell, không kẹt màu, overlay không tràn title bar)
- [ ] Đăng ký vào cả `shell-electron` và `shell-web`
- [ ] Chạy được / degrade đúng ở cả 2 môi trường
- [ ] Không import chéo code app khác (dùng EventBus/ServiceRegistry)
- [ ] Changeset + history nếu cần

## Mô tả nghiệp vụ app → đặt ở đâu?

Mỗi app nên có 1 file mô tả nghiệp vụ trong [`docs/apps/<app>.md`](../apps/) (chức năng, dữ liệu, capability cần, entitlement). Xem [docs/apps/](../apps/).
