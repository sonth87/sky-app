# 02 — Hiện trạng ceremony (khảo sát code)

> Mục đích: biết CHÍNH XÁC cái gì đang có để tái dùng / migrate, tránh phát minh lại.
> Nguồn: `modules/ceremony`, `packages/slide-shared` (khảo sát 2026-07-15).

## Bản đồ "đã có sẵn"

| Khái niệm yêu cầu | Ceremony đã có | File | Ghi chú |
|---|---|---|---|
| Chọn layout theo điều kiện | `resolveTemplate(award_content → template)` | `slide-shared/src/types.ts` | Chỉ theo 1 field `award_content`, key uppercase-trim |
| Layout theo tỷ lệ màn hình | `BackdropTemplate.variants` | `types.ts` | **Đóng cứng `'16:9' \| '25:9'`** — cần tổng quát |
| Điền biến text | `renderTemplate(tpl, student, customVars)` | `ceremony/src/lib/renderTemplate.ts` | Regex `@([a-zA-Z_]+)` |
| Biến điều kiện rule-based | `CustomVariable` + `CustomVariableRule` | `types.ts` | op: equals/contains/in/gt/lt/gte/lte |
| Danh sách biến hệ thống | `STUDENT_TEMPLATE_VARIABLES` (12 biến) | `renderTemplate.ts` | có `key/label/example` |
| Render layout + data runtime | `DynamicBackdropView` | `slide-shared/src/DynamicBackdropView.tsx` | model panel/field |
| Override layout theo config | `AppConfig.layout_overrides` | `types.ts` | `Record<key, Partial<BackdropTemplate>>` |
| Nạp config từ artifact | `fetch(ceremony.backdrops_config).json()` | `BackdropApp.tsx:1010` | Đọc file JSON |
| Resolve variant theo tỷ lệ | `resolveTemplateVariant(tpl, ratio)` | `types.ts` | fallback về top-level nếu thiếu variant |

## Model template HIỆN TẠI (sẽ được thay/migrate)

```
BackdropTemplate
├─ image                         // ảnh nền
├─ avatar: BackdropRegion        // vùng ảnh SV (x,y,w,h theo %)
├─ avatarShape: circle|square
├─ ring                          // ảnh viền
├─ panels: BackdropPanel[]       // MỖI panel = 1 cụm text stack DỌC
│   ├─ x,y,width,height (%)
│   ├─ style mặc định (fontSize %, weight, color, align, vAlign, gap)
│   └─ fieldOrder: string[]      // thứ tự field, VD [full_name, major_name, classification]
├─ fields: Record<key, override> // override style/text/show/prefix theo từng field
└─ variants: { '16:9'|'25:9': {...} } // override image/avatar/panels/fields theo tỷ lệ
```

### Đặc điểm quan trọng của model cũ (điểm mạnh & điểm yếu)

**Điểm mạnh (đáng giữ về mặt ý tưởng):**
- Toạ độ theo **%** → co giãn tốt theo độ phân giải. (khớp YC7)
- `fontSize` theo **% chiều cao khung** (`containerH`) → chữ scale theo màn. (rất hay, phải giữ)
- Có cơ chế **variant theo tỷ lệ** sẵn. (khớp YC6, nhưng cần tổng quát hóa)
- Có **fallback** variant → top-level.

**Điểm yếu (lý do cân nhắc migrate):**
- **Vocabulary field CỐ ĐỊNH**: `full_name`, `major_name`, `classification`, `quote`,
  `template_type`, `title`, `award_title`, `classification_gpa`. Muốn thêm field mới phải
  sửa code `DynamicBackdropView` (xem `fieldContent` map, dòng 34–61).
- **Business logic trộn vào renderer**: `DynamicBackdropView` tự format GPA, tự fallback
  `award_title = 'ĐẠT DANH HIỆU'`, tự cắt tiền tố `"Xếp loại tốt nghiệp:"`. → layout không
  thuần "hình", nó biết nghiệp vụ sinh viên. Khó tái dùng cho "nhân viên".
- **Model panel/field cứng**: chỉ stack dọc trong panel. Không đặt item tự do bất kỳ đâu.
  Editor kéo-thả của bạn cần tự do hơn (ribbon, shape, ảnh trang trí, nhiều text rời rạc).
- `@var@` trong `renderTemplate` KHÁC với field-key trong `DynamicBackdropView`. Đang có **2
  cơ chế biến song song**: một cho TTS (`renderTemplate` + `CustomVariable`), một cho backdrop
  (field-key cố định). Migrate là cơ hội **hợp nhất về 1 cơ chế biến duy nhất**.

## Hai cơ chế biến đang song song (cần hợp nhất)

| | Cơ chế A — backdrop | Cơ chế B — TTS / custom |
|---|---|---|
| Dùng ở | `DynamicBackdropView` | `renderTemplate` (đọc tên SV) |
| Biến là | field-key cố định trong code | token `@key` tự do |
| Giá trị từ | `fieldContent` map (hardcode) | `student[key]` hoặc `CustomVariable` rule |
| Thêm biến mới | sửa code renderer | thêm vào `custom_variables` config |

→ **Migrate nên hợp nhất về cơ chế B** (token tự do + resolver), vì nó linh hoạt và đã
có rule engine. Backdrop render chỉ cần: "text có token → resolve token → hiển thị".

## Chuỗi hàm sẽ bị ảnh hưởng khi migrate

```
BackdropApp.tsx
  fetch(backdrops_config) → BackdropTemplateMap        // đổi sang LayoutDocumentMap
  resolveTemplate(award_content)                        // tổng quát thành resolveLayout(record, ctx)
  resolveTemplateVariant(tpl, aspectRatio)              // tổng quát thành resolveVariant(layout, ratio)
  <DynamicBackdropView student template .../>           // thay bằng <LayoutRenderer record layout variant .../>

renderTemplate.ts
  renderTemplate(@var, student, customVars)             // GIỮ, dùng chung cho cả text trong layout
  STUDENT_TEMPLATE_VARIABLES                             // GIỮ, editor import làm nguồn biến
  resolveCustomVariables                                 // GIỮ
```

## Kết luận khảo sát

- Ceremony đã giải ~70% bài toán, nhưng bằng **model cứng, trộn nghiệp vụ**.
- **Cái phải giữ:** toạ độ %, fontSize theo % chiều cao, cơ chế variant-theo-tỷ-lệ, rule engine
  (`CustomVariableRule`), `renderTemplate` + `STUDENT_TEMPLATE_VARIABLES`.
- **Cái nên bỏ/migrate:** vocabulary field cố định, business logic trong renderer, model
  panel/field cứng, sự đóng cứng `'16:9'|'25:9'`, 2 cơ chế biến song song.
- **Cái phải xây mới:** FieldMappingProfile adapter (map data thô), LayoutStore port, model
  item tự do, editor.
