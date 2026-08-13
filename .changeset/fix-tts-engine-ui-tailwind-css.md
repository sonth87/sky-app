---
"@sky-app/tts-engine-ui": patch
"@sky-app/shell-electron": patch
---

Sửa lỗi giao diện cửa sổ "Cấu hình" TTS hiển thị sai bố cục (vd cột form trong tab Hiệu ứng rơi xuống dưới danh sách thay vì nằm cạnh) — package `tts-engine-ui` trước đây chưa có bundle CSS riêng nên nhiều kiểu dáng chưa từng được áp dụng thật.
