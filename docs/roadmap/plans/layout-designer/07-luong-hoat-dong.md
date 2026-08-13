# 07 — Luồng hoạt động end-to-end

> ⚠️ **CẢNH BÁO LỖI THỜI (2026-07-16):** file này viết ở giai đoạn đầu, nhiều chi tiết ĐÃ SAI so
> với các quyết định chốt sau. Đã sửa các điểm sai chính bên dưới, nhưng **luồng đầy đủ và đúng
> nhất hiện ở [13](13-ceremony-mo-rong.md)** (có Event, control/, wizard 5 bước). Các sửa đã áp
> vào file này:
> - Toạ độ: **px trên canvas chuẩn + scale** (KHÔNG phải `%`) — theo [04](04-schema-layout-document.md).
> - Selector điều kiện chọn layout thuộc **Event** (`EventLayoutRef.selector`), KHÔNG đặt trong
>   editor/layout — theo [14](14-rasoat-2026-07-15.md) #1, [06](06-luu-tru-va-giao-tiep.md).
> - Khi lệch tỷ lệ màn: **stretch lấp đầy** (KHÔNG letterbox/viền đen) — theo [04](04-schema-layout-document.md) #9.
> - Token: **`@var`** (mở, không đóng đuôi, sau khoảng trắng) — theo [09](09-quy-dinh-variable.md) §1.
> - Layout ghim **version** khi gán vào Event, runtime load đúng version đó — theo [21](21-layout-versioning.md).

## Luồng tổng (đích, phương án C)

```
┌───────────────────────── THIẾT KẾ (offline, trước lễ) ─────────────────────────┐
│                                                                                  │
│  layout-designer (editor kéo-thả)                                                │
│    1. tạo LayoutDocument (toạ độ px trên canvas chuẩn refW×refH)                  │
│    2. thêm variant cho từng tỷ lệ (16:9, 21:9, 25:9, custom)                      │
│       - mỗi variant: background riêng + đặt item riêng                            │
│    3. chèn token @key TỰ DO vào text/ảnh (không phụ thuộc Event — file 09 §2.5)│
│    4. (KHÔNG đặt selector ở đây — điều kiện chọn layout thuộc Event, file 06/14)  │
│    5. preview bằng giá trị demo tự gõ (editor KHÔNG biết data thật — file 09)     │
│    6. save (draft) / publish (tăng version — file 21) → LayoutStore (SQLite)      │
│                                                                                  │
└──────────────────────────────────────────┬───────────────────────────────────────┘
                                            │  LayoutDocument JSON
                                            ▼
┌───────────────────────── CHUẨN BỊ DATA (trước lễ) ─────────────────────────────┐
│  ceremony / import                                                               │
│    7. user upload danh sách thô (excel/json bất kỳ shape)                         │
│    8. chọn FieldMappingProfile (student-2026 / employee-hr / …)                   │
│    9. applyMapping → CanonicalRecord[] (Student/Employee/generic)                 │
└──────────────────────────────────────────┬───────────────────────────────────────┘
                                            │  CanonicalRecord[]
                                            ▼
┌───────────────────────── CHẠY LỄ (real-time) ─────────────────────────────────┐
│  ceremony backdrop                                                                │
│   10. record được gọi lên (QR scan / auto)                                        │
│   11. resolveLayout(record, layoutMap) → chọn LayoutDocument theo selector        │
│   12. resolveVariant(doc, screenAspect) → chọn variant khớp tỷ lệ màn thật        │
│   13. LayoutRenderer render variant.items:                                        │
│         - text: renderText(content, record) → thay @key                        │
│         - image: varKey → record ảnh; else src tĩnh                               │
│         - box px trên canvas chuẩn × scale (scaleX/scaleY); fontSize px × scale    │
│   14. hiển thị backdrop                                                           │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## Chi tiết từng điểm nối (input → output)

### Editor save (điểm 6)
- **Input:** thao tác kéo-thả người dùng (state `items[]` + variants), qua editor-core command/
  history (file 23).
- **Output:** `LayoutContent` (variants[]) lưu vào **draft**; hoặc **publish** → tăng version
  (file 21). Qua `LayoutStore`.
- **Toạ độ giữ nguyên px trên canvas chuẩn `refW/refH`** khi lưu — KHÔNG convert sang % (đã đổi
  quyết định sang px, xem [04](04-schema-layout-document.md)). Editor và storage cùng đơn vị px.

### Import + mapping (điểm 7–9)
- **Input:** file thô `rawRecord[]` (cột tên tùy ý) + chọn `FieldMappingProfile`.
- **Xử lý:** `applyMapping(profile, raw)` per record.
- **Output:** `CanonicalRecord[]` chuẩn hoá → đưa vào bundle như hiện tại.
- **Validate:** thiếu biến `required` của layout → cảnh báo (giống `InvalidStudent` đang có).

### Resolve layout (điểm 11)
- **Input:** 1 `CanonicalRecord` + `LayoutDocumentMap`.
- **Xử lý:** duyệt selector theo priority, match rule → chọn layout; else "default".
- **Output:** 1 `LayoutDocument`.

### Resolve variant (điểm 12)
- **Input:** `LayoutDocument` + tỷ lệ màn hình thật (`screen.w/h`).
- **Xử lý:** chọn variant có aspect gần nhất (xem `resolveVariant` ở [04](04-schema-layout-document.md)).
- **Output:** 1 `LayoutVariant` (background + items cho đúng tỷ lệ).

### Render (điểm 13)
- **Input:** `LayoutVariant` (từ đúng `LayoutVersion` mà Event ghim, file 21) + `CanonicalRecord`
  + `resolveAsset` + kích thước container.
- **Xử lý:** với mỗi item:
  - `box {x,y,w,h}` (px trên `refW/refH`) → `left/top/width/height` px = box × scale (scaleX cho
    x/w, scaleY cho y/h; khớp đúng tỷ lệ → 2 scale bằng nhau, lệch tỷ lệ → stretch, KHÔNG letterbox).
  - `text.content` → `renderText(content, record, customVars)` thay token `@key`.
  - `text.fontSize` (px trên canvas chuẩn) × scale (basis: `min(scaleX,scaleY)` — chữ không tràn box).
  - `image.varKey` → `record[varKey]` (ảnh); nếu rỗng → fallbackText.
  - **Preload:** ảnh của record kế tiếp + ảnh nền các variant nên preload để không nháy trắng
    giữa lễ (file 20 §B3).
- **Output:** DOM backdrop.
- **KEY:** đây chính là renderer dùng chung với editor preview → WYSIWYG.

## So sánh với luồng HIỆN TẠI (để thấy khác biệt)

| Bước | Hiện tại (ceremony) | Sau migrate (C) |
|---|---|---|
| Nạp config | `fetch(backdrops_config)` → `BackdropTemplateMap` | → `LayoutDocumentMap` |
| Chọn template | `resolveTemplate(award_content)` | `resolveLayout(record, map)` — rule engine |
| Chọn variant tỷ lệ | `resolveTemplateVariant(tpl, '16:9'\|'25:9')` | `resolveVariant(doc, screenAspect)` — mọi tỷ lệ |
| Render | `<DynamicBackdropView student template/>` | `<LayoutRenderer record variant/>` |
| Data vào | giả định đã là `Student` | qua `FieldMappingProfile` adapter |
| Biến | field-key cố định + `renderTemplate` (2 cơ chế) | chỉ token `@var` (1 cơ chế) |

## Trường hợp biên cần xử lý (ghi để không quên)

- Màn hình tỷ lệ **không khớp variant nào** → chọn gần nhất + **stretch lấp đầy** (KHÔNG
  letterbox — đã đổi quyết định, xem [04](04-schema-layout-document.md) #9). Ưu tiên vẫn là quay
  lại thiết kế thêm variant đúng tỷ lệ.
- Record **thiếu biến** (VD không có ảnh) → fallbackText / ẩn item, không vỡ layout (fail-soft).
- Layout **không có variant cho tỷ lệ đang chiếu** → fallback `defaultVariantAspectId`.
- Text **quá dài tràn box** → `overflow: shrink|wrap|clip` (khai báo trên TextItem).
- **Không match layout nào** (`resolveLayout` trả null) → màn nền trung tính + log cảnh báo
  (KHÔNG throw, KHÔNG chặn lúc soạn — người dùng tự chuẩn bị, xem [13](13-ceremony-mo-rong.md)).
- **Layout đã publish version mới** sau khi Event map biến → Event KHÔNG tự đổi; hiện notice,
  user chủ động update (có bước check token) — xem [21](21-layout-versioning.md) §5.
