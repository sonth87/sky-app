# Apps — Mô tả từng app con

> Mỗi app con trong `modules/*` có 1 file mô tả **nghiệp vụ** ở đây (không phải kiến trúc — kiến trúc ở [../architecture/](../architecture/)).

Mỗi file `<app-id>.md` nên gồm:
- **Mục đích** — app làm gì.
- **Dữ liệu chính** — model app quản lý.
- **Capabilities cần** — `requiredCapabilities` + hành vi degrade khi thiếu (web).
- **Services dùng** — `requiredServices`.
- **Entitlements** — quyền gate app/feature ([licensing](../guides/licensing-entitlement.md)).
- **Đặc thù** — vd Trao Bằng có Backdrop kiosk màn phụ.

## App dự kiến (chưa triển khai)

| App | Mô tả | Nguồn |
|---|---|---|
| `trao-bang` | Điều khiển trao bằng (Control UI) | port từ `apps/slide` repo trao-bang |
| `trao-bang-backdrop` | Màn hình trình chiếu (kiosk màn phụ) | port từ backdrop renderer |
| `tts-studio` | Cấu hình TTS + nhập text → xuất audio | tách từ TTS UI của Slide |

Danh sách nghiệp vụ đầy đủ các module tương lai: xem `docs/multi-app-roadmap.md` bên repo trao-bang gốc.
