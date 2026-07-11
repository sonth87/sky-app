# Shared vs Per-app — Ranh giới thành phần chung và riêng

> Quyết định "code này để `packages/` (dùng chung) hay `modules/` (riêng app)?" là quyết định kiến trúc quan trọng nhất khi mở rộng. Tài liệu này đặt ra ranh giới rõ ràng.

## Ba tầng

```
┌─ packages/kernel ──────────────────────────────────────┐
│  Contract thuần: AppModule, PlatformContext,           │  ← KHÔNG biết app nào,
│  ServiceRegistry, EventBus, EntitlementGate, Capability │     KHÔNG biết môi trường
└────────────────────────────────────────────────────────┘
            ▲                              ▲
┌───────────┴──────────┐      ┌────────────┴───────────────┐
│ packages/ (shared)   │      │ packages/platform-* (env)  │
│  ui, service-contracts│      │  implement port bằng       │
│  device-shell,       │      │  Electron / Web            │
│  licensing, build-cfg│      └────────────────────────────┘
└──────────────────────┘
            ▲
┌───────────┴──────────────────────────────────┐
│ modules/ (per-app)                            │  ← nghiệp vụ cụ thể 1 app
│  trao-bang, tts-studio, ...                   │
└───────────────────────────────────────────────┘
```

## Bảng phân loại

| Thành phần | Tầng | Lý do |
|---|---|---|
| Contract/interface (AppModule, port...) | `kernel` / `service-contracts` | mọi app tuân theo, không phụ thuộc app |
| Window manager, dock, launcher (device-layout) | `device-shell` (shared) | khung chung mọi app |
| shadcn primitives, design tokens | `ui` (shared) | đồng nhất UI toàn nền tảng |
| Cấu hình service (device/engine/clone giọng TTS) | shared (thuộc service, mọi app dùng) | config service share được |
| License verify, EntitlementGate | `licensing` / `kernel` (shared) | gating chung |
| **Template câu đọc theo field sinh viên** | `modules/trao-bang` | nghiệp vụ Trao Bằng |
| **Điều kiện phân giọng theo thuộc tính SV** | `modules/trao-bang` | nghiệp vụ |
| **Pregen theo danh sách SV/batch** | `modules/trao-bang` | gắn dữ liệu 1 app |
| **State on-stage / pending (backdrop)** | `modules/trao-bang` | "trao bằng" đậm, đừng ép thành khung chung |
| UI nhập text tự do → xuất audio | `modules/tts-studio` | dùng service TTS chung, nhưng là app riêng |

## Quy tắc quyết định (checklist)

Đặt vào **shared (`packages/`)** khi TẤT CẢ đúng:
- [ ] Nhiều app dùng được (hoặc sẽ dùng).
- [ ] Không phụ thuộc dữ liệu/nghiệp vụ của 1 app cụ thể.
- [ ] Interface ổn định, ít đổi theo nhu cầu 1 app.

Đặt vào **per-app (`modules/`)** khi BẤT KỲ đúng:
- [ ] Gắn với model dữ liệu của app đó (Student, ceremony...).
- [ ] Là quy tắc nghiệp vụ riêng.
- [ ] Chỉ app đó cần.

## Cảnh báo: đừng tổng quát hóa sớm

- **`socket-server` + state on-stage/pending của Trao Bằng** là "trao bằng" đậm — giữ trong `modules/trao-bang`, đừng ép thành khung chung ngay.
- **Pregen queue** bị trộn: phần "hàng đợi sinh audio" có thể shared, phần "theo SV/batch/template" là module. Tách cẩn thận khi thực sự có app thứ 2 cần.
- Nguyên tắc: **chỉ kéo lên shared khi có app thứ 2 thật sự dùng**, không phỏng đoán.

## Cách app dùng chung mà không import chéo

App A cần dữ liệu/chức năng của app B → KHÔNG `import` code app B. Thay vào đó:
1. App B **expose service** qua `ServiceRegistry` (typed).
2. App A resolve service đó qua `platform.services.get('...')`.
3. Hoặc giao tiếp sự kiện qua **EventBus** (sticky/replay).

Xem [reference/contract-reference.md](../reference/contract-reference.md) §ServiceRegistry, §EventBus.
