# Roadmap — Tầm nhìn & kế hoạch triển khai

> Đây là nơi chứa **những gì CHƯA (hoặc đang) triển khai** — khác với `docs/architecture/`, `docs/guides/`, `docs/reference/` vốn chỉ mô tả hệ thống **đang vận hành**. Đọc thư mục này để biết dự án đang/sẽ đi về đâu; đọc `docs/architecture/` để biết hệ thống hiện tại hoạt động ra sao.

## Cấu trúc

```
roadmap/
├── README.md      ← bạn đang ở đây — tầm nhìn dài/ngắn hạn, điều hướng tới plans/
└── plans/          ← từng kế hoạch/đề xuất cụ thể, 1 file = 1 kế hoạch
    ├── platform-architecture-ga1-7.md   (done)
    ├── ota-update-strategy.md            (proposed)
    └── ...
```

## Quy ước cho mỗi file trong `plans/`

Mỗi kế hoạch có front-matter khai báo trạng thái:

```yaml
---
status: proposed | in_progress | done
owner: <người phụ trách>
created: <ngày lập>
target_version: <version dự kiến/thực tế áp dụng>
supersedes: <file plan khác bị thay thế, nếu có>
implemented_doc: <đường dẫn tới doc chính thức khi status=done, null nếu chưa>
---
```

- **proposed** — đã research/thiết kế, chưa code. Có thể còn điểm mở cần quyết định trước khi bắt tay làm.
- **in_progress** — đang triển khai. Cập nhật ngay trong file này (không tạo bản sao) khi có tiến triển lớn; chi tiết ngày-qua-ngày vẫn ghi ở `docs/dev/history.md`.
- **done** — đã triển khai xong, verify được. Nội dung chính thức (thiết kế cuối cùng, cách dùng) chuyển thành tài liệu ở `docs/architecture/` hoặc `docs/guides/`, field `implemented_doc` trỏ tới đó. File plan giữ nguyên làm lịch sử quyết định — **không xóa**.

Khi 1 kế hoạch mới thay thế hoàn toàn 1 kế hoạch cũ (đổi hướng giữa chừng), đặt `supersedes` trỏ về file cũ thay vì sửa đè.

## Tầm nhìn dài hạn

Sky-App là nền tảng multi-app (Web + Electron, Online + Offline, có licensing) — xem [`docs/architecture/overview.md`](../architecture/overview.md) cho kiến trúc nền tảng đã ổn định (GĐ1-7). Roadmap từ đây tập trung vào: (1) đảm bảo chất lượng port của app nghiệp vụ đầu tiên (Ceremony) khớp đúng bản gốc trước khi mở rộng thêm app mới, (2) giải quyết bài toán vận hành/delivery khi hệ thống đã có user thật.

## Kế hoạch hiện có

| Kế hoạch | Trạng thái | Mô tả ngắn |
|---|---|---|
| [platform-architecture-ga1-7.md](./plans/platform-architecture-ga1-7.md) | `done` | Kế hoạch kiến trúc gốc dựng nền tảng — nay là [architecture/overview.md](../architecture/overview.md) |
| [ota-update-strategy.md](./plans/ota-update-strategy.md) | `proposed` | Chiến lược cập nhật OTA cho renderer (không cần cài lại) và main process (qua auto-update) — tránh phải build tay + gửi lại installer mỗi lần sửa bug/thêm tính năng |

**GĐ7.5 (audit port Trao Bằng → sky-app)** hiện đang ở plan mode riêng của phiên làm việc (`/Users/skyline/.claude/plans/mighty-honking-meteor.md`), chưa được user duyệt (`ExitPlanMode`) — sẽ chuyển vào `plans/` sau khi duyệt và có phiên bản ổn định để lưu trữ lâu dài.

## Thứ tự ưu tiên đề xuất (ngắn hạn)

1. **GĐ7.5 — Audit port Ceremony/TTS** (đang chờ duyệt) — xác nhận toàn bộ chức năng đã port từ `trao-bang-tot-nghiep-2026` hoạt động đúng như bản gốc trước khi đầu tư thêm.
2. **GĐ8 (đề xuất) — OTA Update strategy** (`ota-update-strategy.md`, đang `proposed`) — giải quyết bài toán delivery, ưu tiên sau khi audit ổn định vì mỗi lần fix bug từ audit hiện vẫn phải build tay.
