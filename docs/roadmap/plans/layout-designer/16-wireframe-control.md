# 16 — Wireframe khu vực `control/` (Event, Data, Selector) — chưa có bản vẽ nào

> Đối chiếu với layout-designer: **layout-designer đã có wireframe pixel-detail** (workspace
> `h-th-ng-backdrop-ng-k-o-th`, 2 file `.dc.html`, đọc kỹ ở đầu blueprint) — cái còn thiếu ở đó
> chỉ là chuyển đổi kỹ thuật (HTML prototype → React thật) + nối với schema đã chốt.
>
> Khu vực `control/` (6 trách nhiệm ở file 13) thì **NGƯỢC LẠI** — có schema TypeScript đầy đủ,
> nhưng **0 pixel UI**. File 13 tự thừa nhận ở câu hỏi mở: *"Preview với data thật... chưa
> phác thảo wireframe chi tiết."* Đây là khoảng trống rủi ro effort thật sự — không phải vì
> khó, mà vì **chưa ai hình dung ra hình hài cụ thể**, nên chưa đo được công sức.

## Vì sao khu vực này đáng lo hơn layout-designer dù nhìn "ít tính năng hơn"

| | layout-designer | control/ (Event, Data, Selector) |
|---|---|---|
| Số màn hình chính | 1 (canvas kéo-thả + panel) | Ít nhất 5 (xem bên dưới) |
| Độ phức tạp tương tác | Cao (kéo-thả, resize, chọn nhiều) nhưng **đã có mẫu tham khảo rõ** (Canva/Figma-style, quen thuộc) | Trung bình nhưng **không có mẫu tham khảo** — bảng ưu tiên kéo-thả cho selector, ma trận data pooled/consumable là thiết kế riêng, chưa từng vẽ |
| Wireframe hiện có | Chi tiết tới pixel, đã thử 3 hướng rồi chốt | **Chưa có gì**, chỉ có mô tả văn xuôi trong file 10/13 |
| Rủi ro khi code trước khi vẽ | Thấp — theo đúng mẫu đã có | **Cao** — dễ code 1 hướng rồi phải vẽ lại khi thấy không dùng được (đúng thứ đã xảy ra với layout-designer ở 2 lượt thử 1a/1b trước khi chốt 2a) |

→ **Bài học rút ra từ chính wireframe layout-designer**: bạn đã tốn 2 lượt thử (1a, 1b) trước
khi chốt hướng đúng. `control/` chưa qua bước đó — nên nhiều khả năng cũng cần 1-2 lượt phác
thảo trước khi chốt, KHÔNG nên nhảy thẳng vào code.

## 5 màn hình cần có — đối chiếu trực tiếp field trong schema

### Màn 1 — Danh sách Event (entry point của `control/`)

**Field cần hiển thị** (từ `EventSummary`/`EventDocument`, file 10):
```
id, name, status (draft/scheduled/active/archived), scheduledAt (chỉ hiển thị, không kích hoạt gì)
```

**Cần có:**
- Danh sách Event, lọc theo `status`.
- Badge trạng thái — đặc biệt **Event nào đang `active`** phải nổi bật (đây là Event runtime
  đang đọc, sai sót ở đây = backdrop hiện sai giữa lễ).
- Nút "Kích hoạt" trên mỗi dòng — gọi `EventStore.setActive(id)` (đã chốt A9: thủ công, không
  gợi ý tự động — nghĩa là **không có badge kiểu "sắp đến giờ, nên kích hoạt"**, giữ tối giản).
- Nút "Nhân bản Event" (đã có ở file 10 §"Tái sử dụng" — mức "giống hệt").
- Nút Export (file 15).

**Câu hỏi thiết kế chưa có trong bất kỳ file blueprint nào:** danh sách này sort theo gì mặc
định? `scheduledAt`? `updatedAt`? Với 10-20 Event thì không quan trọng, nhưng nếu 1 trường dùng
lâu dài tích luỹ hàng trăm Event (nhiều đợt khen thưởng qua nhiều năm) thì cần filter/search —
**chưa có ai đặt câu hỏi này**, nêu ra ở đây lần đầu.

### Màn 2 — Tạo/sửa Event: Thông tin cơ bản + chọn DataSource

**Field cần nhập** (`EventDocument.dataSourceId?`, optional theo #2 đã chốt):
```
name, dataSourceId (optional — có nút "Chưa có data, tạo sau")
```

**Cần có:**
- Form tên Event, ngày dự kiến (`scheduledAt` — chỉ metadata hiển thị, đã chốt không kích hoạt gì).
- Chọn `DataSource` có sẵn, HOẶC "+ Tạo nguồn data mới" → mở luồng import (Màn 3).
- **Quan trọng:** nút "Bỏ qua, chọn data sau" phải tồn tại thật (không phải optional trên giấy)
  — đúng field `dataSourceId?` optional đã chốt, nếu UI ép chọn ngay thì field optional vô nghĩa.

### Màn 3 — Tạo/quản lý DataSource (import + chọn mode)

**Field cần nhập** (`DataSource`, file 13):
```
label, mode ('pooled' | 'consumable'), mappingProfileId, records[]
```

**Cần có — đây là màn hình PHỨC TẠP NHẤT trong `control/`, vì gộp 3 việc:**
1. **Upload file thô** (excel/csv/json) → chọn `FieldMappingProfile` có sẵn hoặc tạo mới
   (map cột nguồn → canonical key, đã thiết kế ở file 05, nhưng UI cho việc MAP CỘT — kiểu
   "kéo cột trái sang field phải" hay "dropdown chọn tương ứng" — **chưa vẽ**).
2. **Chọn `mode`** — đây là quyết định 1 lần, cần giải thích rõ hệ quả cho người dùng không
   chuyên (đã chốt A6): "Pooled = dùng lại được nhiều đợt, không mất ai" vs "Consumable = mỗi
   người chỉ tính 1 lần, đợt sau tự loại người đã dùng". Cần copy UI dễ hiểu, không dùng đúng
   2 từ kỹ thuật này trực tiếp.
3. **Preview bảng đã map** — giống hệt bảng "data table" trong wireframe layout-designer
   (`Backdrop Editor - Huong di.dc.html` option `1c`, dòng 733-760) đã có sẵn mẫu UI, CÓ THỂ
   TÁI DÙNG Ý TƯỞNG (bảng dòng/cột, cột cuối đánh dấu ✓/⚠ thiếu) — đây là điểm may mắn, không
   phải vẽ từ số 0.

**Field chưa có UI nào:** hiển thị/sửa `consumedIds` (đã chốt #15: người dùng tự quản lý thủ
công, không tự động) — cần 1 view "danh sách người đã dùng của nguồn X, qua mọi Event", cho
phép tick/untick thủ công. Đây là UI **hoàn toàn mới**, không có gì trong wireframe hiện có để
tham khảo.

### Màn 4 — Gán Layout + Selector (bảng ưu tiên kéo-thả)

Đã có pseudocode UI trong file 13 (§"UI cho selector phức hợp"):
```
┌─ Thứ tự ưu tiên layout (kéo để sắp xếp) ─┐
│ ⠿ 1. GPA xuất sắc   IF gpa>=3.6   [Layout: Xuất sắc] │
│ ⠿ 2. Nam sinh        IF Nam        [Layout: Nam]      │
│ ⠿ 4. Mặc định        (luôn áp dụng) [Layout: Default] │
└──────────────────────────────────────────────────────┘
```

**Đây là UI CHƯA TỪNG được vẽ ở bất kỳ đâu** (kể cả trong 2 file `.dc.html` wireframe — chúng
chỉ vẽ layout-designer, không đụng tới màn hình chọn điều kiện). Cần thiết kế:
- Kéo-thả sắp thứ tự (thư viện kéo-thả — cần chọn công nghệ, VD `@dnd-kit` cho React).
- Mỗi dòng: chọn layout (dropdown, xem preview thumbnail — tái dùng Layout Library file 12),
  xây điều kiện (`groups[]` AND/OR — đã chốt #53, nhưng UI cho AND/OR **phức tạp hơn 1 dòng**
  bảng đơn giản ở trên; cần mở rộng UI khi người dùng bấm "+ thêm điều kiện" trong 1 dòng).
- Dòng "Mặc định" luôn ở cuối, không kéo được lên trên (ràng buộc UI cần enforce).

**Đây là màn hình effort cao nhất trong `control/`** — vừa cần dnd, vừa cần form builder cho
rule (dù đơn giản hoá theo A6), vừa cần preview trực quan.

### Màn 5 — Preview với data thật (Trách nhiệm 6, bước 4 — file 13 tự nhận "chưa phác thảo")

**Mục đích:** trước khi lưu Event, xem trước layout THẬT sẽ hiện ra với record THẬT (không
phải data mẫu như trong layout-designer — đúng nguyên tắc file 09 "editor không biết data thật").

**Cần có (suy từ mô tả file 13, chưa có wireframe):**
- Chọn 1 record cụ thể từ `DataSource` đã gán → chạy `resolveLayout` + `resolveVariant` +
  `LayoutRenderer` thật → hiển thị y hệt kết quả runtime.
- Điều hướng qua nhiều record (giống ý tưởng "Bản ghi xem trước — 3/240" đã có trong wireframe
  layout-designer, `Huong di.dc.html` option `3a` — **tái dùng được ý tưởng UI này**).
- Bảng tổng hợp "đủ dữ liệu / thiếu gì" (cũng đã có mẫu trong wireframe: "238 đủ dữ liệu / 2
  thiếu ảnh") — **may mắn thứ 2**, không phải nghĩ UI từ đầu.

→ Đây là màn hình DUY NHẤT trong `control/` có ý tưởng UI mẫu sẵn từ wireframe cũ (dù được vẽ
cho ngữ cảnh layout-designer, không phải Event) — effort thấp hơn Màn 3, 4.

## Tổng kết — effort tương đối giữa 5 màn (không phải giờ công, chỉ xếp hạng để ưu tiên)

| Màn | Có mẫu UI tham khảo? | Độ mới của tương tác | Ước lượng tương đối |
|---|---|---|---|
| 1. Danh sách Event | Không (nhưng đơn giản — bảng + badge + nút) | Thấp | Nhỏ |
| 2. Tạo Event cơ bản | Không (nhưng đơn giản — form) | Thấp | Nhỏ |
| 3. DataSource + import + mode | **Một phần** (bảng data từ wireframe cũ) | Trung bình (mapping cột + `consumedIds` view là mới) | **Lớn** |
| 4. Selector kéo-thả | Không có gì | Cao (dnd + rule builder) | **Lớn nhất** |
| 5. Preview data thật | **Một phần** (record navigator từ wireframe cũ) | Thấp-trung bình | Trung bình |

→ **Màn 4 (selector kéo-thả) là rủi ro effort lớn nhất trong toàn bộ blueprint**, kể cả so với
layout-designer — vì nó không có bất kỳ tiền lệ/wireframe/mẫu tham khảo nào, trong khi
layout-designer đã đi qua 2 vòng lặp thiết kế và chốt xong.

## Đề xuất bước tiếp theo (không phải quyết định — cần Sonth xác nhận)

Trước khi lên breakdown giai đoạn triển khai (mục 4 gốc), đề xuất: **vẽ wireframe cho Màn 3 và
Màn 4** (cùng công cụ `.dc.html`/Claude Design đã dùng cho layout-designer) — lý do:
- Đây là 2 màn hình effort cao nhất VÀ rủi ro thiết kế sai hướng cao nhất (giống bài học
  layout-designer đã trải qua 1a/1b trước khi chốt 2a).
- Có wireframe rồi mới breakdown giai đoạn sẽ chính xác hơn — hiện tại estimate cho Màn 3/4 chỉ
  là suy luận từ mô tả text, chưa nhìn thấy hình hài thật.
- Màn 1, 2, 5 đơn giản hơn/đã có mẫu — có thể bắt đầu code song song mà không cần chờ wireframe.

## Câu hỏi cần Sonth xác nhận

- Có muốn dựng wireframe cho Màn 3, 4 trước (như đã làm với layout-designer) hay chấp nhận
  code thẳng theo mô tả text trong file 10/13, chịu rủi ro phải vẽ lại?
- Thư viện kéo-thả cho Màn 4 — đã kiểm tra `package.json` toàn monorepo (2026-07-15): **chưa
  có** `dnd-kit`/`react-dnd`/thư viện sortable nào trong sky-app. Đây sẽ là dependency mới,
  cần chọn khi triển khai (không phải tái dùng cái đã có, khác với layout-designer editor vốn
  chỉ cần canvas kéo-thả tự do, có thể tự viết bằng mouse event như prototype `.dc.html` đã làm).
