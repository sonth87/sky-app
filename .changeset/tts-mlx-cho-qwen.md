---
"@sky-app/shell-electron": minor
---

Trên máy Mac chip Apple Silicon (M1/M2/M3/M4), giọng Qwen3-TTS giờ chạy được thật bằng GPU tích hợp sẵn của máy (qua công nghệ MLX của Apple) — đã thử nghiệm thực tế và xác nhận chạy đúng, không cần card đồ hoạ rời. Trước đây engine này chỉ chạy được trên máy có card NVIDIA; trên Mac gần như không dùng được.

Máy Windows/Linux có card NVIDIA vẫn dùng đường cài đặt cũ, không đổi gì.
