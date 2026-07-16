# 19 — Prompt cho Claude Design: màn hình Map trường dữ liệu ↔ biến trong layout

> Prompt tự chứa, cùng bộ với [17-prompt-claude-design-control.md](17-prompt-claude-design-control.md)
> — nhưng đây là 1 màn hình MỚI phát sinh sau quyết định kiến trúc 2026-07-16 (xem
> [09-quy-dinh-variable.md](09-quy-dinh-variable.md) §2.5): layout tự do khai token, nên cần 1
> bước map thủ công khi gán layout vào Event. Màn này CHƯA có trong 5 màn ở file 17 — nó đứng
> xen giữa "chọn layout" và "xem trước" (giữa Bước 3 và Bước 4 của wizard đã mô tả ở file 17).

---

## PROMPT (copy từ đây xuống hết file)

Tôi cần thiết kế thêm 1 màn hình cho app quản lý lễ trao bằng/khen thưởng đã mô tả trước đó
(nếu đây là phiên làm việc mới, tôi sẽ tóm tắt lại bối cảnh cần thiết ngay dưới đây — không
cần nhớ gì từ trước).

**Vài thông số kỹ thuật/vận hành cần biết trước:**
- App chạy trên desktop (Electron) và web, dùng chung 1 bộ giao diện — người vận hành luôn
  dùng trên máy tính/laptop, không cần thiết kế responsive di động.
- Ngôn ngữ giao diện: tiếng Việt.
- Bám sát design system đã có (shadcn/ui + Tailwind CSS variables, hỗ trợ light/dark) — nếu
  bạn có ảnh chụp UI hiện tại của app này từ trước, tiếp tục dùng đúng phong cách đó.

### Bối cảnh: 2 thứ được tạo HOÀN TOÀN ĐỘC LẬP với nhau, rồi mới ghép lại

**Thứ 1 — Layout (mẫu hiển thị):** được thiết kế trước, bằng 1 công cụ kéo-thả riêng (giống
Canva), độc lập hoàn toàn với bất kỳ dữ liệu người thật nào. Người thiết kế layout đặt các
"biến" vào layout — mỗi biến là 1 cái tên tự đặt, đóng trong dấu ngoặc kép đôi, ví dụ
`{{full_name}}`, `{{gpa}}`, hoặc `{{ho_ten}}`, `{{diem_so}}` — **tên hoàn toàn tự do, do người
thiết kế tự nghĩ ra lúc đó**, không tra cứu hay khớp với bất kỳ danh sách chuẩn nào. Layout A
có thể dùng `{{full_name}}`, layout B có thể dùng `{{ho_ten}}` cho cùng 1 ý nghĩa "họ tên" —
không có gì đảm bảo 2 layout dùng chung 1 tên biến.

**Thứ 2 — Dữ liệu người thật:** danh sách sinh viên/nhân viên được nhập vào hệ thống (từ file
Excel/CSV), có tên cột riêng theo file gốc của người dùng (VD cột "fullName", hoặc "HoTen",
hoặc tách riêng "firstName"+"lastName") — cũng hoàn toàn không khớp tên với biến trong layout.

**Vấn đề cần giải quyết:** khi người vận hành chọn "dùng layout A cho đợt lễ này", hệ thống
KHÔNG TỰ BIẾT `{{full_name}}` trong layout A phải lấy giá trị từ cột nào của dữ liệu người
thật. Cần 1 màn hình để người dùng **tự tay khớp (map)** từng biến của layout với 1 nguồn giá
trị cụ thể. Mỗi khi đổi sang layout khác (kể cả trong cùng 1 đợt lễ), việc map này phải làm
LẠI TỪ ĐẦU, vì layout khác dùng tên biến khác.

### Nguồn giá trị mà 1 biến có thể được map tới — 2 loại, cần phân biệt rõ trong thiết kế

1. **Cột dữ liệu thô đã import** — VD biến `{{full_name}}` ← cột "fullName" trong file Excel
   đã tải lên. Đây là ánh xạ 1-1 đơn giản, giá trị lấy nguyên như trong file.
2. **Biến tính toán theo điều kiện** (đã định nghĩa ở 1 màn hình khác trước đó, không phải màn
   này) — VD có sẵn 1 biến tên "danh_hieu" được tính: ngành Dược → "Dược sỹ", ngành CNTT →
   "Kỹ sư", còn lại → "Cử nhân". Biến trong layout (VD `{{chuc_danh}}`) có thể map tới biến
   tính toán này thay vì map tới 1 cột thô — giá trị cuối cùng là kết quả của việc tính rule đó,
   không phải giá trị nguyên trong file.

Người dùng cần **nhìn 1 danh sách trộn cả 2 loại nguồn này** khi chọn nơi map tới, và phân biệt
được rõ ràng đâu là "lấy nguyên từ cột dữ liệu" và đâu là "kết quả tính theo điều kiện" — 2 thứ
có bản chất khác nhau (1 cái là dữ liệu thô, 1 cái là công thức) nên tôi không muốn người dùng
nhầm lẫn khi nhìn vào danh sách chọn.

### Cấu trúc thông tin cần thể hiện trên màn hình (không phải yêu cầu bố cục cụ thể)

Với layout đang chọn, hệ thống đã biết chính xác nó cần những biến nào (vì đọc thẳng từ chính
layout đó ra) — hiển thị thành 1 danh sách, mỗi dòng là 1 biến cần map:

```
Biến trong layout        Map tới
{{full_name}}      →     [ chọn nguồn... ▾ ]
{{gpa}}             →     [ chọn nguồn... ▾ ]
{{chuc_danh}}       →     [ chọn nguồn... ▾ ]
{{anh_dai_dien}}    →     [ chọn nguồn... ▾ ]
```

Đây chỉ là cấu trúc thông tin cần có (2 cột: tên biến bên layout, và nơi chọn nguồn map) —
cách trình bày thực tế (bảng, danh sách card, layout khác) hoàn toàn do bạn quyết định theo
design system, miễn thể hiện đúng quan hệ "mỗi biến của layout ↔ 1 nguồn giá trị".

**Trong ô "chọn nguồn"**, khi mở ra cần thấy rõ 2 nhóm tách biệt (ví dụ):
```
── Cột dữ liệu đã import ──
   fullName
   gpa_diem
   nganh_hoc
── Biến tính theo điều kiện ──
   danh_hieu
   xep_loai_day_du
```

### Trường hợp đặc biệt cần xử lý: biến dạng ảnh

1 số biến trong layout dùng để hiển thị ảnh (VD `{{anh_dai_dien}}` gắn vào 1 khung ảnh trên
layout, không phải 1 dòng chữ). Với biến loại này, danh sách "chọn nguồn" chỉ nên hiện những
cột dữ liệu chứa đường dẫn ảnh (không hiện cột dạng số/chữ như GPA, tên) — để tránh người dùng
lỡ map nhầm 1 cột chữ vào chỗ cần ảnh. Layout đã tự biết biến nào là loại ảnh (từ cách nó dùng
biến đó trong thiết kế), nên màn hình này cần thể hiện phân biệt được biến nào là "biến chữ"
biến nào là "biến ảnh" (VD icon khác nhau cạnh tên biến), và lọc đúng danh sách nguồn tương ứng.

### Trạng thái cần thể hiện: biến nào đã map, biến nào còn thiếu

Vì có thể có nhiều biến cần map (layout phức tạp có thể có 5-10 biến), người dùng cần nhìn
được ngay **tổng quan đã map được bao nhiêu, còn thiếu bao nhiêu** trước khi tiếp tục — 1 biến
chưa được map thì lúc trình chiếu backdrop sẽ hiện trống ở đúng chỗ đó, nên đây là thông tin
quan trọng cần nổi bật, không phải chi tiết ẩn.

Không cần chặn cứng "phải map hết mới cho tiếp tục" — người dùng có thể cố tình bỏ trống 1 vài
biến không quan trọng và tiếp tục, chỉ cần hệ thống hiển thị rõ ràng cái gì còn thiếu để họ tự
quyết định, không đoán hộ hay chặn hộ.

### Gợi ý map tự động ban đầu (không bắt buộc, nhưng nên có nếu hợp lý)

Nếu tên biến trong layout và tên cột dữ liệu **giống hệt hoặc gần giống nhau** (VD biến
`{{full_name}}` và cột dữ liệu cũng tên "full_name", hoặc biến `{{gpa}}` và cột "gpa"), hệ
thống có thể tự động điền sẵn map đó khi mở màn hình lần đầu, để người dùng đỡ phải tự chọn
100% thủ công — nhưng vẫn cho sửa lại thoải mái nếu map tự động sai. Đây là gợi ý tiện lợi,
không phải yêu cầu bắt buộc — nếu bạn thấy không cần thiết hoặc có cách hay hơn để giảm công
sức người dùng, cứ đề xuất.

### Vị trí màn hình này trong luồng tổng thể (để bạn hiểu ngữ cảnh, không phải yêu cầu vẽ lại)

Đây là 1 bước nằm giữa "chọn layout cho đợt lễ" và "xem trước kết quả cuối cùng" — người dùng
vừa chọn xong 1 layout để dùng, thì màn hình này hiện ra để họ map biến trước khi có thể xem
trước layout đó hiển thị đúng dữ liệu thật hay chưa.

### Nguyên tắc thiết kế cần tuân thủ

1. **Người dùng đa dạng, gồm nhiều người không rành kỹ thuật** — tránh thuật ngữ lập trình,
   mọi chữ hướng dẫn dùng ngôn ngữ đời thường. Mục tiêu là người dùng nhìn vào hiểu ngay quan
   hệ "biến này ↔ nguồn này", không cần đọc kỹ hướng dẫn.
2. **Không có hành vi tự động gây rủi ro** — gợi ý map tự động (nêu ở trên) chỉ là gợi ý ban
   đầu, không âm thầm ghi đè lựa chọn người dùng đã tự chọn.
3. **Bám sát design system đã có** — không tạo phong cách mới.
4. Hỗ trợ cả chế độ sáng và tối.

### Lưu ý về mức độ chi tiết của mô tả trên

Tôi mô tả khá cụ thể cấu trúc thông tin cần có (2 cột biến/nguồn, 2 nhóm nguồn tách biệt, phân
biệt biến ảnh, trạng thái đã map/còn thiếu) — đó là để bạn hiểu đúng Ý NGHĨA/CHỨC NĂNG cần đạt,
không phải yêu cầu làm y hệt từng chi tiết hình thức. Nếu bạn có cách trình bày, bố cục, loại
component khác hay hơn để đạt cùng mục đích, cứ tự do đề xuất — tôi muốn xem giải pháp thiết kế
tốt nhất. Nếu có phần nào tôi mô tả chưa đủ rõ để quyết định thiết kế, hãy hỏi lại tôi trước
khi vẽ, đừng tự đoán rồi vẽ sai hướng.

---

## Ghi chú riêng cho Sonth (không phải phần prompt — bỏ đoạn dưới đây khi copy)

- ✅ **ĐÃ CÓ BẢN THIẾT KẾ THẬT** (2026-07-16) — `Ceremony Control - Event Flow.dc.html`, màn
  "Ghép biến của layout với dữ liệu". Đối chiếu rất khớp prompt: 2 nhóm nguồn tách biệt (Cột dữ
  liệu / Biến tính theo điều kiện, có hiện công thức), lọc đúng theo `kind` ảnh/chữ, gợi ý tự
  động có nhãn riêng phân biệt với map thủ công, tổng quan đã map/còn thiếu không chặn tiếp tục.
- Màn hình này tương ứng với **Việc C (Mapping)** trong [09-quy-dinh-variable.md](09-quy-dinh-variable.md)
  §2.5 — lưu vào field `EventLayoutRef.fieldMap` (đã có draft TypeScript đầy đủ ở
  [13-ceremony-mo-rong.md](13-ceremony-mo-rong.md) §"Wizard tạo/sửa Event", theo đúng bản thiết
  kế: `{kind:'raw', sourceKey}` / `{kind:'computed', variableKey}` / `{kind:'unmapped'}`).
- **Câu hỏi "tách hay gộp màn" ĐÃ CÓ CÂU TRẢ LỜI:** Claude Design tự quyết định **tách hẳn
  thành 1 bước riêng** trong wizard (Bước 4/5, đứng giữa "Layout" và "Xem trước"), không gộp
  vào bước nào khác. Xem cấu trúc 5 bước đầy đủ đã chốt ở
  [17-prompt-claude-design-control.md](17-prompt-claude-design-control.md) §"Cấu trúc luồng".
