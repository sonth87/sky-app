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

## Scripts dev (dự kiến — khi có code)

| Lệnh | Việc |
|---|---|
| `pnpm dev:electron` | chạy `shell-electron` (`env -u ELECTRON_RUN_AS_NODE electron-vite dev`) |
| `pnpm dev:web` | chạy `shell-web` (`vite dev`) |
| `pnpm typecheck` | `tsc --noEmit` toàn workspace (Turbo) |
| `pnpm lint` | eslint |
| `pnpm changeset` | tạo changeset ([dev/versioning.md](./versioning.md)) |

## Lưu ý môi trường

- **Electron dev**: phải chạy với `env -u ELECTRON_RUN_AS_NODE` để tránh crash `app.getPath undefined` (bài học từ dự án Trao Bằng gốc).
- **Python TTS service**: yêu cầu Python 3.12/3.11/3.10 (soxr không có wheel cho 3.13/3.14) — xem tài liệu TTS bên repo trao-bang gốc khi port service.
