# 10 — Quản lý Đợt lễ / Chiến dịch (Event/Campaign)

> Yêu cầu mới (2026-07-15): nhiều đợt lễ khác nhau (trao giải NV xuất sắc quý, tổng kết năm,
> trao bằng đợt 1/2 năm 2026...), tạo sẵn trước, đến ngày chuyển qua dùng; đợt mới có thể
> **tái sử dụng một phần hoặc toàn bộ** đợt cũ (chỉ đổi background, hoặc khác hẳn).
> Đây là lý do "ceremony định nghĩa custom_variables" ở file 09 KHÔNG ổn — sửa lại ở đây.

## Vì sao "ceremony" không phải chủ sở hữu đúng

Bản 09 viết: "Per-ceremony variables — Ceremony định nghĩa". Nhưng khảo sát code cho thấy
**"ceremony" trong sky-app hiện tại = 1 module app chạy slide, gắn với 1 `CeremonyBundle` duy
nhất (`room_id`, 1 bộ `AppConfig`, 1 danh sách `students`)** — nó là **runtime của MỘT buổi
lễ tại một thời điểm**, không phải nơi quản lý nhiều buổi lễ song song.

Khi bạn cần "tạo sẵn nhiều đợt, đến ngày chuyển qua" + "đợt mới kế thừa đợt cũ" — đó là nhu cầu
quản lý ở **một tầng cao hơn cả layout lẫn 1 lần chạy ceremony**. Đặt tên tầng đó là **Event**
(hoặc Campaign — xem câu hỏi đặt tên ở cuối).

## Mô hình 4 tầng (thêm 1 tầng so với bản trước)

```
┌─ TẦNG 0 — GLOBAL (code, slide-shared) ─────────────────────────────┐
│  Biến hệ thống cố định: full_name, gpa, student_code...             │
└───────────────────────────────────────────────────────────────────┘
                              │
┌─ TẦNG 1 — EVENT (định nghĩa MỚI, đây là chỗ trả lời câu hỏi) ──────┐
│  1 "Event" = 1 buổi lễ/chiến dịch cụ thể:                            │
│    "Trao giải NV xuất sắc Q3/2026", "Trao bằng đợt 2 năm 2026"      │
│  Event SỞ HỮU:                                                       │
│    - custom_variables (biến tùy chỉnh + rule) CỦA RIÊNG event này    │
│    - selector layout (điều kiện chọn layout theo event này)          │
│    - danh sách layout ĐƯỢC DÙNG trong event (tham chiếu tới          │
│      LayoutDocument, không copy — xem §"tái sử dụng")                │
│    - lịch trình: ngày giờ diễn ra, trạng thái (nháp/sẵn sàng/đã qua) │
│    - liên kết tới data thật (FieldMappingProfile + record đã import) │
└───────────────────────────────────────────────────────────────────┘
                              │
┌─ TẦNG 2 — LAYOUT (đã có ở file 04) ────────────────────────────────┐
│  LayoutDocument — thuần hình + token, KHÔNG gắn cứng với 1 Event     │
│  → CÓ THỂ dùng lại giữa nhiều Event (đúng yêu cầu tái sử dụng)       │
└───────────────────────────────────────────────────────────────────┘
                              │
┌─ TẦNG 3 — RUNTIME (ceremony app, lúc chạy slide) ──────────────────┐
│  ceremony CHỈ đọc: "Event đang active hôm nay là gì?"                │
│  → load Event → load layouts của Event → load data của Event         │
│  → fill token → hiển thị. Ceremony KHÔNG định nghĩa gì cả.            │
└───────────────────────────────────────────────────────────────────┘
```

**Sửa lại quy định:** custom_variables **thuộc về Event**, không thuộc về "ceremony app".
Ceremony app (module chạy slide) chỉ là **runtime đọc Event đang active** — giống hệt vai trò
nó đã có với layout (tiêu thụ, không sở hữu).

## App nào quản lý Event?

Đây là câu hỏi kiến trúc mới cần quyết: Event là 1 khái niệm **ngang hàng hoặc bao trùm** cả
layout-designer lẫn ceremony-runtime. Ba lựa chọn:

### Lựa chọn E1 — Event quản lý trong chính ceremony module (mở rộng UI hiện có)
- Ceremony đã có `SettingsModal`, `CustomVariablesContent.tsx`, `LayoutConfigContent.tsx` —
  thêm 1 tab "Đợt lễ" quản lý danh sách Event, switch active Event.
- ✅ Ít việc nhất, tái dùng UI/store đang có.
- ❌ Lẫn lộn vai trò: ceremony vừa là "nơi quản lý nhiều đợt" vừa là "runtime chạy 1 đợt" —
  đúng cái đang gây rối (giống việc "ceremony định nghĩa custom_variables" ở bản trước).

### Lựa chọn E2 — Event là 1 module/app riêng thứ 3 (ngang hàng layout-designer & ceremony)
```
modules/
  layout-designer/     ← thiết kế HÌNH (layout thuần, không biết Event nào dùng)
  event-manager/        ← MỚI: quản lý Event (custom_variables, lịch, chọn layout, data)
  ceremony/              ← CHỈ CÒN runtime: đọc Event active → chạy slide
```
- ✅ Tách bạch rõ 3 vai trò: **thiết kế hình** / **soạn nội dung + lịch 1 đợt** / **trình chiếu**.
- ✅ Đúng tinh thần "ports & adapters" đã chốt cho sky-app — mỗi module 1 trách nhiệm.
- ✅ Giải quyết đúng nhu cầu "tạo sẵn nhiều đợt, đến ngày chuyển qua" — event-manager là nơi
  liệt kê/lên lịch, ceremony chỉ hỏi "hôm nay Event nào active".
- ❌ Nhiều việc hơn — thêm 1 module, thêm 1 store, thêm luồng giao tiếp thứ 3.

### Lựa chọn E3 — Event là 1 phần của layout-designer (mở rộng phạm vi)
- Layout-designer không chỉ:  chỉ thiết kế hình mà còn "soạn Event" (chọn layout, set biến,
  set lịch) trong cùng 1 app.
- ❌ Phình phạm vi layout-designer ra khỏi tên gọi của nó ("designer" mà lại quản lý lịch/data).
- ❌ Lặp lại đúng vấn đề "ceremony ôm nhiều việc" — chỉ chuyển từ app này sang app khác.

### ĐÃ CHỐT (2026-07-15, xem [13-ceremony-mo-rong.md](13-ceremony-mo-rong.md)): E1 có sửa —
nhúng trong `modules/ceremony/src/control/`, KHÔNG tách module riêng

Quyết định cuối khác với khuyến nghị "E2" ban đầu ở đây — lý do: `control/` (khu vực đã có sẵn
trong ceremony, chứa `StudentList`, `SettingsModal`...) **vốn dĩ đã đúng vai trò** "phòng điều
khiển, tách biệt với màn trình chiếu `backdrop/`" — không phải "ceremony ôm việc" như lo ngại
ban đầu về E1, mà là mở rộng đúng 1 khu vực đã có ranh giới rõ từ trước.

**Vẫn giữ nguyên tắc tách theo SCHEMA** (không đổi so với khuyến nghị ban đầu): `EventDocument`/
`EventStore` là schema/port độc lập, KHÔNG lẫn vào `AppConfig` — chỉ khác ở chỗ UI chạy trong
`control/` thay vì 1 app mới. Nếu sau này thật sự cần tách UI, đó là việc đổi chỗ chạy code,
không phải migrate dữ liệu. Xem phân tích đầy đủ 6 trách nhiệm mới ở
[13-ceremony-mo-rong.md](13-ceremony-mo-rong.md).

## Schema Event Document (draft)

```ts
export interface EventDocument {
  id: string;                    // "trao-bang-dot-2-2026"
  name: string;                  // "Lễ trao bằng đợt 2 năm 2026"
  // status: 'active' chỉ là NHÃN theo dõi/lọc/tìm kiếm — KHÔNG mang nghĩa tự động (không "đến
  // ngày X tự active", không "vì active nên cái khác không được active"). Kể cả bỏ 'active'
  // cũng không sao. setActive() thủ công (A9) là cách duy nhất đổi Event đang chạy. Chốt
  // 2026-07-16, xem 20-rasoat-2026-07-16.md §A1 (không cần tách con trỏ cục bộ).
  status: 'draft' | 'scheduled' | 'active' | 'archived';
  scheduledAt?: string;          // ISO datetime — khi nào đợt này diễn ra
  archivedAt?: string;

  // Biến tùy chỉnh CỦA RIÊNG event này (rule-based, như CustomVariable cũ)
  customVariables: CustomVariable[];

  // Layout được dùng trong event này — THAM CHIẾU tới LayoutDocument có sẵn,
  // KHÔNG copy nội dung layout vào đây (giữ layout tái dùng được, sửa 1 nơi)
  layoutRefs: EventLayoutRef[];

  // Nguồn data thật của đợt này — ĐÃ SỬA (xem 13-ceremony-mo-rong.md §"Trách nhiệm 4"):
  // đổi dataSnapshotId → dataSourceId, vì data giờ có 2 chế độ (pooled/consumable), không
  // còn là 1 "snapshot" đơn giản nữa.
  //
  // OPTIONAL — CHỐT 2026-07-15 (xem 14-rasoat-2026-07-15.md §1b): "user tạo trước sự kiện,
  // layout, nhưng không nhất thiết phải có kèm data, vì data có thể chưa được chốt cả về
  // số lượng lẫn danh sách. User có thể chủ động tạo trước những nội dung khác trước rồi
  // import data map sau." → Event có thể tồn tại ở status='draft' mà CHƯA có dataSourceId.
  dataSourceId?: string;         // trỏ tới 1 DataSource (xem file 13) — thay cho dataSnapshotId
  consumedIds?: string[];        // CHỈ có ý nghĩa khi DataSource.mode='consumable': id các
                                   // record đã "dùng" ở Event này. KHÔNG có cơ chế tự động ghi
                                   // field này (xem quyết định #15 ở file 14) — người dùng tự
                                   // quản lý qua import/export, không gắn vào runtime chạy lễ.

  // Kế thừa — xem §"Tái sử dụng" bên dưới
  clonedFrom?: string;           // id của Event nguồn nếu tạo bằng "Nhân bản"

  createdAt: string;
  updatedAt: string;
}

export interface EventLayoutRef {
  layoutId: string;              // trỏ LayoutDocument.id
  layoutVersion: number;         // MỚI 2026-07-16 (file 21) — GHIM version layout đã chọn lúc
                                  // gán vào Event. Runtime load ĐÚNG version này, không tự lấy
                                  // bản mới nhất → lễ đang chạy ổn định dù designer đang sửa
                                  // layout đó. Layout publish version mới → Event hiện notice,
                                  // user chủ động update (có bước check token). Xem file 21 §5.
  // Điều kiện + độ ưu tiên chọn layout này trong Event — CHỐT 2026-07-15 (xem
  // 14-rasoat-2026-07-15.md §1a): "điều kiện chọn layout ở ceremony; design layout chỉ quản
  // lý danh sách các layout." → selector KHÔNG nằm trong LayoutDocument (đã bỏ ở file 04),
  // mà nằm ở đây — ceremony/control là nơi quyết định layout này dùng cho ai.
  selector?: LayoutSelector;     // xem định nghĩa LayoutSelector (đã hỗ trợ AND/OR) ở file 06
  // override CỤC BỘ cho event này theo TỪNG TỶ LỆ — dùng Record để tránh dựa vào thứ tự
  // mảng (mảng phẳng dễ lệch nếu LayoutDocument.variants gốc đổi thứ tự/thêm bớt variant)
  overrides?: Record<string /* aspect id, VD "16:9" */, Partial<Pick<LayoutVariant, 'background'>>>;
  // Map từng token của layout (đúng version ghim) → nguồn giá trị. ĐỊNH NGHĨA ĐẦY ĐỦ ở file 13
  // §"EventLayoutRef.fieldMap" (FieldMapSource: raw/computed/unmapped) — nhắc ở đây để interface
  // đầy đủ, tránh 2 nơi định nghĩa lệch nhau (như từng xảy ra với LoopItem).
  fieldMap: Record<string /* token */, FieldMapSource>;
}
```

## Tái sử dụng giữa các Event — 3 mức độ (đúng yêu cầu "khác hẳn / hơi khác / giống hệt")

| Mức độ khác biệt | Cơ chế | Ai thao tác |
|---|---|---|
| **Giống hệt** (đợt 2 = đợt 1, chỉ đổi ngày) | Event mới trỏ **cùng `layoutRefs`**, không override gì. Chỉ đổi `scheduledAt` + `dataSourceId`. | 1 click "Nhân bản Event" → sửa ngày + data |
| **Hơi khác** (chỉ đổi background/màu, giữ bố cục) | Event mới trỏ cùng `layoutId` nhưng có `overrides` (background riêng cho event này) — **KHÔNG tạo layout mới**, không fork. | Sửa `EventLayoutRef.overrides` trong Event, layout gốc không đổi |
| **Khác hẳn** (bố cục hoàn toàn mới) | Event mới trỏ **layout khác** (tạo mới trong layout-designer, hoặc "Nhân bản layout" rồi sửa tự do trong editor — fork thật ở tầng Layout, không phải Event) | Vào layout-designer tạo/nhân bản layout mới, rồi gán vào Event |

Điểm quan trọng: **"hơi khác" xử lý bằng override ở tầng Event** (nhẹ, không đụng vào
LayoutDocument gốc, không tạo phiên bản mới của layout) — chỉ khi **thật sự cần đổi bố cục/vị
trí item** mới cần "Nhân bản layout" ở tầng Layout (đây mới là fork thật, tạo `LayoutDocument`
mới với `clonedFrom` riêng — cơ chế nhân bản này thuộc phạm vi layout-designer, không phải
Event).

→ Cần thêm cơ chế **"Nhân bản layout"** trong layout-designer (không có trong bản 04 hiện tại)
— ghi vào câu hỏi mở dưới.

## custom_variables giờ thuộc Event — sửa lại bảng "app nào quản lý biến" (từ file 09)

| Việc | Trước (bản 09, SAI) | Sau (sửa) |
|---|---|---|
| B. Định nghĩa biến tùy chỉnh + rule | ~~Ceremony~~ | **Event** (qua `EventDocument.customVariables`) |
| Lưu trữ | ~~`AppConfig.custom_variables` của ceremony~~ | `EventDocument.customVariables`, qua `EventStore` |
| Editor (layout-designer) đọc để gợi ý? | "nếu gắn ngữ cảnh ceremony" | **nếu gắn ngữ cảnh 1 Event cụ thể** (đổi từ "ceremony" sang "Event") |
| Ceremony (runtime) vai trò | ~~sở hữu~~ | **chỉ đọc Event đang active**, không định nghĩa gì |

## Chuyển đổi Event ("hôm nay lễ này, mai lễ khác") — ĐÃ CHỐT: hoàn toàn thủ công (A9)

> Cập nhật: bản nháp ban đầu đề xuất "bán tự động theo `scheduledAt`" — Sonth chốt **thủ công
> hoàn toàn**, bỏ hẳn phần tự động/gợi ý. Đơn giản hơn thiết kế ban đầu.

```ts
export interface EventStore {
  list(): Promise<EventSummary[]>;
  get(id: string): Promise<EventDocument>;
  save(doc: EventDocument): Promise<void>;
  getCurrentActive(): Promise<EventDocument | null>;  // trả về Event đang active (đã set thủ công)
  setActive(id: string): Promise<void>;                // NGƯỜI DÙNG bấm chuyển — nguồn duy nhất
  // Import/Export — thêm 2026-07-15, xem 15-import-export.md. Đây là công cụ hiện thực hoá
  // triết lý "không tự động bảo vệ, người dùng tự chuẩn bị" (quyết định #15, #16, file 14):
  // export gồm cả EventDocument + layout tham chiếu + data, để tự sao lưu/đối chiếu trước lễ.
  exportBundle(id: string): Promise<EventExportBundle>;
  importBundle(bundle: EventExportBundle): Promise<void>;
}
```

- **Không có `getActive(now)` theo lịch, không có gợi ý tự động.** `scheduledAt` trong
  `EventDocument` (file 10 §"Schema") chỉ còn là **thông tin hiển thị** — giúp sắp xếp/tìm
  kiếm Event trong danh sách dài (VD sort theo ngày, lọc "sắp tới"), KHÔNG kích hoạt hành vi gì.
- **`setActive(id)` là cách DUY NHẤT đổi Event đang chạy** — người vận hành chủ động vào màn
  hình quản lý Event, chọn Event, bấm "Kích hoạt". Đúng tinh thần đã chốt ở A6 (người dùng
  không chuyên cần kiểm soát rõ ràng, tránh hệ thống tự đổi ngoài ý muốn).
- Ceremony khởi động → gọi `EventStore.getCurrentActive()` → nếu có, load layout + data + biến
  của Event đó. Nếu không có Event nào được set active → màn hình chờ / thông báo "chưa có đợt
  lễ nào đang kích hoạt — vào [màn quản lý Event] để chọn".

## Cập nhật luồng tổng (so với file 07 — bản lỗi thời, xem file 13 cho luồng đầy đủ nhất)

```
layout-designer:  thiết kế LayoutDocument (thuần hình, không gắn Event nào, KHÔNG có selector)
                          │
modules/ceremony/src/control/  (đã chốt — không phải "event-manager" riêng, xem file 13 §A8):
                   tạo EventDocument:
                     - chọn/nhân bản layout đã có → gán vào layoutRefs, MỖI ref tự đặt
                       selector (điều kiện) + priority + overrides (theo từng aspect)
                     - định nghĩa customVariables riêng cho đợt này
                     - import data qua FieldMappingProfile → gán dataSourceId (optional,
                       có thể để trống lúc mới tạo — xem §1b ở trên)
                     - đặt scheduledAt (chỉ để hiển thị/sắp xếp, KHÔNG kích hoạt gì), status
                          │
ceremony (runtime): EventStore.getCurrentActive() → load Event đã được set active THỦ CÔNG
                   → resolveLayout(record, event) theo layoutRefs[].selector + priority
                   → resolveVariant (theo tỷ lệ màn thật)
                   → fill token (Global + Event.customVariables + record.extra)
                   → hiển thị
```

## Câu hỏi mở (bổ sung vào 08) — PHẦN LỚN ĐÃ CHỐT, xem cột "Trạng thái"

| Câu hỏi | Trạng thái |
|---|---|
| Đặt tên "Event"/"Đợt lễ"/"Campaign"? | ✅ **Event** (A7, file 08) |
| GĐ1 nhúng ceremony hay tách module? | ✅ Nhúng `control/`, tách schema (A8, file 13) |
| "Nhân bản layout" (fork) — thêm vào schema? | ✅ Có, ở tầng Layout (file 12 `cloneVariant` + versioning file 21) |
| Ai chuyển Event active — tự động hay thủ công? | ✅ **HOÀN TOÀN THỦ CÔNG** (A9) — bỏ hẳn "bán tự động" từng nêu ở đây. `active` chỉ là nhãn theo dõi (§Schema, [20](20-rasoat-2026-07-16.md) §A1) |
| Data giữa các Event tách biệt không? | ✅ Cả 2 kiểu (pooled/consumable), file 13; re-import qua modal (file 22) |
| Version Event archived giữ lại? | ✅ `status='archived'` không xoá, chỉ ẩn khỏi active |

**Còn mở thật sự:**
- Không còn câu hỏi mở nghiêm trọng ở tầng Event — các vấn đề vận hành mới (consume khi chạy đến,
  re-import, layout version) đã chuyển thành quyết định ở [13](13-ceremony-mo-rong.md), [21](21-layout-versioning.md),
  [22](22-import-modal.md).
