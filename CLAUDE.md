# CLAUDE.md

Quy định làm việc cho AI trong repo này nằm ở **[`AGENTS.md`](./AGENTS.md)** — đọc file đó trước tiên.

Điểm nhấn nhanh (chi tiết ở AGENTS.md):
- Repo đang ở giai đoạn **thiết kế, chưa có code** — chỉ có `docs/`.
- **Ports & Adapters**: không gọi trực tiếp `window.*`/`ipcRenderer`/`fetch`/Electron API — đi qua port của `PlatformContext`.
- **Isomorphic + offline-first**: chạy cả Web lẫn Electron, không phụ thuộc mạng bắt buộc.
- Cập nhật log đúng loại khi sửa code (version / changelog / history — xem AGENTS.md §4).
