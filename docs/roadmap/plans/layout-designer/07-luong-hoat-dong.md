# 07 — Luồng hoạt động end-to-end

## Luồng tổng (đích, phương án C)

```
┌───────────────────────── THIẾT KẾ (offline, trước lễ) ─────────────────────────┐
│                                                                                  │
│  layout-designer (editor kéo-thả)                                                │
│    1. tạo LayoutDocument                                                          │
│    2. thêm variant cho từng tỷ lệ (16:9, 21:9, 25:9, custom)                      │
│       - mỗi variant: background riêng + đặt item riêng                            │
│    3. chèn token @var@ vào text/ảnh (từ STUDENT_TEMPLATE_VARIABLES + CustomVar)   │
│    4. đặt selector (điều kiện chọn layout): classification=Xuất sắc, year=2026…   │
│    5. preview bằng record mẫu (sample từ FieldMappingProfile)                     │
│    6. save → LayoutStore (local GĐ1 / Supabase GĐ2)                               │
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
│         - text: renderText(content, record) → thay @var@                          │
│         - image: varKey → record ảnh; else src tĩnh                               │
│         - box % → px thật theo kích thước màn; fontSize % → px                     │
│   14. hiển thị backdrop                                                           │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## Chi tiết từng điểm nối (input → output)

### Editor save (điểm 6)
- **Input:** thao tác kéo-thả người dùng (state `items[]` + variants).
- **Output:** `LayoutDocument` (schema [04](04-schema-layout-document.md)) → `LayoutStore.save()`.
- Lưu ý: editor thao tác bằng px cho dễ, nhưng **convert sang % khung variant khi lưu**.

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
- **Input:** `LayoutVariant` + `CanonicalRecord` + `resolveAsset` + kích thước container.
- **Xử lý:** với mỗi item:
  - `box {x,y,w,h}%` → `left/top/width/height` px theo container.
  - `text.content` → `renderText(content, record, customVars)` thay token.
  - `text.fontSize %` → px theo chiều cao container.
  - `image.varKey` → `record[varKey]` (ảnh); nếu rỗng → fallbackText.
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
| Biến | field-key cố định + `renderTemplate` (2 cơ chế) | chỉ token `@var@` (1 cơ chế) |

## Trường hợp biên cần xử lý (ghi để không quên)

- Màn hình tỷ lệ **không khớp variant nào** → chọn gần nhất + letterbox/pillarbox (không kéo giãn méo).
- Record **thiếu biến** (VD không có ảnh) → fallbackText / ẩn item, không vỡ layout.
- Layout **không có variant cho tỷ lệ đang chiếu** → fallback `defaultVariantAspectId`.
- Text **quá dài tràn box** → `overflow: shrink|wrap|clip` (khai báo trên TextItem).
- **Không match layout nào** → dùng "default" layout; nếu cũng không có → backdrop trống + log.
