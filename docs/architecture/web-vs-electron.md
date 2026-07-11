# Web vs Electron — 2 môi trường, 1 codebase

> Sky-App chạy trên **cả Web lẫn Electron** từ cùng một codebase. Tài liệu này giải thích *cái gì khác nhau*, *cái gì degrade*, và *quyết định đặt code ở đâu*.

## Nguyên tắc: khác biệt nằm ở ADAPTER, không ở app

Code app (`modules/*`) và renderer viết **một lần**, trung lập môi trường. Sự khác biệt Web/Electron bị **cô lập** trong 2 package adapter:

```
             modules/*  (viết 1 lần, không biết đang chạy đâu)
                 │  gọi qua port (PlatformContext)
        ┌────────┴─────────┐
        ▼                  ▼
platform-electron    platform-web
  (IPC/native)        (HTTP/browser)
        │                  │
    apps/shell-electron  apps/shell-web
```

App hỏi Platform "capability X có không?" → tự quyết hiển thị/ẩn/degrade. **Không** `if (isElectron)` rải rác trong code app.

## Bảng port: Electron vs Web

| Port | Electron adapter | Web adapter | Web thiếu → app làm gì |
|---|---|---|---|
| `TtsPort` | client → local Python service (IPC) | HTTP → backend TTS service | cần backend; nếu chưa có → ẩn TTS |
| `DataPort` (import/sync SV) | IPC → store local (fs) | REST API backend | cần backend |
| `DisplayPort` (Backdrop màn ngoài) | BrowserWindow kiosk màn phụ | popup/tab, hoặc **không khả dụng** | ẩn nút "mở màn phụ", chỉ preview |
| `CardReaderPort` (quét thẻ) | native HID/serial qua main | WebHID (nếu browser hỗ trợ) hoặc không | ẩn tính năng quét, chỉ nhập tay |
| `FsPort` | fs thật | OPFS/IndexedDB hoặc backend | lưu tạm trình duyệt |
| `LicensePort` | license file + OS keystore | license server | verify online |
| `NetworkPort` | fetch/undici | fetch | giống nhau |

## Capabilities

Mỗi app khai `requiredCapabilities` trong `AppModule`. Platform cung cấp `platform.capabilities.has('secondary-display')`. App dùng để:
- **Ẩn UI** không dùng được (vd nút Backdrop trên web không có màn phụ).
- **Chặn mở app** nếu thiếu capability cốt lõi (launcher hiện app mờ + lý do).
- **Chọn nhánh triển khai** (vd TTS: có `tts-local` → client; không → gọi backend).

Danh sách capability chuẩn: xem [reference/contract-reference.md](../reference/contract-reference.md) §Capability.

## Đánh đổi đã chấp nhận

- **Một số tính năng chỉ có ở Electron** (màn phụ Backdrop full-screen kiosk, quét thẻ HID, TTS chạy offline local). Trên web: degrade hoặc cần backend.
- **TTS triển khai 2 lần về mặt vận chuyển**: Electron gọi Python service local qua IPC; Web gọi cùng service đó nhưng deploy phía backend qua HTTP. *Logic nghiệp vụ TTS (template, điều kiện giọng) vẫn dùng chung* — chỉ tầng vận chuyển khác (đó chính là điều port che đi).
- **Offline**: Electron offline hoàn toàn (service local); Web offline giới hạn (chỉ app không cần backend, hoặc cache).

## Quyết định "đặt code ở đâu"

| Code kiểu gì | Đặt ở |
|---|---|
| UI + logic nghiệp vụ app | `modules/<app>/` (trung lập môi trường) |
| Interface truy cập môi trường | `packages/service-contracts/` (port) |
| Cách làm port đó bằng Electron | `packages/platform-electron/` |
| Cách làm port đó bằng Web | `packages/platform-web/` |
| Chỉ khác nhau ở entry/bootstrap | `apps/shell-electron` vs `apps/shell-web` |

> Nếu bạn thấy mình viết `if (window.electron)` trong `modules/*` → SAI. Đưa nhánh đó ra sau một port. Xem [guides/ports-and-adapters.md](../guides/ports-and-adapters.md).
