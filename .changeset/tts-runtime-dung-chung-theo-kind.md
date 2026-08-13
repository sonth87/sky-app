---
"@sky-app/shell-electron": minor
"@sky-app/tts-engine-ui": minor
"@sky-app/service-contracts": minor
"@sky-app/slide-shared": minor
"@sky-app/platform-electron": minor
---

Engine TTS tải thêm (VoxCPM, MOSS...) giờ dùng chung thư viện Python theo loại thay vì mỗi engine giữ một bản riêng — đỡ hàng GB dung lượng khi cài từ engine cần PyTorch thứ hai trở đi. Gộp luôn thư viện tăng tốc GPU vào cùng cơ chế.

Sửa lỗi khiến engine đa ngôn ngữ nhẹ (MOSS) bị khởi động thành một tiến trình riêng không cần thiết mỗi khi đổi sang — nay nạp thẳng vào tiến trình đang chạy như thiết kế ban đầu, đổi sang nhanh hơn.

Màn hình quản lý engine hiện thêm dòng dung lượng thư viện dùng chung, tách khỏi dung lượng riêng của từng engine.
