# 18 — Lưu trữ: SQLite (local) + Supabase (đồng bộ theo tenant)

> Chốt 2026-07-16: thay đổi nền tảng so với mọi thiết kế lưu trữ trước đó trong blueprint này
> (file 06 nói "local/file trước, Supabase sau — GĐ2"; ceremony hiện tại đang chạy thật bằng
> file JSON, xem khảo sát ở cuối phiên trước). Quyết định mới: **bỏ hẳn file JSON làm nguồn
> lưu trữ chính, chuyển sang SQLite làm database local cho MỌI THỨ** (ceremony bundle hiện có
> LẪN Event/DataSource/LayoutStore đang thiết kế), Supabase là tầng đồng bộ đa-tenant cho giai
> đoạn sau. File này phân tích + đánh giá hướng đi, làm căn cứ kế hoạch triển khai.

## 1. Quyết định phạm vi (đã chốt, không phải đề xuất)

| | Quyết định |
|---|---|
| SQLite áp dụng cho | **Toàn bộ** — cả ceremony bundle hiện tại (student/config/session, đang là `bundle.json`) LẪN mọi thứ blueprint này đang thiết kế (Event, DataSource, LayoutDocument, FieldMappingProfile) |
| Electron | Dùng SQLite local (`better-sqlite3`, file thật); về sau có **3 chế độ**: offline (SQLite local) / online (Supabase trực tiếp) / đồng bộ (kéo online → offline, đẩy thay đổi lên) |
| Web | **3 tầng ưu tiên**, xem §1a — `data-service` (SQLite server-side) khi có sẵn → fallback SQLite-WASM (`sql.js`, chạy thẳng trong trình duyệt, lưu IndexedDB) khi không có server → Supabase khi đã triển khai GĐ2 |
| Supabase | Đồng bộ dữ liệu theo **tenant**, và đồng bộ **2 chiều** giữa server và Electron client (kéo dữ liệu về máy, đẩy trạng thái/log vận hành lên) — **phân tích ngay ở giai đoạn này** để làm kế hoạch, KHÔNG implement bây giờ |

### 1a. Vì sao Web cần 3 tầng thay vì chỉ qua `data-service` (chốt 2026-07-16)

**Vấn đề phát hiện khi lên kế hoạch triển khai code (không phải lý thuyết):** `data-service`
(Fastify) là **persistent server + cần filesystem ghi được** — 2 điều kiện mà môi trường
serverless (Vercel và tương đương) **không đáp ứng được về mặt kỹ thuật** (Vercel function
không có filesystem bền, không giữ được process sống liên tục). Vì vậy nếu triển khai `shell-web`
lên môi trường serverless mà chưa tới lúc làm Supabase (GĐ2, còn ở backlog), `data-service`
đơn giản là **không chạy được** ở đó — cần 1 lối thoát cho khoảng thời gian ở giữa.

**Mục đích thật của việc thêm SQLite-WASM (không phải "thêm cho đủ bộ"):**
- Cho phép người dùng **làm việc trên web ngay cả khi không có server nào cả** (không
  `data-service`, chưa có Supabase) — dữ liệu (layout, Event, ceremony config, danh sách...)
  vẫn được lưu **trên đúng máy/trình duyệt đó** (IndexedDB), không mất khi đóng tab.
- Kết hợp với Import/Export (file 15) đã có sẵn: người dùng làm trên web (SQLite-WASM local)
  → **Export** ra file → mang file đó **Import vào bản Electron** ở một máy khác — đây là cách
  "đồng bộ thủ công" trong lúc CHƯA có Supabase, dùng đúng cơ chế Import/Export đã thiết kế cho
  mục đích khác (backup/di chuyển layout) nhưng giờ kiêm thêm vai trò "cầu nối web ⇄ Electron".
- Đây **không phải** cơ chế đồng bộ nhiều máy/nhiều người dùng chung dữ liệu qua mạng — mỗi
  trình duyệt SQLite-WASM là 1 đảo dữ liệu độc lập, cô lập hoàn toàn với trình duyệt khác. Khi
  cần nhiều người/nhiều máy cùng thao tác chung 1 bộ dữ liệu qua mạng thật sự, đó chính xác là
  lúc cần Supabase (GĐ2) — SQLite-WASM KHÔNG thay thế được vai trò đó, chỉ lấp khoảng trống
  "web hoạt động độc lập, không cần server" ở giai đoạn hiện tại.

**Thứ tự ưu tiên runtime của `shell-web` (health-check tại lúc khởi động):**
```
1. Thử gọi data-service (nếu đang chạy/khả dụng — VD dev local, hoặc tự host có server riêng)
2. Không có/không phản hồi → fallback sang SqliteWasmAdapter (sql.js + IndexedDB, tự chứa)
3. (GĐ2, sau này) Nếu đã đăng nhập tenant qua Supabase → ưu tiên SupabaseDataStore,
   SqliteWasmAdapter lúc này đổi vai trò thành cache offline (giống SQLite của Electron)
```

**Hệ quả kiến trúc:** `DataStore` interface (packages/service-contracts, xem §4) phải trừu
tượng đủ để 3 adapter (`SqliteAdapter` qua `data-service`, `SqliteWasmAdapter` trong trình
duyệt, `SupabaseDataStore` sau này) cùng implement được — `shell-web` code gọi qua interface,
không biết/không quan tâm đang chạy adapter nào. Đây là lý do interface `DataStore` được thiết
kế ngay từ Giai đoạn 0 dù chỉ 1 trong 3 adapter được code thật ở giai đoạn này (xem checklist
Giai đoạn 0 trong plan triển khai).

## 2. Vì sao đổi từ JSON/localStorage sang SQLite — đánh giá thẳng

### Vấn đề thật của cách cũ (không phải lý thuyết — đã thấy trong code ceremony đang chạy)

Khảo sát ceremony hiện tại (2026-07-15) cho thấy cách "file JSON + `writeFileSync`" đã bắt đầu
lộ rõ giới hạn dù mới chỉ có 1 loại dữ liệu (student/config):

- **Ghi đè toàn bộ file mỗi lần đổi 1 field.** `applyMerge()`/`updateConfig()` đều đọc hết
  `bundle.json`, sửa trong bộ nhớ, `writeFileSync` lại NGUYÊN file — với vài trăm sinh viên
  vẫn ổn, nhưng đây là pattern **không scale** khi Event/DataSource cộng thêm vào (nhiều Event,
  mỗi Event nhiều `layoutRefs`, `consumedIds` tích luỹ qua thời gian — ghi đè cả file mỗi lần
  tick 1 người "đã xử lý" là lãng phí và có rủi ro race condition nếu 2 thao tác ghi đồng thời).
- **Không có transaction.** Nếu ghi file bị ngắt giữa chừng (crash, mất điện) → file JSON có
  thể hỏng/half-written, không có cơ chế rollback. `sync.ts` đã phải tự chế "staging + commit"
  (giải nén ZIP vào thư mục tạm, verify, rồi mới move) để né vấn đề này — đây chính là thứ
  transaction của database giải quyết miễn phí.
- **Truy vấn phải tự viết bằng JS.** VD "liệt kê consumedIds của mọi Event từng dùng chung 1
  DataSource" (đã nêu ở file 13, còn là câu hỏi mở) — với JSON phải tự loop qua toàn bộ Event
  trong bộ nhớ; với SQLite là 1 câu `SELECT` có index.
- **Không có nơi tự nhiên để đặt ràng buộc dữ liệu** (VD "1 Event chỉ có tối đa 1 layoutRef
  mặc định", "priority không trùng nhau trong cùng Event") — JSON không tự validate, phải tự
  viết code kiểm tra mỗi nơi ghi; SQLite có `UNIQUE`, `CHECK`, `FOREIGN KEY`.

### Vì sao SQLite (không phải giữ JSON, không phải nhảy thẳng lên Postgres cục bộ)

- **Vẫn là "1 file, chép/di chuyển được"** — giữ đúng ưu điểm quan trọng nhất của JSON (dễ
  backup/export, không cần chạy server riêng) mà cơ chế Import/Export ZIP hiện tại đang dựa
  vào — với SQLite chỉ cần đổi "chép `bundle.json`" thành "chép `ceremony.db`", cơ chế ZIP
  streaming (`archiver`) giữ nguyên tinh thần.
- **Có transaction + query thật + ràng buộc** — giải toàn bộ 4 vấn đề nêu trên.
- **Đã có schema quan hệ tự nhiên trong blueprint** — `EventDocument.layoutRefs[]`,
  `DataSource.records[]`, `Student` với nhiều field — đây vốn dĩ là dữ liệu QUAN HỆ (Event
  tham chiếu Layout, Event tham chiếu DataSource, DataSource chứa nhiều Record), SQL biểu diễn
  tự nhiên hơn nhiều so với việc nhét tất cả vào 1 cây JSON lồng nhau.
- **Cùng 1 engine cho cả Electron và Node (data-service)** — thư viện SQLite phổ biến
  (`better-sqlite3`) chạy được cả 2 môi trường mà không cần server riêng, khớp đúng mô hình
  "mỗi máy tự chứa data của chính nó" đang có.

## 3. Vì sao KHÔNG migrate JSON→SQLite bằng script tự động — dựng schema mới, seed lại

Nhất quán với quyết định đã chốt ở file 03 ("KHÔNG convert `backdrops.json` cũ — dựng lại từ
đầu bằng công cụ mới"): áp dụng **cùng triết lý** cho lần migrate này.

- Ceremony hiện tại **chưa triển khai sản xuất thật** (đang port từ repo cũ, xem file 02) —
  chi phí viết + kiểm chứng 1 script convert JSON→SQLite cho vài trăm bản ghi test tốn công
  hơn hẳn so với việc dựng schema đúng ngay từ đầu và re-seed từ `sample-bundle/` đã có sẵn.
- Convert tự động dễ mang theo "nợ cấu trúc" của JSON cũ (VD field thừa từ giai đoạn thử
  nghiệm trước) sang thẳng SQLite — trong khi đây là cơ hội thiết kế schema quan hệ đúng ngay.
- **Ngoại lệ duy nhất cần giữ:** cơ chế `resolveAsset`/thư mục ảnh-voice (`ceremony-data/
  {image,voice,assets,_assets}/`) — đây là file nhị phân, không đổi gì, SQLite chỉ lưu
  **đường dẫn tương đối** trỏ vào đúng cấu trúc thư mục đang có, không đổi cách resolve asset.

## 4. Kiến trúc: 1 port chung, 4 adapter (Electron 1 + Web 2 + Supabase dùng chung)

Giữ đúng nguyên tắc "ports & adapters" đã xuyên suốt toàn bộ blueprint — mọi cách lưu trữ là
**adapter khác nhau** cùng implement **1 interface `DataStore` chung**, app (layout-designer,
ceremony/control, ceremony/backdrop) chỉ gọi qua interface, không biết đang chạy adapter nào.

```ts
// packages/service-contracts (hoặc slide-shared) — interface chung, KHÔNG đổi khi thêm adapter
export interface DataStore {
  // Ceremony hiện có (student/config/session) — port hoá lại từ bundle.json
  getCeremonyBundle(): Promise<CeremonyBundle>;
  saveCeremonyBundle(bundle: CeremonyBundle): Promise<void>;
  // Event/DataSource/Layout — port mới từ blueprint này (file 06/10/13)
  events: EventStore;           // đã phác ở file 10
  layouts: LayoutStore;         // đã phác ở file 06
  dataSources: DataSourceStore; // mới, xem §5
}
```

### 4 adapter — Electron dùng SQLite file thật; Web có 2 tầng fallback; Supabase dùng chung sau

| Adapter | Chạy ở | Cơ chế | Giai đoạn |
|---|---|---|---|
| `SqliteAdapter` (Electron) | Electron main process | `better-sqlite3` native, đọc/ghi file `.db` local thật, transaction thật | **Giai đoạn 0 — code thật** |
| `SqliteAdapter` (server-side, qua `data-service`) | Web, khi `data-service` khả dụng (dev local / tự host có server riêng) | `shell-web` gọi HTTP → `data-service` (Fastify) → cùng `better-sqlite3`, khác instance file | **Giai đoạn 0 — code thật** |
| `SqliteWasmAdapter` | Web, fallback khi KHÔNG có `data-service` (VD deploy serverless như Vercel, chưa có server riêng) | `sql.js` (SQLite biên dịch WASM) chạy thẳng trong trình duyệt, persist vào IndexedDB — dữ liệu chỉ tồn tại trên đúng trình duyệt/máy đó, không đồng bộ mạng. Xem lý do ở §1a | Giai đoạn 0 — **chỉ thiết kế interface tương thích, code thật cùng đợt với `SqliteAdapter`** (đã chốt làm luôn, không lùi) |
| `SupabaseDataStore` | Electron (chế độ online) + Web (khi đã có tenant/đăng nhập) | REST/Realtime qua Supabase client, theo `tenant_id`, đồng bộ 2 chiều với Electron (kéo dữ liệu về, đẩy trạng thái/log vận hành lên) | GĐ2 — xem §6 |
| `SyncingDataStore` | Chỉ Electron (chế độ đồng bộ) | Bọc quanh `SqliteAdapter`, định kỳ/theo yêu cầu kéo dữ liệu mới nhất từ `SupabaseDataStore` về ghi đè SQLite local, và đẩy thay đổi local lên khi có mạng | GĐ2, xây sau `SupabaseDataStore` đã ổn |

Điểm chọn adapter cho Web nằm ở 1 lớp mỏng lúc khởi động `shell-web` (health-check
`data-service`), không phải rẽ nhánh rải rác khắp code — xem sơ đồ ưu tiên ở §1a.

`SyncingDataStore` không phải adapter thứ 3 độc lập về data access — nó là 1 lớp **điều phối**
giữa 2 adapter kia (đọc/ghi local trước, đồng bộ nền), nên có thể triển khai sau cùng.

## 5. Schema SQLite sơ bộ (bảng, không phải DDL đầy đủ — dùng để hình dung quan hệ)

> Tên bảng/cột là nháp, sẽ tinh chỉnh khi thực sự viết migration. Mục đích ở đây là xác nhận
> cấu trúc quan hệ đúng, không phải chốt SQL cuối cùng.

```
ceremony            (id, name, graduation_year, date, venue, ..., updated_at)
app_config           (id, ceremony_id FK, ws_port, mode, idle_timeout_*, ...)
student               (id, ceremony_id FK, student_code, full_name, ..., status, ts_checkin, ...)
custom_variable       (id, scope_type ['event'], scope_id FK, key, label, default_value)
custom_variable_rule  (id, custom_variable_id FK, attr, op, val, result, order_index)

layout_document       (id, name, description, version, created_at, updated_at)
layout_variant        (id, layout_document_id FK, aspect_id, ref_w, ref_h, background_json)
layout_item           (id, layout_variant_id FK, type, box_json, content_json, order_index)
                      -- box_json/content_json giữ dạng JSON TEXT cho phần lồng nhau tự do
                      -- (item property), tránh chẻ quá sâu thành bảng — đây là chỗ SQLite
                      -- lai JSON hợp lý (cột JSON1, vẫn query được nếu cần)

data_source            (id, label, mode ['pooled'|'consumable'], mapping_profile_id FK)
data_source_record     (id, data_source_id FK, subject_type, full_name, image_path, status,
                         extra_json)                    -- record cá nhân/tập thể, xem file 11
field_mapping_profile   (id, label, target_subject_type, map_json)

event                  (id, name, status, scheduled_at, data_source_id FK NULLABLE,
                         cloned_from FK NULLABLE, created_at, updated_at)
event_layout_ref        (id, event_id FK, layout_document_id FK, priority, selector_json,
                          overrides_json)
event_consumed_record   (event_id FK, data_source_record_id FK, consumed_at)
                        -- bảng nối — thay cho EventDocument.consumedIds mảng string, giờ là
                        -- quan hệ nhiều-nhiều thật, dễ tổng hợp "toàn bộ đã dùng của nguồn X"
                        -- (câu hỏi mở ở file 13) bằng 1 JOIN, không cần cache field riêng
```

**Điểm hay lộ ra khi chuyển sang SQL** (không thấy rõ lúc còn nghĩ bằng JSON): câu hỏi mở ở
file 13 *"consumedIds cộng dồn qua nhiều Event — tính on-the-fly hay cache?"* **tự nhiên biến
mất** — `event_consumed_record` là 1 bảng nối chuẩn, `SELECT data_source_record_id FROM
event_consumed_record WHERE data_source_id = ?` (qua JOIN) luôn đúng, không cần chọn giữa
on-the-fly/cache. Đây là ví dụ cụ thể cho thấy SQLite không chỉ "lưu trữ tốt hơn" mà còn **giải
được 1 câu hỏi thiết kế đã treo** một cách tự nhiên.

## 6. Phân tích & đánh giá Supabase multi-tenant (theo yêu cầu — làm ngay, chưa implement)

### Bài toán tenant là gì trong ngữ cảnh này

"Tenant" = 1 đơn vị tổ chức độc lập dùng chung hệ thống (VD Trường Đại học A, Trường Đại học B,
hoặc trong ngữ cảnh doanh nghiệp: Công ty X, Công ty Y) — dữ liệu (Event, layout, sinh viên/
nhân viên) của tenant này **không được** tenant khác nhìn thấy, dù chạy trên cùng hạ tầng
Supabase.

### Phương án mô hình hoá tenant trong Supabase — đánh giá 2 hướng

| | A — 1 project Supabase chung, cột `tenant_id` + Row-Level Security (RLS) | B — Mỗi tenant 1 project Supabase riêng |
|---|---|---|
| Cách ly dữ liệu | Logic (RLS policy chặn theo `tenant_id`) | Vật lý (project khác nhau hoàn toàn) |
| Chi phí vận hành | 1 project để quản lý, dễ maintain/update schema 1 lần | N project — phải tự động hoá tạo/migrate cho từng tenant, tốn công vận hành hơn nhiều |
| Rủi ro rò rỉ chéo tenant | Có, nếu RLS policy viết sai (lỗi lập trình có thể lộ data) | Không thể rò — cách ly cứng ở tầng hạ tầng |
| Phù hợp quy mô | Tốt cho **nhiều tenant nhỏ/vừa** (nhiều trường học, mỗi trường vài trăm-vài nghìn bản ghi/năm) | Tốt hơn cho **ít tenant nhưng rất lớn** hoặc cần cam kết cách ly cứng theo hợp đồng (VD khách doanh nghiệp yêu cầu compliance) |
| Free tier Supabase | 1 project đủ dùng | Free tier giới hạn 2 project/org — không scale nếu nhiều tenant |

**Đánh giá cho ngữ cảnh sky-app (trường học + có thể mở rộng doanh nghiệp):** nghiêng
**phương án A** (1 project + RLS theo `tenant_id`) — vì:
- Số lượng tenant dự kiến là "nhiều trường/nhiều đợt lễ", không phải vài khách hàng lớn cần
  cách ly hạ tầng riêng theo hợp đồng.
- Chi phí vận hành N project (B) không tương xứng với quy mô dữ liệu mỗi tenant (1 đợt lễ chỉ
  vài trăm/vài nghìn bản ghi, không phải big data cần tách hạ tầng).
- RLS của Supabase (dựa trên Postgres RLS) là cơ chế trưởng thành, rủi ro "viết sai policy" có
  thể giảm bằng test + review kỹ trước khi launch multi-tenant thật.

### Hệ quả thiết kế nếu theo phương án A (để chuẩn bị trước, không code ngay)

- Mọi bảng ở §5 cần thêm cột `tenant_id` (trừ các bảng thuần cấu hình không phụ thuộc tenant,
  nếu có).
- `SupabaseDataStore` cần biết `tenant_id` hiện tại (từ phiên đăng nhập/license — sky-app đã
  có `packages/licensing` xử lý entitlement, có thể tái dùng cơ chế xác định danh tính ở đó
  thay vì làm mới).
- SQLite local (Electron offline) **không cần cột `tenant_id`** — vì mỗi máy Electron chạy
  offline chỉ phục vụ đúng 1 tenant tại 1 thời điểm (đã đăng nhập, đã chọn), không cần cách ly
  nhiều tenant trong cùng 1 file `.db` local. Cột `tenant_id` chỉ có ý nghĩa ở tầng Supabase
  dùng chung nhiều tenant.

### Đồng bộ (SyncingDataStore) — điểm cần cân nhắc kỹ khi triển khai thật (chưa chốt cách làm)

- **Xung đột ghi (conflict):** nếu người dùng sửa data lúc offline, rồi có người khác (hoặc
  chính họ trên máy khác) cũng sửa data đó trên Supabase trong lúc offline — khi đồng bộ lại
  ai thắng? Cần chiến lược (last-write-wins theo `updated_at`, hoặc merge thủ công) — **chưa
  chốt, để làm kế hoạch GĐ2**.
- **Đồng bộ 1 chiều hay 2 chiều:** "kéo online → offline" (nêu trong yêu cầu) gợi ý ưu tiên
  1 chiều (Supabase là nguồn chân lý, Electron chỉ cache về để chạy offline) — đơn giản hơn
  nhiều so với đồng bộ 2 chiều thật sự. Nên làm rõ: lúc Electron offline có được PHÉP sửa data
  rồi đẩy ngược lên Supabase không, hay offline = chỉ đọc?

## 7. Việc cần làm khi triển khai thật (checklist, KHÔNG làm ngay)

- [ ] Chọn thư viện SQLite cho Node/Electron (`better-sqlite3` là lựa chọn phổ biến nhất, đồng
      bộ, hiệu năng tốt cho use case này — cần xác nhận build native module hoạt động ổn trong
      Electron packaged app, đây là điểm hay gây rắc rối build/deploy với các package `.node` native).
- [ ] Chọn thư viện SQLite-WASM cho `SqliteWasmAdapter` (`sql.js` — phổ biến nhất, đơn giản hoá
      persist qua IndexedDB bằng cách tự dump/load `Uint8Array`; cân nhắc `wa-sqlite` nếu cần
      OPFS thật cho hiệu năng tốt hơn, nhưng phức tạp hơn — đề xuất bắt đầu bằng `sql.js` đơn giản).
- [ ] Viết migration tool cho chính SQLite (schema versioning) — vì giờ có schema thật, cần
      cơ chế nâng cấp schema qua các version app, không chỉ "đọc JSON tuỳ ý" như trước. Cùng bộ
      file `.sql` migration nên dùng chung được cho cả `SqliteAdapter` lẫn `SqliteWasmAdapter`
      (cùng là SQLite, chỉ khác driver — `better-sqlite3` vs `sql.js`).
- [ ] Định nghĩa lại Import/Export (file 15) dựa trên SQLite — `archiver` vẫn dùng được, nhưng
      nội dung zip đổi từ "students.json + image/ + voice/" sang "ceremony.db (hoặc export ra
      JSON snapshot để người dùng vẫn xem/sửa tay được nếu cần) + image/ + voice/". Với
      `SqliteWasmAdapter`, Export/Import chính là cầu nối "làm trên web offline → mang vào
      Electron" — xem §1a.
- [ ] `apps/data-service` (Fastify web) cần thêm dependency SQLite, đổi toàn bộ `store.ts` từ
      `readFileSync`/`writeFileSync` sang query SQL.
- [ ] `shell-web`: viết lớp health-check chọn adapter lúc khởi động (gọi thử `data-service`,
      timeout ngắn → fallback `SqliteWasmAdapter` nếu không phản hồi) — xem thứ tự ưu tiên §1a.
- [ ] Xác nhận lại với Sonth: khi migrate ceremony bundle hiện tại sang SQLite, `sample-bundle/`
      (dữ liệu mẫu dùng cho dev/demo) có cần chuyển thành file `.db` mẫu luôn không, hay vẫn
      giữ JSON làm nguồn "seed" rồi có script tạo `.db` từ đó lúc khởi tạo lần đầu?

## 8. Việc cập nhật các file blueprint khác (đồng bộ thuật ngữ)

- [ ] [06-luu-tru-va-giao-tiep.md](06-luu-tru-va-giao-tiep.md): `LayoutStore`/adapter table
      đang ghi "local/file GĐ1 → Supabase GĐ2" — cần đổi thành "SQLite (Electron+Web) → thêm
      Supabase GĐ2 song song, không thay thế hoàn toàn ở Electron (giữ chế độ offline)".
- [ ] [10-quan-ly-dot-le-event.md](10-quan-ly-dot-le-event.md): `EventStore` tương tự — bỏ
      cụm "local/file trước", trỏ sang file này.
- [ ] [13-ceremony-mo-rong.md](13-ceremony-mo-rong.md): `DataSource` — đóng câu hỏi mở
      "`consumedIds` cache hay on-the-fly" bằng lời giải bảng nối `event_consumed_record` ở §5.
- [ ] [15-import-export.md](15-import-export.md): cập nhật định dạng export theo SQLite (§7).
- [ ] [00-index.md](00-index.md): thêm dòng trỏ file này, sửa mục "Lưu trữ" trong phần
      "Chốt chính thức" (hiện đang ghi "local/file trước để dev tính năng, Supabase sau").

## 9. Câu hỏi mở

- ~~`better-sqlite3` vs `sql.js`/`wa-sqlite`~~ — **CHỐT 2026-07-16 (đổi hướng so với quyết định
  ban đầu):** làm **cả hai**, không phải chọn 1. `better-sqlite3` cho Electron + `data-service`
  (server-side), `sql.js` (WASM) cho `SqliteWasmAdapter` chạy thẳng trong trình duyệt — vì phát
  sinh nhu cầu thật: web cần hoạt động được cả khi KHÔNG có server nào (triển khai serverless
  như Vercel, hoặc tự host nhưng server tạm ngưng). Xem lý do đầy đủ ở §1a.
- File `.db` local trên Electron đặt ở đâu — theo đúng pattern đã có (`app.getPath('userData')/
  ceremony-data/`, đổi tên file từ `bundle.json` thành `ceremony.db`) hay đặt tên/thư mục khác?
  Đề xuất: giữ nguyên thư mục `ceremony-data/`, chỉ đổi tên file, để không phải sửa lại toàn bộ
  cơ chế `resolveAsset` (vẫn trỏ đúng thư mục ảnh/voice cạnh đó).
- Ranh giới rõ giữa "SQLite bảng nào cho ceremony cũ" và "SQLite bảng nào cho Event/DataSource
  mới" — có nên tách 2 file `.db` riêng (`ceremony.db` + `layout-events.db`) hay 1 file `.db`
  chung chứa mọi bảng? Đề xuất nghiêng **1 file chung** — vì Event tham chiếu `student`/
  `ceremony` qua `data_source_record`, tách 2 file sẽ mất khả năng `FOREIGN KEY`/`JOIN` xuyên
  bảng, phải tự nối bằng code — đánh mất đúng lợi ích chính của việc chuyển sang SQL.
