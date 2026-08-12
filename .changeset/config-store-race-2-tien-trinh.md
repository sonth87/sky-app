---
"@sky-app/shell-electron": patch
"@sky-app/tts-service": patch
---

Sửa lỗi engine TTS đã chọn (ví dụ Qwen 1.7B) không được nhớ đúng — mỗi lần mở lại app lại quay về engine mặc định dù trước đó đã đổi. Nguyên nhân: tiến trình TTS chạy nền của engine cũ ghi đè nhầm lựa chọn mới trong lúc lưu các thiết lập khác.
