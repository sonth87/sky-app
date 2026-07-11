# AGENTS.md — Quy định cho AI agent làm việc trong Sky-App

> File này là **hợp đồng bắt buộc** cho mọi AI agent (Claude Code, ...) trước khi đọc/sửa/tạo bất cứ thứ gì trong repo. Đọc hết file này TRƯỚC. Nếu có `CLAUDE.md`, nó chỉ trỏ về đây.

## 0. Trạng thái repo (đọc trước tiên)

Repo đang ở giai đoạn **thiết kế — chưa có code**. Hiện chỉ có `docs/`. Đừng giả định tồn tại `packages/kernel`, `apps/shell-electron`... trong code — chúng mới là **thiết kế trong tài liệu**. Khi bắt đầu code, tuân theo lộ trình ở [`docs/architecture/overview.md`](./docs/architecture/overview.md) §Lộ trình.

## 1. Thứ tự đọc tài liệu bắt buộc

1. File này (AGENTS.md) — quy định làm việc.
2. [`docs/README.md`](./docs/README.md) — bản đồ điều hướng.
3. [`docs/architecture/overview.md`](./docs/architecture/overview.md) — kiến trúc tổng, nguyên tắc.
4. Tài liệu liên quan trực tiếp tới task (guide/reference tương ứng).

**Không đoán kiến trúc từ trí nhớ.** Contract/interface luôn lấy từ [`docs/reference/contract-reference.md`](./docs/reference/contract-reference.md) — nếu code đã tồn tại thì đọc code thật, không tự chế interface.

## 2. Nguyên tắc kiến trúc BẤT DI BẤT DỊCH (vi phạm = sai)

1. **Ports & Adapters.** App/module KHÔNG được gọi trực tiếp `window.*`, `ipcRenderer`, `fetch`, `fs`, Electron API. Mọi truy cập môi trường đi qua **port** do `PlatformContext` inject. Vi phạm phổ biến nhất — luôn kiểm.
2. **Core không biết app cụ thể.** `packages/kernel` KHÔNG được import bất kỳ module/app nào. Phụ thuộc chỉ đi 1 chiều: `modules/* → packages/* → kernel`.
3. **Isomorphic.** Code trong `modules/*` và renderer phải chạy được cả Web lẫn Electron. Thứ chỉ chạy 1 môi trường → đặt sau port + khai `requiredCapabilities`, degrade khi thiếu.
4. **Offline-first.** Không thêm phụ thuộc mạng bắt buộc để chạy app đã cấp quyền. Online chỉ để refresh.
5. **Không import chéo giữa app.** App giao tiếp qua EventBus / ServiceRegistry, không `import` code của app khác.
6. **Không big-bang.** Mỗi thay đổi phải giữ các app hiện có chạy được.

Chi tiết & lý do: [`docs/architecture/overview.md`](./docs/architecture/overview.md) §Nguyên tắc.

## 3. Skills & MCP

- **Skills** (nếu dùng Claude Code): quy ước đặt trong `.claude/skills/` (chưa có — thêm khi cần). Skill dành riêng cho repo này (vd "scaffold-app", "add-port") sẽ được khai báo ở đây.
- **MCP servers**: cấu hình trong `.claude/settings.json` hoặc `.mcp.json` (chưa có). Khi thêm MCP (vd truy cập license server, DB), ghi lại mục đích + scope vào [`docs/dev/tooling.md`](./docs/dev/tooling.md).
- Khi task cần MCP/skill chưa tồn tại → hỏi người dùng, không tự giả định.

## 4. Quy tắc thay đổi & log (BẮT BUỘC khi sửa code)

Mỗi thay đổi đáng kể phải cập nhật đúng loại log — **phân biệt rõ, không trộn lẫn**:

| Loại | File | Ghi gì |
|---|---|---|
| **Version** | `package.json` từng package | Bump theo [`docs/dev/versioning.md`](./docs/dev/versioning.md) (SemVer + Changesets) |
| **Changelog** (cho người dùng) | `CHANGELOG.md` mỗi package (Changesets tự sinh) | Tính năng/fix theo góc nhìn người dùng |
| **History / nhật ký kỹ thuật** | [`docs/dev/history.md`](./docs/dev/history.md) | Quyết định kỹ thuật, lý do, ngày (context cho AI/dev sau) |

Quy tắc đầy đủ: [`docs/dev/versioning.md`](./docs/dev/versioning.md) và [`docs/dev/history.md`](./docs/dev/history.md).

## 5. Trước khi báo "xong"

- Chạy `pnpm typecheck` + `pnpm lint` (khi đã có code).
- Nếu thay đổi có mặt runtime → verify chạy thật (`electron-vite dev` cho Electron với `env -u ELECTRON_RUN_AS_NODE`; `vite dev` cho web).
- Cập nhật log đúng loại (§4). Cập nhật tài liệu liên quan nếu contract đổi.
- Báo trung thực: test fail thì nói rõ, bước bỏ qua thì nói bỏ qua.
