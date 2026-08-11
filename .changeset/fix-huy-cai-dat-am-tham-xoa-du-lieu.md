---
"@sky-app/shell-electron": patch
"@sky-app/tts-service": patch
"@sky-app/tts-engine-ui": patch
"@sky-app/slide-shared": patch
---

Sửa lỗi gốc khiến giọng Qwen3-TTS (0.6B/1.7B) không bao giờ được nhận là "đã cài xong" dù đã tải/cài đủ trên đĩa — phần xử lý ngầm tìm sai tên thư mục cho 2 giọng này (do có dấu chấm trong tên), khiến màn "Quản lý engine TTS" đứng mãi ở "Đang cài thư viện..." vô thời hạn dù dữ liệu đã tải xong từ lâu.

Sửa lỗi bấm "Hủy" khi đang tải/cài giọng đọc thêm (Qwen, VoxCPM, MOSS...) âm thầm xoá toàn bộ dữ liệu đã tải — kể cả phần đã tải/cài xong — mà không có cảnh báo nào, trông như bấm không có tác dụng gì trong khi thực ra dữ liệu đã mất. Giờ có hộp xác nhận trước khi Hủy, và trạng thái sau khi Hủy hiện đúng (khác với Tạm dừng).

Sửa lỗi màn hình "Quản lý engine TTS" đôi khi đứng mãi ở "Đang cài thư viện..." dù engine đã cài xong từ trước đó — màn hình giờ tự đối chiếu lại đúng trạng thái mỗi khi mở lại.

Bỏ dòng "Thư viện dùng chung" (PyTorch/ONNX/MLX...) khỏi màn hình — thông tin kỹ thuật nội bộ, không cần thiết cho người dùng thường.

Sửa lỗi báo lỗi (500) khi hỏi thông tin thiết bị tăng tốc lúc đang dùng giọng Qwen3-TTS trên Mac Apple Silicon — thiếu 2 thông tin nội bộ mà các giọng khác đều có sẵn.
