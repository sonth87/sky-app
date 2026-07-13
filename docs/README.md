# Sky-App — Bản đồ tài liệu

> Đây là **điểm điều hướng** cho toàn bộ tài liệu. Mỗi tài liệu có một vai trò rõ ràng — đọc đúng cái bạn cần.

## Phân tầng tài liệu

Tài liệu được chia theo **đối tượng đọc** và **mục đích**, không trộn lẫn:

```
docs/
├── README.md              ← BẠN ĐANG Ở ĐÂY (bản đồ điều hướng)
│
├── roadmap/               ← 🗺️ CHƯA/ĐANG TRIỂN KHAI (tầm nhìn, kế hoạch, đề xuất)
│   ├── README.md              Tầm nhìn dài/ngắn hạn, điều hướng tới plans/
│   └── plans/                 Từng kế hoạch cụ thể, có trạng thái proposed/in_progress/done
│
├── architecture/          ← 🏛️ KIẾN TRÚC HỆ THỐNG (mô tả hệ thống ĐANG VẬN HÀNH)
│   ├── overview.md            Tổng quan: tầm nhìn, nguyên tắc, monorepo, các GĐ đã xong
│   ├── web-vs-electron.md     2 môi trường khác nhau ra sao, cái gì degrade
│   └── shared-vs-per-app.md   Ranh giới thành phần chung (packages) vs riêng (modules)
│
├── guides/                ← 🧭 HƯỚNG DẪN DEV (làm việc cụ thể theo bước)
│   ├── app-spec.md            ⭐ QUY CHUẨN APP CON — đọc TRƯỚC khi tạo/sửa app (spine, trỏ tới các guide dưới)
│   ├── adding-an-app.md       Thêm 1 app con mới vào nền tảng (các bước cụ thể)
│   ├── app-css-theming.md     CSS & theme isolation cho app con (scope, --color-*, fixed overlay)
│   ├── ports-and-adapters.md  Viết port mới + adapter Electron/Web
│   └── licensing-entitlement.md  Gate app/feature theo license
│
├── reference/             ← 📚 THAM CHIẾU (tra cứu chính xác interface/API)
│   └── contract-reference.md  AppModule, PlatformContext, ServiceRegistry, EventBus, Ports
│
├── apps/                  ← 📦 TỪNG APP CON (mô tả nghiệp vụ mỗi app)
│   └── (ceremony.md, tts-studio.md ... — thêm khi có app)
│
├── services/             ← ⚙️ TỪNG SERVICE (TTS, ... — service dùng chung)
│   └── (tts-service.md ... — thêm khi có service)
│
└── dev/                  ← 🔧 QUY ĐỊNH & LOG CHO DEV
    ├── versioning.md         Quy tắc bump version package.json (SemVer + Changesets)
    ├── history.md            Nhật ký kỹ thuật (quyết định + lý do, theo ngày)
    └── tooling.md            Skills, MCP, công cụ dev
```

## "Tôi muốn..." → đọc gì

| Mục tiêu | Tài liệu |
|---|---|
| Biết dự án đang/sẽ đi về đâu, có kế hoạch gì chưa làm | [roadmap/README.md](./roadmap/README.md) |
| Hiểu Sky-App là gì, kiến trúc tổng | [architecture/overview.md](./architecture/overview.md) |
| Biết cái gì chạy web, cái gì chỉ electron | [architecture/web-vs-electron.md](./architecture/web-vs-electron.md) |
| Biết code nào để `packages/` vs `modules/` | [architecture/shared-vs-per-app.md](./architecture/shared-vs-per-app.md) |
| **Hiểu 1 app con PHẢI như thế nào (tạo mới hay sửa)** | [guides/app-spec.md](./guides/app-spec.md) ⭐ |
| Thêm 1 app con mới (các bước) | [guides/adding-an-app.md](./guides/adding-an-app.md) |
| Scope CSS/theme cho app con (khỏi rò rỉ ra shell, kẹt màu, tràn title bar) | [guides/app-css-theming.md](./guides/app-css-theming.md) |
| Thêm khả năng truy cập môi trường (fs, tts...) | [guides/ports-and-adapters.md](./guides/ports-and-adapters.md) |
| Khóa/mở app-feature theo license | [guides/licensing-entitlement.md](./guides/licensing-entitlement.md) |
| Tra interface chính xác | [reference/contract-reference.md](./reference/contract-reference.md) |
| Biết quy tắc bump version | [dev/versioning.md](./dev/versioning.md) |
| Xem lịch sử quyết định kỹ thuật | [dev/history.md](./dev/history.md) |

## Loại tài liệu — phân biệt để không nhầm

- **roadmap/** = *sẽ/đang làm gì, chưa chắc chắn 100%* (kế hoạch, đề xuất — có trạng thái proposed/in_progress/done).
- **architecture/** = *tại sao & thiết kế thế nào của cái ĐANG chạy thật* (thay đổi chậm, cần review kỹ, luôn khớp hệ thống hiện tại).
- **guides/** = *làm thế nào* (hướng dẫn thao tác, cập nhật khi quy trình đổi).
- **reference/** = *chính xác là gì* (interface/API — phải khớp code khi có code).
- **apps/ services/** = *mô tả từng thành phần nghiệp vụ*.
- **dev/** = *quy định vận hành + nhật ký* (versioning, history, tooling).

**Vòng đời 1 ý tưởng:** `roadmap/plans/*.md` (status: proposed) → triển khai (status: in_progress, theo dõi tiến độ ở `dev/history.md`) → xong (status: done, nội dung chính thức chuyển vào `architecture/`/`guides/`/`apps/`/`services/`, field `implemented_doc` trỏ tới đó, file plan giữ lại làm lịch sử).

> Tài liệu cho AI (quy định làm việc) nằm ở [`../AGENTS.md`](../AGENTS.md), KHÔNG nằm trong `docs/`.
