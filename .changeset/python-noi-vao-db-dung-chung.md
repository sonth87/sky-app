---
"@sky-app/shell-electron": minor
"@sky-app/tts-service": minor
"@sky-app/app-db": patch
---

Tiến trình xử lý giọng nói (TTS) giờ lưu danh sách giọng đọc trực tiếp vào cơ sở dữ liệu dùng chung của app thay vì một file riêng — bước nền tảng để thêm các tính năng giọng nói mới (nhiều mẫu âm thanh cho một giọng để clone chính xác hơn, lịch sử các lần tạo audio...).

Không ảnh hưởng gì tới giọng đọc đã có: dữ liệu cũ tự động chuyển sang khi mở app lần đầu và vẫn giữ nguyên bản gốc để đối chiếu nếu cần, không xoá gì.
