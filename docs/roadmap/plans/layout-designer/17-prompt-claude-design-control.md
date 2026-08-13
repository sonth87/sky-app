# 17 — Prompt cho Claude Design: thiết kế màn hình `control/` (Event, Data, Selector)

> Prompt tự chứa để dán vào Claude Design, kèm ảnh chụp màn hình control hiện tại. Viết chi
> tiết theo yêu cầu của Sonth (không outline) vì Claude Design không đọc được 16 file blueprint
> — mọi ngữ cảnh cần thiết phải nằm trong chính prompt này.

---

## PROMPT (copy từ đây xuống hết file)

Tôi đang thiết kế thêm 1 bộ màn hình mới cho một app quản lý **lễ trao bằng tốt nghiệp / lễ
khen thưởng** tại một trường đại học (và có thể mở rộng cho doanh nghiệp trao giải nhân viên).
Tôi sẽ giải thích đầy đủ bối cảnh, cái đã có, và cái cần thiết kế mới. Đọc kỹ trước khi vẽ.

**Vài thông số kỹ thuật/vận hành cần biết trước:**
- App chạy trên **desktop (Electron)** và **web**, dùng chung 1 bộ giao diện — người vận hành
  luôn dùng trên máy tính/laptop (không có bản di động, không cần thiết kế responsive cho màn
  hình điện thoại). Cứ giả định kích thước màn hình laptop/desktop thông thường trở lên.
  Vì đây là app hoạt động, ưu tiên nhìn thấy nhiều thông tin cùng lúc hơn là thiết kế thoáng.
- Ngôn ngữ giao diện: **tiếng Việt** (app hiện có cả tiếng Anh nhưng tiếng Việt là mặc định và
  là ngôn ngữ chính người vận hành dùng — hãy thiết kế và viết chữ trong UI bằng tiếng Việt).

### Bối cảnh tổng: hệ thống gồm 2 phần chạy song song trong 1 buổi lễ

**Phần 1 — Màn hình trình chiếu (backdrop):** 1 màn hình lớn/máy chiếu/LED sân khấu, hiển thị
"backdrop" (phông nền số) có tên, ảnh, thông tin của người đang được gọi lên nhận bằng/nhận
giải. Không ai thao tác trực tiếp vào màn này — nó chỉ hiển thị.

**Phần 2 — Phòng điều khiển (control):** 1 nhân viên vận hành ngồi trước máy tính, dùng app
này để: xem danh sách người tham dự, quét mã QR khi họ check-in, gọi họ lên sân khấu (bấm
"Phát" → backdrop hiển thị đúng người đó), theo dõi tiến trình buổi lễ. **Đây là phần tôi cần
thiết kế thêm màn hình mới — control room.**

### Ảnh đính kèm — UI control HIỆN TẠI, ĐÃ CÓ SẴN, PHẢI GIỮ NGUYÊN PHONG CÁCH

Tôi đính kèm ảnh chụp màn hình control đang chạy thật. Đây **không phải** thiết kế cần thay
thế — đây là dashboard vận hành chính, đã hoàn thiện, đang dùng tốt. Tôi cần bạn:
- **Học đúng design system đang thấy trong ảnh** (màu sắc, khoảng cách, kiểu bo góc, kiểu
  button/input/card, kiểu bảng dữ liệu, style dark mode) — hệ thống dùng shadcn/ui + Tailwind
  CSS variables, hỗ trợ light/dark và nhiều bảng màu (palette) đổi được, nên đừng bịa ra 1 tông
  màu mới — bám theo đúng những gì nhìn thấy trong ảnh.
- Dashboard trong ảnh gồm: 1 thanh header trên cùng, phần thân chia 2 cột — cột trái là 2 bảng
  danh sách người tham dự (dạng bảng ảo hoá cho danh sách dài, có avatar tròn, tìm kiếm, lọc
  nâng cao, click vào 1 dòng mở popup chi tiết), cột phải là các panel nhỏ xếp dọc (hộp thư
  quét QR, "đang trên sân khấu", xem trước, panel màn chờ, panel đồng bộ dữ liệu).

**Quan trọng — vài nút/dropdown trong ảnh KHÔNG liên quan gì tới Event tôi sắp mô tả, đừng
nhầm lẫn khi thiết kế:**
- **"CHẾ ĐỘ: Auto (quét là lên) / Manual (chờ Play)"** ở header: đây là chế độ vận hành lúc
  trình chiếu (tự động phát khi quét QR, hay chờ người vận hành bấm Play thủ công) — hoàn toàn
  KHÁC với "trạng thái Event" (Nháp/Đã lên lịch/Đang hoạt động/Đã lưu trữ) tôi mô tả bên dưới.
  Đừng gộp 2 khái niệm này, đừng dùng chung 1 kiểu toggle cho cả 2.
- **Dropdown "HỘI TRƯỜNG: 0 - Quảng trường"**: đây là chọn ĐỊA ĐIỂM VẬT LÝ nơi đặt màn hình
  trình chiếu (VD sân khấu chính, hội trường phụ...) trong CÙNG 1 buổi lễ — không phải chọn
  giữa "nhiều đợt lễ khác nhau". 1 đợt lễ (Event) có thể chiếu ở nhiều địa điểm cùng lúc qua
  dropdown này. Đừng lẫn nó với màn hình chọn Event tôi cần thêm mới.
- **Nút "Import ZIP" / "Export ZIP"** trong panel "Dữ liệu": đây là cơ chế sao lưu/khôi phục
  TOÀN BỘ dữ liệu đang dùng (thông tin buổi lễ + cấu hình + danh sách người, đóng gói vào 1
  file ZIP) — cơ chế backup có sẵn, không phải chỗ nhập danh sách người ban đầu. Việc "nhập
  file Excel/CSV chứa danh sách người" tôi mô tả ở Màn 3 bên dưới là 1 tính năng MỚI, RIÊNG
  BIỆT, phục vụ mục đích khác (tạo nguồn dữ liệu cho 1 Event) — không thay thế nút Import/
  Export ZIP này, cả 2 cùng tồn tại song song.
- Tôi chưa chụp được ảnh của modal "Cài đặt" (có nhiều tab, trong đó có 1 tab quản lý "biến
  điều kiện" dạng rule-builder: mỗi biến là 1 card, có thể thêm nhiều dòng "Nếu [thuộc tính]
  [so sánh] [giá trị] → [kết quả]", nút thêm/xoá dòng, nút di chuyển lên xuống) — nếu bạn cần
  tham khảo phong cách rule-builder này cho Màn 4 (mô tả bên dưới) mà thấy mô tả bằng lời chưa
  đủ rõ, hãy hỏi lại tôi, tôi sẽ chụp bổ sung.

### Vấn đề cần giải quyết: hiện tại app KHÔNG CÓ khái niệm "nhiều đợt lễ"

Đây là điểm quan trọng nhất bạn cần hiểu. **Hiện tại, dashboard ở trên giả định luôn chỉ có
ĐÚNG 1 buổi lễ duy nhất đang diễn ra** — dữ liệu người tham dự được nạp sẵn 1 lần khi mở app,
không có màn hình nào để chọn "buổi lễ nào" cả. Không có khái niệm Room, không có khái niệm
"phiên", không có gì tương tự.

**Nhưng thực tế vận hành cần nhiều đợt lễ khác nhau, có thể tồn tại song song:** ví dụ "Lễ
trao bằng tốt nghiệp đợt 1 năm 2026", "Lễ trao bằng đợt 2 năm 2026", "Lễ trao giải Nhân viên
xuất sắc quý 3", "Lễ tổng kết cuối năm". Mỗi đợt có thể diễn ra vào ngày khác nhau, có danh
sách người khác nhau, có thể dùng backdrop (giao diện hiển thị) khác nhau hoặc giống nhau. Cần
tạo trước nhiều đợt, rồi đến đúng ngày thì người vận hành **tự tay chọn đợt nào đang chạy**
(không có gì tự động theo lịch — luôn là hành động bấm tay của người vận hành, để tránh
chuyển nhầm giữa lúc lễ đang diễn ra dở).

**Quan hệ quan trọng cần thiết kế đúng:** dashboard hiện tại (ảnh đính kèm) sẽ trở thành
**"màn hình chỉ hiện ra SAU KHI đã chọn 1 đợt lễ đang hoạt động"**. Nghĩa là cần thêm 1 tầng
điều hướng HOÀN TOÀN MỚI, đứng TRƯỚC dashboard đó:

```
Mở app
  → [MÀN HÌNH MỚI CẦN THIẾT KẾ] Danh sách các đợt lễ đã tạo, chọn 1 đợt để "Kích hoạt"
  → Sau khi kích hoạt → mới vào dashboard hiện tại (ảnh đính kèm), lúc này dashboard
    hiển thị đúng danh sách người + backdrop của đợt lễ vừa chọn
```

Tôi gọi khái niệm "1 đợt lễ" này là **"Event"** trong toàn bộ hệ thống — hãy dùng đúng từ này
khi ghi nhãn trong thiết kế (hoặc "Đợt lễ" trong bản tiếng Việt của UI, tuỳ bạn — nhưng khái
niệm kỹ thuật đằng sau tên là "Event").

**Dashboard cần hiển thị đang ở Event nào — ĐÃ CHỐT** (2026-07-16, theo bản thiết kế thật đầu
tiên): chèn 1 "chip Event" ngay sau chữ "Control" ở đầu bên trái header — gồm chấm trạng thái
xanh, nhãn nhỏ "ĐỢT LỄ ĐANG CHẠY" phía trên tên đợt lễ phía dưới (2 dòng, cùng 1 khối), và 1
nút "Đổi đợt" nhỏ cạnh đó dẫn về Màn 1. Đặt ở đầu bên trái vì đó là chỗ trống nhất trong header
hiện có — không đụng tới cụm CHẾ ĐỘ / HỘI TRƯỜNG / 2 nút bên phải, giữ nguyên như ảnh đính kèm.

### Cấu trúc luồng — ĐÃ CHỐT 6 màn / 5 bước wizard (2026-07-16, cập nhật theo bản thiết kế thật)

> Bản đầu của prompt này mô tả 5 màn/4 bước — bản thiết kế thật (Claude Design) đã tự thêm 1
> bước "Ghép biến" tách riêng (không gộp vào bước Layout hay Preview như dự phòng ban đầu),
> đúng ý đồ ở prompt [19-prompt-claude-design-mapping.md](19-prompt-claude-design-mapping.md).
> Chốt lại theo đúng cấu trúc đã có, thay cho mô tả 4 bước cũ:

```
Màn 1 (danh sách) → bấm "+ Tạo đợt lễ mới"
  → Bước 1: Thông tin cơ bản + chọn nguồn dữ liệu
  → Bước 2: Import/quản lý nguồn dữ liệu — CHỈ hiện nếu chọn "Tạo nguồn dữ liệu mới" ở Bước 1;
     nếu chọn nguồn có sẵn hoặc "Chưa có dữ liệu, để sau" thì BỎ QUA thẳng sang Bước 3
  → Bước 3: Chọn layout theo điều kiện (bảng quy tắc kéo-thả)
  → Bước 4: Ghép biến — với MỖI layout đã dùng ở Bước 3, map token layout ↔ cột dữ liệu/biến
     tính theo điều kiện (chi tiết đầy đủ ở prompt riêng: 19-prompt-claude-design-mapping.md)
  → Bước 5: Xem trước với dữ liệu thật + nút "Lưu đợt lễ" (bước cuối)
  → Lưu xong → quay lại Màn 1, Event mới xuất hiện trong danh sách
```

Thanh tiến trình đầu wizard đổi số bước ĐỘNG theo việc có Bước 2 hay không (VD "Bước 3/5" nếu
đủ 5 bước, "Bước 3/4" nếu bỏ qua Bước 2) — không cố định "X/4" hay "X/5".

Người dùng có thể **thoát giữa chừng ở bất kỳ bước nào** ("Lưu nháp & thoát" — Event lưu ở
trạng thái Nháp với những gì đã nhập), rồi quay lại sửa tiếp sau — không bắt buộc hoàn thành
cả wizard 1 lần. Bước 5 (xem trước) vẫn hiển thị được ở dạng rút gọn nếu chưa có dữ liệu thật
(dùng dữ liệu mẫu, ghi chú rõ "chưa có dữ liệu thật để xem trước chính xác").

### 5 màn hình cụ thể cần thiết kế (đây là phần chính, mô tả chi tiết từng cái)

#### Màn 1 — Danh sách Event (cổng vào mới, đứng trước dashboard hiện tại)

Đây là màn hình đầu tiên người vận hành thấy khi mở app (thay vì đi thẳng vào dashboard như
hiện tại). Mục đích: xem tất cả các đợt lễ đã tạo, biết đợt nào đang chạy, chọn đợt để kích
hoạt.

Cần có:
- Danh sách các Event dạng thẻ hoặc bảng — mỗi Event hiển thị: tên đợt lễ (VD "Lễ trao bằng
  tốt nghiệp đợt 2 năm 2026"), trạng thái, ngày dự kiến diễn ra (chỉ là thông tin hiển thị để
  người dùng tự sắp xếp, KHÔNG có gì tự động xảy ra theo ngày này).

  **4 trạng thái và khi nào mỗi trạng thái xảy ra (để bạn thiết kế đúng badge + luồng nút bấm):**
  - **Nháp** — Event mới tạo, CHƯA đủ điều kiện để kích hoạt (VD chưa gán nguồn dữ liệu, hoặc
    chưa chọn layout nào). Người dùng vẫn có thể lưu ở trạng thái này để sửa tiếp sau — không
    có gì "tự động chuyển" khỏi trạng thái Nháp, người dùng tự chuyển bằng cách hoàn thiện đủ
    thông tin rồi bấm 1 nút kiểu "Đánh dấu sẵn sàng" (nút này bạn tự đề xuất tên/vị trí phù hợp).
  - **Đã lên lịch** — Event đã đủ thông tin (có nguồn dữ liệu, có ít nhất 1 layout) nhưng CHƯA
    được kích hoạt để chạy. Có thể tồn tại nhiều Event ở trạng thái này CÙNG LÚC (VD chuẩn bị
    trước cả 2 đợt lễ của năm).
  - **Đang hoạt động** — CHỈ DUY NHẤT 1 Event có thể ở trạng thái này tại 1 thời điểm (đây
    chính là Event mà dashboard đang hiển thị data theo). Chuyển sang trạng thái này CHỈ bằng
    hành động "Kích hoạt" của người dùng (xem bên dưới), không có gì khác kích hoạt được nó.
  - **Đã lưu trữ** — Event đã dùng xong (lễ đã diễn ra), người dùng tự bấm "Lưu trữ" để ẩn khỏi
    danh sách chính (nhưng vẫn xem lại được, không bị xoá) — hữu ích khi danh sách Event tích
    luỹ nhiều theo thời gian.
- **Event nào đang ở trạng thái "đang hoạt động" phải thật sự nổi bật** (đây là đợt lễ mà
  dashboard đang hiển thị dữ liệu của nó — sai sót ở đây nghĩa là hiển thị sai người giữa buổi
  lễ thật, nên cần rất rõ ràng, không mơ hồ).
- Mỗi Event có nút "Kích hoạt" (chuyển sang đợt này, luôn cần xác nhận rõ ràng vì đây là hành
  động quan trọng — có thể cần hộp thoại xác nhận "Chuyển sang đợt lễ này? Đợt đang hoạt động
  hiện tại sẽ dừng.").
- Nút "Vào dashboard" cho Event đang hoạt động — dẫn thẳng tới dashboard hiện tại (ảnh đính kèm).
- Nút "+ Tạo đợt lễ mới" (dẫn tới Màn 2).
- Mỗi Event có menu thao tác thêm: Nhân bản (tạo 1 đợt mới copy y hệt cấu hình, để đổi ngày/
  data mà không phải làm lại từ đầu), Xuất file (sao lưu đợt lễ này ra file), Lưu trữ/Xoá.
- Có ô tìm kiếm/lọc theo trạng thái nếu danh sách dài (có thể tích luỹ hàng chục/hàng trăm
  đợt qua nhiều năm sử dụng).
- **Trạng thái rỗng (lần đầu mở app, chưa tạo Event nào):** vì đây là màn hình ĐẦU TIÊN người
  dùng thấy, cần thiết kế 1 trạng thái rỗng tử tế thay vì để trống trơn — 1 hình minh hoạ/icon
  đơn giản, câu giải thích ngắn "Chưa có đợt lễ nào — tạo đợt đầu tiên để bắt đầu", và nút
  "+ Tạo đợt lễ mới" nổi bật ngay giữa màn hình (không chỉ có ở góc như bình thường).

#### Màn 2 — Tạo/Sửa Event: thông tin cơ bản + chọn nguồn dữ liệu

Form tạo 1 Event mới hoặc sửa Event đã có (draft). Cần có:
- Tên đợt lễ (input text), ngày dự kiến diễn ra (date picker — chỉ để hiển thị/sắp xếp, không
  kích hoạt gì tự động, ghi chú rõ điều này trong UI nếu cần).
- Chọn **nguồn dữ liệu** cho đợt này (danh sách người tham dự): dropdown chọn 1 nguồn dữ liệu
  đã có sẵn, HOẶC nút "Tạo nguồn dữ liệu mới" (dẫn sang Màn 3), HOẶC **quan trọng: có nút rõ
  ràng "Chưa có dữ liệu, để sau"** — vì người dùng có thể muốn tạo khung đợt lễ trước (đặt tên,
  chọn cách hiển thị) rồi TUẦN SAU mới có danh sách người thật để import vào. Đừng ép người
  dùng phải có đủ dữ liệu ngay khi tạo.
- Nút "Tiếp tục": nếu vừa chọn "Tạo nguồn dữ liệu mới" → dẫn sang Màn 3; nếu chọn nguồn có sẵn
  hoặc "để sau" → bỏ qua Màn 3, dẫn thẳng sang Màn 4 (xem "Cấu trúc luồng" ở trên).

#### Màn 3 — Quản lý nguồn dữ liệu (import + chọn cách dùng)

Đây là màn hình phức tạp nhất trong nhóm quản lý dữ liệu, gồm 3 việc. **Trạng thái ban đầu khi
mở màn này (chưa tải file gì lên):** vùng kéo-thả/chọn file lớn ở giữa màn hình, icon tải lên,
dòng chữ "Kéo file vào đây hoặc bấm để chọn — hỗ trợ Excel (.xlsx), CSV, JSON", không hiện
bảng/form nào khác cho tới khi có file — các bước 3b/3c/3d/3e bên dưới chỉ xuất hiện SAU khi
đã có file.

**3a. Import dữ liệu thô:** người dùng tải lên 1 file (excel/csv/json) chứa danh sách người
(sinh viên hoặc nhân viên — hệ thống phải dùng được cho cả 2 loại đối tượng khác nhau, không
chỉ sinh viên). File có thể có tên cột bất kỳ (VD "ho_ten" hoặc "full_name" hoặc "ten_nv" đều
được, không cố định).

**3b. Ánh xạ cột (mapping):** sau khi tải file lên, cần 1 màn hình cho người dùng khớp từng
cột trong file với "trường chuẩn" của hệ thống (VD trường chuẩn là "Họ tên" thì người dùng
chọn cột nào trong file tương ứng với nó). Trường chuẩn CỐ ĐỊNH gồm: họ tên, ảnh đại diện,
trạng thái. Ngoài ra có các trường MỞ RỘNG tuỳ loại đối tượng (sinh viên có: GPA, xếp loại,
chuyên ngành, khoa, lớp, khoá học; nhân viên có: chức vụ, phòng ban, trình độ, năm kinh
nghiệm...) — người dùng có thể tự thêm trường mở rộng mới nếu file có cột lạ. Thiết kế UI cho
việc khớp cột này — có thể là 2 danh sách cạnh nhau (cột trong file bên trái, trường chuẩn bên
phải) nối bằng dropdown chọn tương ứng, hoặc drag để nối — chọn cách nào bạn thấy trực quan
nhất cho người dùng không rành kỹ thuật.

**3c. Xem trước bảng dữ liệu đã map:** sau khi map xong, hiển thị bảng xem trước (như bảng
excel) để người dùng kiểm tra bằng mắt xem map đúng chưa — mỗi dòng là 1 người, có cột đánh
dấu "✓ đủ dữ liệu" hoặc "⚠ thiếu [trường gì đó]" để người dùng biết ngay ai bị thiếu thông tin
trước khi dùng nguồn dữ liệu này.

**3d. Chọn "cách dùng" nguồn dữ liệu — đây là 1 lựa chọn quan trọng, cần giải thích rõ bằng
ngôn ngữ dễ hiểu (không dùng thuật ngữ kỹ thuật):**
- Lựa chọn A ("Dùng chung nhiều đợt"): nguồn dữ liệu này có thể được nhiều đợt lễ khác nhau
  cùng sử dụng, KHÔNG người nào bị loại trừ dù đã dùng ở đợt trước. Ví dụ: danh sách nhân viên
  phòng Kinh doanh, quý nào cũng dùng lại đúng danh sách này để xét khen thưởng.
- Lựa chọn B ("Dùng dần, không lặp lại"): mỗi người trong danh sách chỉ tính là "đã xử lý" 1
  lần; đợt lễ sau (nếu dùng chung nguồn này) sẽ tự động không hiện lại người đã xử lý ở đợt
  trước. Ví dụ: danh sách sinh viên chờ nhận bằng — sinh viên đã nhận bằng ở đợt 1 thì không
  nên xuất hiện lại ở đợt 2.
- Người dùng chọn 1 trong 2 lựa chọn này, kèm mô tả ngắn dễ hiểu như trên — bạn tự quyết định
  cách trình bày (radio, card, toggle...) sao cho rõ ràng nhất (không hiện chữ "pooled"/
  "consumable" ra UI, đó chỉ là tên kỹ thuật nội bộ, không cần xuất hiện trong thiết kế).

**3e. (chỉ hiện khi chọn Lựa chọn B ở trên) Xem/sửa danh sách "đã xử lý":** 1 view hiển thị
những ai trong nguồn dữ liệu này đã được đánh dấu "đã xử lý" (từ các đợt lễ trước dùng chung
nguồn này), cho phép người dùng **tự tay tick/untick thủ công** (không có gì tự động đánh dấu
— người vận hành tự quyết định lúc nào 1 người được coi là "xong", hệ thống không đoán hộ).

#### Màn 4 — Chọn cách hiển thị (layout) theo điều kiện — MÀN HÌNH QUAN TRỌNG NHẤT

Đây là màn hình phức tạp nhất và cần đầu tư thiết kế kỹ nhất. Bối cảnh: hệ thống có sẵn nhiều
"mẫu hiển thị" (gọi là **layout**) được thiết kế trước bằng 1 công cụ kéo-thả riêng (giống
Canva) — mỗi layout là 1 kiểu bố cục backdrop khác nhau (vị trí ảnh, tên, màu sắc, hiệu ứng).
Nhiệm vụ ở màn hình này: **với đợt lễ đang tạo, quyết định người nào dùng layout nào, dựa trên
điều kiện của chính người đó.**

Ví dụ thực tế cần hỗ trợ: "Sinh viên có điểm GPA từ 3.6 trở lên thì dùng layout Xuất sắc (có
hiệu ứng vàng đặc biệt); còn lại nếu là Nam thì dùng layout Nam, nếu là Nữ thì dùng layout Nữ;
những trường hợp không khớp gì cả thì dùng layout Mặc định."

**Ý cần đạt — 1 danh sách quy tắc, sắp được bằng kéo-thả, ưu tiên từ trên xuống.** Mockup dưới
đây chỉ để tôi truyền đạt cấu trúc thông tin (mỗi dòng cần những gì) — cách trình bày thực tế
(cột, khoảng cách, kiểu chữ, có gộp chung hàng hay tách dòng...) hoàn toàn do bạn quyết định
theo design system đã có:

```
┌─ Thứ tự ưu tiên (kéo để sắp xếp — ưu tiên từ trên xuống, cái nào khớp trước thì dùng cái đó) ─┐
│ ⠿  1.  [Tên quy tắc: "GPA xuất sắc"]     Điều kiện: GPA ≥ 3.6         Layout: [Xuất sắc ▾] │
│ ⠿  2.  [Tên quy tắc: "Nam sinh"]          Điều kiện: Giới tính = Nam   Layout: [Nam ▾]      │
│ ⠿  3.  [Tên quy tắc: "Nữ sinh"]           Điều kiện: Giới tính = Nữ    Layout: [Nữ ▾]       │
│ ⠿  4.  Mặc định (luôn dùng nếu không khớp gì ở trên, không xoá được)  Layout: [Mặc định ▾]  │
│    + Thêm quy tắc mới                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

Chi tiết cần có:
- **Kéo-thả để đổi thứ tự** — thứ tự trong danh sách CHÍNH LÀ độ ưu tiên (dòng trên cùng được
  kiểm tra trước). Không hiện số ưu tiên ra UI, chỉ cần vị trí trực quan.
- **Chọn layout cho mỗi dòng**: dropdown hoặc nút mở 1 thư viện layout dạng lưới ảnh thu nhỏ
  (thumbnail) để chọn bằng mắt, không chỉ chọn theo tên chữ.
- **Dòng "Mặc định" luôn cố định ở cuối cùng**, không kéo lên trên được, không xoá được (đảm
  bảo luôn có 1 layout dự phòng nếu không ai khớp điều kiện nào).
- **Danh sách này có thể dài** (VD 6-10 quy tắc cho 1 đợt lễ phức tạp) — thiết kế sao cho vẫn
  dùng được tốt khi có nhiều dòng: có thể cho khung danh sách tự cuộn riêng (không cuộn cả
  trang), và cân nhắc cho phép thu gọn/mở rộng từng dòng để không chiếm quá nhiều chỗ khi
  không cần sửa.
- Người dùng KHÔNG rành kỹ thuật (nhân viên phòng đào tạo, phòng nhân sự...) — mọi phần chữ
  hướng dẫn, tên nút, thông báo lỗi phải dùng ngôn ngữ đời thường, tránh thuật ngữ lập trình.

**Mỗi dòng có thể mở rộng ra để sửa điều kiện chi tiết** — đây là phần khó nhất của cả màn
hình, và là chỗ tôi muốn bạn đầu tư sáng tạo nhiều nhất vì chưa có tiền lệ nào để tham khảo
(cả trong ảnh đính kèm lẫn hệ thống hiện tại). Mockup dưới đây chỉ minh hoạ CẤU TRÚC THÔNG TIN
cần thể hiện (khối lồng khối, quan hệ VÀ/HOẶC) — không phải yêu cầu vẽ y hệt kiểu ASCII-box
này; bạn có thể trình bày bằng card có màu nền phân biệt, đường viền, khoảng cách, hay bất kỳ
ngôn ngữ thị giác nào giúp người dùng không rành kỹ thuật NHÌN RA NGAY quan hệ lồng nhau mà
không cần đọc kỹ chữ. Có thể mở rộng ngay tại chỗ (không mở modal riêng) hoặc theo cách khác
nếu bạn thấy hợp lý hơn:

```
│ ⠿  1.  GPA xuất sắc                                          Layout: [Xuất sắc ▾]  [▲ Thu gọn] │
│    ┌─ Áp dụng NẾU (một trong các khối dưới đây đúng) ──────────────────────────────┐            │
│    │  ┌─ Khối 1 (mọi điều kiện trong khối này đều phải đúng) ───────────────┐      │            │
│    │  │  GPA          [≥ ▾]  3.6                                    [✕ xoá]  │      │            │
│    │  │  + Thêm điều kiện vào khối này                                       │      │            │
│    │  └───────────────────────────────────────────────────────────────────┘      │            │
│    │              ── HOẶC ──                                                      │            │
│    │  ┌─ Khối 2 ──────────────────────────────────────────────────────────┐      │            │
│    │  │  GPA          [≥ ▾]  3.6                                    [✕ xoá]  │      │            │
│    │  │  Đạt giải phụ [= ▾]  Có                                     [✕ xoá]  │      │            │
│    │  │  + Thêm điều kiện vào khối này                                       │      │            │
│    │  └───────────────────────────────────────────────────────────────────┘      │            │
│    │  + Thêm 1 khối điều kiện khác (HOẶC)                                        │            │
│    └──────────────────────────────────────────────────────────────────────────┘            │
```

Giải thích ý nghĩa để bạn thiết kế đúng logic hiển thị: các dòng điều kiện TRONG CÙNG 1 khối
phải TẤT CẢ đều đúng (quan hệ VÀ) mới tính khối đó khớp; nếu có NHIỀU khối, chỉ cần 1 trong
các khối khớp là đủ (quan hệ HOẶC giữa các khối) — ví dụ ở trên: "GPA≥3.6" HOẶC "(GPA≥3.6 VÀ
đạt giải phụ)" đều dẫn tới layout Xuất sắc. Mỗi dòng điều kiện gồm: chọn 1 thuộc tính (GPA,
giới tính, xếp loại, ngành, chuyên ngành, tên trường...), chọn 1 phép so sánh (bằng, chứa,
thuộc danh sách, lớn hơn, nhỏ hơn, lớn hơn hoặc bằng, nhỏ hơn hoặc bằng), nhập giá trị so
sánh. Tuyệt đối tránh để người dùng phải viết code/công thức — mọi thao tác đều qua
dropdown/input đơn giản như mockup trên.

#### Màn 5 — Xem trước với dữ liệu thật

Trước khi lưu đợt lễ, cho phép người dùng xem trước kết quả THẬT (không phải dữ liệu giả) —
chọn 1 người bất kỳ trong danh sách đã import, hệ thống tự động tính layout nào sẽ áp dụng
(theo điều kiện đã thiết lập ở Màn 4) và hiển thị chính xác backdrop sẽ trông như thế nào với
đúng tên/ảnh/thông tin của người đó.

Cần có:
- Bộ điều hướng qua từng người: "◀ 3 / 240 ▶" — bấm để xem người tiếp theo/trước đó.
- Vùng preview lớn hiển thị backdrop thật (nền tối, khung 16:9 hoặc theo tỷ lệ đã cấu hình).
- Bảng tổng hợp nhỏ: bao nhiêu người "đủ dữ liệu để hiển thị đúng" và bao nhiêu người "thiếu
  thông tin gì đó" (VD thiếu ảnh) — để người vận hành biết cần bổ sung gì trước khi lễ diễn ra.
- Nút "Lưu đợt lễ" ở cuối luồng.
- **Trường hợp chưa có dữ liệu thật** (người dùng chọn "để sau" ở Màn 2): thay bộ điều hướng
  "3/240" và bảng tổng hợp bằng 1 preview DUY NHẤT dùng dữ liệu mẫu/giả (tên giả, ảnh placeholder),
  kèm dòng chú thích rõ "Đây là xem trước với dữ liệu mẫu — kết quả thật sẽ khác khi bạn import
  danh sách người tham dự." Vẫn cho lưu đợt lễ ở trạng thái Nháp từ đây.

### Nguyên tắc thiết kế xuyên suốt cần tuân thủ

1. **Không có bất kỳ hành vi tự động nào có thể gây rủi ro giữa buổi lễ thật** — không tự động
   chuyển đợt lễ theo ngày giờ, không tự động đánh dấu người "đã xử lý". Mọi hành động quan
   trọng đều là người vận hành tự bấm, tự xác nhận.
2. **Người dùng đa dạng, gồm nhiều người không rành kỹ thuật** (nhân viên phòng đào tạo, phòng
   nhân sự, không phải lập trình viên) — tránh thuật ngữ kỹ thuật, tránh bắt viết code/công
   thức. Mục tiêu là người dùng THẤY và HIỂU ngay, không cần đọc kỹ hướng dẫn — cách đạt được
   điều đó (loại control nào, bố cục ra sao) là phần bạn tự quyết theo chuyên môn thiết kế.
3. **Bám sát design system đã có trong ảnh đính kèm** — không tạo phong cách mới, đây là phần
   mở rộng của cùng 1 app, phải liền mạch với dashboard hiện tại.
4. Hỗ trợ cả **chế độ sáng và tối** (light/dark mode) như hệ thống hiện tại đang có.
5. Có thể tái sử dụng các thành phần UI đã thấy trong ảnh đính kèm (bảng dữ liệu ảo hoá, kiểu
   card/panel, kiểu badge trạng thái ở footer) làm điểm khởi đầu cho các màn hình mới — đừng
   phát minh lại từ đầu nếu đã có mẫu tương tự trong ảnh.

### Việc bạn cần làm

Vẽ đầy đủ 5 màn hình mô tả ở trên (Danh sách Event, Tạo Event, Quản lý nguồn dữ liệu với đủ
các bước 3a-3e, Chọn layout theo điều kiện với kéo-thả + rule builder VÀ/HOẶC, Xem trước dữ
liệu thật), đúng phong cách thị giác đã thấy trong ảnh đính kèm.

**Lưu ý về mức độ chi tiết của mô tả trên:** Tôi có mô tả khá cụ thể nhiều chỗ (loại control,
vị trí nút, cách trình bày...) — đó là để bạn hiểu đúng Ý NGHĨA/CHỨC NĂNG cần có, không phải
yêu cầu bạn làm đúng y hệt từng chi tiết hình thức. Nếu bạn thấy có cách trình bày, bố cục,
loại component, hay cách tương tác khác hay hơn/hợp với design system hơn để đạt cùng mục
đích, cứ tự do đề xuất — tôi muốn xem giải pháp thiết kế tốt nhất, không cần bám sát prompt
một cách máy móc. Nếu có phần nào tôi mô tả chưa đủ rõ để quyết định thiết kế, hãy hỏi lại tôi
trước khi vẽ, đừng tự đoán rồi vẽ sai hướng.

---

## Ghi chú riêng cho Sonth (không phải phần prompt — bỏ đoạn dưới đây khi copy)

- Prompt trên gộp cả 5 màn từ file [16-wireframe-control.md](16-wireframe-control.md), viết
  lại dạng tự nhiên/tự chứa cho AI design đọc — không dùng thuật ngữ nội bộ blueprint (không
  nói "EventDocument", "DataSource.mode", "selector.groups"...) vì Claude Design không cần và
  không nên thấy tên biến kỹ thuật, chỉ cần hiểu Ý NGHĨA để vẽ đúng UI.
- Phần "Quan hệ Event↔Dashboard" (dashboard hiện tại trở thành view CHỈ CHO Event active) là
  quyết định MỚI chốt trong lượt trao đổi này (2026-07-15, tiếp theo) — cần cập nhật lại file
  10/13 để phản ánh: **Màn 1 (danh sách Event) giờ là ĐIỂM VÀO ĐẦU TIÊN của toàn bộ `control/`**,
  không phải 1 tab/màn phụ như suy đoán ban đầu ở file 13. Đây là thay đổi kiến trúc điều
  hướng đáng kể — xem mục cập nhật bên dưới.
- Sau khi có bản vẽ từ Claude Design, nên quay lại đối chiếu với schema (`EventDocument`,
  `DataSource`, `LayoutSelector`) một lần nữa — khả năng cao bản vẽ sẽ lộ ra trường dữ liệu
  còn thiếu hoặc cần điều chỉnh, giống cách layout-designer wireframe đã từng trải qua.

### Kiểm tra "đóng vai AI chưa biết gì" (2026-07-15, tiếp theo) — kết quả và vá lỗi

Sonth yêu cầu mô phỏng góc nhìn 1 AI chỉ có đúng 3 nguồn (file 17, workspace wireframe, ảnh
chụp control thật) để tự đánh giá prompt trước khi dùng thật. Kết quả: **hiểu đúng ~65-70%**
ở bản đầu — phần khung xương (mục đích, 5 màn, luồng wizard) hiểu tốt, nhưng lộ ra 4 lỗ hổng vì
**ảnh thật không khớp hoàn toàn với mô tả trong prompt lúc đó**:

1. Prompt nhắc "tab Variable rule-builder" làm tham chiếu style cho Màn 4, nhưng ảnh đính kèm
   không hề chụp modal Settings — AI phải tự bịa style cho phần quan trọng nhất mà không có gì
   để bám. **→ Đã sửa:** mô tả bằng lời chi tiết hơn thay ảnh, kèm câu mời AI hỏi lại nếu cần
   ảnh thật.
2. Ảnh có "HỘI TRƯỜNG: 0 - Quảng trường" (`HallSelector` — chọn địa điểm vật lý trong CÙNG 1
   buổi lễ) mà prompt không giải thích → rủi ro AI nhầm đây là chỗ chọn Event. **→ Đã sửa:**
   thêm đoạn giải thích rõ khác biệt.
3. Ảnh có sẵn nút "Import ZIP/Export ZIP" (backup toàn bộ `CeremonyBundle`) mâu thuẫn ngầm với
   Màn 3 (import Excel/CSV cho 1 nguồn dữ liệu) — prompt không nói 2 cơ chế này cùng tồn tại
   song song. **→ Đã sửa:** thêm đoạn làm rõ đây là 2 tính năng khác nhau, không thay thế nhau.
4. Ảnh có "CHẾ ĐỘ: Auto/Manual" (`ModeSwitch` — chế độ vận hành trình chiếu) dễ bị AI gộp nhầm
   với "trạng thái Event" (Nháp/Đã lên lịch/Đang hoạt động/Đã lưu trữ) vì cả 2 đều là toggle ở
   header. **→ Đã sửa:** thêm câu phân biệt rõ 2 khái niệm.
5. Phát hiện thêm 1 câu hỏi mở thật (không phải AI tưởng tượng): header dashboard sau khi có
   Event cần hiển thị gì để biết đang ở đợt nào + cách quay lại đổi Event — **chưa có ai quyết
   định** cả trong prompt lẫn trong blueprint gốc. **→ Đã sửa:** thêm đoạn nói rõ đây là phần
   Sonth chưa quyết, mời Claude Design tự đề xuất phương án cụ thể.

**Bài học chung, áp dụng cho các prompt sau này:** viết prompt mô tả ảnh đính kèm bằng trí nhớ/
suy luận (chưa cầm ảnh thật trong tay) luôn có rủi ro lệch với ảnh thật ở đúng những chi tiết
nhỏ, dễ gây hiểu nhầm nhất — nên **luôn đối chiếu lại prompt với ảnh thật trước khi gửi**, đặc
biệt các nút/dropdown/toggle có vẻ ngoài giống khái niệm mới đang mô tả (dễ trùng lẫn).

### Điều chỉnh giọng văn: design brief, không phải spec code (2026-07-15, tiếp theo)

Sonth lưu ý: đây là prompt để 1 AI **thiết kế giao diện/prototype**, không phải để code — cần
phân biệt rõ với cách viết brief kỹ thuật. Rà lại toàn bộ prompt, phát hiện nhiều chỗ đang mô
tả quá cứng "phải dùng loại control nào, đặt ở đâu" thay vì mô tả Ý NGHĨA/CHỨC NĂNG cần đạt và
để không gian cho thiết kế sáng tạo cách thể hiện. Đã sửa:
- Thêm 1 đoạn ngay đầu "Việc bạn cần làm": làm rõ các mô tả cụ thể (loại control, vị trí nút...)
  trong prompt là để truyền đạt Ý NGHĨA cần có, không phải yêu cầu làm y hệt — mời tự do đề
  xuất giải pháp thiết kế tốt hơn nếu có.
- 2 khối mockup ASCII ở Màn 4 (bảng ưu tiên + khối AND/OR mở rộng): thêm câu mở đường trước
  mỗi khối, nói rõ đây là minh hoạ CẤU TRÚC THÔNG TIN (thứ tự, quan hệ lồng nhau), không phải
  yêu cầu vẽ y hệt dạng ASCII-box — đặc biệt nhấn mạnh phần AND/OR là chỗ muốn Claude Design
  sáng tạo nhiều nhất vì chưa có tiền lệ nào để tham khảo.
- Màn 3d (chọn cách dùng nguồn dữ liệu): bỏ chỉ định cứng "radio button hoặc card", đổi thành
  để tự chọn cách trình bày.
- Nguyên tắc #2 (người dùng không rành kỹ thuật): bỏ liệt kê cứng "ưu tiên thumbnail/kéo-thả/
  card hơn gõ chữ", đổi thành nêu MỤC TIÊU ("thấy và hiểu ngay") — cách đạt mục tiêu đó để tự quyết.

Nguyên tắc rút ra khi viết prompt kiểu này về sau: mô tả nghiệp vụ/logic hệ thống (khi nào
trạng thái đổi, quan hệ VÀ/HOẶC nghĩa là gì...) vẫn nên GIỮ ĐẦY ĐỦ và chi tiết — đó là cơ sở
đúng đắn để thiết kế dựa vào, không phải "code leak". Nhưng phần MÔ TẢ HÌNH THỨC (loại
component cụ thể, cách bố trí từng pixel) nên nói ở mức "cần có gì" thay vì "phải trông như
thế nào", trừ những chỗ thật sự cần thống nhất chặt (VD cấu trúc luồng wizard, cấu trúc lồng
khối AND/OR) vì sai cấu trúc đó sẽ khiến bản vẽ không dùng được, không chỉ là "kém đẹp hơn".
