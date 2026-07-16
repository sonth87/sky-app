# 09 — Quy định chi tiết về Variable

> Đào sâu 4 khía cạnh: cú pháp token, kiểu dữ liệu & validate, phạm vi (global/layout/ceremony),
> quản lý trong UI editor. File [05](05-he-bien-va-adapter.md) là khung tổng quan 3 tầng; file
> này là quy định kỹ thuật cụ thể để implement.

## 1. Cú pháp token & ký tự hợp lệ

### Cú pháp ĐÃ CHỐT: `{{key}}` (2026-07-16, theo bản thiết kế thật đầu tiên của mapping screen)

> Bản nháp trước còn phân vân giữa `@key@` (cú pháp cũ của `renderTemplate`) và `{{key}}`.
> Bản thiết kế thật đầu tiên (Claude Design, `Ceremony Control - Event Flow.dc.html`, màn
> "Ghép biến của layout với dữ liệu") đã tự chọn và dùng nhất quán `{{key}}` xuyên suốt UI
> (hiển thị `tokenBraced: '{{'+tk.t+'}}'`) — chốt theo đúng bản thiết kế này, không còn để mở.

```
{{key}}            // đóng cả 2 đầu, dấu ngoặc nhọn đôi — khớp cú pháp Mustache/Handlebars quen
                    // thuộc, dễ nhận diện hơn @...@ khi đứng cạnh chữ thường trong câu
```

Lý do giữ nguyên tắc "đóng cả 2 đầu" đã phân tích ở bản trước (dù đổi ký hiệu bọc):
- Token đóng không mơ hồ khi đứng cạnh chữ khác: `"{{full_name}} ơi"` rõ ràng hơn viết liền.
- Regex: `/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g` — bắt buộc đóng, ký tự đầu không phải số.
- `renderTemplate` hiện tại (`@key`, mở) cần migrate sang cú pháp mới này khi implement thật —
  không giữ song song 2 cú pháp, tránh nhập nhằng.

### Ký tự hợp lệ cho tên biến (key)

```
Quy tắc:  /^[a-zA-Z_][a-zA-Z0-9_]*$/
- Bắt đầu bằng chữ cái (a-z, A-Z) hoặc gạch dưới
- Theo sau: chữ, số, gạch dưới
- KHÔNG dấu tiếng Việt, KHÔNG khoảng trắng, KHÔNG ký tự đặc biệt (-, ., {, }, #...)
- Khuyến nghị style: snake_case (khớp convention hiện có: full_name, danh_xung, chuc_vu)
```

Lý do cấm dấu tiếng Việt/khoảng trắng: token nằm trong text tự do, nếu cho phép ký tự rộng
sẽ khó phân biệt "đây là biến" hay "đây là chữ thường có `{{` ngẫu nhiên". Giữ khoảng ký tự hẹp
giúp regex không nhập nhằng.

### Namespace — KHÔNG còn "cấm trùng key hệ thống" (đã đổi hướng, xem §2.5/§3)

> Mục này ở bản trước quy định "cấm trùng key giữa Global và biến khác" — **đã lỗi thời** sau
> quyết định "layout tự do khai token" (§2.5). Layout dùng key gì là việc của layout, không
> cần khớp/không được trùng với Global — Global chỉ còn là DANH SÁCH GỢI Ý, không phải danh
> sách "đã đăng ký, cấm ai khác dùng lại". Xem §2.5, §3 để có quy định đầy đủ, đúng nhất.

### Thuộc tính biến dạng `{{var:modifier}}`? — KHÔNG làm ở bản đầu

Cân nhắc cú pháp mở rộng kiểu `{{gpa:round2}}` hay `{{full_name:upper}}` (biến đổi ngay trong token).
**Đề xuất KHÔNG làm ở v1** — lý do:
- Format/transform nên nằm ở **định nghĩa biến** (CustomVariable hoặc computed mapping), không
  nằm rải rác trong từng chỗ dùng token. Nếu 5 layout khác nhau đều cần GPA làm tròn 2 số,
  định nghĩa 1 lần ở biến `{{gpa_2so}}` tốt hơn phải gõ `:round2` ở cả 5 nơi.
- Giữ cú pháp token đơn giản (`{{key}}` thuần) giúp regex ổn định, dễ parse, dễ validate.
- Nếu sau này thực sự cần (VD uppercase tại chỗ cho 1 trường hợp riêng lẻ), có thể bổ sung
  cú pháp `:modifier` như một tính năng version sau — không phá vỡ token cũ vì cú pháp cũ vẫn
  là tập con hợp lệ.

## 2. Kiểu dữ liệu & validate biến

### Kiểu biến (mở rộng so với `kind: 'text'|'image'` đã phác ở file 04/05)

```ts
export type VariableKind = 'text' | 'number' | 'date' | 'image' | 'boolean';

export interface VariableDef {
  key: string;
  kind: VariableKind;
  label: string;          // hiện trong dropdown editor
  example?: string;        // giá trị mẫu để preview
  required?: boolean;      // layout này BẮT BUỘC phải có biến này mới render đúng
  format?: VariableFormat; // cách hiển thị (chỉ áp dụng kind=number/date)
}

export type VariableFormat =
  | { kind: 'number'; decimals?: number }              // GPA: decimals=2 → "3.80"
  | { kind: 'date'; pattern: string }                  // "dd/MM/yyyy" | "MMMM yyyy" ...
  | { kind: 'text'; case?: 'upper'|'lower'|'title' };  // chuẩn hoá hiển thị
```

- `kind='image'` → chỉ được bind vào `ImageItem.varKey`, KHÔNG được chèn vào `TextItem.content`
  (nếu người dùng cố tình gõ `{{anh_dai_dien}}` vào 1 ô text → hiện placeholder lỗi rõ ràng thay
  vì in ra đường dẫn file).
- `kind='number'`/`'date'` → giá trị lưu ở canonical là string/number thô; **format** quyết
  định cách hiển thị ra text. VD `gpa: 3.8` (number) + `format: {decimals:2}` → hiển thị "3.80".
- `kind='boolean'` → chủ yếu dùng trong `selector`/`CustomVariableRule` (điều kiện), hiếm khi
  chèn thẳng vào text.

### Validate — 3 thời điểm

| Thời điểm | Validate gì | Hành vi khi lỗi |
|---|---|---|
| **Lúc thiết kế layout** (editor) | Token `{{key}}` có khớp biến đã khai báo không | Hiện cảnh báo (không chặn lưu — layout có thể thiết kế trước khi có đủ data) |
| **Lúc import data** (FieldMappingProfile) | Record có đủ field `required` layout cần không | Liệt kê record lỗi (giống `InvalidStudent` đã có), KHÔNG chặn import toàn bộ |
| **Lúc render runtime** (ceremony chạy lễ) | Biến thiếu giá trị / sai kiểu | **Không bao giờ throw** — render rỗng/fallback, ghi log. Backdrop không được vỡ giữa lễ. |

Nguyên tắc runtime: **fail-soft tuyệt đối**. Đây là điểm khác biệt quan trọng với validate lúc
thiết kế (có thể chặt chẽ, cảnh báo nhiều) — lúc chạy lễ thật, layout PHẢI hiển thị được gì đó
dù data không hoàn hảo, không được crash hay để trống trắng xoá cả backdrop.

### Ví dụ format áp dụng

```
canonical: { gpa: 3.8, date_of_birth: "2004-03-17T00:00:00+00:00" }
variable:  {{gpa}}         kind=number format={decimals:2}  → "3.80"
           {{ngay_sinh}}   kind=date   format={pattern:"dd/MM/yyyy"} → "17/03/2004"
```
(`{{ngay_sinh}}` là ví dụ biến hệ thống mới nên thêm — hiện `STUDENT_TEMPLATE_VARIABLES` chưa có
biến ngày sinh dù `Student.date_of_birth` đã tồn tại — ghi vào câu hỏi mở.)

## 2.5. App nào quản lý variable? (đã chốt lại — 2026-07-16, thay thế toàn bộ suy luận cũ)

> ⚠️ **THAY ĐỔI KIẾN TRÚC QUAN TRỌNG.** Bản trước của mục này (và cả bản trước nữa) đều sai ở
> 1 điểm: giả định **layout-designer cần "đọc" Event để biết biến nào tồn tại** — dẫn tới 1
> chiều gọi ngược từ layout-designer sang ceremony. Sonth chỉ ra đúng vấn đề: layout được thiết
> kế **trước khi Event nào tồn tại**, nên layout-designer không có Event nào để hỏi. Chốt lại
> hoàn toàn theo hướng đúng: **layout tự do định nghĩa token của chính nó, không phụ thuộc
> Event; việc khớp (map) giữa field data thật và token của layout xảy ra ở phía ceremony, khi
> chọn layout cho 1 Event — không phải lúc thiết kế layout.**

### Bốn việc hoàn toàn khác nhau (thêm 1 việc D so với bản cũ)

```
Việc A — Layout TỰ ĐỊNH NGHĨA token của chính nó (chuỗi tự do trong dấu {{...}})
Việc B — Ceremony/Event ĐỊNH NGHĨA biến tùy chỉnh + rule ({{danh_hieu}} = rule theo ngành/GPA)
Việc C — Ceremony/Event MAP field data thật ↔ token mà layout đã khai
Việc D — Ceremony (runtime) FILL giá trị thật vào token lúc render
```

| Việc | Là gì | Chủ sở hữu | Khi nào chạy |
|---|---|---|---|
| **A. Layout tự khai token** | Layout gõ `{{full_name}}` hoặc `{{ho_ten}}` — TÊN TỰ CHỌN, không tra cứu gì | **Layout-designer**, hoàn toàn độc lập | Lúc thiết kế layout, KHÔNG cần Event nào tồn tại |
| **B. Định nghĩa biến tùy chỉnh + rule** | `danh_hieu` = "Dược sỹ" nếu ngành=Dược, "Kỹ sư" nếu ngành=CNTT, còn lại "Cử nhân" | **Event** — `EventDocument.customVariables` | Lúc soạn 1 đợt lễ, TRƯỚC khi đợt đó chạy |
| **C. Map field ↔ token layout** | "Layout này cần `{{full_name}}` → lấy từ cột nào/biến nào của Event?" | **Event**, khi CHỌN layout để gán vào (`EventLayoutRef`) | Lúc soạn Event, SAU khi đã chọn layout cụ thể |
| **D. Fill giá trị thật** | `{{full_name}}` → "Nguyễn Văn A" khi hiển thị | **Ceremony (runtime)** | Runtime, mỗi lần 1 record được gọi lên |

### Vậy layout-designer làm gì với biến — CHỈ 1 CHIỀU, không hỏi ngược ai cả

- Layout-designer đặt token `{{key}}` **theo ý người thiết kế**, key là chuỗi tự do (theo cú
  pháp §1). KHÔNG tra cứu Global list, KHÔNG hỏi Event, KHÔNG phụ thuộc bất kỳ dữ liệu ngoài.
- Để gõ token không bị sai chính tả/trùng lặp không cần thiết (VD vừa có `full_name` vừa có
  `ho_ten` cho cùng 1 nghĩa mà quên mất), editor gợi ý autocomplete dựa trên **lịch sử token đã
  từng gõ trong TOÀN BỘ layout-designer** (không riêng layout hiện tại) — xem bảng
  `variable_registry` ở §2.6. Đây KHÔNG phải hỏi ceremony/Event — là dữ liệu nội bộ của chính
  layout-designer, ghi nhận mỗi lần có token mới được gõ ở BẤT KỲ layout nào.
- Editor **hoàn toàn không làm** Việc C, D — chỉ đặt token vào vị trí, không bao giờ biết
  "full_name" cuối cùng lấy từ cột nào của data thật, hay giá trị thật là gì. Preview trong
  editor dùng **giá trị mẫu tự đặt** (người thiết kế tự gõ 1 giá trị demo cho từng token khi
  cần xem trước, không tra cứu từ đâu cả).

### Việc mapping (C) — đây là chỗ trả lời thẳng câu hỏi của Sonth

Khi soạn 1 Event và chọn dùng layout nào đó, layout đã khai sẵn nó cần những token gì (VD
Layout 1 cần `{{full_name}}`, `{{gpa}}`; Layout 2 cần `{{ho_ten}}`, `{{diem}}`). Ceremony hiện
màn hình **map thủ công**: mỗi token của layout ↔ 1 nguồn giá trị, nguồn đó có thể là:

- 1 cột trong data thật đã import (VD `full_name ← fullName`)
- 1 biến tùy chỉnh vừa định nghĩa ở Việc B (VD `chuc_danh ← danh_hieu`, mà `danh_hieu` lại là
  kết quả tính theo rule ngành/GPA)

```
Chọn Layout 1 cho Event "Trao bằng đợt 2" → Layout 1 cần: {{full_name}}, {{gpa}}
  Map:  {{full_name}}  ←  cột "fullName" trong data đã import
        {{gpa}}         ←  cột "gpa_diem" trong data đã import

Chọn Layout 2 (khác layout, cùng hoặc khác Event) → Layout 2 cần: {{ho_ten}}, {{chuc_danh}}
  Map:  {{ho_ten}}      ←  cột "fullName" (CÙNG cột data, khác tên token vì khác layout)
        {{chuc_danh}}   ←  biến tùy chỉnh "danh_hieu" (kết quả rule, không phải cột thô)
```

**Đây chính xác là ý Sonth mô tả** — mỗi lần đổi layout, user tự map lại, vì layout không biết
trước tên field của bất kỳ nguồn data nào (sinh viên, nhân viên, hay loại đối tượng khác sau
này). Layout chỉ cần biết "tôi cần 1 giá trị gọi là gì đó" — khớp với cột/biến nào là việc của
ceremony lúc dùng, không phải việc của layout lúc vẽ.

### Vì sao đây KHÔNG phải "2 chiều gọi lẫn nhau" — chỉ có 1 chiều

```
Layout-designer  --(đưa LayoutDocument, chỉ chứa token tự do)-->  Ceremony/Event
                                                                    (tự map + tự fill)
```

Chỉ 1 mũi tên. Ceremony/Event **đọc** layout để biết nó cần token gì, rồi TỰ quyết định lấy giá
trị từ đâu — không có chiều nào từ layout-designer gọi ngược sang ceremony để "xin" dữ liệu.
Gợi ý autocomplete (nêu ở trên) cũng không phải ngoại lệ, vì nó tra `variable_registry` (nội bộ
layout-designer), không đọc gì từ ceremony.

### Vì sao KHÔNG để editor fill sẵn / cache giá trị

Cân nhắc phương án "editor cũng biết data, fill sẵn rồi mới gửi ceremony" — **cố tình KHÔNG
làm**, vì:
- Phá hoàn toàn YC1 ("thiết kế TRƯỚC", độc lập với data — layout có thể thiết kế xong cả tháng
  trước khi có danh sách sinh viên/nhân viên thật, thậm chí trước khi có Event nào).
- 1 layout phải dùng lại được cho **nhiều record khác nhau** (mỗi sinh viên 1 backdrop) — nếu
  fill sẵn thì mỗi người phải có 1 bản layout riêng, vô nghĩa.
- Data sinh viên/nhân viên là thông tin nhạy cảm — không nên đi qua/lưu ở app thiết kế layout
  nếu không cần thiết. Editor càng "không biết gì về data thật" càng an toàn & đơn giản.

### Bảng tổng kết ai-làm-gì (đối chiếu nhanh)

| | A. Layout tự khai token | B. Custom vars (rule) | C. Mapping | D. Fill giá trị thật |
|---|---|---|---|---|
| Định nghĩa/tạo ở | Layout-designer, tự do | Event (UI cấu hình) | Event, lúc gán layout | — (thực thi, không "định nghĩa") |
| Lưu trữ | `LayoutDocument.items[].content` (chứa token) | `EventDocument.customVariables` | `EventLayoutRef.fieldMap` (mới, xem §2.6) | `CanonicalRecord` gắn với Event |
| Layout-designer đọc gì? | Chỉ đọc lịch sử token của chính nó (`variable_registry`) để gợi ý | ❌ không đọc | ❌ không đọc | ❌ không đọc |
| Ceremony (runtime) làm gì? | Đọc token layout cần | Tính giá trị theo rule | Tra bảng map để biết token ↔ nguồn nào | Fill vào token lúc chạy |

## 2.6. Bảng gợi ý toàn cục `variable_registry` (mới, giải bài toán autocomplete)

Để editor gợi ý token đã từng dùng (thay vì hỏi ngược Event), cần 1 bảng **dùng chung toàn hệ
thống layout-designer**, không gắn với layout hay Event cụ thể nào — sống trong SQLite local
của layout-designer (xem [18](18-luu-tru-sqlite-supabase.md)):

```sql
variable_registry (
  key            TEXT PRIMARY KEY,   -- "full_name", "gpa", "danh_hieu"...
  first_used_at  TEXT,
  last_used_at   TEXT,
  usage_count    INTEGER DEFAULT 0
)
```

- Mỗi khi user gõ xong 1 token mới `{{key}}` ở BẤT KỲ layout nào → nếu `key` chưa có trong
  bảng thì `INSERT`, nếu có rồi thì `UPDATE usage_count += 1, last_used_at = now()`.
- Gõ `{{` ở bất kỳ layout nào (kể cả layout hoàn toàn mới) → autocomplete `SELECT * FROM
  variable_registry ORDER BY usage_count DESC` — gợi ý cái hay dùng lên trước.
- Bảng này **không phải nơi định nghĩa biến** (không có `kind`/`format`/rule gì) — chỉ là lịch
  sử gõ để tránh gõ sai/trùng lặp không cần thiết. Layout vẫn tự do gõ token bất kỳ không có
  trong bảng này (VD lần đầu dùng 1 tên mới).

## 3. Phạm vi biến: global vs layout vs event (đã chốt lại — 2026-07-16)

> ⚠️ Bản trước ghi "PER-LAYOUT chỉ tham chiếu, KHÔNG định nghĩa biến mới" — **NGƯỢC với quyết
> định mới**. Layout giờ là nơi **tự do khai token** (Việc A ở §2.5), không phải nơi "tham
> chiếu" biến đã định nghĩa sẵn ở đâu đó.

```
┌─ GLOBAL (toàn hệ thống, hardcode trong code) ─────────────────────┐
│  STUDENT_TEMPLATE_VARIABLES — danh sách biến canonical gợi ý sẵn    │
│  (full_name, gpa...). KHÔNG bắt buộc, chỉ là 1 nhóm gợi ý có nhãn   │
│  đẹp trong dropdown — layout được tự do dùng key khác nếu muốn.    │
│  Nguồn: slide-shared                                                │
└──────────────────────────────────────────────────────────────────┘

┌─ LAYOUT (token tự do, độc lập hoàn toàn) ──────────────────────────┐
│  Layout gõ {{key}} bất kỳ — KHÔNG cần khớp Global, KHÔNG cần Event  │
│  tồn tại trước. Nguồn gợi ý (không bắt buộc theo): Global list +    │
│  variable_registry (lịch sử token đã gõ, §2.6).                    │
│  Layout KHÔNG BIẾT và KHÔNG CẦN BIẾT giá trị token đến từ đâu.      │
└──────────────────────────────────────────────────────────────────┘

┌─ EVENT (định nghĩa rule + MAP token của layout đã chọn) ───────────┐
│  B. customVariables — CustomVariable[] rule-based, RIÊNG cho Event  │
│     này, VD "danh_hieu" = Dược sỹ/Kỹ sư/Cử nhân theo ngành.         │
│  C. EventLayoutRef.fieldMap — map TỪNG TOKEN của layout đã chọn    │
│     sang 1 cột data thật HOẶC 1 customVariable. Khác layout được    │
│     gán vào Event (kể cả cùng Event) → map LẠI TỪ ĐẦU, vì token     │
│     khác nhau giữa các layout.                                      │
└──────────────────────────────────────────────────────────────────┘
```

### Quy định cứng (để tránh lẫn lộn)

1. **Layout tự do đặt token bất kỳ — KHÔNG cần khớp Global, KHÔNG cần Event tồn tại trước.**
   Đây là thay đổi cốt lõi so với bản trước: layout không còn bị giới hạn "chỉ dùng biến đã
   tồn tại ở Global/Event" — layout CHÍNH LÀ nơi khai token, độc lập hoàn toàn.
2. **Event là nơi map token layout ↔ nguồn giá trị thật (§2.5 Việc C), KHÔNG phải nơi "khớp
   tên biến".** Không còn khái niệm "cấm trùng key giữa Global và Event" — vì layout dùng key
   gì là việc của layout, Event chỉ cần map đúng token đó sang đúng cột/biến, tên có trùng hay
   khác Global đều không quan trọng.
3. **Editor không hỏi Event gì cả** (đã bỏ hẳn yêu cầu "chọn ngữ cảnh 1 Event" ở bản trước) —
   dropdown "Chèn biến" trong editor chỉ gồm Global (gợi ý có sẵn) + `variable_registry` (lịch
   sử token đã gõ toàn cục, §2.6). Gõ tay token mới hoàn toàn tự do, không cảnh báo "chưa được
   định nghĩa ở Event nào" (vì đó không còn là lỗi — layout vốn không phụ thuộc Event).

### Vì sao layout KHÔNG chứa nghiệp vụ dù giờ tự do đặt token

Layout tự do đặt token **KHÔNG có nghĩa** layout chứa nghiệp vụ — token vẫn chỉ là 1 cái tên
chuỗi, không mang theo rule/logic gì. Rule (VD "ngành Dược → Dược sỹ") vẫn nằm ở Event (Việc B),
không nằm trong layout. Layout chỉ biết "tôi cần 1 ô tên là `chuc_danh`" — không biết `chuc_danh`
được tính ra sao. Nguyên tắc "layout thuần hình, không chứa nghiệp vụ"
([04](04-schema-layout-document.md) mục 5) **vẫn giữ nguyên**, chỉ khác cách đạt được nó: trước
đây bằng cách giới hạn layout chỉ dùng biến có sẵn, giờ bằng cách tách bạch "đặt tên" (layout)
khỏi "tính giá trị" (Event) — layout tự do đặt tên nhưng không bao giờ tự tính giá trị.

Trường hợp "text cố định không đổi" (VD tiêu đề "LỄ VINH DANH 2026") vẫn nên gõ thẳng vào
`content`, không cần bọc `{{...}}`, nếu nó thực sự không đổi theo Event. Nếu cần đổi theo từng
Event (VD "2026" → "2027") thì bọc thành token `{{nam}}`, Event nào map giá trị nào tuỳ ý.

## 4. Quản lý biến trong UI Editor

### Nguồn hiển thị trong dropdown "Chèn biến"

```
┌─────────────────────────────────────┐
│  ⌕  Tìm biến...                       │
├─────────────────────────────────────┤
│  GỢI Ý HỆ THỐNG                       │  ← Global, luôn có, chỉ là gợi ý có nhãn đẹp
│    full_name         "Họ và tên"      │
│    gpa                "Điểm GPA"       │
│    ...                                │
├─────────────────────────────────────┤
│  ĐÃ TỪNG DÙNG (mọi layout)             │  ← variable_registry, sắp theo usage_count
│    ho_ten             12 lần           │
│    danh_hieu           5 lần           │
│    chuc_vu              3 lần           │
├─────────────────────────────────────┤
│  (gõ tên mới bất kỳ nếu không có trong danh sách trên) │
└─────────────────────────────────────┘
```

- **Ai tạo token mới:** CHÍNH editor layout — gõ `{{key}}` bất kỳ là tạo token ngay tại chỗ,
  không cần điều hướng ra đâu, không cần Event nào tồn tại. Dropdown chỉ để GỢI Ý (tránh gõ sai/
  trùng), không phải danh sách "đã được duyệt trước".
- **Preview giá trị:** người thiết kế tự gõ 1 giá trị demo cho từng token khi cần xem trước
  (không tra cứu từ Event/data thật nào — layout không biết gì về data thật, xem §2.5).

### Không còn "cảnh báo biến chưa tồn tại" — vì layout không cần biến nào "tồn tại" trước

Bản trước có lint cảnh báo "biến chưa được định nghĩa ở Event nào" — **bỏ hẳn**, vì theo quyết
định mới token là do layout tự đặt, không có khái niệm "chưa tồn tại". Điều CẦN cảnh báo thay
vào đó nằm ở phía Event (không phải layout): khi soạn Event và chọn layout, nếu có token của
layout **chưa được map** (§2.5 Việc C) → Event cảnh báo "token `{{xyz}}` chưa gán nguồn giá trị
— sẽ hiện trống khi trình chiếu". Đây là cảnh báo ở `control/`, không phải ở layout-designer.

### Panel "Biến" hiển thị trạng thái sử dụng (giữ ý tưởng từ prototype)

Prototype đã có ý hay: mỗi biến trong panel có **chấm tròn** báo "đang dùng trong thiết kế"
(`usedKeys` set quét qua toàn bộ `items[].content`). Giữ nguyên ý tưởng này — hữu ích để biết
biến nào đã chèn, biến nào còn thiếu (đối chiếu với `required` trong `LayoutVariableRef`).

Bổ sung so với prototype: hiện thêm badge cảnh báo ở đầu panel nếu có `required=true` mà
CHƯA được chèn vào bất kỳ item nào — nhắc người thiết kế đừng quên biến bắt buộc (VD layout
"Vinh danh" quên chèn `{{full_name}}` thì layout gần như vô nghĩa).

## Tổng kết quy định (checklist khi implement) — ĐÃ CẬP NHẬT 2026-07-16

- [ ] **Layout-designer TỰ DO khai token, KHÔNG hỏi Event/ceremony gì cả** — chỉ 1 chiều
      layout-designer → ceremony (đưa `LayoutDocument`), không có chiều ngược lại.
- [ ] **Editor KHÔNG fill giá trị**, chỉ preview bằng giá trị demo tự gõ.
- [ ] **Event là nơi định nghĩa `customVariables` (rule) VÀ map token layout ↔ nguồn giá trị
      (`EventLayoutRef.fieldMap`)** — map lại mỗi khi đổi layout, vì token khác nhau giữa layout.
- [ ] **Ceremony (runtime) là nơi duy nhất fill giá trị thật vào token**, lúc chạy slide.
- [x] Token: cú pháp `{{key}}` — ĐÃ CHỐT theo bản thiết kế thật (mapping screen), đóng 2 đầu.
- [ ] `variable_registry` — bảng SQLite dùng chung toàn layout-designer, ghi nhận mọi token đã
      từng gõ để gợi ý autocomplete (§2.6) — KHÔNG phải nơi định nghĩa/validate biến.
- [ ] `kind: text|number|date|image|boolean` + `format` cho number/date — áp dụng ở tầng
      mapping (Event), không phải ở tầng khai token (layout).
- [ ] Validate 3 thời điểm: thiết kế layout (không còn cảnh báo "biến lạ" — đã bỏ) / lúc map ở
      Event (cảnh báo token chưa gán nguồn) / runtime (fail-soft tuyệt đối, không throw).
- [ ] Editor: dropdown gợi ý (Global + `variable_registry`), không có khái niệm "tạo biến" hay
      "điều hướng ra ngoài" nữa — tạo token = gõ trực tiếp trong layout.
