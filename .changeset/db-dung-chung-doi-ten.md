---
"@sky-app/app-db": minor
"@sky-app/shell-electron": minor
"@sky-app/data-service": minor
"@sky-app/platform-web": patch
"@sky-app/platform-electron": patch
"@sky-app/service-contracts": patch
---

Đổi tên cơ sở dữ liệu nội bộ từ "ceremony" sang "sky-app" cho đúng thực tế — file này chứa dữ liệu của cả ứng dụng (layout, sự kiện, thư viện ảnh, giọng đọc...), không riêng phần buổi lễ. Dữ liệu của bản cài cũ được chuyển sang tên mới tự động khi mở app lần đầu; không cần thao tác gì và không mất dữ liệu.

Sửa lỗi tiến trình giọng nói bị bỏ lại chạy ngầm khi khởi động thất bại (thường gặp khi đang tải giọng nặng như VoxCPM/Qwen quá lâu). Trước đây tiến trình đó tiếp tục chiếm vài GB RAM cho tới khi tắt máy, và không có cách nào dừng nó — kể cả thoát ứng dụng.
