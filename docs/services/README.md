# Services — Mô tả từng service dùng chung

> Service = tiến trình độc lập (thường HTTP) phục vụ nhiều app, do shell quản vòng đời (ServiceManager). Mỗi service có 1 file mô tả ở đây.

Mỗi file `<service-id>.md` nên gồm:
- **Mục đích** — service làm gì.
- **Giao thức** — HTTP endpoint / port / health.
- **Vòng đời** — spawn eager hay theo nhu cầu; restart khi nào.
- **Client (port)** — port nào ở `service-contracts` map tới service này.
- **Web vs Electron** — Electron spawn local; Web deploy ở đâu.

## Service dự kiến

| Service | Mô tả | Nguồn |
|---|---|---|
| `tts-service` | Sinh audio TTS (Python, HTTP) | port nguyên từ `apps/tts-service` repo trao-bang |
| `stt-service` | Speech-to-text (tương lai) | — |

**Nguyên tắc:** service KHÔNG biết app nào gọi (chỉ nói HTTP). Config service share chung mọi app. Xem [architecture/overview.md](../architecture/overview.md) §4.3.
