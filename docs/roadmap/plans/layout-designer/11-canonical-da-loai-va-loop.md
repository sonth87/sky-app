# 11 — Canonical đa loại đối tượng & Layout dạng Loop (trao giải tập thể)

> Chốt câu hỏi A1 (canonical cho nhân viên/sinh viên/bất kỳ loại nào) + yêu cầu MỚI: layout
> phải hỗ trợ **1 item lặp lại cho danh sách nhiều người** (trao giải tập thể/nhóm).
> Đây là thay đổi lớn tới `LayoutDocument` — record đầu vào không còn chắc chắn là 1 người.

## Phần 1 — Canonical đa loại đối tượng (chốt A1)

### Xác nhận hướng: Hybrid lõi + extra

Đúng như Sonth mô tả: có phần **giống nhau** (tên, avatar) và phần **khác nhau tuỳ loại**
(sinh viên: GPA/ngành/xếp loại; nhân viên: chức vụ/trình độ/năm kinh nghiệm). Đây chính xác
là pattern "hybrid" đã nghiêng ở [05](05-he-bien-va-adapter.md) §"canonical cho nhân viên" —
giờ chốt cụ thể:

```ts
// ─── Lõi chung — MỌI loại đối tượng đều có ─────────────────────
export interface CanonicalSubject {
  id: string;                    // định danh duy nhất trong record set
  displayOrder?: number;         // thứ tự trình chiếu (như Student.display_order hiện có)
  full_name: string;
  image_relative_path?: string;  // avatar/ảnh — key thống nhất cho MỌI loại
  status?: string;                // trạng thái vận hành (checkin/called/on_stage...) — tái dùng StudentStatus

  // Loại đối tượng — để ceremony biết field nào áp dụng, để layout selector lọc theo loại
  subjectType: string;           // "student" | "employee" | "group" | ... (mở, không union cứng)

  // Field ĐẶC THÙ theo loại — sinh viên có gpa/major_name, nhân viên có chuc_vu/nam_kinh_nghiem
  extra: Record<string, string | number>;
}
```

- **Lõi (`full_name`, `image_relative_path`, `status`, `displayOrder`) map trực tiếp vào
  `STUDENT_TEMPLATE_VARIABLES`-style biến Global** — luôn có, mọi layout dùng được không cần
  biết loại đối tượng.
- **`extra`** chứa field đặc thù: sinh viên → `{gpa, major_name, classification, ...}`; nhân
  viên → `{chuc_vu, trinh_do, nam_kinh_nghiem, phong_ban, ...}`. Field trong `extra` được khai
  báo qua `FieldMappingProfile` (đã có ở file 05) — mapping quyết định `extra` chứa gì.
- **`Student` interface hiện tại (14) trở thành 1 "profile" cụ thể của canonical này** — không
  xoá `Student`, mà xem nó như **kết quả của 1 `FieldMappingProfile` mặc định cho sinh viên**,
  giữ tương thích ngược với ceremony đang chạy. Về lâu dài, `Student` có thể alias:
  `type Student = CanonicalSubject & { extra: StudentExtra }` (không bắt buộc đổi ngay).

### Vì sao KHÔNG làm nhiều type cứng (phương án b cũ)

Với yêu cầu "bất kỳ loại nào" (không chỉ sinh viên/nhân viên, có thể còn loại khác về sau) +
yêu cầu nhóm/tập thể (phần 2) — số lượng type cứng sẽ phình không kiểm soát được. Hybrid với
`extra: Record<string, ...>` là lựa chọn ĐÚNG duy nhất còn lại cho tính mở này.

### Biến "extra" hiển thị trong editor thế nào

Layout không biết trước "extra" của 1 `subjectType` cụ thể chứa gì (vì tuỳ Event/mapping).
Do đó dropdown "Chèn biến" trong editor, ngoài Global + Custom (Event), cần thêm 1 mục:

```
BIẾN MỞ RỘNG (extra) — theo hồ sơ dữ liệu đang chọn
  @gpa            (chỉ có khi FieldMappingProfile đang xem trước = sinh viên)
  @chuc_vu        (chỉ có khi FieldMappingProfile đang xem trước = nhân viên)
```
→ Cần editor có UI **"xem trước theo hồ sơ"** — chọn 1 `FieldMappingProfile` để biết `extra`
gồm những field nào, phục vụ preview + gợi ý biến. Nếu không chọn, chỉ hiện Global + Custom,
biến `extra` phải gõ tay (kèm cảnh báo "chưa xác nhận tồn tại", như quy định ở file 09 §4).

---

## Phần 2 — Layout dạng Loop (trao giải tập thể/nhóm)

### Vấn đề

Toàn bộ mô hình từ đầu (`LayoutRenderer(layout, record)`) giả định **1 record → 1 backdrop**.
Trao giải tập thể cần: **1 item trong layout (VD khung ảnh + tên) LẶP LẠI theo số lượng người
trong nhóm**, tự động dàn (grid/hàng/cột), không phải thiết kế tay từng vị trí cho từng người.

### Hai loại nhóm khác hẳn nhau — phải tách bạch (phát hiện quan trọng)

Sonth chỉ ra: "trao giải cho phòng Công nghệ thông tin" **không nhất thiết có danh sách người
cụ thể** — đây là đối tượng tập thể *danh nghĩa* (1 cái tên đại diện), khác hẳn "trao giải cho
1 nhóm 5 bạn sinh viên có tên rõ ràng từng người". Gộp chung vào 1 `CanonicalGroup` với
`members` bắt buộc là SAI — vì `members` không phải lúc nào cũng có/cần có. Tách thành 2:

```ts
// Loại 2a — Nhóm DANH NGHĨA: không cần liệt kê từng người, chỉ có 1 "danh phận" đại diện.
// VD "Phòng Công nghệ thông tin", "Tập thể lớp CNTT K16" (khi trao mà không cần điểm danh).
// → Về schema, đây THỰC RA vẫn là CanonicalSubject bình thường — chỉ khác ở NỘI DUNG:
//    full_name = "Phòng Công nghệ thông tin", extra có thể có {so_luong_thanh_vien: "12"}...
//    KHÔNG CẦN LoopItem — layout hiển thị y như trao cho 1 cá nhân (tên tổ chức thay tên người).
// → Không cần type mới, không cần Phần 2 (Loop) cho trường hợp này.

// Loại 2b — Nhóm CÓ DANH SÁCH: cần liệt kê/hiển thị từng người cụ thể (VD "5 sinh viên xuất
// sắc nhất khoá" — mỗi người có ảnh + tên riêng cần thấy hết trên backdrop).
// → Đây mới là trường hợp cần LoopItem thực sự.
export interface CanonicalGroup {
  id: string;
  subjectType: 'group';
  full_name: string;               // tên gọi chung của nhóm, VD "5 sinh viên xuất sắc nhất khoá"
  members?: CanonicalSubject[];    // OPTIONAL — có khi cần liệt kê từng người, không có khi
                                     // nhóm là danh nghĩa thuần (Loại 2a cũng có thể biểu diễn
                                     // qua CanonicalGroup với members=[] nếu muốn nhất quán type,
                                     // xem khuyến nghị bên dưới)
  extra: Record<string, string>;   // field của CHÍNH nhóm (VD "thanh_tich_tap_the", "so_luong")
}
```

### Khuyến nghị: dùng CHUNG 1 type, `members` là optional — không tách 2 type cứng

Lý do không tách `NamedGroup`/`ListedGroup` thành 2 interface riêng: ranh giới giữa "danh nghĩa"
và "có danh sách" không phải lúc nào cũng rõ ràng ngay từ đầu (VD lúc thiết kế Event chưa biết
phòng CNTT có ai cụ thể, sau đó mới bổ sung danh sách) — dùng `members?: CanonicalSubject[]`
optional cho phép **cùng 1 record chuyển từ "danh nghĩa" sang "có danh sách" khi có đủ thông
tin, không đổi type**. `LoopItem` (Phần 2 dưới đây) tự nhiên xử lý cả 2 trường hợp:
`members` rỗng/không có → loop chạy 0 lần → phần khung danh sách người tự ẩn, chỉ còn tên nhóm
hiển thị bình thường như 1 "cá nhân danh nghĩa". Không cần logic rẽ nhánh nào thêm.

Ceremony gọi lên "1 record" để trình chiếu — record đó CÓ THỂ là `CanonicalSubject` (1 người)
HOẶC `CanonicalGroup` (tập thể, có hoặc không kèm danh sách). Layout cần khai báo nó phục vụ
loại nào (qua `selector` theo `subjectType`, xem cuối phần này).

> Ghi chú: bản nháp trước có đặt câu hỏi "nhóm lồng nhóm" (nhóm chứa nhóm con thay vì người) —
> Sonth xác nhận đây KHÔNG phải yêu cầu thực tế, tự bỏ ra khỏi phạm vi. `CanonicalGroup.members`
> giữ nguyên là `CanonicalSubject[]` phẳng, không cần union/đệ quy.

### Item dạng Loop trong LayoutDocument

Thêm 1 loại "container" mới bên cạnh `TextItem/ImageItem/ShapeItem/RibbonItem` (từ file 04):

```ts
export interface LoopItem extends BaseItem {
  type: 'loop';
  // Layout con — CHỈ THIẾT KẾ 1 LẦN, áp dụng lặp lại cho từng phần tử trong members[]
  itemTemplate: LayoutItem[];      // các item con, toạ độ TƯƠNG ĐỐI trong 1 "ô" của loop
  itemBox: { w: number; h: number }; // kích thước 1 "ô" (px trên canvas chuẩn, như Box)

  // Cách dàn nhiều ô trong box tổng của LoopItem
  direction: 'row' | 'column' | 'grid';
  columns?: number;                // dùng khi direction='grid'
  gap?: number;                    // px trên canvas chuẩn, khoảng cách giữa các ô

  // Nguồn danh sách — trỏ tới field nào của record chứa mảng người
  source: 'members';               // hiện chỉ có 1 nguồn hợp lệ: CanonicalGroup.members
                                    // (mở rộng sau nếu cần loop theo nguồn khác)

  // Token trong itemTemplate dùng biến LOCAL của từng phần tử, KHÔNG phải @full_name của
  // record cha — cần cú pháp phân biệt, xem "Token trong loop" bên dưới

  // Xử lý khi số lượng members VƯỢT quá chỗ chứa — người thiết kế chọn 1 trong 2 chiến lược
  overflow: 'shrink' | 'truncate';
  // 'shrink'    → giữ NGUYÊN toàn bộ members, itemBox tự co (scale xuống) để nhét vừa hết vào
  //               box tổng của LoopItem. Không giới hạn số lượng, nhưng ô có thể rất nhỏ nếu
  //               nhóm quá đông (VD 50 người trong khung 12 ô ban đầu → mỗi ô co lại ~28% kích
  //               thước gốc để 50 ô vẫn vừa khung).
  maxItems?: number;               // chỉ dùng khi overflow='truncate': hiện tối đa N ô đầu
  overflowMoreText?: string;        // "+@count_more" — ô cuối cùng khi overflow='truncate' và
                                     // members.length > maxItems; @count_more là biến LOCAL
                                     // tự động = members.length - maxItems, không cần khai báo
}
```

### Chiến lược overflow — 2 lựa chọn, người thiết kế chọn khi tạo LoopItem (không hardcode 1 cách)

| `overflow` | Hành vi | Khi nào hợp | Rủi ro |
|---|---|---|---|
| `'shrink'` | Hiện HẾT `members`, `itemBox` tự scale nhỏ lại vừa khung tổng | Muốn thấy đủ mặt mọi người, chấp nhận ảnh/tên nhỏ dần khi đông | Nhóm quá đông (100+) → ô nhỏ tới mức không đọc được chữ; cần 1 **kích thước ô tối thiểu** để dừng shrink và chuyển sang cuộn/cắt (xem câu hỏi mở) |
| `'truncate'` | Hiện `maxItems` ô đầu (theo `displayOrder` nếu có), ô cuối thay bằng `overflowMoreText` (VD "+38") | Khung cố định, ưu tiên rõ nét hơn đầy đủ | Không thấy hết mặt — chấp nhận được cho nhóm rất đông (tập thể phòng ban 50+ người) |

Công thức `shrink` (tương tự cơ chế `computeScale` đã có ở [04](04-schema-layout-document.md)):
```
cols, rows = tính theo direction/columns sao cho cols*rows >= members.length
cellW = loopBox.w / cols  (trừ gap)
cellH = loopBox.h / rows  (trừ gap)
itemScale = min(cellW / itemBox.w, cellH / itemBox.h, 1)   // không phóng to quá kích thước gốc,
                                                              // chỉ co nhỏ khi cần
```
`itemScale` áp dụng NHÂN THÊM vào scale tổng thể của variant (không thay thế) — mỗi ô trong
loop vẫn tuân theo `scale` chung của variant (file 04), cộng thêm hệ số co riêng do đông người.

`itemTemplate` là 1 layout con thu nhỏ — **thiết kế 1 lần trong editor** (1 khung: avatar +
tên), rồi `LoopItem` tự nhân bản khung đó theo số lượng `members`, xếp theo `direction`.

### Token trong loop — phân biệt biến "của nhóm" vs "của từng thành viên"

Vấn đề cú pháp: `@full_name` trong `itemTemplate` phải hiểu là "tên của TỪNG THÀNH VIÊN",
khác với `@full_name` ở NGOÀI loop (nếu record là nhóm, đó là "tên của cả nhóm"). Cần tách:

```
Ngoài LoopItem:          @full_name       → record.full_name (tên nhóm, nếu record là group)
Trong itemTemplate:       @full_name       → member.full_name (tên người, tự động theo ngữ cảnh)
```

Đề xuất: **không cần cú pháp mới** — resolver tự đổi ngữ cảnh (`ctx`) khi render bên trong
`itemTemplate`: item con của `LoopItem` resolve token theo TỪNG `member` thay vì `record` gốc.
Đây là hành vi tự nhiên của việc "render 1 sub-layout N lần với N ngữ cảnh khác nhau" — không
cần token đặc biệt kiểu `@member.full_name@`, giữ cú pháp `@key` nhất quán toàn hệ thống
(khớp quy định file 09 §1 — không làm token phức tạp thêm).

### resolveVariant / render khi record là Group

```
LayoutRenderer(layout, record):
  if record.subjectType === 'group':
     với mỗi item KHÔNG phải LoopItem → render bình thường, ctx = record (dùng record.extra,
        record.full_name = tên nhóm)
     với LoopItem → nếu record.members có giá trị (không rỗng, không undefined):
        với mỗi member (theo overflow='shrink'|'truncate', xem trên):
           tính vị trí + itemScale theo direction/columns/gap
           render itemTemplate với ctx = member (dùng member.extra, member.full_name = tên người)
        nếu record.members rỗng/undefined (nhóm DANH NGHĨA, VD "Phòng CNTT" không kèm danh sách):
           LoopItem tự ẨN HẲN — record.full_name (tên nhóm) vẫn hiển thị bình thường ở các item
           text khác NGOÀI loop, y hệt như trình chiếu 1 cá nhân
  else (record là 1 người bình thường, subjectType != 'group'):
     LoopItem không áp dụng → ẩn hẳn (layout dùng chung được cho cả 3 trường hợp: cá nhân /
        nhóm danh nghĩa / nhóm có danh sách — không lỗi nếu chọn nhầm layout)
```

→ Hệ quả quan trọng: **layout có `LoopItem` vẫn render được khi trình chiếu 1 người bình
thường** (loop chỉ chạy 0 hoặc 1 lần) — không bắt buộc phải có 2 layout tách biệt "cho cá
nhân" và "cho nhóm", TRỪ KHI bố cục cá nhân/nhóm khác nhau hẳn (lúc đó vẫn nên 2 layout, chọn
qua `selector` theo `subjectType`).

### Selector theo subjectType (mở rộng file 06)

```ts
// SelectorRule.attr giờ có thể là "subjectType" — lọc layout theo cá nhân/nhóm
{ attr: 'subjectType', op: 'equals', val: 'group' }
```
Khớp đúng cơ chế `resolveLayout` đã có ở [06](06-luu-tru-va-giao-tiep.md), không cần cơ chế mới.

### UI editor cho LoopItem (phác thảo, chưa chi tiết hoá)

- Kéo "Khung lặp" (LoopItem) vào canvas như 1 item bình thường, resize khung tổng.
- Double-click / "Sửa mẫu ô" → mở chế độ thiết kế **1 ô** riêng (như sửa 1 layout con thu nhỏ),
  dùng lại toàn bộ UI item text/image/shape đã có — không cần UI mới, chỉ đổi ngữ cảnh edit.
- Preview trong editor: cần record mẫu dạng `CanonicalGroup` (vài member giả) để thấy loop
  chạy thật — bổ sung vào `FieldMappingProfile.sample` khả năng khai báo mẫu nhóm.
- Panel Layers: `LoopItem` hiện như 1 node, expand ra thấy các item con của mẫu (không phải
  N bản sao — vẫn chỉ 1 bản mẫu).

## Việc cần cập nhật ở các file khác (checklist đồng bộ)

- [ ] [04-schema-layout-document.md](04-schema-layout-document.md): thêm `LoopItem` vào union
      `LayoutItem`, ghi chú ngữ cảnh token đổi bên trong loop.
- [ ] [05-he-bien-va-adapter.md](05-he-bien-va-adapter.md): `FieldMappingProfile` cần hỗ trợ
      map ra `CanonicalGroup` (không chỉ `CanonicalSubject` đơn), và `targetType` nên đổi từ
      `'student'|'employee'|'generic'` thành mở (`subjectType: string`) khớp với phần 1 ở đây.
- [ ] [09-quy-dinh-variable.md](09-quy-dinh-variable.md) §3: thêm dòng "biến extra theo
      subjectType" vào bảng phạm vi — nằm giữa Global và Per-event về mặt "ai định nghĩa"
      (thực ra do `FieldMappingProfile` quyết định field nào có trong `extra`, không phải Event
      hay Global — cần 1 dòng riêng, xem câu hỏi mở bên dưới).
- [ ] [10-quan-ly-dot-le-event.md](10-quan-ly-dot-le-event.md): `EventDocument.dataSnapshotId`
      giờ có thể trỏ tới tập hợp gồm CẢ `CanonicalSubject[]` lẫn `CanonicalGroup[]` cùng lúc
      (1 đợt lễ có thể vừa trao cá nhân vừa trao tập thể).

## Câu hỏi đã chốt (2026-07-15, trao đổi tiếp theo)

### ✅ Overflow — CẢ HAI, người thiết kế chọn (không hardcode 1 cách)
Đã thêm field `overflow: 'shrink' | 'truncate'` vào `LoopItem` — xem §"Chiến lược overflow" ở
trên. `'shrink'` = giữ hết, tự co nhỏ ô; `'truncate'` = cắt bớt + "+N người khác". Đúng như
Sonth đề xuất: để làm option, không hardcode.

### ✅ `SessionState.current_on_stage_msv` khi trao tập thể (không xác định cụ thể là ai)

Sonth chỉ ra insight quan trọng: nhóm KHÔNG NHẤT THIẾT có danh sách người cụ thể (VD "trao giải
phòng Marketing" — không cần biết ai trong phòng). Điều này thực ra làm bài toán **đơn giản
hơn** dự kiến ban đầu, không phức tạp hơn:

```ts
// Đổi field, KHÔNG đổi bản chất — vẫn là "1 mã định danh của cái đang lên sân khấu",
// chỉ khác là mã đó giờ trỏ tới CanonicalSubject.id HOẶC CanonicalGroup.id (cùng 1 namespace id,
// không cần 2 field riêng phân biệt loại — subjectType đã nằm trong chính record được trỏ tới).
export interface SessionState {
  current_on_stage_id: string | null;   // đổi tên từ current_on_stage_msv — có thể là id của
                                          // 1 CanonicalSubject HOẶC 1 CanonicalGroup, ceremony
                                          // tra cứu record theo id để biết nó là loại gì
  pending_id: string | null;             // đổi tên từ pending_msv, cùng logic
  ...
}
```

- **Ceremony KHÔNG cần biết "bên trong nhóm có ai"** để hiển thị — nó chỉ cần `record.id` trỏ
  đúng `CanonicalGroup`, rồi `LayoutRenderer` tự xử lý `members` có/không có (đã giải ở phần
  render trên). Nếu nhóm là danh nghĩa thuần (không `members`) → hiển thị y hệt cá nhân, chỉ
  khác `full_name` là tên phòng ban thay vì tên người — **không cần logic đặc biệt nào ở tầng
  session/socket**, đúng những gì ceremony đã làm cho 1 người, chỉ đổi record đưa vào.
- **Đây là đổi tên field, không đổi kiến trúc** — mức độ thay đổi thấp hơn tôi ước tính ban đầu
  (trước đó lo phải xử lý "nhiều mã cùng lúc", giờ hoá ra vẫn luôn là **1 id duy nhất**, dù id
  đó trỏ tới người hay nhóm).
- Việc còn lại thuộc phạm vi **socket-events/QR scan** (`modules/ceremony/src/lib/socket.ts`,
  ngoài phạm vi blueprint layout) — cần 1 luồng "quét mã nhóm" riêng (khác quét mã sinh viên cá
  nhân) để set đúng `current_on_stage_id` = group id. Ghi nhận vào việc cần làm khi triển khai
  thật, không phải vấn đề của layout/Event/canonical đang bàn ở đây.

## Câu hỏi mở còn lại (bổ sung vào 08)

- **`extra` field validate ở đâu?** Không thuộc Global (không hardcode) hay Event (không phải
  rule biến, mà là cấu trúc data) — thực ra thuộc về `FieldMappingProfile` (file 05). Cần thêm
  1 dòng vào bảng phạm vi biến (09 §3) cho rõ: "Field mở rộng (extra)" — chủ sở hữu là
  **FieldMappingProfile**, không phải Global/Event/Layout.
- **Ngưỡng dừng `shrink`** — khi `overflow='shrink'` mà nhóm cực đông (100+ người), ô co tới
  mức không đọc được chữ. Có cần 1 `minItemScale` để dừng co và tự chuyển sang `truncate` không?
  (đề xuất: có, mặc định `minItemScale: 0.3`, dưới ngưỡng đó tự động cắt bớt dù đã chọn 'shrink')
- **`displayOrder` trong `members`** dùng để quyết ai hiển thị trước khi `truncate` cắt bớt —
  cần đảm bảo `FieldMappingProfile` khi map ra `CanonicalGroup.members` giữ đúng thứ tự nguồn
  (VD ưu tiên hiển thị theo thứ tự import, hoặc theo tiêu chí nào đó) — chưa chốt quy tắc sắp
  xếp mặc định.
