# Contract Reference — Kernel API

> Tham chiếu chính xác các interface cốt lõi của `packages/kernel` + `packages/service-contracts`.
>
> ⚠️ **Đây là interface DỰ KIẾN (chưa code).** Khi kernel được implement (GĐ1), interface thật trong code là nguồn chân lý — cập nhật file này cho khớp. AI: luôn đọc code thật nếu đã tồn tại, đừng chỉ tin file này.

## AppModule

Contract mỗi app con phải implement.

```ts
interface AppModule {
  id: string;                    // slug duy nhất: 'ceremony', 'tts-studio'
  name: string;                  // tên hiển thị ở dock/title
  icon: string;                  // 'lucide:IconName' | '/path/icon.svg'
  category?: string;             // nhóm ở launcher: 'ceremony'|'tools'|...

  window?: {
    defaultSize?: { width: number; height: number };
    minSize?: { width: number; height: number };
    hasMenuBar?: boolean;
    hasStatusBar?: boolean;
    mobileFullscreen?: boolean;  // iOS/Android theme: mở fullscreen
  };

  requiredCapabilities: Capability[];   // môi trường cần có
  requiredServices: string[];           // service phải ready trước khi mở (vd 'tts')
  entitlement?: string;                 // license gate; bỏ = miễn phí

  render: React.ComponentType<AppContentProps>;   // UI trong cửa sổ
  activate?(ctx: PlatformContext): Promise<void>;  // khởi tạo
  deactivate?(): Promise<void>;                    // dọn dẹp
}
```

## AppContentProps

Props inject vào component `render` của mỗi app.

```ts
interface AppContentProps {
  appId: string;
  windowId: string;
  platform: PlatformContext;
}
```

## PlatformContext

Cổng duy nhất app dùng để chạm môi trường/nền tảng. Inject qua React context (bọc mỗi app).

```ts
interface PlatformContext {
  env: 'electron' | 'web';
  capabilities: CapabilitySet;      // .has('secondary-display')
  services: ServiceRegistry;        // .get<TtsPort>('tts')
  events: EventBus;                 // inter-app messaging
  entitlements: EntitlementSet;     // .has('feature.x')
  // tiện ích chung
  assetUrl(path: string): string;   // resolve asset theo môi trường
}
```

## Capability

```ts
type Capability =
  | 'network'
  | 'fs'                 // đọc/ghi file thật
  | 'tts'                // sinh audio TTS
  | 'tts-local'          // TTS chạy local (offline) — Electron
  | 'card-reader'        // quét thẻ/QR phần cứng
  | 'secondary-display'  // màn phụ full-screen (Backdrop kiosk)
  | 'keystore';          // OS keystore cho license

interface CapabilitySet { has(c: Capability): boolean; list(): Capability[]; }
```

## ServiceRegistry

```ts
interface ServiceRegistry {
  get<T>(serviceId: string): T | undefined;   // typed port của service
  register<T>(serviceId: string, impl: T): void;
  has(serviceId: string): boolean;
}
```

App B expose service cho app A qua `register`; A lấy qua `get`. Không import chéo code.

## EventBus

Học từ mfe-shell — có **sticky/replay** cho subscriber mount muộn.

```ts
interface EventBus {
  emit(event: string, data?: unknown, opts?: { persistMs?: number }): void;
  on(event: string, cb: (data: unknown) => void,
     opts?: { replayLatest?: boolean }): () => void;   // trả unsubscribe
  off(event: string, cb: Function): void;
  once(event: string, cb: (data: unknown) => void): void;
}
```

Quy ước tên: `{appId}:{action}` (vd `ceremony:student-shown`) | `platform:{action}` (vd `platform:license-changed`).

## EntitlementSet & EntitlementGate

```ts
interface EntitlementSet { has(entitlement: string): boolean; list(): string[]; }

interface EntitlementGate {
  canOpen(app: AppModule): boolean;         // dùng ở launcher
  reason(app: AppModule): string | null;    // lý do bị khóa (hiển thị)
}
```

## Ports (packages/service-contracts)

Interface trung lập môi trường; implement ở `platform-electron`/`platform-web`. Bảng đầy đủ: [architecture/web-vs-electron.md](../architecture/web-vs-electron.md).

```ts
interface TtsPort {
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  listVoices(): Promise<Voice[]>;
  // ... (chi tiết bổ sung khi implement — port hóa dần từ window.slide.tts:*)
}
interface DataPort { /* import/sync/export dữ liệu app */ }
interface DisplayPort { /* mở/điều khiển màn phụ (Backdrop) */ }
interface CardReaderPort { /* stream sự kiện quét thẻ */ }
interface FsPort { /* đọc/ghi file trừu tượng */ }
interface LicensePort { /* đọc license + verify */ }
```

## Chiều phụ thuộc (bất biến)

```
modules/*  →  packages/{ui, service-contracts, device-shell}  →  packages/kernel
packages/platform-*  implement contract  →  chỉ nạp ở apps/shell-*
```

- `kernel` KHÔNG import bất kỳ thứ gì ở trên nó.
- `modules/*` KHÔNG import `platform-*` trực tiếp (chỉ dùng port qua `platform` context).
- `modules/*` KHÔNG import lẫn nhau.
