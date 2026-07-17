# Layout Designer — Blueprint (bản nháp tiến hóa)

> **Trạng thái:** DRAFT / brainstorm. Đây KHÔNG phải docs chính thức.
> Mục đích: gom hết ý tưởng, phân tích yêu cầu, phương án, schema, luồng, data
> vào một chỗ để dần lên hình hài. Khi blueprint đủ chín sẽ chắt lọc thành docs
> chính thức ở `docs/apps/` + `docs/architecture/`.
>
> Ngày khởi tạo: 2026-07-15 · Người khởi xướng: Sonth

## App là gì (một câu)

Một app **thiết kế trước layout backdrop** cho lễ bằng canvas kéo-thả: người dùng dựng
template có **biến `@var@`**, hỗ trợ **nhiều tỷ lệ màn hình**, lưu vào **SQLite local** (sau
này thêm Supabase để đồng bộ đa-tenant). Layout thuần hình, KHÔNG gắn với đợt lễ cụ thể nào —
được gán vào **Event** (1 đợt lễ/
chiến dịch, VD "Trao bằng đợt 2/2026", "Khen thưởng NV xuất sắc Q3") qua khu vực quản trị mở
rộng trong **ceremony/control** (chọn layout theo điều kiện ưu tiên, định nghĩa biến riêng đợt,
gắn nguồn data). **Ceremony/backdrop (runtime)** đọc Event đang được kích hoạt thủ công, điền
dữ liệu thật vào biến, và hiển thị — hỗ trợ cả cá nhân lẫn tập thể (layout dạng lặp).

## Các file trong blueprint này

| File | Nội dung |
|---|---|
| [01-yeu-cau.md](01-yeu-cau.md) | Yêu cầu gốc + bổ sung (multi-aspect-ratio), phân tích từng ý |
| [02-hien-trang-ceremony.md](02-hien-trang-ceremony.md) | Khảo sát code ceremony hiện có — cái gì tái dùng được, cái gì bỏ |
| [03-phuong-an-schema.md](03-phuong-an-schema.md) | Phương án schema — **ĐÃ CHỐT: migrate thẳng (C), không convert config cũ** |
| [04-schema-layout-document.md](04-schema-layout-document.md) | Schema `LayoutDocument` — multi-aspect, px+scale, item |
| [05-he-bien-va-adapter.md](05-he-bien-va-adapter.md) | 3 tầng biến, FieldMappingProfile adapter (map data thô → canonical) |
| [06-luu-tru-va-giao-tiep.md](06-luu-tru-va-giao-tiep.md) | LayoutStore port, local → Supabase, cách app giao tiếp |
| [07-luong-hoat-dong.md](07-luong-hoat-dong.md) | Luồng end-to-end (bản đầu — xem file 13 cho luồng đã cập nhật đầy đủ Event) |
| [08-cau-hoi-mo.md](08-cau-hoi-mo.md) | **Sổ theo dõi mọi câu hỏi A1-A10 — hầu hết đã chốt**, rủi ro, việc cần nghiên cứu |
| [09-quy-dinh-variable.md](09-quy-dinh-variable.md) | Cú pháp token, kiểu dữ liệu & validate, phạm vi biến (global/event/layout) |
| [10-quan-ly-dot-le-event.md](10-quan-ly-dot-le-event.md) | **Tầng Event** — nhiều đợt song song, tái sử dụng layout 3 mức, kích hoạt thủ công |
| [11-canonical-da-loai-va-loop.md](11-canonical-da-loai-va-loop.md) | Canonical đa loại đối tượng (SV/NV/...) + **LoopItem** cho trao giải tập thể/nhóm |
| [12-thu-vien-layout.md](12-thu-vien-layout.md) | Layout Library — sao chép variant từ bất kỳ layout nào (copy-as-new, không kế thừa runtime) |
| [13-ceremony-mo-rong.md](13-ceremony-mo-rong.md) | **Tổng hợp:** 6 trách nhiệm mới của ceremony — Event, active, data global/per-event, selector đa điều kiện |
| [14-rasoat-2026-07-15.md](14-rasoat-2026-07-15.md) | **Rà soát:** sơ đồ luồng tổng thể (Mermaid + SVG) + log 7 mâu thuẫn/câu hỏi — TẤT CẢ đã chốt (2026-07-15, đợt 2) |
| [15-import-export.md](15-import-export.md) | **Import/Export** cho layout-designer (LayoutDocument) và ceremony/control (Event+variable+data) — công cụ "tự chuẩn bị" thay cho validate tự động |
| [16-wireframe-control.md](16-wireframe-control.md) | **Đánh giá effort:** layout-designer đã có wireframe pixel-detail, `control/` (Event/Data/Selector) thì CHƯA — 5 màn hình cần vẽ, Màn "selector kéo-thả" là rủi ro effort lớn nhất toàn blueprint |
| [17-prompt-claude-design-control.md](17-prompt-claude-design-control.md) | **Prompt** cho Claude Design vẽ `control/` — ✅ ĐÃ CÓ BẢN THIẾT KẾ THẬT (`Ceremony Control - Event Flow.dc.html`, 2026-07-16), chốt 5 bước wizard + header chip Event |
| [19-prompt-claude-design-mapping.md](19-prompt-claude-design-mapping.md) | **Prompt** cho màn "Ghép biến" — ✅ ĐÃ CÓ BẢN THIẾT KẾ THẬT (gộp chung file trên), khớp rất sát prompt |
| [18-luu-tru-sqlite-supabase.md](18-luu-tru-sqlite-supabase.md) | **ĐỔI HƯỚNG LƯU TRỮ:** SQLite thay JSON/localStorage làm database local (cả ceremony bundle hiện có lẫn Event/DataSource/Layout mới); web 3 tầng (data-service→WASM→Supabase); Supabase là **giai đoạn CUỐI**; multi-tab/persist WASM; thử `node:sqlite` |
| [20-rasoat-2026-07-16.md](20-rasoat-2026-07-16.md) | **RÀ SOÁT VÒNG 2:** nguồn chân lý cho quyết định 2026-07-16 vòng 2 — lỗ hổng nghiệp vụ (active/re-import/consume/version) + kỹ thuật (multi-tab/persist/preload/node:sqlite/editor) + Supabase làm cuối cùng. Mọi file khác trỏ về đây |
| [21-layout-versioning.md](21-layout-versioning.md) | **MỚI — Layout versioning:** publish/draft, lịch sử version đầy đủ, switch version, Event ghim `layoutVersion` (không tự đổi giữa lễ), notice + check token khi update. Nền tảng cho cả offline switch lẫn Supabase sync |
| [22-import-modal.md](22-import-modal.md) | **MỚI — Import modal:** re-import DataSource qua modal rõ ràng (diff git thêm/ghi đè/xóa + màn kết quả), khóa tự nhiên (`naturalKeyField`) để id ổn định → người đã consumed không xuất hiện lại |
| [23-editor-core-architecture.md](23-editor-core-architecture.md) | **MỚI — Editor-core:** package `layout-editor-core` riêng (Zustand state + command/history registry undo/redo/coalesce + tool registry + snap/helper-line + zoom/pan + item-type registry). `modules/layout-designer` chỉ ráp UI |

## Chốt chính thức (đã quyết, phần lớn KHÔNG còn là "nghiêng về")

- ✅ **Vị trí layout-designer:** module trong monorepo (`modules/layout-designer`), KHÔNG tách repo.
- ✅ **Schema:** migrate THẲNG sang model mới, **KHÔNG convert `backdrops.json` cũ** (nó hết tác
  dụng — hardcode layout, đúng thứ plan này thay thế). Không giữ nhánh renderer cũ song song.
  Xem [03](03-phuong-an-schema.md).
- ✅ **Multi-aspect:** mỗi layout nhiều variant theo tỷ lệ (4:3/16:9/21:9/25:9/custom), mỗi
  variant có bg + item riêng, KHÔNG kế thừa runtime giữa các variant — nhưng có thao tác
  **"Sao chép variant"** (copy-as-new) từ bất kỳ layout/variant nào trong **Layout Library**.
  Xem [04](04-schema-layout-document.md) + [12](12-thu-vien-layout.md).
- ✅ **Toạ độ:** px trên "canvas chuẩn" (`refW×refH`) riêng mỗi variant + scale-to-fit lúc render
  — chọn vì dễ hình dung hơn cho người dùng không chuyên kỹ thuật (đối tượng đã chốt).
  Xem [04](04-schema-layout-document.md).
- ✅ **Font:** bundle sẵn (whitelist chung `slide-shared`), KHÔNG cho nhập tự do.
- ✅ **Người dùng editor:** đa dạng, gồm người KHÔNG chuyên kỹ thuật — ràng buộc thiết kế UI
  xuyên suốt (px dễ hiểu, cảnh báo ngôn ngữ thường, preview trực quan). Xem [08](08-cau-hoi-mo.md) A6.
- ✅ **Lưu trữ:** SQLite làm database local cho MỌI THỨ (kể cả ceremony bundle hiện có, không
  chỉ Event/DataSource/Layout mới) — thay hẳn file JSON. Supabase là tầng đồng bộ đa-tenant GĐ2
  (1 project chung + RLS theo `tenant_id`, không tách project/tenant), đồng bộ **2 chiều** với
  Electron (kéo dữ liệu về máy, đẩy trạng thái/log vận hành lên). Electron về sau có 3 chế độ:
  offline (SQLite) / online (Supabase) / đồng bộ. **Web dùng 3 tầng ưu tiên:** `data-service`
  (SQLite server-side) khi khả dụng → `SqliteWasmAdapter` (`sql.js` trong trình duyệt, lưu
  IndexedDB) khi không có server nào (VD deploy serverless) → Supabase khi đã có tenant/GĐ2 —
  vì `data-service` (persistent server) không chạy được trên môi trường serverless, và web cần
  hoạt động độc lập được kể cả không có server; Export/Import (file 15) là cầu nối mang dữ liệu
  từ web (SQLite-WASM, cô lập theo từng trình duyệt) sang Electron. Qua port chung (`LayoutStore`,
  `EventStore`, `DataSource`) — chỉ đổi adapter, không đổi app. Xem [18](18-luu-tru-sqlite-supabase.md) §1a.
- ✅ **Cú pháp token — CHỐT 2026-07-16 vòng 2:** `@var` — MỞ, không đóng đuôi (như tag Facebook),
  `@` sau khoảng trắng/đầu dòng, tên biến `[a-zA-Z0-9_-]` bắt đầu+kết thúc bằng chữ/số. Đảo lại
  quyết định `{{key}}` (chốt sáng cùng ngày) theo yêu cầu Sonth. **Đồng bộ với `renderTemplate`
  TTS hiện có** (vốn đã dùng `@key`). UI hiện token dạng chip + autocomplete. Xem [09](09-quy-dinh-variable.md) §1.
- ✅ **Ai quản lý biến — CHỐT LẠI 2026-07-16 (đổi hướng quan trọng):** layout **tự do khai token**
  `@var` bất kỳ, KHÔNG cần khớp danh sách nào, KHÔNG cần Event tồn tại trước (vì layout được
  thiết kế TRƯỚC Event). Event là nơi định nghĩa biến tùy chỉnh (rule) VÀ **map token của layout
  đã chọn sang nguồn giá trị thật** (`EventLayoutRef.fieldMap`) — map lại mỗi khi đổi layout, vì
  mỗi layout có token khác nhau. Chỉ **1 chiều** layout-designer → ceremony, KHÔNG có chiều
  ngược (layout-designer không hỏi Event gì cả — gợi ý autocomplete dùng bảng `variable_registry`
  nội bộ, ghi nhận lịch sử token đã gõ toàn cục). **Ceremony/backdrop (runtime) fill giá trị
  thật** lúc chạy slide. Xem [09](09-quy-dinh-variable.md) §2.5, §2.6.
- ✅ **Canonical đa loại đối tượng:** hybrid lõi chung (`full_name`, `image`, `status`) +
  `extra: Record<...>` cho field đặc thù (sinh viên/nhân viên/...); có thêm `CanonicalGroup`
  cho tập thể (danh nghĩa HOẶC có danh sách thành viên, dùng chung 1 type). Xem [11](11-canonical-da-loai-va-loop.md).
- ✅ **Trao giải tập thể:** `LoopItem` — thiết kế 1 khung, tự lặp theo `members`; 2 chiến lược
  overflow (`shrink` co nhỏ / `truncate` cắt + "+N") do người thiết kế chọn. Xem [11](11-canonical-da-loai-va-loop.md).
- ✅ **Tầng Event:** đứng giữa Layout và Ceremony-runtime — 1 Event = 1 đợt lễ cụ thể, tham
  chiếu layout có sẵn (3 mức tái dùng: giống hệt / override nhẹ / fork layout mới), tên chốt
  là **"Event"**. Kích hoạt Event **hoàn toàn thủ công**, không tự động theo lịch. Xem [10](10-quan-ly-dot-le-event.md).
- ✅ **Data global vs per-event:** cả 2 kiểu đều cần — `DataSource` với `mode: 'pooled'`
  (dùng chung nhiều Event, VD khen thưởng định kỳ) hoặc `'consumable'` (tiêu hao dần qua các
  đợt, VD trao bằng tốt nghiệp — SV đã nhận không xuất hiện lại). Xem [13](13-ceremony-mo-rong.md).
- ✅ **Selector điều kiện chọn layout thuộc về Event, KHÔNG thuộc `LayoutDocument`.**
  layout-designer chỉ quản lý danh sách layout (thuần hình); ceremony/control quyết định layout
  nào dùng cho ai, qua `EventLayoutRef.selector`. Hỗ trợ AND/OR (`groups[]` — OR giữa các group,
  AND trong 1 group), giải quyết trường hợp nhiều rule chồng nhau (GPA/giới tính/...) bằng
  `priority` (bắt buộc khi nhiều layoutRefs) — layout ưu tiên cao hơn thắng. UI dạng bảng
  kéo-thả, không lộ khái niệm "priority: number" ra người dùng không chuyên.
  Xem [06](06-luu-tru-va-giao-tiep.md), [10](10-quan-ly-dot-le-event.md), [13](13-ceremony-mo-rong.md).
- ✅ **Khi thiếu variant khớp tỷ lệ màn:** KHÔNG letterbox (không viền đen). Ưu tiên quay lại
  thiết kế thêm variant đúng tỷ lệ; nếu chưa kịp, chấp nhận **stretch** (kéo giãn/co méo) variant
  gần nhất để lấp đầy màn. Xem [04](04-schema-layout-document.md).
- ✅ **Không có cơ chế tự động bảo vệ người dùng** (không validate chặn thiếu layout mặc định) —
  người dùng tự chuẩn bị/tự quản lý, đổi lại hệ thống cung cấp **Import/Export đầy đủ** để họ
  chủ động kiểm tra trước khi chạy lễ. Xem [15](15-import-export.md). **`consumedIds` ghi theo
  luồng vận hành** (chạy đến ai — ấn tay/tự động/QR — thì đánh dấu người đó), KHÔNG tick tay
  tách biệt (đổi 2026-07-16, xem [13](13-ceremony-mo-rong.md), [20](20-rasoat-2026-07-16.md) §A3).
- ✅ **Event sống ở đâu:** nhúng UI trong `modules/ceremony/src/control/` (khu vực quản trị đã
  có sẵn, tách biệt với `src/backdrop/` = runtime trình chiếu) — KHÔNG tách module riêng.
  Schema (`EventStore`/`LayoutStore`/`DataSource`) vẫn độc lập, chỉ UI dùng chung chỗ chạy.
  Xem [13](13-ceremony-mo-rong.md).
- ✅ **Layout versioning (MỚI 2026-07-16):** publish/draft, lịch sử version đầy đủ, switch
  version (offline được, không cần cloud). Event **ghim `layoutVersion`** — layout đổi không tự
  ảnh hưởng lễ đang chạy; publish version mới → notice + user chủ động update (có check token).
  Xem [21](21-layout-versioning.md).
- ✅ **Editor-core package riêng (MỚI 2026-07-16):** `packages/layout-editor-core` — registry
  đầy đủ (command/undo-redo/history/zoom/snap/helper-line/drag-drop/item-type). Xem [23](23-editor-core-architecture.md).
- ✅ **Re-import DataSource qua modal (MỚI 2026-07-16):** diff git (thêm/ghi đè/xóa) + màn kết
  quả + khóa tự nhiên (id ổn định → người đã consumed không xuất hiện lại). Xem [22](22-import-modal.md).
- ✅ **Supabase = GIAI ĐOẠN CUỐI CÙNG (chốt 2026-07-16):** đẩy xuống sau khi hoàn thiện SQLite +
  layout-designer + Event + wizard + import/export + versioning. Xem [20](20-rasoat-2026-07-16.md) §E.

## Nguyên tắc xuyên suốt

1. **layout-designer là "người thiết kế hình", không phụ thuộc data/Event.** Giao tiếp với
   phần còn lại qua artifact (`LayoutDocument` JSON) + Layout Library (để sao chép chéo).
2. **`ceremony` không còn là 1 app đơn giản "chạy slide"** — là 1 cụm gồm khu vực quản trị
   (`control/`: Event, data, mapping, selector — việc soạn trước) và runtime trình chiếu
   (`backdrop/`: đọc Event active, render, fill token — việc chạy lúc lễ diễn ra). Xem [13](13-ceremony-mo-rong.md).
3. **Schema đặt ở `packages/slide-shared`** (hoặc `service-contracts` cho các port) để mọi
   phần dùng chung 1 nguồn type — layout-designer, control/, backdrop/ đều import cùng chỗ.
4. **Tách bạch 4 trục độc lập, mỗi trục 1 chủ sở hữu:** layout (hình, sở hữu bởi layout-designer)
   ≠ biến tùy chỉnh (token+rule, sở hữu bởi Event) ≠ data (record thật, sở hữu bởi DataSource)
   ≠ điều kiện chọn layout (selector/priority, sở hữu bởi Event, KHÔNG phải layout).
5. **Không tự động hoá thay người dùng khi hậu quả sai là rủi ro vận hành thật** (chuyển Event
   active, đánh dấu data đã dùng, đảm bảo luôn có layout fallback) — ưu tiên cho công cụ
   Import/Export để người dùng tự kiểm tra, thay vì validate/tự động ngầm dễ gây bất ngờ.
6. **Ports & adapters** — nhất quán với kiến trúc sky-app đã chốt (xem `docs/architecture`).
