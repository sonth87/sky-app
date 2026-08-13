---
"@sky-app/voice-catalog-ui": patch
"@sky-app/tts-engine-ui": patch
"@sky-app/shell-electron": patch
---

Sửa lỗi bộ chọn giọng đọc (voice picker) hiện danh sách bị che khuất phía sau cửa sổ khi mở trong một cửa sổ nổi khác (vd tab Hiệu ứng của cửa sổ Cấu hình TTS) — dropdown giờ luôn nổi trên cùng đúng như mong đợi, và tự lật lên trên khi bên dưới trigger không đủ chỗ hiển thị (vd trigger nằm gần đáy cửa sổ).

Sửa lỗi tên giọng đang chọn hiện bị cắt cụt chỉ còn vài ký tự (vd "Ho....."), trong khi phần mô tả phụ lại chiếm hết chỗ hiển thị.

Sửa lỗi phần dưới cửa sổ Cấu hình (rõ nhất ở form tạo/sửa preset hiệu ứng, tab Hiệu ứng) bị cắt mất, cuộn cũng không thấy — nội dung bị tràn ra ngoài khung cửa sổ rồi bị chính viền bo góc của cửa sổ che mất trước khi tới được vùng cuộn bên trong.

Sửa lỗi 1 số giọng mặc định (Hoài My, Nam Minh) không hiện mô tả ngắn trong ô chọn giọng nghe thử ở tab Hiệu ứng, dù vẫn hiện đúng ở TTS Studio — 2 giọng này chỉ lưu mô tả ở nguồn catalog gốc, chưa được bù vào danh sách hiển thị ở tab Hiệu ứng như TTS Studio đã làm.
