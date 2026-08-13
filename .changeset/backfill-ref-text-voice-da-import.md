---
"@sky-app/shell-electron": patch
"@sky-app/tts-service": patch
---

Sửa lỗi giọng đọc dựng sẵn (catalog) vẫn báo thiếu bản chép lời khi tạo audio bằng engine Qwen, dù bản chép lời đã có sẵn — trước đây chỉ giọng chưa từng dùng lần nào mới được đồng bộ, giọng đã dùng qua rồi thì không.
