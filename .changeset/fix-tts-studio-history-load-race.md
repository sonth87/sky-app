---
"@sky-app/shell-electron": patch
"@sky-app/module-tts-studio": patch
"@sky-app/platform-electron": patch
"@sky-app/slide-shared": patch
---

Sửa lỗi "Các bản ghi gần đây" trong TTS Studio trống vĩnh viễn nếu app được mở trước khi dịch vụ TTS khởi động xong — trước đây phải tắt rồi mở lại app mới thấy lại dữ liệu, kể cả khi dịch vụ TTS đã sẵn sàng từ lâu. (Cập nhật 2026-08-25: đổi cách IPC `tts:history-list` báo lỗi "server chưa sẵn sàng" từ throw sang trả `{ok:false}` — throw khiến Electron tự log ồn ào "Error occurred in handler..." ra terminal dev mỗi lần retry lúc cold-start.)
