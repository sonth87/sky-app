---
status: proposed
target_version: layout-designer-v0.22.0
---

# GĐ18 — Mẫu > Cá nhân: lưu & chèn lại nhóm item tự chọn

## Luồng UX "Lưu thành mẫu" — từng bước

1. User multi-select N item trên canvas (GĐ9).
2. `ItemToolbar` multi-select mode — thêm nút MỚI `Save`/`BookmarkPlus` icon (cạnh Delete) —
   click → mở `SaveTemplateModal.tsx` (mirror `LayoutInfoModal.tsx`'s form nhỏ: 1 input tên +
   Huỷ/Lưu).
3. Bấm "Lưu": (a) tính bounding-box của N item đã chọn, (b) deep-clone + tính toạ độ TƯƠNG ĐỐI
   trừ theo góc trên-trái bounding-box (ĐÚNG format `items[]` của GĐ17's preset — TÁI DÙNG
   thẳng, không định dạng riêng), (c) STRIP `syncKey`/`syncRef`/`syncOverrides` khỏi MỌI item
   (set `undefined`, không giữ giá trị cũ) — bước BẮT BUỘC, lý do đã nêu ở phase trước.
4. Gọi `layoutComponentPort.save(name, items)` → modal hiện icon `CheckCircle2` xanh + text "Đã
   lưu" trong ~600ms rồi tự đóng (mirror timing pattern GĐ14's upload-done, dùng NHẤT QUÁN 1 kiểu
   feedback "auto-close sau khi xong" trong toàn bộ module).

## Bảng SQL + Port

```ts
// packages/ceremony-db/src/migrations/0XX_layout_component.ts
CREATE TABLE layout_component (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content_json TEXT NOT NULL, -- JSON.stringify(LayoutItem[]), toạ độ tương đối
  created_at TEXT NOT NULL
);
```
```ts
// packages/service-contracts/src/layoutComponent.ts
export interface LayoutComponentPort {
  list(): Promise<{ id: string; name: string; items: LayoutItem[]; createdAt: string }[]>;
  save(name: string, items: LayoutItem[]): Promise<{ id: string }>;
  delete(id: string): Promise<void>;
}
```
3 adapter (Electron IPC/Web REST/WASM IndexedDB) — mirror ĐÚNG pattern `deleteLayoutDocument`
(GĐ6 cũ) đã làm nhiều lần, không thiết kế lại.

## UI tab "Cá nhân" (trong `TemplatesPanel.tsx`, lắp ở GĐ19)

Giống `GridPresetsPanel.tsx`'s layout (mini-preview qua `LayoutRenderer`, grid 2 cột) + nút
`Trash2` hover-reveal trên mỗi tile (xoá gọi `layoutComponentPort.delete(id)`, optimistic filter
local ngay — cùng pattern đã dùng ở GĐ14's asset delete). Kéo tile → `useSpawnDrag`'s
`onDown({kind:'preset', items: template.items, label: template.name})` — publisher NGUỒN `items`
khác GĐ17 (load từ `list()` thay vì hardcode) nhưng CƠ CHẾ CHÈN giống 100%.

## Vấn đề phát sinh & cách xử lý

- **N=1** (lưu 1 item duy nhất làm "mẫu") — HỢP LỆ, không chặn (nút "Lưu thành mẫu" cũng hiện khi
  `selection.length === 1`, không riêng multi-select) — use-case thật: lưu 1 TextItem đã style kỹ
  để dùng lại (gần giống Text Preset GĐ19 nhưng do USER tự tạo thay vì app cung cấp).
- **Đặt tên trùng** — KHÔNG validate unique (cho phép trùng tên, phân biệt bằng `id`) — đơn giản
  hoá v1, không có lý do kỹ thuật cần tên duy nhất.

## Definition of done

- [ ] Chọn N item → "Lưu thành mẫu" → xuất hiện trong tab "Cá nhân".
- [ ] Mở layout KHÁC → chèn mẫu → đúng cấu trúc, 1 bước undo.
- [ ] Item chèn từ mẫu KHÔNG mang `syncKey/syncRef` gốc — test rõ ràng xác nhận.
- [ ] Xoá mẫu → biến mất khỏi "Cá nhân", không ảnh hưởng layout đã chèn nó.
- [ ] Hoạt động đúng Electron + Web (data-service + WASM).

