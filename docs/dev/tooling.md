# Tooling — Skills, MCP, công cụ dev

> Ghi lại công cụ hỗ trợ phát triển: AI skills riêng repo, MCP servers, script dev. Cập nhật khi thêm công cụ.

## AI Skills (Claude Code)

Skills riêng cho repo đặt ở `.claude/skills/` *(chưa có — thêm khi cần)*.

Skills dự kiến hữu ích cho Sky-App:
- `scaffold-app` — sinh khung 1 app con mới (`modules/*`) theo [guides/adding-an-app.md](../guides/adding-an-app.md).
- `add-port` — sinh port + 2 adapter stub theo [guides/ports-and-adapters.md](../guides/ports-and-adapters.md).

Khi tạo skill mới: ghi mục đích + phạm vi vào đây.

## MCP servers

Cấu hình MCP ở `.claude/settings.json` hoặc `.mcp.json` *(chưa có)*.

MCP có thể cần trong tương lai:
- Truy cập **license server** (cấp/kiểm entitlement) — khi làm GĐ6.
- Truy cập **backend web** (cho bản web parity) — GĐ7.

Khi thêm MCP: ghi tên server + mục đích + scope quyền vào đây (để AI/dev sau biết công cụ nào tồn tại và dùng khi nào).

## Scripts dev

| Lệnh | Việc |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` toàn workspace (Turbo) |
| `pnpm test` | chạy test toàn workspace (Turbo, vitest mỗi package) |
| `pnpm changeset` | tạo changeset ([dev/versioning.md](./versioning.md)) |
| `pnpm dev:electron` *(dự kiến, chưa có shell-electron)* | chạy `shell-electron` (`env -u ELECTRON_RUN_AS_NODE electron-vite dev`) |
| `pnpm dev:web` *(dự kiến, chưa có shell-web)* | chạy `shell-web` (`vite dev`) |
| `pnpm lint` *(dự kiến, chưa cấu hình eslint)* | eslint |

## device-layout dependency (git tag)

`@sonth87/device-layout` không phải workspace member — nó là repo riêng ([github.com/sonth87/device-layout](https://github.com/sonth87/device-layout)), cài vào 4 chỗ (`apps/shell-electron`, `apps/shell-web`, `packages/device-shell`, `modules/ceremony`) qua **git dependency**: `"github:sonth87/device-layout#v0.1.0"`. `dist-lib/` (bản build Vite lib) được **commit vào git** repo device-layout, nên pnpm resolve trực tiếp từ git không cần build lại — sky-app KHÔNG cài devDependencies (~583MB Next.js) của device-layout. Xem `docs/architecture/overview.md` §6 + [dev/history/2026-07-14-danh-gia-device-layout-git-dependency.md](./history/2026-07-14-danh-gia-device-layout-git-dependency.md).

**Cập nhật device-layout** (quy trình ở repo device-layout, không phải sky-app): sửa source → `pnpm build:lib` → commit cả `dist-lib/` → tạo tag mới (`v0.1.1`...) → push tag. Rồi ở sky-app đổi `#v0.1.0` → `#v0.1.1` trong 4 `package.json` + `pnpm install`. Version tường minh qua tag — sky-app luôn biết đang dùng bản device-layout nào.

**Bẫy đã gặp — trùng phiên bản React:** vì device-layout build sẵn thành bundle (đóng gói `react-dom` runtime calls), nếu workspace có 2 phiên bản `react`/`react-dom` khác nhau (vd một package ghim `^19.2.4`, package khác resolve `19.2.7`), React sẽ báo "Invalid hook call" khi component từ 2 bundle khác nhau render lồng nhau. Root `package.json` có `pnpm.overrides` ép cả workspace dùng đúng 1 version — khi thêm package mới dùng React, không ghim version khác với override đó.

## Lưu ý môi trường

- **Electron dev**: phải chạy với `env -u ELECTRON_RUN_AS_NODE` để tránh crash `app.getPath undefined` (bài học từ dự án Trao Bằng gốc).
- **Python TTS service**: yêu cầu Python 3.12/3.11/3.10 (soxr không có wheel cho 3.13/3.14) — xem tài liệu TTS bên repo trao-bang gốc khi port service.
