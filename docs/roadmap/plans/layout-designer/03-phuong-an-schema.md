# 03 — Phương án schema (quyết định trung tâm)

> Bài toán: editor mới (kéo-thả, item tự do, biến tự do, multi-aspect) vs ceremony
> hiện tại (model panel/field cứng, trộn nghiệp vụ). Hoà giải thế nào?

## Tóm tắt 3 phương án

| | A — Ép editor theo schema cũ | B — Schema mới song song | C — Migrate toàn bộ |
|---|---|---|---|
| Editor xuất ra | `BackdropTemplate` (cũ) | `LayoutDocument` (mới) | `LayoutDocument` (mới) |
| Ceremony | không đổi | render CẢ HAI | chỉ render mới |
| Config cũ 2025/2026 | giữ nguyên | giữ nguyên (nhánh cũ) | **phải convert** |
| Tự do editor | ❌ bó theo panel/field | ✅ | ✅ |
| Rủi ro dữ liệu đang chạy | thấp | thấp | trung bình |
| Nợ kỹ thuật để lại | cao (editor méo mó) | trung bình (2 schema) | **thấp (1 schema sạch)** |
| Công sức | ít nhất | trung bình | nhiều nhất |

**Sonth nghiêng về C** (đang giai đoạn phát triển, chưa triển khai thật, muốn cấu trúc tốt nhất).
Dưới đây phân tích sâu C.

---

## Phân tích sâu phương án C — Migrate toàn bộ

### C làm gì

1. Định nghĩa **1 schema mới duy nhất** `LayoutDocument` (multi-aspect, item tự do, token biến).
2. Viết **1 renderer mới duy nhất** `LayoutRenderer` (thay `DynamicBackdropView`).
3. **Chuyển toàn bộ config cũ** (`backdrops.json` 2025/2026) sang `LayoutDocument`:
   - hoặc viết script convert tự động (model cũ → mới),
   - hoặc dựng lại bằng chính editor (ít config, làm tay được).
4. **Gỡ bỏ** `DynamicBackdropView`, `BackdropTemplate`, vocabulary field cố định, business logic
   trong renderer → đẩy nghiệp vụ ra ngoài (thành biến/adapter).
5. Ceremony chỉ còn 1 đường: `resolveLayout → LayoutRenderer`.

### Ưu điểm C

- ✅ **Một nguồn chân lý.** Không phải maintain 2 schema, 2 renderer, 2 cơ chế biến. Giảm nợ dài hạn.
- ✅ **Editor và ceremony dùng CHUNG renderer.** "What you see is what ceremony shows" — preview
  trong editor chính là output thật, vì cùng 1 `LayoutRenderer`. Cực kỳ giá trị.
- ✅ **Tách nghiệp vụ khỏi hình.** Format GPA, fallback danh hiệu… chuyển thành `CustomVariable`
  rule → layout thuần hình, tái dùng được cho nhân viên/sinh viên/bất kỳ đối tượng nào.
- ✅ **Hợp nhất cơ chế biến.** Chỉ còn token `@var@` + resolver. Đơn giản hoá tư duy.
- ✅ **Đúng thời điểm.** Chưa triển khai thật → chi phí phá vỡ thấp nhất so với sau này.

### Nhược điểm / rủi ro C

- ⚠️ **Phải convert config cũ.** Có `assets/2026/backdrops.json` (và có thể 2025) đang dùng.
  Nếu convert sai → backdrop lệch. **Giảm thiểu:** vì hiện đang phát triển, chấp nhận dựng lại
  bằng editor thay vì convert tự động; hoặc viết converter + so sánh ảnh trước/sau.
- ⚠️ **Port business logic.** `DynamicBackdropView` chứa logic thật (GPA, award fallback, cắt tiền tố).
  Phải bóc ra cẩn thận, không được mất. **Giảm thiểu:** liệt kê từng logic → map thành
  `CustomVariable` hoặc "computed field" trong adapter. Xem [05](05-he-bien-va-adapter.md).
- ⚠️ **Rủi ro pixel/tỷ lệ** (Sonth nêu): màn thật khác độ phân giải/tỷ lệ.
  **→ Đây KHÔNG phải rủi ro của việc migrate, mà là yêu cầu thiết kế toạ độ.** Giải bằng:
  - Toạ độ theo **% khung variant** (không px tuyệt đối).
  - **Mỗi tỷ lệ 1 variant riêng** (YC6) → không ép 1 layout co cho mọi tỷ lệ.
  - fontSize theo **% chiều cao khung** (giữ từ model cũ).
  Xem [04](04-schema-layout-document.md) §"Chống lệch pixel".

### C có phá vỡ gì đang chạy không?

- Ceremony ở sky-app đang là bản **port** (GĐ5), CHƯA triển khai sản xuất → an toàn để đổi.
- `renderTemplate` + `CustomVariable` + `STUDENT_TEMPLATE_VARIABLES` **được giữ nguyên**, chỉ
  mở rộng cách dùng → không phá phần TTS.
- Cần kiểm: `PreviewPanel.tsx`, `LayoutConfigContent.tsx`, `CustomVariablesContent.tsx` đang
  phụ thuộc `BackdropTemplate` — sẽ phải cập nhật theo. (đưa vào checklist migrate)

---

## Chiến lược migrate — ĐÃ CHỐT (2026-07-15): C thẳng, KHÔNG convert config cũ

> Cập nhật: chiến lược "chặng B→C an toàn" bên dưới (giữ log lịch sử suy luận, gạch ngang) đã
> bị THAY THẾ. Sonth chốt: đây là 1 đợt tái cấu trúc lớn, `backdrops.json` KHÔNG còn tác dụng
> gì (nó là hardcode layout, đúng thứ toàn bộ plan này thay thế) — không cần convert, không
> cần đối chiếu ảnh cũ, không cần giữ đường lui về schema cũ. Đóng thẳng câu hỏi A5 ở file 08.

**Ý nghĩa thực tế:**
- **Không có Bước 3 "convert config cũ"** — `backdrops.json` của 2025/2026 (nếu có) bị bỏ hẳn,
  không port. Layout cho các đợt lễ sắp tới được **thiết kế lại từ đầu bằng editor mới** — đây
  vốn dĩ là mục đích của app layout-designer, không phải việc phát sinh thêm.
- **Không cần giữ nhánh renderer cũ chạy song song** trong ceremony — vì không có config cũ nào
  cần đọc nữa. `DynamicBackdropView`/`BackdropTemplate` có thể **gỡ ngay khi `LayoutRenderer`
  mới sẵn sàng**, không phải đợi "migrate xong dữ liệu cũ" (vì không có dữ liệu cũ nào cần giữ).
- Điều này **giảm nhẹ đáng kể** độ phức tạp triển khai so với bản nháp B→C trước — không phải
  vì bớt việc code, mà vì bớt hẳn 1 loại rủi ro (rủi ro convert sai lệch pixel dữ liệu cũ).

**Trình tự triển khai (đơn giản hoá, không còn "song song 2 schema"):**

1. Định nghĩa `LayoutDocument` + `LayoutRenderer` trong `slide-shared` (file 04).
2. Làm `modules/layout-designer` (editor) xuất đúng schema mới.
3. Làm `Event` (file 10) + mở rộng ceremony (file 13) để đọc `LayoutDocument`/`EventDocument`.
4. Ceremony **thay thẳng** cơ chế cũ (`fetch(backdrops_config)` + `DynamicBackdropView`) bằng
   cơ chế mới (`EventStore.getActive()` + `LayoutRenderer`) — không cần nhánh rẽ if/else giữ
   cả 2, vì không còn dữ liệu cũ nào phải phục vụ.
5. Xoá `BackdropTemplate`, `DynamicBackdropView`, `resolveTemplate`, `resolveTemplateVariant`
   khỏi `slide-shared` — dọn sạch, không để lại code chết.

**Vẫn cần kiểm (không đổi so với bản trước):** `PreviewPanel.tsx`, `LayoutConfigContent.tsx`,
`CustomVariablesContent.tsx` đang phụ thuộc `BackdropTemplate`/`AppConfig.custom_variables` —
các UI này cần viết lại theo schema mới (`LayoutDocument`/`EventDocument`), không phải "cập
nhật nhẹ" — đưa vào phạm vi file 13 (ceremony mở rộng).

---

<details>
<summary>Lịch sử suy luận trước khi chốt (giữ lại để hiểu vì sao — không còn là kế hoạch hiện hành)</summary>

Chia nhỏ để không "big bang":

**Bước 0 — Định nghĩa schema + renderer mới, chạy song song ẩn.**
`LayoutDocument` + `LayoutRenderer` trong `slide-shared`, có test render, CHƯA gỡ cũ.

**Bước 1 — Editor sinh `LayoutDocument`.** Làm `modules/layout-designer` xuất đúng schema mới.

**Bước 2 — Ceremony đọc được `LayoutDocument`.** Thêm nhánh: nếu config là schema mới → `LayoutRenderer`.
Tạm thời vẫn giữ nhánh cũ (giai đoạn chuyển tiếp — GIỐNG phương án B tạm thời).

**Bước 3 — Convert config cũ → mới.** Dựng lại 2026 (và 2025 nếu có) bằng editor / converter.
Đối chiếu backdrop bằng mắt / screenshot.

**Bước 4 — Gỡ schema cũ.** Xoá `DynamicBackdropView`, `BackdropTemplate`, nhánh cũ trong ceremony.
Đến đây mới thực sự là "C hoàn tất".

> Lưu ý: Bước 0→2 thực chất đi qua trạng thái B (2 schema cùng tồn tại)... (không còn áp dụng)

</details>

---

## Khuyến nghị

- **Chốt đích = C** (1 schema sạch), nhưng **triển khai theo chặng B→C** để luôn có trạng thái chạy được.
- **Không dùng px tuyệt đối** trong schema — đó là quyết định độc lập với A/B/C, và là mấu chốt
  chống lệch màn hình.
- Ưu tiên **editor & ceremony share `LayoutRenderer`** — đây là lợi ích lớn nhất của việc thống nhất schema.
