# 05 — Hệ biến & Adapter

> Giải quyết YC4 (biến), YC5 (adapter map trường), và phần "quản lý danh sách biến ở đâu".

## Ba tầng biến (tách bạch rõ)

```
Tầng 1 — RAW INPUT (dữ liệu thô của user)
   linh hoạt, hỗn loạn: ho_ten | full_name | ten_sv | masv | ma_sv | first+last ...
        │
        │  [FieldMappingProfile]  ← ADAPTER (mảnh phải xây)
        ▼
Tầng 2 — CANONICAL RECORD (kiểu chuẩn)
   cố định: full_name, student_code, gpa, classification, image_relative_path ...
   (đã có: interface Student ở slide-shared/types.ts)
        │
        │  [renderTemplate + resolveCustomVariables]  ← đã có
        ▼
Tầng 3 — TOKEN @var@ trong layout
   editor nhúng @full_name@, @danh_xung@, @anh_dai_dien@ ...
   → resolve thành giá trị cuối để hiển thị
```

**Ý nghĩa:** editor & layout chỉ làm việc với Tầng 3 (token). Ceremony lo Tầng 1→2 (adapter)
và 2→3 (render). Layout KHÔNG biết data gốc dạng gì → tái dùng cho mọi nguồn.

## Danh sách biến quản lý ở đâu — 3 loại

### Loại 1 — Biến hệ thống (canonical, cố định)
- **Nguồn chân lý:** `STUDENT_TEMPLATE_VARIABLES` (đã có, `ceremony/src/lib/renderTemplate.ts`).
  12 biến: full_name, student_code, major_name, faculty_name, class_code, course_code,
  gpa, classification, award_content, quote, batch_name, achievement_title.
- Mỗi biến có `key / label / example`.
- **Editor import chính danh sách này** để render dropdown "Chèn biến" — KHÔNG tự định nghĩa
  `varDefs` riêng như prototype (tránh lệch nguồn).
- Cần chuyển danh sách này lên `slide-shared` để cả 2 app import (hiện đang ở module ceremony).

### Loại 2 — Biến điều kiện tùy chỉnh (rule-based)
- **Đã có:** `CustomVariable` + `CustomVariableRule` (`slide-shared/types.ts`).
- VD `@danh_xung@` = "Kỹ sư" nếu ngành ∈ {CNTT, Cơ khí}, "Cử nhân" nếu GPA ≥ 3.2, mặc định "Cử nhân".
- Người dùng định nghĩa trong ceremony (`CustomVariablesContent.tsx` đã có UI).
- **Editor cần đọc được danh sách này** để hiện trong dropdown chèn biến (đọc từ store/config).
- Đây cũng là chỗ **chuyển nghiệp vụ ra khỏi renderer**: thay vì `DynamicBackdropView` tự
  format "Xuất sắc: 3.8", định nghĩa biến `@xep_loai_gpa@` = rule → layout chỉ chèn token.

### Loại 3 — Biến ảnh
- `ImageItem.varKey` (VD `anh_dai_dien` → `student.image_relative_path`).
- Cần đánh dấu biến nào là ảnh (kind='image') để editor cho "gán biến ảnh" vào ImageItem.
- Canonical: `image_relative_path`. Adapter map từ nguồn thô (VD `anh`, `photo_url`, `avatar`).

## FieldMappingProfile — Adapter (mảnh PHẢI xây)

### Vấn đề
Ceremony hiện GIẢ ĐỊNH input đã đúng shape `Student`. Thực tế user đưa data đủ kiểu tên cột.

### Đề xuất schema

```ts
export interface FieldMappingProfile {
  id: string;                    // "employee-hr" | "student-dainam-2026"
  label: string;                 // "Danh sách nhân viên HR"
  targetType: 'student' | 'employee' | 'generic';  // kiểu canonical đích
  map: Record<string, MappingRule>;   // canonicalKey → cách lấy từ raw
  // giá trị mẫu để preview trong editor (1 record giả)
  sample?: Record<string, string>;
}

export type MappingRule =
  | { kind: 'from'; from: string }                        // full_name ← raw["ho_ten"]
  | { kind: 'concat'; parts: string[]; sep?: string }     // full_name ← [first,last] nối " "
  | { kind: 'const'; value: string }                      // award_type ← "KHENTHUONG"
  | { kind: 'computed'; expr: ComputedExpr };             // (tương lai) trim/upper/format ngày
```

### Cách chạy
```
rawRecord (bất kỳ shape) ─ applyMapping(profile) ─▶ canonicalRecord (Student/Employee)
```
Chạy **1 lần khi import** → toàn bộ pipeline sau (`resolveLayout`, `renderTemplate`, `LayoutRenderer`)
không cần biết data gốc. Đây đúng "ports & adapters" của kiến trúc sky-app.

### Ví dụ

```jsonc
// Nguồn: danh sách nhân viên có cột: manv, ho, ten, chuc_danh, phong, anh
{
  "id": "employee-hr",
  "label": "Nhân viên HR",
  "targetType": "employee",
  "map": {
    "student_code":  { "kind": "from", "from": "manv" },
    "full_name":     { "kind": "concat", "parts": ["ho", "ten"], "sep": " " },
    "chuc_vu":       { "kind": "from", "from": "chuc_danh" },
    "phong_ban":     { "kind": "from", "from": "phong" },
    "image_relative_path": { "kind": "from", "from": "anh" }
  }
}
```

### Vấn đề "canonical cho nhân viên chưa tồn tại"
- Hiện chỉ có `Student` (rất chuyên biệt sinh viên). Nhân viên có `chuc_vu`, `phong_ban`… không có
  trong `Student`.
- **Phương án:**
  - (a) Canonical **generic** = `Record<string, string>` linh hoạt, biến = key bất kỳ. Đơn giản,
    nhưng mất type-safety, mất validate.
  - (b) Định nghĩa vài canonical type (`Student`, `Employee`, …) + `STUDENT_VARS`/`EMPLOYEE_VARS`.
    Type-safe hơn, nhưng phải maintain nhiều bộ.
  - (c) **Hybrid:** canonical lõi tối thiểu (`id`, `full_name`, `image`) + `extra: Record<string,string>`
    cho field tuỳ đối tượng. Biến hệ thống = lõi; biến mở rộng = khai báo trong profile.
  - → nghiêng (c). Ghi vào câu hỏi mở để chốt.

## Hợp nhất cơ chế biến (dọn nợ khi migrate)

Hiện có 2 cơ chế (xem [02](02-hien-trang-ceremony.md)). Sau migrate:
- **Chỉ còn token `@var@`** trong mọi text (layout + TTS).
- Resolver duy nhất: `@key@` → ưu tiên `CustomVariable` → rồi `canonical[key]` → rồi `extra[key]` → "".
- Business logic cũ trong `DynamicBackdropView` (format GPA, award fallback) → viết lại thành
  `CustomVariable` rule hoặc `computed` mapping. Liệt kê để không sót:

| Logic cũ trong renderer | Chuyển thành |
|---|---|
| `classification` → "Xuất sắc: 3.8 TRONG HỌC TẬP" | CustomVariable `@xep_loai_day_du@` (rule + template) |
| `award_title` fallback "ĐẠT DANH HIỆU" | CustomVariable với default |
| cắt tiền tố "Xếp loại tốt nghiệp:" | computed mapping (transform) hoặc rule |
| `displayName(full_name)` (title-case) | giữ trong renderTemplate (`titleCaseIfAllCaps` đã có) |
| `formatGpa(gpa)` | computed mapping hoặc giữ helper |

## Sơ đồ resolve token (Tầng 3)

```
"Xin chúc mừng @full_name@ — @danh_xung@"
        │  renderText(content, ctx)
        ▼
for each @key@:
   1. key ∈ CustomVariable?   → tính theo rules (op equals/contains/in/gt/lt…)
   2. key ∈ canonical core?   → giá trị + titleCase nếu ALL CAPS
   3. key ∈ record.extra?     → giá trị thô
   4. else                    → "" (rỗng, không vỡ layout)
        ▼
"Xin chúc mừng Nguyễn Văn A — Kỹ sư"
```
