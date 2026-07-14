# Apps — Mô tả từng app con

> Mỗi app con trong `modules/*` có 1 file mô tả **nghiệp vụ** ở đây (không phải kiến trúc — kiến trúc ở [../architecture/](../architecture/)).

Mỗi file `<app-id>.md` nên gồm:
- **Mục đích** — app làm gì.
- **Dữ liệu chính** — model app quản lý.
- **Capabilities cần** — `requiredCapabilities` + hành vi degrade khi thiếu (web).
- **Services dùng** — `requiredServices`.
- **Entitlements** — quyền gate app/feature ([licensing](../guides/licensing-entitlement.md)).
- **Đặc thù** — vd Ceremony có Backdrop kiosk màn phụ.

## App đã triển khai

| App | Mô tả | Chi tiết |
|---|---|---|
| `ceremony` | Điều khiển buổi lễ (Control UI, trước đây gọi là Trao Bằng) | port từ `apps/slide` repo trao-bang |
| `tts-studio` | Chọn giọng, chỉnh tốc độ, nhập text → tạo & tải audio | [tts-studio.md](./tts-studio.md) |

## App dự kiến (chưa triển khai)

| App | Mô tả | Nguồn |
|---|---|---|
| `ceremony-backdrop` | Màn hình trình chiếu (kiosk màn phụ) | port từ backdrop renderer |

Danh sách nghiệp vụ đầy đủ các module tương lai: xem `docs/multi-app-roadmap.md` bên repo trao-bang gốc.
