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
  // Điều kiện + độ ưu tiên chọn layout này trong Event — CHỐT 2026-07-15 (xem
  // 14-rasoat-2026-07-15.md §1a): "điều kiện chọn layout ở ceremony; design layout chỉ quản
  // lý danh sách các layout." → selector KHÔNG nằm trong LayoutDocument (đã bỏ ở file 04),
  // mà nằm ở đây — ceremony/control là nơi quyết định layout này dùng cho ai.
  selector?: LayoutSelector;     // xem định nghĩa LayoutSelector (đã hỗ trợ AND/OR) ở file 06
  // override CỤC BỘ cho event này theo TỪNG TỶ LỆ — dùng Record để tránh dựa vào thứ tự
  // mảng (mảng phẳng dễ lệch nếu LayoutDocument.variants gốc đổi thứ tự/thêm bớt variant)
  overrides?: Record<string /* aspect id, VD "16:9" */, Partial<Pick<LayoutVariant, 'background'>>>;
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

## Câu hỏi mở (bổ sung vào 08)

- **Đặt tên:** "Event" hay "Đợt lễ" hay "Chiến dịch" hay "Campaign"? Ảnh hưởng namespace code
  (`EventDocument` vs `CampaignDocument`). Đề xuất tạm: **Event** (trung lập, không trùng nghĩa
  với "Ceremony" đã dùng cho app/module).
- **GĐ1 triển khai ở đâu:** nhúng tab trong ceremony (nhanh) hay tách module riêng luôn (sạch
  hơn nhưng chậm hơn)? Đề xuất: nhúng UI nhưng tách schema — xem khuyến nghị E2 ở trên.
- **"Nhân bản layout"** (fork LayoutDocument mới từ 1 layout có sẵn, đổi tự do) — cần thêm vào
  file 04, hiện chưa có cơ chế này trong schema `LayoutDocument`.
- **Ai chuyển Event active:** hoàn toàn tự động theo `scheduledAt`, hay luôn cần người bấm xác
  nhận (an toàn hơn — tránh tự động chuyển nhầm giữa lúc đang chạy lễ dở dang)? Nghiêng: **bán
  tự động** — hệ thống gợi ý/cảnh báo "sắp đến giờ Event X" nhưng người vận hành bấm xác nhận.
- **Data giữa các Event có tách biệt hoàn toàn không?** (VD Event "Trao bằng đợt 2" có được
  nhìn thấy/tái dùng danh sách sinh viên đã import ở "đợt 1" không, hay luôn import mới?)
- **Version lịch sử Event đã archived** — có cần giữ lại để xem/nhân bản về sau không (khả năng
  cao là CÓ, vì "đợt sau giống đợt trước" là chính yêu cầu ban đầu) → `status='archived'`
  KHÔNG xoá, chỉ ẩn khỏi danh sách active — đã phản ánh trong schema (archived là 1 status,
  không phải xoá record).
