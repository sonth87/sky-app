---
"@sky-app/shell-electron": patch
"@sky-app/module-tts-studio": patch
---

Sửa lỗi "Các bản ghi gần đây" trong TTS Studio trống vĩnh viễn nếu app được mở trước khi dịch vụ TTS khởi động xong — trước đây phải tắt rồi mở lại app mới thấy lại dữ liệu, kể cả khi dịch vụ TTS đã sẵn sàng từ lâu.
