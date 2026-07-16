# 08 — Câu hỏi mở, rủi ro, việc cần nghiên cứu

> Nơi gom mọi thứ CHƯA chốt. Trả lời dần, rồi chắt lọc thành quyết định ở docs chính thức.

## A. Câu hỏi cần Sonth quyết

### A1. ~~Canonical cho "nhân viên" xử lý sao?~~ — ĐÃ CHỐT (mở rộng thêm nhóm/tập thể)
- Chốt (c) hybrid lõi (`full_name`, `image_relative_path`, `status`) + `extra: Record<string,...>`
  cho field đặc thù từng loại (`CanonicalSubject`). Đồng thời phát sinh thêm `CanonicalGroup`
  (trao giải tập thể — nhiều người trong 1 record) + `LoopItem` trong layout để lặp 1 khung
  thiết kế cho cả danh sách. Xem chi tiết đầy đủ ở [11-canonical-da-loai-va-loop.md](11-canonical-da-loai-va-loop.md).

### A2. ~~Toạ độ biên (border/stroke) theo % hay px?~~ — ĐÃ CHỐT
- Đã quyết dùng px trên canvas chuẩn (`refW/refH`) + scale-to-fit cho MỌI kích thước (xem 04) —
  border cũng theo cơ chế này, không cần quyết riêng nữa. Đóng câu hỏi này.

### A3. ~~Có cần "master variant" để các variant kế thừa item không?~~ — ĐÃ CHỐT: không kế thừa
tự động, nhưng cần **"Sao chép variant" (copy-as-new)** từ BẤT KỲ layout/variant nào khác.
- Không làm cơ chế kế thừa runtime (master → variant con tự động ăn theo) — mỗi variant vẫn là
  dữ liệu độc lập, tự chứa (đơn giản hơn, không có "phép màu ẩn" khi debug).
- Thay vào đó: hành động **"Sao chép từ..."** khi tạo variant mới — chọn NGUỒN là bất kỳ
  variant nào của BẤT KỲ layout nào (không giới hạn cùng 1 layout), toàn bộ `items[]` +
  `background` được COPY nguyên bản thành dữ liệu mới độc lập, người dùng chỉnh tiếp từ đó.
- Đây là lý do phát sinh khái niệm **Layout Library** (quản lý chung, xem
  [12-thu-vien-layout.md](12-thu-vien-layout.md)) — vì "copy từ bất kỳ layout nào" đòi hỏi
  1 nơi liệt kê TOÀN BỘ layout + variant đang có để chọn nguồn sao chép.

### A4. ~~Font — bundle sẵn hay tự do?~~ — ĐÃ CHỐT: bundle sẵn
- Cung cấp sẵn 1 danh sách font cố định (whitelist) — KHÔNG cho tự do chọn/upload font.
- Editor chỉ hiện dropdown chọn trong danh sách này — không có ô nhập tên font tự do.
- **Nguồn chân lý:** đặt danh sách `LAYOUT_FONTS` ở `slide-shared` (giống `STUDENT_TEMPLATE_VARIABLES`),
  cả editor lẫn ceremony import chung — đảm bảo font hiển thị trong editor luôn khớp font
  ceremony render (loại bỏ hẳn rủi ro "lệch font giữa 2 app" đã nêu ở bảng rủi ro mục B).
- Font vật lý (file `.ttf`/`.woff2`) đặt trong `assets/fonts` (đã có sẵn thư mục này ở
  ceremony, xem `modules/ceremony/src/assets/fonts/`) — dùng lại, không tạo kho font mới.
- Việc còn lại: liệt kê chính xác bộ font sẽ bundle (kế thừa "Be Vietnam Pro", "Times New
  Roman" đang có + hỏi Sonth có muốn thêm font nào khác khi thiết kế layout đa dạng hơn).

### A5. ~~Migrate config cũ: convert tự động hay dựng lại tay?~~ — ĐÃ CHỐT: KHÔNG convert
- `backdrops.json` là hardcode layout — chính thứ toàn bộ kế hoạch này thay thế. Bỏ hẳn, không
  convert, không đối chiếu ảnh cũ/mới. Layout cho các đợt lễ sắp tới thiết kế lại từ đầu bằng
  editor mới. Xem chiến lược đầy đủ ở [03](03-phuong-an-schema.md) §"Chiến lược migrate — ĐÃ CHỐT".
- Hệ quả: bỏ luôn nhánh "giữ 2 schema song song" — ceremony chuyển thẳng sang schema/renderer
  mới, không cần fallback về `DynamicBackdropView`/`BackdropTemplate`.

### A6. ~~Đối tượng người dùng editor là ai?~~ — ĐÃ CHỐT: đa dạng, gồm người KHÔNG chuyên kỹ thuật
- Kỹ thuật viên, nhân viên, người dùng cuối không rành kỹ thuật — phải phục vụ được cả nhóm ít
  kinh nghiệm nhất. Đây là ràng buộc THIẾT KẾ UI quan trọng, ảnh hưởng nhiều quyết định trước đó:
- **Xác nhận đúng hướng đã chọn:**
  - Toạ độ px (thay vì %) — dễ hình dung hơn cho người không chuyên, càng đúng hướng hơn nữa
    với đối tượng này (xem quyết định ở file 04).
  - Font bundle sẵn (A4), không cho nhập tay — giảm khả năng người dùng chọn sai/gõ nhầm tên font.
  - Chuyển Event active bằng tay, không tự động (A9 — xem dưới) — người không chuyên cần kiểm
    soát rõ ràng thời điểm, tránh bị hệ thống tự đổi mà không hiểu vì sao.
- **Hệ quả THÊM cần ghi nhận (chưa có trong bản trước):**
  - Cảnh báo lỗi (file 09 §2 "Validate") phải dùng ngôn ngữ thường, không thuật ngữ kỹ thuật
    (VD "Biến @xyz@ chưa có dữ liệu — nội dung sẽ để trống khi trình chiếu" thay vì "token
    unresolved").
  - "Sao chép variant" (file 12) cần preview trực quan (thumbnail), không chỉ danh sách tên —
    người không chuyên chọn bằng mắt, không đọc kỹ mô tả.
  - Cân nhắc **onboarding/template mẫu có sẵn** (giữ ý tưởng "Mẫu" trong prototype gốc — kéo cả
    layout mẫu ra rồi tuỳ biến, thay vì bắt đầu từ canvas trắng) — hạ rào cản cho người mới.

### A7. ~~Đặt tên tầng "đợt lễ"~~ — ĐÃ CHỐT: **Event**
- Theo đề xuất tạm — giữ nguyên, dùng `EventDocument`/`EventStore` trong toàn bộ code/docs sau này.

### A8. ~~Event triển khai GĐ1 ở đâu?~~ — ĐÃ CHỐT: nhúng trong `modules/ceremony/src/control/`
- Không tách module/app riêng. `control/` đã đúng vai trò "phòng điều khiển" (khác biệt sẵn với
  `backdrop/` = màn trình chiếu) — quản lý Event/Data/Mapping thuộc đúng khu vực này.
- Chi tiết lý do + toàn cảnh 6 trách nhiệm mới của ceremony (Event, active/switch, tạo Event,
  data global/per-event, selector điều kiện phức hợp, mapping variable): xem
  [13-ceremony-mo-rong.md](13-ceremony-mo-rong.md).

### A9. ~~Chuyển Event active — tự động hay cần xác nhận?~~ — ĐÃ CHỐT: **hoàn toàn thủ công**
- Không làm cơ chế tự động/gợi ý theo `scheduledAt` — người dùng tự bấm chuyển Event active,
  không có bước "hệ thống tự đề xuất". Đơn giản hơn đề xuất ban đầu (bỏ hẳn phần bán-tự-động).
- `EventDocument.scheduledAt` (file 10) vẫn giữ làm THÔNG TIN hiển thị/sắp xếp danh sách Event
  theo thời gian (giúp người dùng tìm đúng Event trong danh sách dài), nhưng KHÔNG kích hoạt gì
  tự động — chỉ là metadata hiển thị.
- `EventStore.getActive(now)` (file 10) đổi nghĩa: không còn "tính theo lịch", chỉ là "trả về
  Event đang được đánh dấu active thủ công gần nhất" — tương đương `getCurrentActive()`.

### A10. ~~Data giữa các Event tách biệt hoàn toàn không?~~ — ĐÃ CHỐT: **tuỳ loại đợt, cả 2 đều cần**
- Sonth chỉ ra ví dụ rõ: **trao bằng tốt nghiệp** — sinh viên đã nhận bằng thì KHÔNG xuất hiện
  lại ở đợt sau (data đợt sau thực chất là "phần còn lại", tách biệt theo nghĩa vận hành dù
  cùng 1 nguồn danh sách trường). Nhưng **đợt khen thưởng khác** (không phải trao bằng) thì
  hoàn toàn có thể DÙNG LẠI/CHIA SẺ cùng 1 danh sách data giữa nhiều Event.
- → Đây không phải câu hỏi "chọn 1 trong 2", mà là: **Event cần hỗ trợ CẢ 2 kiểu quan hệ với
  data**, người tạo Event tự chọn kiểu nào áp dụng. Xem thiết kế cụ thể ở
  [13-ceremony-mo-rong.md](13-ceremony-mo-rong.md) §"Quản lý data global vs per-event".

## B. Rủi ro đã nhận diện

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Convert config cũ sai → backdrop lệch | Trung bình | Đối chiếu screenshot trước/sau; đang dev nên rủi ro thấp |
| Mất business logic khi bóc khỏi renderer (GPA, danh hiệu) | Trung bình | Liệt kê từng logic → map sang CustomVariable (bảng ở [05](05-he-bien-va-adapter.md)) |
| Lệch màn hình khác tỷ lệ/độ phân giải | Cao (chính) | px trên canvas chuẩn + scale-to-fit + variant-per-aspect (3 tầng, [04](04-schema-layout-document.md)) |
| Editor & renderer lệch nhau (preview ≠ thật) | Cao | **Dùng CHUNG 1 LayoutRenderer** — lợi ích lớn nhất của C |
| Font không đồng bộ giữa 2 app | Trung bình | Whitelist font chung (A4) |
| localStorage đầy khi lưu ảnh base64 | Thấp | Dùng file/IndexedDB; Supabase Storage ở GĐ2 |
| 2 cơ chế biến gây rối trong lúc chuyển tiếp | Thấp | Hợp nhất token @var@ khi migrate ([05](05-he-bien-va-adapter.md)) |

## C. Cần nghiên cứu / xác minh thêm

- [ ] Đếm & đọc các file `backdrops.json` cũ thực tế (2025, 2026) — quy mô convert.
- [ ] Kiểm `PreviewPanel.tsx`, `LayoutConfigContent.tsx` — mức phụ thuộc `BackdropTemplate`.
- [ ] Xem `DynamicBackdropView` có logic ẩn nào chưa liệt kê (avatar ring, fallback ảnh…).
- [ ] Cơ chế `resolveAsset` trên web vs electron — layout lưu path kiểu gì cho cả 2 chạy.
- [ ] canvas-confetti / motion trong `BackdropApp` — layout mới có cần khai báo hiệu ứng không,
      hay hiệu ứng vẫn do ceremony quyết (ngoài layout)?
- [ ] Editor prototype `.dc.html` dùng framework "DCLogic" riêng — port sang React/stack sky-app
      thế nào (không dùng lại HTML đó, chỉ lấy UX + data model).
- [ ] Có cần export ảnh hàng loạt (nút "Xuất hàng loạt" trong prototype) không — scope sau.

## D. Quyết định đã chốt (để khỏi mở lại)

- ✅ Vị trí: `modules/layout-designer` trong monorepo (không tách repo).
- ✅ Đích schema: model mới thống nhất (C), đi theo chặng B→C an toàn.
- ✅ Toạ độ: px trên canvas chuẩn (`refW/refH`) của variant + scale-to-fit lúc render (đổi từ
  `%` sang `px` ngày 2026-07-15 — dễ hình dung hơn khi thiết kế; thử trước đo sau).
- ✅ Multi-aspect: mỗi layout nhiều variant theo tỷ lệ, mỗi variant có bg + item riêng.
- ✅ Storage qua port `LayoutStore`: local/file GĐ1 → Supabase GĐ2.
- ✅ Giao tiếp qua artifact JSON, editor không là dependency runtime của ceremony.
- ✅ Schema + renderer đặt ở `packages/slide-shared` (dùng chung).
- ✅ Editor import `STUDENT_TEMPLATE_VARIABLES` + `CustomVariable`, không tự định nghĩa biến.
- ✅ **Tầng Event mới** (2026-07-15, xem [10](10-quan-ly-dot-le-event.md)): quản lý nhiều đợt
  lễ song song, mỗi Event sở hữu `customVariables` riêng (KHÔNG phải ceremony sở hữu), tham
  chiếu tới layout có sẵn (tái dùng, không copy), 3 mức tái sử dụng (giống hệt/override nhẹ/
  fork layout mới), chuyển đổi Event active theo lịch (bán tự động, cần xác nhận).

## E. Việc tiếp theo (khi blueprint đủ chín)

1. Trả lời câu hỏi mục A.
2. Xác minh mục C (đọc code + config cũ).
3. Chốt schema `LayoutDocument` v1 (bỏ nháp, thành final).
4. Viết docs chính thức: `docs/apps/layout-designer.md` + `docs/architecture/layout-schema.md`.
5. Lập kế hoạch triển khai theo chặng Bước 0→4 ở [03](03-phuong-an-schema.md).
