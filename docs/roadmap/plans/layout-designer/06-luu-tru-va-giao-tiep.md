# 06 — Lưu trữ & Giao tiếp giữa các app

> Giải YC2 (lưu trữ) + câu hỏi "2 app giao tiếp thế nào".
>
> ⚠️ **Cập nhật lưu trữ (2026-07-16):** phương án lưu trữ ở file này (localStorage/IndexedDB/
> file JSON GĐ1) đã bị THAY THẾ. Chốt mới: **SQLite là database local cho mọi thứ** (cả
> Electron lẫn web qua `data-service`), **Supabase là tầng đồng bộ đa-tenant GĐ2** — không
> phải "Supabase thay SQLite" mà là song song (Electron có 3 chế độ: offline SQLite / online
> Supabase / đồng bộ). Xem đầy đủ ở [18-luu-tru-sqlite-supabase.md](18-luu-tru-sqlite-supabase.md).
> Phần "LayoutStore là 1 port, nhiều adapter" và "giao tiếp qua artifact" dưới đây **vẫn đúng
> về nguyên tắc kiến trúc** — chỉ đổi adapter cụ thể, không đổi cách các app giao tiếp.

## Nguyên tắc: giao tiếp qua ARTIFACT, không gọi trực tiếp

```
┌─────────────────┐    lưu     ┌──────────────┐    đọc    ┌─────────────────┐
│ layout-designer │ ─────────▶ │  LayoutStore │ ◀──────── │    ceremony     │
│    (editor)     │  Document  │ (local/cloud)│  Document │  (tiêu thụ)     │
└─────────────────┘            └──────────────┘           └─────────────────┘
```

- Editor & ceremony **không import lẫn nhau** ở runtime. Chỉ chia sẻ **schema** (`slide-shared`)
  và **artifact** (`LayoutDocument` JSON).
- Đây đúng pattern đang chạy: ceremony `fetch(ceremony.backdrops_config).json()`.
- Ưu điểm: editor có thể chạy độc lập (thậm chí offline), ceremony vẫn hoạt động nếu editor tắt.

## LayoutStore — Port lưu trữ (YC2)

```ts
export interface LayoutStore {
  list(): Promise<LayoutSummary[]>;
  get(id: string): Promise<LayoutDocument>;
  save(doc: LayoutDocument): Promise<void>;
  remove(id: string): Promise<void>;
  // Import/Export — thêm 2026-07-15, xem 15-import-export.md (yêu cầu mới từ quyết định #16:
  // không có bảo vệ tự động, người dùng tự chủ động sao lưu/kiểm tra qua import/export).
  exportBundle(ids: string[]): Promise<LayoutExportBundle>;
  importBundle(bundle: LayoutExportBundle): Promise<void>;
}

export interface LayoutSummary {
  id: string; name: string; updatedAt: string; aspectIds: string[];
}
```

### Các adapter — ĐÃ CẬP NHẬT theo [18](18-luu-tru-sqlite-supabase.md) (đổi backend = đổi adapter, không đổi app)

| Adapter | Môi trường | Giai đoạn | Ghi chú |
|---|---|---|---|
| `SqliteLayoutStore` (server-side) | web qua `data-service` (Node, `better-sqlite3`/`node:sqlite`) | **Bây giờ** | Query SQL vào file `.db` local trên máy chạy `data-service` |
| `SqliteLayoutStore` (Electron) | electron main process (native) | **Bây giờ** | Cùng logic, file `.db` trong `ceremony-data/` |
| `SqliteWasmLayoutStore` | web fallback khi KHÔNG có `data-service` (VD serverless) | **Bây giờ** | `sql.js` (WASM) trong trình duyệt, persist IndexedDB — mỗi trình duyệt 1 đảo dữ liệu, xem [18](18-luu-tru-sqlite-supabase.md) §1a |
| `SupabaseLayoutStore` | web (dài hạn) + electron (chế độ online/đồng bộ) | **Giai đoạn CUỐI** | Cột `tenant_id` + RLS, đồng bộ 2 chiều + version (file 21), xem [18](18-luu-tru-sqlite-supabase.md) §6. Đẩy xuống làm SAU CÙNG (chốt 2026-07-16, xem [20](20-rasoat-2026-07-16.md) §E) |

→ SQLite làm nền tảng ngay từ đầu (không phải localStorage/file JSON tạm) — vì bản thân
Event/DataSource/Layout là dữ liệu quan hệ, SQL biểu diễn tự nhiên hơn, và tránh việc phải
viết lại lần 2 khi thêm Supabase. Xem phân tích đầy đủ ở [18](18-luu-tru-sqlite-supabase.md).

### Đặt LayoutStore ở đâu (ports & adapters)
- Interface `LayoutStore` → `packages/service-contracts` (cạnh `DataPort`, `TtsPort`).
- Adapter web → `packages/platform-web/adapters/layout.ts`.
- Adapter electron → `packages/platform-electron/adapters/layout.ts`.
- Đăng ký service `'layout'` trong `create-web-platform` / `create-electron-platform`.

## Ảnh nền & asset — 3 tầng lưu trữ (cập nhật 2026-07-16, khớp file 18)

> ⚠️ Bản trước ("GĐ1 local file/base64 → GĐ2 Supabase Storage") viết TRƯỚC quyết định SQLite/
> WASM — **đã lỗi thời**. Ảnh nền/ring/trang trí của layout lưu khác nhau theo từng tầng:

| Tầng | Ảnh lưu ở đâu | Layout lưu gì |
|---|---|---|
| **Electron** | file trong `ceremony-data/` (thư mục assets, như hiện tại) | đường dẫn tương đối |
| **Web + data-service** | thêm route `POST /api/layout/asset` upload → lưu file cạnh `.db` server | đường dẫn tương đối |
| **Web WASM (fallback)** | **blob trong IndexedDB** (không có filesystem) → tạo `object URL` lúc render | key blob (không phải path file) |
| **Supabase (cuối)** | Supabase Storage | URL/path |

- **`resolveAsset(relativePath)`** đã có — GIỮ cơ chế, nhưng cần mở rộng để xử lý cả trường hợp
  WASM (key blob → object URL) bên cạnh path file/URL. Đây là 1 điểm PHẢI thiết kế trước khi làm
  editor web (GĐ2), không phải để mở.
- **Export/Import (file 15/22)** phải gánh việc mang ảnh theo (base64 trong JSON hoặc thư mục
  `assets/` trong zip) — vì WASM mode không có path file bền, ảnh chỉ sống trong IndexedDB của
  đúng trình duyệt đó; muốn mang sang máy khác/Electron thì phải qua Export.
- Chi tiết + việc phải làm ở [18](18-luu-tru-sqlite-supabase.md) §1a (giới hạn WASM) + plan GĐ2.

## Điều kiện chọn layout — thuộc về Event, KHÔNG thuộc về layout-designer

> Chốt 2026-07-15 (xem [14](14-rasoat-2026-07-15.md) §1a): "design layout chỉ quản lý danh
> sách các layout; điều kiện chọn layout ở ceremony." → `LayoutSelector` KHÔNG gắn vào
> `LayoutDocument` (đã bỏ khỏi file 04) — mà gắn vào `EventLayoutRef` (file 10), vì đó là nơi
> ceremony/control quyết định "layout này dùng cho ai, trong đợt lễ nào".

Song song `resolveTemplate(award_content)` cũ, nhưng tổng quát và có hỗ trợ AND/OR (mở rộng
theo yêu cầu #53 — xem [14](14-rasoat-2026-07-15.md)):

```ts
export interface LayoutSelector {
  // Nhóm điều kiện — các nhóm nối với nhau bằng OR, mỗi nhóm bên trong nối bằng AND.
  // "GPA >= 3.6 VÀ (giới tính Nam HOẶC đạt giải phụ)" biểu diễn được bằng 2 group:
  //   group 1: [gpa>=3.6, gender=Nam]
  //   group 2: [gpa>=3.6, award_content=...]
  groups: SelectorRuleGroup[];
  priority: number;         // BẮT BUỘC khi 1 Event có nhiều layoutRefs — số càng cao càng ưu tiên
}
export interface SelectorRuleGroup {
  rules: SelectorRule[];    // AND toàn bộ rule trong group này
}
export interface SelectorRule {
  attr: string;              // "classification" | "award_content" | "graduation_year" ...
                              // hoặc field trong record.extra (VD "gpa", "chuc_vu")
  op: 'equals' | 'contains' | 'in' | 'gt' | 'lt' | 'gte' | 'lte';
  val: string;
}
```

`resolveLayout(record, event)` — chạy trên `event.layoutRefs`, không phải trên
`LayoutDocumentMap` toàn cục (vì selector giờ ở tầng Event, xem [10](10-quan-ly-dot-le-event.md)):
```
for ref in event.layoutRefs (sort theo ref.selector.priority desc):
   if MỘT group bất kỳ trong ref.selector.groups match record (mọi rule trong group đều đúng)
      → return layout(ref.layoutId)
// Event PHẢI có 1 layoutRef với groups rỗng (match mọi thứ), priority thấp nhất, làm
// fallback — validate chặn lúc lưu Event nếu thiếu (không xử lý null lúc runtime, xem
// quyết định #16 ở file 14 — nhưng #16 đã đổi hướng sang import/export tự chuẩn bị,
// xem ghi chú cập nhật ở cuối mục này)
```

Ví dụ điều kiện của Sonth (khai báo trong `EventLayoutRef.selector`, không phải trong layout):
- "Nhân viên xuất sắc → layout riêng": `groups: [{ rules: [{attr:"classification", op:"equals", val:"Xuất sắc"}] }]`
- "GPA cao HOẶC Nam": `groups: [{rules:[gpa>=3.6]}, {rules:[gender=Nam]}]` (2 group = OR giữa chúng)

→ Tái dùng đúng rule engine của `CustomVariableRule` (cùng op set). Không phát minh mới.

**Cập nhật #16 (2026-07-15):** ban đầu đề xuất "chặn lúc soạn Event nếu thiếu layoutRef mặc
định" — Sonth chốt KHÔNG cần cơ chế bảo vệ tự động này; người dùng tự chịu trách nhiệm chuẩn
bị đầy đủ trước khi chạy lễ, đổi lại hệ thống cung cấp **Import/Export** để họ chủ động kiểm
tra/chuẩn bị trước (xem [15-import-export.md](15-import-export.md)). Validate "phải có layoutRef
mặc định" vẫn là gợi ý hay (cảnh báo mềm trong UI), nhưng KHÔNG chặn cứng.

## So khớp với giao tiếp hiện có trong sky-app

| Thành phần | Đã có (student data) | Thêm mới (layout) |
|---|---|---|
| Port interface | `DataPort` | `LayoutStore` |
| Web adapter | `createWebDataPort` (HTTP → data-service) | `createWebLayoutStore` |
| Electron adapter | qua `window.slide` | `createElectronLayoutStore` |
| Backend dev | `apps/data-service` (Fastify :8094) | có thể mở rộng data-service thêm `/api/layout/*` |
| Artifact | `bundle.json` (students) | `LayoutDocument` JSON |

> Gợi ý: GĐ1 web có thể **thêm route `/api/layout/*` vào `apps/data-service`** (đã là Fastify sẵn)
> thay vì dựng backend mới — nhanh, đúng scope local-dev.
