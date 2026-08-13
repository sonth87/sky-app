# 13 — Ceremony mở rộng (tổng hợp trách nhiệm mới)

> Sonth tự tổng kết rất chính xác cuối trao đổi 2026-07-15: *"ceremony cần mở rộng khá nhiều,
> từ việc quản lý đợt/event, active/chọn đợt/event, tạo đợt/event kết hợp với chọn layout
> tương ứng, quản lý data global hay data theo đợt/event, sắp xếp quản lý data... và truyền/
> map data key với layout variable."* File này gom lại thành 1 bức tranh trách nhiệm đầy đủ,
> làm rõ câu hỏi A8 (Event sống ở đâu) và chốt A10 (data global vs per-event).

## 6 trách nhiệm mới của "ceremony" (thực ra là 1 CỤM chức năng, không còn là 1 app đơn giản)

```
1. Quản lý Event      — CRUD danh sách EventDocument (file 10)
2. Active/Switch       — chọn Event nào đang chạy, thủ công (A9, file 10)
3. Tạo Event + gán layout — chọn/nhân bản layout (layoutRefs), định nghĩa customVariables (file 10)
4. Quản lý Data        — global (dùng chung) vs per-event (riêng từng đợt) — MỤC NÀY, xem dưới
5. Selector điều kiện phức hợp — không chỉ 1 rule, nhiều điều kiện ưu tiên (GPA/giới tính/...) — MỤC NÀY
6. Mapping data key ↔ layout variable — chính là FieldMappingProfile (file 05), áp trong Event
```

Nhận định quan trọng: **"ceremony" giờ không còn là 1 app đơn nhất "chạy slide"** — nó là
1 cụm gồm **(a) màn hình quản trị** (Event, data, mapping — việc soạn trước) + **(b) runtime
trình chiếu** (đọc Event active, render, fill token — việc chạy lúc lễ diễn ra). Đây là lý do
câu hỏi A8 ("Event sống ở đâu") cần làm rõ trước — nó thực ra đang hỏi: **"phần (a) và phần
(b) có nên tách app hay không?"**

## Làm rõ A8: tách hay không tách — dựa trên khối lượng thật của phần (a)

Trước khi có yêu cầu Event + đa loại đối tượng + loop + data global/per-event, phần "quản trị"
của ceremony chỉ có vài modal cấu hình nhỏ (`SettingsModal`, `CustomVariablesContent`...) — nhúng
trong ceremony hợp lý. **Sau khi cộng dồn 6 trách nhiệm ở trên, phần (a) đã đủ lớn để là 1 khu
vực UI riêng biệt, độc lập với "màn hình trình chiếu"** (khác hẳn về mục đích: (a) là công cụ
soạn thảo dùng bàn phím+chuột kỹ càng, (b) là màn hình full-screen trình chiếu không tương tác).

**Khuyến nghị cụ thể (trả lời A8):**

```
modules/ceremony/
  ├─ src/backdrop/     ← GIỮ NGUYÊN vai trò: runtime trình chiếu (phần b) — không đổi nhiều,
  │                       chỉ đổi renderer bên trong (DynamicBackdropView → LayoutRenderer)
  └─ src/control/       ← MỞ RỘNG vai trò: đã là "phòng điều khiển" (control room) từ trước
                          (có StudentList, SettingsModal...) — đây CHÍNH XÁC LÀ NƠI PHÙ HỢP
                          để thêm quản lý Event, data, mapping. KHÔNG cần app/module mới.
```

Lý do chọn "mở rộng `control/` sẵn có" thay vì tách `event-manager` mới:
- `control/` **đã đúng vai trò** "màn hình quản trị dùng bàn phím+chuột, khác biệt với màn
  trình chiếu" — thêm Event/Data management vào đây là **đúng chỗ về mặt khái niệm**, không
  phải nhét tạm.
- Tránh dựng thêm 1 app (routing, build, deploy, cửa sổ Electron riêng...) chỉ để chứa thêm vài
  màn hình quản trị — chi phí hạ tầng không tương xứng lợi ích lúc này.
- Ranh giới SCHEMA vẫn tách bạch đúng như đã chốt trước (`EventStore`/`LayoutStore` là port
  riêng, không lẫn vào `AppConfig`) — nên NẾU sau này thực sự cần tách UI thành app riêng, đó
  là việc chuyển đổi UI thuần tuý, dữ liệu không phải migrate.

→ **Chốt A8: nhúng trong `modules/ceremony/src/control/` (không tách module mới), vì đây vốn
đã là khu vực quản trị đúng nghĩa, tách bạch với runtime trình chiếu ở `src/backdrop/`.**

## Trách nhiệm 4 — Quản lý Data: Global vs Per-event (chốt A10)

Sonth chỉ rõ: **cả 2 kiểu quan hệ đều cần tồn tại**, tuỳ loại đợt lễ:

| Loại đợt | Quan hệ với data | Ví dụ |
|---|---|---|
| **Tiêu hao** (data dùng 1 lần, không lặp lại) | Data **thuộc về Event**, đợt sau không thấy lại người đã "dùng" ở đợt trước | Trao bằng tốt nghiệp — SV đã nhận bằng thì biến mất khỏi danh sách chờ của đợt sau |
| **Tái sử dụng** (cùng 1 nguồn data, nhiều đợt) | Data ở **kho chung (Global)**, nhiều Event cùng trỏ vào, KHÔNG bị trừ/mất | Khen thưởng theo quý — cùng 1 danh sách nhân viên phòng ban, quý nào cũng random/xét trên tập đó |

### Thiết kế: `DataSource` — 1 khái niệm, 2 chế độ

```ts
export interface DataSource {
  id: string;
  label: string;                      // "Danh sách SV khoá 2026", "Nhân viên phòng CNTT"
  mode: 'pooled' | 'consumable';       // chốt tên: pooled = dùng chung nhiều Event,
                                        //           consumable = tiêu hao, gắn cứng 1 Event
  // MẢNG TRỘN — sửa 2026-07-15 (xem 14-rasoat-2026-07-15.md #14): union 2 mảng thuần
  // (Subject[] | Group[]) KHÔNG biểu diễn được use case "1 đợt lễ vừa trao cá nhân vừa
  // trao tập thể" đã nêu ở file 11 — phải là mảng chứa lẫn cả 2 loại record.
  records: Array<CanonicalSubject | CanonicalGroup>;
  mappingProfileId: string;            // FieldMappingProfile đã dùng để tạo records này (file 05)
}

// EventDocument (file 10) — field liên quan data, KHỚP với file 10 (đã đối chiếu, cùng optional)
export interface EventDocument {
  // ...(các field khác giữ nguyên)
  dataSourceId?: string;                 // OPTIONAL — chốt 2026-07-15 (xem file 14 §1b):
                                          // Event có thể tạo trước, gán data sau, vì số lượng/
                                          // danh sách data có thể chưa chốt lúc soạn layout+điều
                                          // kiện. Trước đây file này khai bắt buộc — ĐÃ SỬA để
                                          // khớp file 10.
  consumedIds?: string[];                // CHỈ áp dụng khi DataSource.mode='consumable':
                                          // danh sách id đã "dùng" ở Event này, để Event SAU
                                          // (nếu cùng trỏ DataSource này) biết loại trừ.
                                          // KHÔNG có cơ chế TỰ ĐỘNG ghi field này — xem quyết
                                          // định #15 ở file 14: người dùng tự quản lý qua
                                          // import/export (file 15), không gắn vào lúc chạy lễ.
}
```

### Cách 2 chế độ hoạt động khác nhau

```
mode='pooled' (Global — VD nhân viên phòng CNTT):
  Event A trỏ dataSourceId=X → đọc TOÀN BỘ records của X, không đánh dấu gì
  Event B (đợt sau) trỏ CÙNG dataSourceId=X → đọc TOÀN BỘ records của X y hệt Event A
  → 2 Event hoàn toàn độc lập dùng chung 1 nguồn, không ảnh hưởng nhau

mode='consumable' (Tiêu hao — VD sinh viên tốt nghiệp):
  Event A trỏ dataSourceId=Y → đọc records của Y
  Event B (đợt 2) trỏ CÙNG dataSourceId=Y → đọc records của Y, loại trừ theo consumedIds
     đã cộng dồn từ MỌI Event trước đó đã trỏ Y
  → hiệu ứng "danh sách chờ vơi dần qua từng đợt", đúng mô tả "trao bằng đợt 2 không còn SV đã
     nhận ở đợt 1"
```

**Ai ghi `consumedIds`, khi nào — CHỐT LẠI 2026-07-16 (thay quyết định #15 cũ, xem [20](20-rasoat-2026-07-16.md) §A3):**

> Bản trước (#15, 2026-07-15) chốt "tick tay hoàn toàn, tách khỏi runtime" — nhưng trao 500
> người mà tick tay từng người thì UX quá cực, dễ bị bỏ luôn không dùng. Sonth chốt lại:
> **đánh dấu THEO LUỒNG VẬN HÀNH — chạy đến ai thì đánh dấu người đó là đã chạy.**

Có **3 dạng vận hành** đưa 1 record lên sân khấu, dạng nào cũng ghi `consumedIds` cho record đó:
- **Ấn tay** (người vận hành bấm "chạy" cho 1 người) → đánh dấu người đó.
- **Chạy tự động** (auto theo danh sách) → đánh dấu mỗi người khi tới lượt.
- **Quét QR** → đánh dấu người vừa quét.

→ Đây KHÔNG mâu thuẫn "không tự động hóa": việc "chạy đến người đó" là **hành động chủ động của
người dùng** (họ cho chạy), hệ thống chỉ ghi nhận theo đúng hành động đó — không tự suy diễn.
Khác hẳn "tự động theo `scheduledAt`" (đã bỏ). Điểm ghi cụ thể: khi record chuyển sang trạng
thái đã-trình-chiếu (tái dùng luồng `status` sẵn có: `on_stage`/`returned`) VÀ DataSource của
Event là `mode='consumable'` → thêm `record.id` vào `consumedIds`. Người vận hành vẫn có thể
**mở lại và chỉnh tay** `consumedIds` (bỏ/thêm) nếu cần sửa — thao tác quản trị bổ sung, không
thay cho cơ chế đánh-dấu-khi-chạy. Import/export danh sách xem [15](15-import-export.md).

### Vì sao KHÔNG cần 2 schema riêng cho "Global" và "Per-event"

Ban đầu có thể nghĩ cần 2 khái niệm tách biệt (`GlobalDataPool` vs `EventOwnedData`) — nhưng
thực ra chỉ khác nhau ở **1 thuộc tính hành vi (`mode`)**, cấu trúc data giống hệt nhau
(`CanonicalSubject[]`/`CanonicalGroup[]`). Dùng chung 1 `DataSource` với `mode` linh hoạt hơn
— người tạo Event chọn nguồn data VÀ chọn chế độ ngay lúc đó, không phải học 2 khái niệm khác
nhau. Đây cũng nhất quán với cách đã xử lý "2 loại nhóm" ở file 11 (dùng chung 1 type, khác
bằng field optional/mode thay vì tách interface).

## Trách nhiệm 5 — Selector điều kiện phức hợp (mở rộng file 06 + 10)

Sonth nêu ví dụ cụ thể: *"sinh viên A thì layout 1, sinh viên B thì layout 2 theo điều kiện,
VD gpa >= 4 hay với giới tính Nam thì layout 3, Nữ layout 4"* — tức là **nhiều rule, có khả
năng CHỒNG NHAU** (1 sinh viên có thể vừa GPA>=4 vừa là Nam) — cần cơ chế ưu tiên rõ ràng, đây
là mở rộng thật sự so với `LayoutSelector` đơn giản đã phác ở file 06.

### `LayoutSelector` — đặt trong `EventLayoutRef` (đã chốt §1a), hỗ trợ AND/OR (đã chốt #53)

```ts
// Định nghĩa đầy đủ hiện ở file 06 — nhắc lại để đối chiếu (đã cập nhật groups thay vì rules
// phẳng, để biểu diễn "A VÀ (B HOẶC C)" — xem 14-rasoat-2026-07-15.md #53):
export interface LayoutSelector {
  groups: SelectorRuleGroup[];  // các group nối OR; trong 1 group, rules nối AND
  priority: number;              // BẮT BUỘC khi 1 Event có nhiều layoutRefs — càng cao càng ưu tiên
}
```

Cơ chế `priority` đã đủ để giải quyết ví dụ của Sonth — KHÔNG cần schema mới, chỉ cần dùng
đúng cách khi tạo Event (field `selector` nằm trong `EventLayoutRef`, không phải trong layout):

```jsonc
// Trong 1 Event, layoutRefs — layout đầu tiên match (priority giảm dần) THẮNG
// (không phải AND giữa các layout, mà là "duyệt lần lượt, ai match trước dùng cái đó")
[
  { layoutId: "gpa-xuat-sac", selector: { groups: [{rules:[{attr:"gpa", op:"gte", val:"3.6"}]}], priority: 100 } },
  { layoutId: "nam-sinh",      selector: { groups: [{rules:[{attr:"gender", op:"equals", val:"Nam"}]}], priority: 50 } },
  { layoutId: "nu-sinh",       selector: { groups: [{rules:[{attr:"gender", op:"equals", val:"Nữ"}]}], priority: 50 } },
  { layoutId: "default",       selector: { groups: [{rules:[]}], priority: 0 } }  // group rỗng luôn match — fallback
]
```

**Ví dụ trên giải đúng tình huống Sonth nêu:** 1 sinh viên Nam có GPA 3.8 → match CẢ
`gpa-xuat-sac` (priority 100) LẪN `nam-sinh` (priority 50) → **priority cao hơn thắng** →
layout `gpa-xuat-sac` được chọn.

Nếu cần "GPA≥3.6 VÀ (Nam HOẶC đạt giải phụ)" trong **cùng 1** layoutRef (không tách 2 ref khác
priority), dùng 2 group: `groups: [{rules:[gpa≥3.6, gender=Nam]}, {rules:[gpa≥3.6, award=...]}]`
— mỗi group tự AND, các group với nhau là OR.

### `resolveLayout` — cập nhật theo `groups`, KHÔNG có validate bắt buộc default (đã chốt #16)

```ts
function resolveLayout(record: CanonicalSubject | CanonicalGroup, event: EventDocument): LayoutDocument | null {
  const candidates = [...event.layoutRefs].sort((a, b) => (b.selector?.priority ?? 0) - (a.selector?.priority ?? 0));
  for (const ref of candidates) {
    const matched = (ref.selector?.groups ?? []).some(g => matchesAllRules(record, g.rules));
    if (matched) return loadLayout(ref.layoutId);  // qua LayoutStore
  }
  return null;  // không match gì — ceremony hiện cảnh báo, KHÔNG crash (fail-soft, file 09 §2).
                // KHÔNG có validate chặn lúc lưu Event bắt buộc phải có layoutRef mặc định —
                // người dùng tự chịu trách nhiệm chuẩn bị đầy đủ, hệ thống hỗ trợ bằng
                // import/export để họ tự kiểm tra trước (xem file 15, quyết định §1a ở file 14 #16).
}
```

### UI cho selector phức hợp — quan trọng vì A6 (người dùng không chuyên)

Vì đối tượng dùng gồm người không rành kỹ thuật (đã chốt A6), UI tạo/sắp xếp selector KHÔNG
nên là "viết JSON rule" — cần dạng **bảng ưu tiên kéo-thả**:

```
┌─ Thứ tự ưu tiên layout (kéo để sắp xếp — trên cùng = ưu tiên cao nhất) ─┐
│ ⠿ 1. GPA xuất sắc          IF  gpa >= 3.6                    [Layout: Xuất sắc]  │
│ ⠿ 2. Nam sinh               IF  giới tính = Nam                [Layout: Nam]      │
│ ⠿ 3. Nữ sinh                IF  giới tính = Nữ                 [Layout: Nữ]       │
│ ⠿ 4. Mặc định               (luôn áp dụng nếu không khớp trên) [Layout: Default]  │
└──────────────────────────────────────────────────────────────────────────────┘
```
Kéo-thả đổi thứ tự = đổi `priority` tương ứng (thứ tự trong danh sách CHÍNH LÀ priority, không
cần người dùng tự gõ số) — đơn giản hoá đúng tinh thần A6, không lộ khái niệm "priority: number"
ra UI.

## Trách nhiệm 6 — Mapping data key ↔ layout variable

Đây chính là `FieldMappingProfile` đã thiết kế đầy đủ ở [05](05-he-bien-va-adapter.md) — không
có gì mới về schema, chỉ cần xác nhận **nó chạy Ở ĐÂU trong luồng Event**:

```
Tạo Event (trong control/ mới):
  1. Chọn DataSource (hoặc tạo mới — upload file thô)
  2. Nếu DataSource mới: chọn/tạo FieldMappingProfile để map raw → CanonicalSubject/Group
  3. Chọn layout(s) + sắp xếp selector priority (như trên)
  4. Preview: chọn 1 vài record mẫu từ DataSource, xem layout tương ứng + token đã fill đúng
     chưa (ĐÂY LÀ NƠI DUY NHẤT preview có DATA THẬT — khác preview trong layout-designer chỉ
     có data mẫu giả, đúng nguyên tắc file 09 "editor không biết data thật")
  5. Lưu EventDocument
```

## Cập nhật luồng tổng (thay thế luồng ở file 07, giờ đầy đủ với Event + control/)

> ⚠️ **Cập nhật cấu trúc điều hướng (2026-07-15, tiếp theo — xem [17](17-prompt-claude-design-control.md)):**
> Khảo sát code thật `modules/ceremony/src/control/` cho thấy `ControlApp.tsx` hiện tại đi
> **THẲNG** vào dashboard (StudentPanels, ScanInbox, NowOnStage...) ngay khi mount — KHÔNG có
> màn hình chọn/kích hoạt gì trước đó, vì hiện tại app giả định luôn có đúng 1 `Ceremony`
> singleton nạp sẵn. Đã chốt: **dashboard này trở thành view CHỈ DÀNH CHO Event đang active**
> — nghĩa là "Danh sách Event" (Trách nhiệm 1-2) không còn là "1 tab trong control" như bản
> mô tả trước, mà là **1 GATE/màn hình mới đứng TRƯỚC toàn bộ dashboard hiện tại**. Luồng dưới
> đây đã cập nhật đúng cấu trúc này.

```
layout-designer:  thiết kế LayoutDocument (thuần hình, KHÔNG biết Event/data nào)
                          │
modules/ceremony/src/control/  (MỞ RỘNG — không phải module mới):

  ┌─ GATE MỚI: Danh sách Event (điểm vào ĐẦU TIÊN khi mở control/, thay thế việc đi thẳng
  │  vào dashboard như hiện tại) ─────────────────────────────────────────────────────────┐
  │  ① Quản lý DataSource (pooled/consumable, import qua FieldMappingProfile)              │
  │  ② Tạo/sửa EventDocument:                                                               │
  │      - chọn DataSource (optional lúc tạo)                                               │
  │      - chọn nhiều layout + sắp xếp priority (bảng kéo-thả, AND/OR)                       │
  │      - định nghĩa customVariables riêng cho Event                                        │
  │      - preview với data thật                                                             │
  │  ③ Danh sách Event → bấm "Kích hoạt" (setActive, THỦ CÔNG — A9)                          │
  └──────────────────────────────────────────────────────────────────────────────────────┘
                          │  SAU KHI kích hoạt 1 Event
                          ▼
  ┌─ Dashboard hiện tại (StudentPanels, ScanInbox, NowOnStage, PreviewPanel, SyncPanel...) ──┐
  │  GIỮ NGUYÊN component/UI đã có — chỉ đổi NGUỒN DATA: thay vì nạp 1 Ceremony singleton    │
  │  cố định lúc mount, giờ nạp theo đúng EventStore.getCurrentActive() → students/layout/   │
  │  biến của Event đó. Nếu KHÔNG có Event nào active → không vào được dashboard, quay lại   │
  │  Gate ở trên với thông báo "Chưa có đợt lễ nào đang kích hoạt".                           │
  └────────────────────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
modules/ceremony/src/backdrop/  (runtime, ít đổi — chỉ đổi renderer bên trong):
                   EventStore.getCurrentActive() → lấy EventDocument đang active
                   với mỗi record được gọi lên:
                     resolveLayout(record, event)  → theo priority (mục Trách nhiệm 5)
                     resolveVariant(layout, screenAspect) → theo tỷ lệ màn (file 04)
                     LayoutRenderer(variant, record, event.customVariables) → fill token, hiển thị
                   nếu record.mode='consumable' → người vận hành TỰ đánh dấu consumedIds
                     (không tự động — xem quyết định #15, mục "Ai ghi consumedIds" ở trên)
```

**Hệ quả kỹ thuật của thay đổi này (ghi nhận, chưa triển khai):** `ControlApp.tsx` hiện `useEffect`
nạp `Ceremony`/`students` 1 lần lúc mount qua `getMeta()`/`window.slide` — sẽ cần đổi thành
nạp theo `EventStore.getCurrentActive()` trước, rồi mới gọi data theo đúng `dataSourceId` của
Event đó. Đây là thay đổi ở tầng routing/state của `control/`, không phải chỉ thêm màn hình mới.

## Wizard tạo/sửa Event — ĐÃ CHỐT 5 BƯỚC (2026-07-16, theo bản thiết kế thật)

> Bản thiết kế thật đầu tiên từ Claude Design (`Ceremony Control - Event Flow.dc.html`, theo
> prompt [17](17-prompt-claude-design-control.md) + [19](19-prompt-claude-design-mapping.md))
> đã tự quyết định cấu trúc wizard — chốt theo đúng bản đó, thay cho mô tả khái quát trước đây.

```
Bước 1 — Thông tin cơ bản
  Tên đợt lễ, ngày dự kiến (chỉ hiển thị/sắp xếp).
  Chọn nguồn dữ liệu: (a) Tạo nguồn dữ liệu mới → sang Bước 2 · (b) Dùng nguồn có sẵn
  → BỎ QUA Bước 2, sang thẳng Bước 3 · (c) "Chưa có dữ liệu, để sau" → cũng bỏ qua Bước 2.

Bước 2 — Dữ liệu (CHỈ hiện nếu chọn "tạo nguồn mới" ở Bước 1)
  Import file (Excel/CSV/JSON) → Ánh xạ cột (trường chuẩn ↔ cột file, có badge Bắt buộc/Mở
  rộng) → Xem trước bảng dữ liệu đã map (cờ ✓ đủ / ⚠ thiếu) → Chọn cách dùng (Dùng chung
  nhiều đợt / Dùng dần không lặp lại) → nếu chọn "dùng dần": bảng "Danh sách đã xử lý"
  (tick/untick thủ công, không tự động).

Bước 3 — Layout (chọn layout theo điều kiện)
  Bảng quy tắc kéo-thả (⠿ để đổi ưu tiên), mỗi quy tắc: tên, layout (mở picker dạng lưới
  thumbnail), điều kiện dạng khối AND lồng OR ("Áp dụng NẾU — một trong các nhóm dưới đây
  đúng"). Dòng "Mặc định" cố định cuối, khoá cứng.

Bước 4 — Ghép biến (MỚI, tách hẳn thành 1 bước riêng — không gộp vào Bước 3 hay Bước 5)
  Với MỖI layout đã dùng trong Event (từ các quy tắc ở Bước 3 + layout Mặc định), map từng
  token layout khai báo sang 1 nguồn: cột dữ liệu thô HOẶC biến tính theo điều kiện (Bước B ở
  §2.5 file 09). Có tab chuyển qua lại giữa các layout nếu dùng nhiều hơn 1 layout trong Event.
  Gợi ý map tự động khi tên token và tên cột giống/gần giống nhau (không bắt buộc theo, sửa
  lại thoải mái). Hiển thị tổng số đã ghép/còn thiếu, KHÔNG chặn tiếp tục nếu còn thiếu.

Bước 5 — Xem trước (dữ liệu thật hoặc dữ liệu mẫu nếu chưa có data)
  Preview backdrop thật, điều hướng qua từng người (◀ n/N ▶), hiển thị layout nào được áp
  dụng + quy tắc nào khớp. Bảng tổng hợp "đủ dữ liệu / thiếu gì". Nút "Lưu đợt lễ" kết thúc
  wizard, quay về Danh sách Event.
```

Người dùng có thể "Lưu nháp & thoát" ở bất kỳ bước nào — Event lưu ở `status='draft'` với
những gì đã nhập, quay lại sửa tiếp sau (không bắt buộc hoàn thành cả 5 bước 1 lần).

### `EventLayoutRef.fieldMap` — schema cụ thể cho Bước 4 (mới, chưa có ở bản trước)

```ts
export interface EventLayoutRef {
  layoutId: string;
  selector?: LayoutSelector;              // đã có, file 06/10
  overrides?: Record<string, Partial<Pick<LayoutVariant, 'background'>>>;  // đã có, file 10
  fieldMap: Record<string /* token trong layout, VD "full_name" */, FieldMapSource>;
}

export type FieldMapSource =
  | { kind: 'raw'; sourceKey: string }        // lấy nguyên từ 1 cột dữ liệu đã import
  | { kind: 'computed'; variableKey: string } // lấy từ 1 CustomVariable (EventDocument.customVariables)
  | { kind: 'unmapped' };                     // chưa ghép — token sẽ hiện rỗng lúc render (fail-soft)
```

- `fieldMap` thuộc `EventLayoutRef`, **không** thuộc `LayoutDocument` — đúng nguyên tắc "map
  xảy ra ở Event, lúc gán layout" (file 09 §2.5 Việc C).
- Gợi ý tự động (bản thiết kế gọi là `autoSuggest`) là hành vi UI thuần (so khớp tên token/tên
  cột gần giống), KHÔNG lưu vào `fieldMap` cho tới khi người dùng xác nhận (bấm chọn) — tránh
  "âm thầm ghi đè" đã cảnh báo ở nguyên tắc thiết kế chung.

## Việc cần cập nhật ở các file khác (checklist đồng bộ)

- [ ] [10-quan-ly-dot-le-event.md](10-quan-ly-dot-le-event.md): đổi `dataSnapshotId` thành
      `dataSourceId` + `consumedIds`, xoá phần "chuyển đổi theo lịch tự động" (đã sửa — xem
      §"Chuyển đổi Event" đã cập nhật), thêm tham chiếu tới file 13 cho câu hỏi A8.
- [ ] [08-cau-hoi-mo.md](08-cau-hoi-mo.md): đóng A8 với quyết định "nhúng trong `control/`".
- [ ] [06-luu-tru-va-giao-tiep.md](06-luu-tru-va-giao-tiep.md): `LayoutSelector.priority` cần
      ghi rõ là bắt buộc dùng khi 1 Event có NHIỀU layoutRefs (không chỉ optional cho tình
      huống hiếm) — cập nhật mô tả field.

## Quyết định vận hành bổ sung — CHỐT 2026-07-16 (xem [20](20-rasoat-2026-07-16.md))

### Re-import DataSource → qua MODAL rõ ràng (không chỉ hỏi "có import?")
Re-import cập nhật DataSource đã có `consumedIds`: id record ổn định theo **khóa tự nhiên**
(`DataSource.naturalKeyField`) → người đã consumed không xuất hiện lại. Modal import hiển thị
diff kiểu git (thêm/ghi đè/không đổi/xóa) + màn kết quả. Chi tiết đầy đủ ở [22](22-import-modal.md).

### `setActive` giữa lễ → reset session + backdrop idle
`EventStore.setActive(id)` sang Event khác Event đang chạy → `SessionState.current_on_stage_id`/
`pending_id` reset về null + backdrop về màn chờ (id cũ thuộc DataSource khác, vô nghĩa với
Event mới). Tránh backdrop kẹt hiển thị người của đợt trước. (Hệ quả kỹ thuật, [20](20-rasoat-2026-07-16.md) §A5.)

### Layout có version mới sau khi Event map biến → notice + check token
Event ghim `EventLayoutRef.layoutVersion` (file 21). Layout publish version mới → Event hiện
notice, user chủ động Update; lúc Update hệ thống check token của version mới vs `fieldMap`,
thiếu thì hỏi sang màn Ghép biến. Runtime luôn load đúng version ghim → lễ đang chạy ổn định.
Đầy đủ ở [21](21-layout-versioning.md) §5. Đây là lời giải cho lỗ hổng "layout đổi → lệch âm
thầm giữa lễ".

### Khi kích hoạt Event → cảnh báo mềm token chưa gán (không chặn)
Lúc bấm Kích hoạt 1 Event, chạy 1 lượt đối chiếu token của các layout (đúng version ghim) vs
`fieldMap` → hiện cảnh báo mềm "layout X có N token chưa gán nguồn — sẽ hiện trống khi trình
chiếu" (không chặn kích hoạt, đúng triết lý "không tự động bảo vệ"). Ai không mở lại wizard sau
khi layout đổi vẫn được nhắc ở bước kích hoạt.

## Câu hỏi mở còn lại

- **`consumedIds` cộng dồn qua nhiều Event dùng chung 1 `DataSource` mode='consumable'** — ĐÃ
  GIẢI (không còn mở): dùng **bảng nối `event_consumed_record`** trong SQLite ([18](18-luu-tru-sqlite-supabase.md)
  §5) — `SELECT` qua JOIN luôn đúng "toàn bộ đã dùng của nguồn X", không cần chọn cache/on-the-fly.
- **Preview với data thật** (Trách nhiệm 6, Bước 5 wizard) — đã có bản thiết kế thật (§Wizard 5
  bước). Chi tiết UI khi code GĐ4d.
- **Khi record không match layout nào** (`resolveLayout` trả `null`) — CHỐT (xem [07](07-luong-hoat-dong.md)
  §"Trường hợp biên"): màn nền trung tính + log cảnh báo, KHÔNG throw, KHÔNG chặn lúc soạn.
