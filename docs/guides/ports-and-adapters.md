# Guide: Ports & Adapters — thêm khả năng truy cập môi trường

> Khi app cần làm gì đó với môi trường (đọc file, gọi service, mở màn phụ, quét thẻ...), bạn KHÔNG gọi API môi trường trực tiếp — bạn định nghĩa một **port** rồi implement **adapter** cho Electron và Web.
>
> ⚠️ Code chưa tồn tại — mô tả thiết kế dự kiến.

## Vì sao

Đây là cơ chế cho phép **1 codebase chạy 2 môi trường**. App chỉ thấy interface trung lập (port); môi trường cắm implementation (adapter). Xem lý do tổng: [architecture/web-vs-electron.md](../architecture/web-vs-electron.md).

## Giải phẫu một port

```ts
// packages/service-contracts/src/tts.ts
export interface TtsPort {
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  listVoices(): Promise<Voice[]>;
  // ... chỉ interface, KHÔNG implementation
}
```

Port là **contract thuần** — không import Electron, không import fetch, không biết ai implement.

## Thêm một port mới — 4 bước

### 1. Định nghĩa interface (`packages/service-contracts`)

```ts
// packages/service-contracts/src/my-thing.ts
export interface MyThingPort {
  doIt(input: string): Promise<Result>;
}
```

### 2. Khai capability tương ứng (nếu port có thể vắng mặt)

```ts
// packages/kernel — enum Capability
type Capability = 'fs' | 'tts' | 'card-reader' | 'secondary-display' | 'my-thing' | ...;
```

### 3. Adapter Electron (`packages/platform-electron`)

```ts
// packages/platform-electron/src/adapters/my-thing.ts
import type { MyThingPort } from '@sky-app/service-contracts';

export const electronMyThing: MyThingPort = {
  async doIt(input) {
    return window.sky.invoke('my-thing:doIt', input);  // qua preload IPC
  },
};
```

### 4. Adapter Web (`packages/platform-web`)

```ts
// packages/platform-web/src/adapters/my-thing.ts
export const webMyThing: MyThingPort = {
  async doIt(input) {
    const r = await fetch('/api/my-thing', { method: 'POST', body: input });
    return r.json();
  },
};
// hoặc: null nếu web không hỗ trợ → capability 'my-thing' = false → app degrade
```

Mỗi platform gom adapter vào `PlatformContext` khi khởi tạo shell tương ứng.

## Quy tắc

- **Port trong `service-contracts` KHÔNG được import** Electron/fetch/browser API — chỉ type.
- **Adapter là chỗ DUY NHẤT** được đụng `window.*`, `ipcRenderer`, `fetch`, `fs`.
- Nếu 1 môi trường không làm được port → adapter trả `null`/không đăng ký → capability = `false` → app kiểm `capabilities.has()` và degrade. **Không throw giữa chừng.**
- Port async (`Promise`) kể cả khi Electron làm được đồng bộ — để 2 môi trường cùng shape.

## Trường hợp đặc biệt: Ceremony `window.slide`

Ceremony (trước đây gọi là Trao Bằng, port từ dự án `apps/slide`) hiện có 1 bridge `window.slide` với 78 IPC channel. Chiến lược migrate (GĐ4-5):
1. **Giữ nguyên** `window.slide` trong preload sky-app → 117 call-site chạy không đổi ngay.
2. **Bọc dần** thành `TtsPort`/`DataPort`/`DisplayPort` — thay call-site theo nhóm, không codemod 1 lần.
3. 7 event-listener (`onPregenProgress`...) map sang callback/observable trong port.

Xem [dev/history.md](../dev/history.md) để biết chi tiết bridge Ceremony.

## Anti-pattern (tuyệt đối tránh)

```ts
// ❌ trong modules/*
if (window.electron) { window.slide.speak(t); } else { fetch('/tts', ...); }
// → đưa cả 2 nhánh ra sau TtsPort, app chỉ gọi platform.services.get('tts')?.speak(t)
```
