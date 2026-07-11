# Sky-App

> **Nền tảng multi-app đa môi trường** — một "desktop OS" chạy được cả **Web** lẫn **Electron**, **online + offline**, nơi mỗi ứng dụng (Ceremony, TTS Studio, ...) là một **app con** cắm vào theo một contract chung. Giao diện dùng [`device-layout`](https://github.com/sonth87/device-layout) để visualize cửa sổ/dock/menubar kiểu desktop.

**Trạng thái:** 🟡 Thiết kế kiến trúc — **chưa triển khai code**. Toàn bộ hiện có là tài liệu định hướng trong [`docs/`](./docs/).

---

## Đọc gì đầu tiên?

| Bạn là... | Đọc |
|---|---|
| 🤖 **AI agent** (Claude, ...) | [`AGENTS.md`](./AGENTS.md) — quy định bắt buộc TRƯỚC KHI làm bất cứ việc gì |
| 🧭 **Người mới / muốn hiểu tổng thể** | [`docs/README.md`](./docs/README.md) — bản đồ điều hướng toàn bộ tài liệu |
| 🏛️ **Muốn hiểu kiến trúc** | [`docs/architecture/overview.md`](./docs/architecture/overview.md) |
| 🧩 **Muốn thêm 1 app con** | [`docs/guides/adding-an-app.md`](./docs/guides/adding-an-app.md) |
| 🔧 **Dev đang code** | [`docs/dev/`](./docs/dev/) — versioning, changelog, quy tắc code |

---

## Là gì / không là gì

**LÀ:** một shell/nền tảng chứa nhiều app + service dùng chung, tách môi trường bằng **ports & adapters** (1 codebase → 2 runtime Web/Electron), có **license/entitlement** gating theo app/feature.

**KHÔNG LÀ:** một ứng dụng đơn. Ceremony (module tổ chức sự kiện, port từ dự án Slide gốc) chỉ là **app con đầu tiên** được migrate sang, không phải toàn bộ dự án.

## Nguồn gốc

Sky-App là bước tiến hóa của định hướng multi-app từ dự án `trao-bang-tot-nghiep-2026` (xem `docs/multi-verse.md` bên repo đó). App Ceremony (nghiệp vụ tổ chức sự kiện/lễ — không gắn tên cụ thể "trao bằng" nữa, vì nền tảng dùng chung cho nhiều loại tổ chức) + TTS được migrate sang đây làm các app con đầu tiên.

## Tech stack

React 19 · TypeScript · Tailwind v4 · shadcn/ui · TanStack Query · Zustand · Electron · Vite / electron-vite · pnpm workspace + Turborepo · Changesets.

## Cấu trúc (dự kiến — chưa scaffold code)

```
apps/       shell-electron, shell-web, tts-service
packages/   kernel, platform-electron, platform-web, device-shell, ui,
            service-contracts, licensing, build-config
modules/    ceremony, ceremony-backdrop, tts-studio   (các app con)
docs/       tài liệu (xem docs/README.md)
```
