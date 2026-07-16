# 12 — Thư viện Layout (Layout Library) & Sao chép Variant

> Giải quyết yêu cầu: "layout trao bằng 2026 - xuất sắc" có variant 16:9+25:9; "layout trao
> bằng 2026 - không thành tích" có variant 16:9; muốn tạo thêm variant 25:9 hoặc 31:9 cho cái
> sau bằng cách **copy từ bất kỳ layout/variant nào có sẵn** — kể cả từ layout khác hẳn.
> Không làm kế thừa runtime (master variant) — chỉ làm copy-as-new một lần, xem [08](08-cau-hoi-mo.md) A3.

## Vấn đề: LayoutDocument một mình không đủ để "quản lý chung"

`LayoutDocument` (file 04) là 1 đơn vị độc lập — biết `variants[]` của CHÍNH NÓ, không biết
layout nào khác đang tồn tại. Nhưng thao tác "sao chép variant từ layout X sang layout Y" cần
1 nơi **liệt kê toàn bộ layout đang có**, duyệt/tìm theo tên, xem trước, rồi chọn nguồn copy.
Đây là vai trò của **Layout Library** — không phải 1 schema mới, mà là **UI + truy vấn trên
LayoutStore đã có** (file 06), cộng thêm 1 thao tác mới: `cloneVariant`.

## Layout Library là gì (làm rõ, không phải tầng dữ liệu mới)

```
LayoutStore (đã có, file 06)
  .list()   → tất cả LayoutDocument (id, name, updatedAt, aspectIds)
  .get(id)  → 1 LayoutDocument đầy đủ

Layout Library = MÀN HÌNH trong layout-designer hiển thị kết quả .list(), có thể:
  - lọc/tìm theo tên ("trao bằng 2026")
  - xem trước từng layout (thumbnail theo variant)
  - MỞ 1 layout để sửa (vào editor)
  - "Sao chép variant" — thao tác MỚI, mô tả bên dưới
```

Không cần schema/store mới — Library là 1 view trên `LayoutStore.list()` đã định nghĩa sẵn.

## Thao tác "Sao chép variant" (cloneVariant) — chi tiết luồng

```
Người dùng đang sửa layout Y ("Trao bằng 2026 - Không thành tích", hiện chỉ có variant 16:9)
  → bấm "+ Thêm tỷ lệ" → chọn tỷ lệ đích (VD 25:9)
  → dialog hiện 2 lựa chọn:
      (a) "Tạo trống" — variant mới, canvas trống, tự thiết kế từ đầu
      (b) "Sao chép từ..." → MỞ Layout Library dạng picker:
            liệt kê MỌI layout + MỌI variant đang có trong LayoutStore
            (kể cả layout X "Trao bằng 2026 - Xuất sắc", variant 25:9 của nó)
            người dùng chọn 1 variant nguồn bất kỳ → xem preview
  → xác nhận → hệ thống COPY NGUYÊN VẸN {refW, refH, background, items[]} của variant nguồn
      thành variant MỚI, gắn vào layout Y với aspect = 25:9 (aspect đích, không phải aspect
      của nguồn — xem xử lý lệch tỷ lệ bên dưới)
  → variant mới độc lập hoàn toàn với nguồn — sửa variant Y không ảnh hưởng layout X
```

### Xử lý khi tỷ lệ nguồn ≠ tỷ lệ đích (VD copy từ variant 16:9 sang tạo variant 25:9)

Đây là tình huống chính bạn mô tả ("layout xuất sắc có 25:9, muốn tạo 25:9 hoặc 31:9 cho layout
không thành tích bằng cách copy") — nguồn copy CÓ THỂ không cùng tỷ lệ với đích:

```ts
function cloneVariant(source: LayoutVariant, targetAspect: AspectRatio): LayoutVariant {
  const scaleX = targetAspect.w / source.aspect.w;   // VD copy 16:9 → 25:9: scaleX = (25/9)/(16/9) ≈ 1.56
  const scaleY = 1;  // refH thường giữ nguyên logic thiết kế theo chiều cao
  return {
    aspect: targetAspect,
    refW: Math.round(source.refW * scaleX),
    refH: source.refH,
    background: null,     // ẢNH NỀN KHÔNG COPY ĐƯỢC (ảnh 16:9 kéo méo sang 25:9 sẽ xấu) —
                            // để trống, NHẮC người dùng tự thay ảnh nền phù hợp tỷ lệ mới
    items: source.items.map(it => ({
      ...it,
      box: { ...it.box, x: it.box.x * scaleX, w: it.box.w * scaleX }  // giãn theo trục X,
                                                                        // giữ Y nguyên — vị trí
                                                                        // tương đối hợp lý làm
                                                                        // điểm khởi đầu, KHÔNG
                                                                        // đảm bảo đẹp tuyệt đối
    })),
  };
}
```

**Quan trọng — đặt đúng kỳ vọng:** copy-across-aspect chỉ là **điểm khởi đầu để đỡ vẽ lại từ
đầu**, KHÔNG phải "tự động ra layout hoàn hảo cho tỷ lệ mới". Sau khi copy, người thiết kế gần
như chắc chắn cần **chỉnh tay lại vị trí** (đặc biệt ảnh nền luôn phải thay thủ công). Điều này
nhất quán với nguyên tắc đã chốt ở file 04: mỗi tỷ lệ xứng đáng 1 bố cục được cân nhắc riêng,
copy chỉ là công cụ tiết kiệm công sức, không thay thế việc thiết kế.

**Trường hợp đơn giản hơn — copy CÙNG tỷ lệ** (VD nhân bản variant 16:9 sang 1 layout khác
cũng cần 16:9, chỉ muốn đổi nội dung/ảnh): `scaleX = scaleY = 1`, copy y nguyên không biến đổi
gì, `background` GIỮ NGUYÊN (vì cùng tỷ lệ, ảnh không bị méo) — người dùng chỉ cần đổi text/
màu, tiết kiệm gần như toàn bộ công sức.

## Vị trí thao tác "Sao chép" trong editor UI (phác thảo)

```
[Thanh tab tỷ lệ trên canvas]   16:9   25:9   [+ Thêm tỷ lệ ▾]
                                                   ├─ Tạo trống
                                                   └─ Sao chép từ layout khác...
                                                        → mở Library Picker (modal)
```

## Quan hệ với Event (file 10) — làm rõ ranh giới, tránh nhầm 2 cơ chế "tái sử dụng"

File 10 đã có 3 mức tái sử dụng ở **tầng Event** (giống hệt / override background / fork layout
mới). Thao tác `cloneVariant` ở đây nằm ở **tầng Layout**, khác hẳn phạm vi:

| | Tầng Event (file 10) | Tầng Layout (file này) |
|---|---|---|
| Tái sử dụng gì | 1 LayoutDocument nguyên khối, giữa các ĐỢT LỄ | 1 LayoutVariant, giữa các LAYOUT (bất kể đợt nào) |
| Khi nào dùng | "Đợt 2 giống đợt 1, chỉ đổi ngày/data" | "Layout A cần thêm tỷ lệ B, đỡ vẽ lại — mượn bố cục từ layout khác đã có tỷ lệ đó" |
| Kết quả | Event mới trỏ layout cũ (không tạo LayoutDocument mới) | LayoutDocument ĐÍCH có thêm 1 variant mới (đã tạo dữ liệu mới, độc lập) |

Hai cơ chế không chồng lấn: Event tái dùng cả layout; `cloneVariant` tái dùng 1 phần bên trong
layout (chỉ 1 variant) để đỡ công thiết kế, không liên quan gì đến Event.

## Việc cần cập nhật ở các file khác (checklist đồng bộ)

- [ ] [04-schema-layout-document.md](04-schema-layout-document.md): không đổi schema
      `LayoutVariant` (không cần field mới) — `cloneVariant` là hàm ở tầng ứng dụng (editor
      logic), không phải field trong dữ liệu.
- [ ] [06-luu-tru-va-giao-tiep.md](06-luu-tru-va-giao-tiep.md): `LayoutStore.list()` cần trả
      đủ thông tin để Library hiển thị preview (VD 1 thumbnail nhỏ mỗi variant) — cân nhắc bổ
      sung `LayoutSummary.variantPreviews?: {aspectId, thumbnailUrl}[]`.

## Câu hỏi mở

- Preview/thumbnail trong Library Picker — render live (chậm hơn, luôn đúng) hay cache ảnh
  snapshot lúc save layout (nhanh hơn, có thể lệch nếu layout đổi mà chưa re-cache)?
- Có cần "Sao chép cả layout" (toàn bộ LayoutDocument, mọi variant) làm layout mới hoàn toàn
  độc lập không — hay chỉ cần sao chép từng variant lẻ như mô tả trên là đủ? (đề xuất: làm
  luôn, vì gần như miễn phí về kỹ thuật khi đã có `cloneVariant` — chỉ là lặp cho mọi variant
  + đổi `id`/`name` của layout đích)
