---
status: reference
purpose: >
  Tài liệu MÔ TẢ NỘI DUNG cho nhóm "Đồ họa" trong side palette kiểu Canva. Đọc file này KHÔNG
  cần xem lại ảnh chụp Canva gốc. File này là NGUỒN NỘI DUNG cho `GraphicsPanel.tsx` đã nhắc ở
  `06-graphics-library.md` (GĐ15) — file đó giữ cơ chế (`SpawnKind`'s `overrides`, cách spawn
  shape/icon), file NÀY giữ danh mục nội dung thật (bao nhiêu shape, icon nào, tổ chức thế nào).
related_phase: GĐ15 (06-graphics-library.md)
source_images: image - 3.png (Themed Lines/Basic Shapes), image - 4.png (Arrows/Horizontal Lines), image - 5.png (Icons/Animals & Nature)
---

# Nhóm "Đồ họa" — mô tả chi tiết toàn bộ nội dung và hành vi

> Ảnh nguồn: [`image - 3.png`](./image%20-%203.png) (Themed Lines + Basic Shapes), [`image - 4.png`](./image%20-%204.png) (Arrows + Horizontal Lines), [`image - 5.png`](./image%20-%205.png) (Icons/Animals & Nature) — cùng thư mục.

## Bối cảnh chung

Nhóm "Đồ họa" trong Canva gốc (ảnh chụp lại được cấu trúc điều hướng con dưới dạng 1 danh sách
dọc bên trái panel, chia thành các CỤM có tiêu đề nhóm — không phải 1 danh sách phẳng) là nơi
người dùng tìm các HÌNH KHỐI (không phải ảnh chụp, không phải chữ) để trang trí layout: đường kẻ,
hình vuông/tròn/tam giác, mũi tên, và các icon minh hoạ (illustration) đủ màu theo chủ đề (con
vật, cây cối, huy hiệu, ký tự...). Khác nhóm "Khung" (Khung dùng để CẮT ẢNH theo 1 silhouette),
nhóm "Đồ họa" là các hình/icon ĐỘC LẬP, tự nó là 1 khối nội dung hoàn chỉnh, không cần ảnh nào
khác lấp vào bên trong.

## Cấu trúc điều hướng con — 3 cụm lớn, mỗi cụm nhiều mục nhỏ

Nhìn vào ảnh gốc, cột điều hướng con bên trái được NGĂN CÁCH bằng các đường kẻ mỏng thành 3 cụm
rõ rệt, mỗi cụm có 1 tiêu đề nhóm viết hoa nhỏ phía trên (không phải mục có thể bấm, chỉ là label
phân nhóm):

Cụm đầu tiên tên "SHAPES" (Hình khối) gồm 5 mục: "Themed Lines" (đang được chọn trong ảnh, tô nền
xanh nhạt), "Basic Shapes", "Arrows", "Horizontal Lines", "Vertical Lines".

Cụm thứ hai tên "VECTOR ART" (Nghệ thuật vector — tức icon minh hoạ) gồm 5 mục: "Featured" (nổi
bật/được chọn lọc), "Icons", "Animals & Nature", "Badges & Emblems", "Characters".

Cụm thứ ba tên "VIDEO" gồm 3 mục: "VideoBox", "Video Mask", "Transparent Video" — đây là nhóm
liên quan tới NỘI DUNG VIDEO, hoàn toàn KHÔNG ÁP DỤNG cho sky-app ở giai đoạn hiện tại, vì hệ
thống `LayoutItem` hiện tại (`text | image | shape | ribbon | loop | gallery`) không có bất kỳ
loại item nào xử lý video — thêm hỗ trợ video là một hạng mục KỸ THUẬT LỚN (decode video, đồng bộ
phát trên nhiều màn hình LED cùng lúc, xử lý hiệu năng phát video trên phần cứng LED-controller
thực tế) không nằm trong phạm vi bộ palette này. Cụm này BỎ HOÀN TOÀN khỏi kế hoạch của sky-app,
không dịch sang tiếng Việt, không tạo placeholder — coi như không tồn tại trong "Đồ họa" của
sky-app, trừ khi có 1 quyết định kiến trúc riêng về việc thêm hỗ trợ video sau này (ngoài phạm vi
tài liệu này).

Có 1 cụm thứ tư tên "TEXT EFFECTS" chỉ có 1 mục "Text Mask" — đây thực chất là LỐI TẮT trỏ tới
đúng mục "Text Mask" đã mô tả kỹ ở file `content-spec-van-ban.md` (nhóm Văn bản). Canva đặt lối
tắt này ở đây vì "Text Mask" vốn cần 1 asset đồ họa/màu để lấp vào chữ, nên đặt gần nhóm Đồ họa để
dễ tìm. Sky-app KHÔNG cần làm lại — tài liệu này chỉ ghi chú lại để hiểu rõ vì sao Canva có mục đó
ở cả 2 nơi, không cần tạo file/route riêng cho lối tắt này.

## Cụm "Themed Lines" — đường kẻ đã phối màu/độ dày theo bộ

![Điều hướng con nhóm Đồ họa (SHAPES/VECTOR ART/VIDEO/TEXT EFFECTS) + nội dung Themed Lines và Basic Shapes (~30 hình khối nhiều màu)](./image%20-%203.png)

Đây là mục ĐANG được chọn trong ảnh gốc (nền tô xanh nhạt), nội dung hiện ra bên phải chỉ có 4
tile đường kẻ ngang: 1 đường mảnh màu đen, 1 tổ hợp GỒM 2 ĐƯỜNG xếp gần nhau (1 đường dày phía
trên, 1 đường MẢNH HƠN phía dưới — trông như 1 cặp đường kẻ được thiết kế đi cùng nhau, có thể
dùng làm đường viền trang trí kiểu "gạch chân kép"), 1 đường mảnh màu đen khác (tương tự tile đầu
nhưng vị trí khác), và 1 đường màu XÁM NHẠT (nhạt hơn hẳn màu đen của 3 tile kia, tạo cảm giác
"đường kẻ mờ/phụ" dùng cho chi tiết tinh tế không cần nổi bật). "Themed" ở đây nghĩa là các đường
kẻ này được chọn sẵn theo 1 bộ phối hợp (độ dày + màu) để dùng CÙNG NHAU trong 1 thiết kế, khác
với "Basic Shapes"/"Horizontal Lines" là các lựa chọn RỜI, tự chọn tự phối.

Với sky-app, "Themed Lines" có giá trị THẤP (chỉ là biến thể nhỏ của `ShapeItem.shape:'line'` đã
có sẵn từ trước — khác màu, khác độ dày, không có gì mới về kỹ thuật) — có thể gộp thẳng vào mục
"Horizontal Lines"/"Vertical Lines" thay vì tách riêng thành 1 mục con, hoặc bỏ hẳn khái niệm
"Themed" cho đường kẻ (đơn giản hoá, giữ 1 mục "Đường kẻ" chung có vài biến thể độ dày/màu, không
cần khái niệm "phối theo bộ" phức tạp cho riêng đường kẻ).

## Cụm "Basic Shapes" — kho hình khối cơ bản với số lượng và độ đa dạng lớn

Đây là mục có NỘI DUNG PHONG PHÚ NHẤT trong toàn bộ cụm SHAPES. Nhìn vào lưới hình trong ảnh gốc
(xếp theo hàng, mỗi hàng nhiều tile hình vuông chứa 1 shape màu đặc bên trong), đếm được khoảng
30 hình khối riêng biệt, được tô các màu khác nhau theo TỪNG HÀNG (không phải mỗi hình 1 màu ngẫu
nhiên — Canva cố ý nhóm các hình CÙNG HÀNG có cùng gam màu, để mắt người xem dễ nhận ra đây là 1
"bộ" theo hàng): hàng đầu toàn màu ĐEN gồm lục giác lớn, hình vuông bo góc nhỏ, tam giác, sao 5
cánh, và 1 hình "khối tròn có mép lượn sóng" (giống bông hoa mây hoặc bánh quy, không phải hình
tròn trơn mà có các đường lượn ở viền). Hàng thứ hai màu XANH DƯƠNG gồm hình giống "pac-man" (1
hình tròn bị khuyết 1 miếng như miệng đang mở), lục giác nhỏ hơn hàng đầu, và 1 hình chữ nhật đặc.
Hàng thứ ba màu XANH LÁ gồm bát giác, hình tròn, tam giác nằm ngang trông giống nút "play" (mũi
tên chỉ sang phải dạng tam giác), hình chữ nhật, và 1 hình chữ nhật có 1 GÓC NHÔ RA giống bong bóng
chat (đuôi bong bóng chỉ xuống, kiểu icon tin nhắn). Hàng thứ tư màu NÂU/CAM ĐẤT gồm hình bình
hành (hình chữ nhật bị nghiêng, 2 cạnh song song xiên), hình thoi (diamond, giống viên kim cương
nhìn từ trên xuống), hình ngũ giác, hình bát giác khác kiểu hàng ba, và 1 hình "ngôi sao nhiều
cánh nhỏ" trông như ánh lấp lánh (sparkle) màu vàng cam. Hàng thứ năm màu SẶC SỠ HỖN HỢP (không
theo 1 màu cố định như các hàng trên) gồm hình chữ nhật bo góc màu tím cam, sao 5 cánh cam, hình
tim màu đỏ, hình bong bóng chat màu tím (có đuôi chỉ như bong bóng lời nói trong truyện tranh),
vài hình giọt nước (teardrop) màu tím với các kích cỡ khác nhau xếp cạnh nhau, hình thoi tím, và
hình nón/tam giác nhọn tím. Hàng cuối (bị cắt 1 phần ở dưới ảnh) có 1 hình "cụm mây/bông hoa lớn"
màu xanh ngọc (giống hình bông hoa 6-7 cánh tròn xếp thành khối), vài hình tam giác nhỏ màu xanh
rêu nhạt, hình thoi xanh rêu, hình thang xanh rêu, và vài hình nhỏ màu cam đào (giọt nước, thoi,
tròn).

Điểm mấu chốt rút ra từ mô tả trên: bộ "Basic Shapes" của Canva RỘNG HƠN RẤT NHIỀU so với 6 giá
trị enum hiện tại của `ShapeItem.shape` trong sky-app (`rect | circle | triangle | diamond |
frame | line`). Những hình như lục giác, ngũ giác, bát giác, sao nhiều cánh, bong bóng chat, giọt
nước, hình bình hành, hình "pac-man", khối mây-hoa lượn sóng — TẤT CẢ đều KHÔNG có trong enum hiện
tại. Để làm đúng theo tinh thần ảnh gốc, sky-app cần MỞ RỘNG enum `shape` của `ShapeItem` — mỗi
hình mới thêm là 1 giá trị CSS `clip-path: polygon(...)` mới (đúng kỹ thuật đã dùng cho
triangle/diamond từ GĐ10, chỉ là thêm nhiều giá trị polygon phức tạp hơn vào `SHAPE_CLIP_PATHS`).
Danh sách hình nên bổ sung (ưu tiên theo mức phổ biến/dễ làm bằng `polygon()`, KHÔNG cần làm đủ
30 hình ngay từ đầu, chỉ cần 1 bộ khởi điểm hợp lý): lục giác (hexagon, `polygon(25% 0%, 75% 0%,
100% 50%, 75% 100%, 25% 100%, 0% 50%)`), ngũ giác (pentagon), bát giác (octagon), sao 5 cánh
(dùng lại đúng chuỗi toạ độ đã viết cho Frame preset "Sao 5 cánh" ở GĐ16 — 2 nhóm dùng CHUNG 1
hằng số toạ độ, không viết 2 lần), hình bình hành (parallelogram, `polygon(20% 0%, 100% 0%, 80%
100%, 0% 100%)`), giọt nước (teardrop — hình học phức tạp hơn polygon đơn giản, có thể cần
`path()` thay `polygon()`), bong bóng chat (chat bubble — hình chữ nhật bo góc + 1 tam giác nhỏ
nhô ra làm đuôi, khả thi bằng CSS `border-radius` kết hợp `::after` giả lập đuôi, KHÔNG dùng
clip-path đơn cho hình này vì clip-path không thể bo góc + có đuôi nhô cùng lúc 1 cách đơn giản).
Những hình có hình học PHỨC TẠP như "khối mây-hoa lượn sóng" hay hình "pac-man" nên để lại BACKLOG,
không làm ngay ở bản đầu vì độ phức tạp cao/giá trị sử dụng thấp so với công sức.

## Cụm "Arrows" — mũi tên với nhiều kiểu hướng và độ dày viền

![Nội dung Arrows (nhiều kiểu mũi tên, nút More Arrows) và Horizontal Lines (9 kiểu nét dày/mảnh/chấm/đứt)](./image%20-%204.png)

Nhìn vào phần lưới bị cắt ở đầu ảnh (do đang cuộn dở từ mục trước) và phần đầy đủ hơn ngay dưới,
thấy được nhiều KIỂU mũi tên khác nhau, không chỉ khác màu mà khác cả HÌNH DÁNG: có mũi tên dạng
"góc vuông" (như dấu ngoặc nhọn chevron ">"/"<" xoay các hướng), có mũi tên NẰM TRONG 1 KHUNG (hình
tròn viền hoặc hình vuông viền, mũi tên nhỏ nằm giữa khung đó — giống nút điều hướng trên UI), có
mũi tên ĐẶC (filled solid, không viền) hình tam giác chỉ hướng, có mũi tên dạng "kim cương/diều"
(kite shape, 1 đầu nhọn 1 đầu tù), có mũi tên với ĐUÔI DÀI (như mũi tên bắn cung, có thân dài phía
sau đầu nhọn), có mũi tên NÉT ĐỨT/CHẤM (dotted, tạo từ nhiều hình tam giác nhỏ xếp liên tiếp mô
phỏng hiệu ứng chuyển động), và có nút "More Arrows" (dạng pill/viên thuốc màu xanh nhạt bo tròn
hoàn toàn) để MỞ RỘNG xem thêm — ngụ ý bộ mũi tên đầy đủ CÒN NHIỀU HƠN những gì hiện sẵn trên màn
hình đầu tiên, phải bấm mới thấy hết.

Với sky-app, mũi tên map vào field `overrides` của `SpawnKind` giống cách shape khác đã làm — mỗi
tile mũi tên là 1 `ImageItem` hoặc `ShapeItem` với `clip-path` polygon dạng mũi tên (VD mũi tên
chevron đơn giản: `polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)` cho mũi
tên chỉ phải có đuôi vuông). Do sky-app hiện KHÔNG có UI nào hỗ trợ hiển thị "Xem thêm" bên trong
1 mục con của palette (khác với nút "Xem thêm" ở phần Media panel — đó là mở MODAL riêng, còn ở
đây "More Arrows" của Canva là mở rộng NGAY TẠI CHỖ, thêm nhiều tile hơn vào chính lưới đang xem,
không mở modal) — quyết định: bản đầu tiên của sky-app hiện ĐỦ số lượng mũi tên có thể fit trong 1
màn hình cuộn bình thường (khoảng 8-10 mũi tên phổ biến nhất: chevron 4 hướng, mũi tên thẳng 4
hướng, mũi tên tam giác đặc 4 hướng — chọn 1 bộ vừa đủ dùng, không làm cơ chế "mở rộng tại chỗ"
phức tạp thêm cho 1 tính năng phụ).

## Cụm "Horizontal Lines" và "Vertical Lines" — đường kẻ đơn giản với nhiều độ dày/kiểu nét

Phần dưới của ảnh (sau "Arrows") hiện rõ mục "Horizontal Lines" với 9 tile đường kẻ xếp dọc từ
trên xuống, MỖI TILE 1 ĐƯỜNG NGANG khác nhau về độ dày hoặc kiểu nét: đường mảnh nhất (1px), đường
dày hơn 1 chút, đường RẤT DÀY (như 1 dải màu đen to), đường dày tương tự nhưng ngắn hơn về độ dài
hiển thị, đường NÉT CHẤM tròn màu xanh dương (dotted), đường NÉT ĐỨT màu xanh lá (dashed, các đoạn
gạch ngang xen khoảng trống), đường nét đứt mảnh màu cam (dashed nhưng mảnh hơn đường xanh lá),
đường nét chấm RẤT MẢNH màu xám (gần như vô hình, chỉ có tác dụng phân chia nhẹ), và đường DÀY màu
đỏ cam ở cuối cùng. "Vertical Lines" (không có ảnh chụp riêng nhưng chắc chắn tồn tại theo tên
trong danh sách điều hướng) là phiên bản CÙNG BỘ kiểu nét nhưng xoay 90 độ thành đường thẳng đứng.

Với sky-app, đây là phần DỄ LÀM NHẤT trong toàn bộ nhóm Đồ họa vì `ShapeItem.shape:'line'` ĐÃ CÓ
SẴN từ GĐ10 — chỉ cần thêm các preset với `strokeW` (độ dày) và style nét khác nhau. Về "nét đứt/
nét chấm" — hiện tại `ShapeItem`'s render cho `'line'` chỉ vẽ 1 đường ĐẶC (solid), CHƯA hỗ trợ
`border-style: dashed/dotted`. Cần thêm field `lineStyle?: 'solid' | 'dashed' | 'dotted'` vào
`ShapeItem` (chỉ có ý nghĩa khi `shape === 'line'`), áp trực tiếp vào CSS `border-style` của phần
render đường kẻ (thay `background` giải pháp hiện tại bằng cách render đường kẻ dưới dạng
`border-top` với `border-style` tương ứng, để CSS tự xử lý nét đứt/chấm — kỹ thuật browser chuẩn,
không cần tự vẽ pattern). Preset cho "Đường kẻ" nên có ít nhất: mảnh-đặc, dày-đặc, rất dày-đặc,
mảnh-chấm, vừa-đứt, mảnh-đứt — đủ đa dạng mà không cần làm hết 9 biến thể như ảnh gốc ngay từ đầu.

## Cụm "Icons" (Vector Art) — kho icon minh hoạ nhiều màu theo chủ đề

![Mục Animals & Nature — ~16 icon illustration màu (sóc, hổ, chim, cây, lá...) + nút More Icons](./image%20-%205.png)

Nhóm "VECTOR ART" trong ảnh gốc có 5 mục con: "Featured", "Icons", "Animals & Nature", "Badges &
Emblems", "Characters" — mỗi mục là 1 CHỦ ĐỀ icon riêng. Ảnh chụp chi tiết chỉ có mục "Animals &
Nature" (Động vật & Thiên nhiên), nhưng đủ để hiểu rõ PHONG CÁCH THIẾT KẾ chung của toàn bộ kho
icon này: đây KHÔNG PHẢI kiểu icon đơn sắc/outline mảnh như Lucide (bộ icon UI sky-app đang dùng
cho nút bấm/toolbar) — mà là các ILLUSTRATION MÀU đầy đủ, phong cách "flat design" hiện đại, mỗi
icon có 2-4 màu phối hợp, có chi tiết (VD con sóc có màu xanh navy đậm cho thân, cầm 1 vật màu đỏ
trong miệng; con hổ có sọc cam-trắng-đen chi tiết; cây có thân + nhiều tán lá màu khác nhau xếp
lớp). Trong ảnh mẫu "Animals & Nature" đếm được khoảng 16 icon: cây xương rồng nhỏ trong chậu
hồng, 1 nhánh hoa dại màu vàng, 1 icon giống mặt trăng lưỡi liềm/bông tuyết màu xanh dương, 1 nhánh
gạc/cành khô màu xanh nhạt, 1 con chim cổ đỏ (robin) đang đứng, 1 nhánh lá màu hồng, 1 chiếc lông
vũ màu nâu, 1 cụm lá gai màu xanh đậm, 1 nhánh lá dương xỉ xanh, 1 cây nhỏ tán tròn màu xanh vàng,
2 nhánh lá nhiều màu (cam và xanh), 1 con sóc xanh navy đang cầm vật đỏ, 1 cây màu hồng với lá xanh
đậm, 1 nhánh lá nhỏ xanh đậm, và 1 con hổ đang đi (thân cam sọc đen, nhìn ngang) — cùng vài icon bị
cắt ở mép dưới ảnh (thấy 1 phần lá xanh và 1 phần vật màu hồng/cam, có thể là 1 con cáo).

Có 1 nút "More Icons" (pill xanh nhạt, giống "More Arrows") phía trên mục "Animals & Nature" —
xác nhận cách Canva tổ chức: MỖI CHỦ ĐỀ (Animals & Nature, Badges & Emblems...) đều có RẤT NHIỀU
icon, màn hình đầu chỉ hiện 1 phần, phải bấm "More" để load thêm — đây là 1 kho nội dung LỚN, quy
mô hàng trăm-hàng nghìn icon nếu làm đủ như Canva thật, KHÔNG PHẢI THỨ 1 NGƯỜI TỰ VẼ TAY NỔI trong
thời gian ngắn.

Với sky-app, đây là phần THỰC TẾ NHẤT cần nhìn nhận: xây 1 kho icon minh hoạ màu phong phú như
Canva là công việc CỦA MỘT TEAM THIẾT KẾ chuyên biệt, không phải việc lập trình đơn thuần. Quyết
định hợp lý cho sky-app: (1) KHÔNG tự vẽ icon minh hoạ màu phức tạp từ đầu; (2) tìm 1 bộ icon
illustration MIỄN PHÍ/BẢN QUYỀN RÕ RÀNG có sẵn trên mạng phù hợp phong cách "flat design nhiều
màu" (VD các bộ icon từ Freepik/Flaticon dạng "sticker"/"illustration" theo giấy phép cho phép sử
dụng thương mại, hoặc dùng emoji-style illustration open-source như "Twemoji"/"OpenMoji" nếu chấp
nhận phong cách đó) rồi CHỌN LỌC RA khoảng 20-40 icon phù hợp ngữ cảnh lễ tốt nghiệp/sự kiện (mũ
tốt nghiệp, bằng cấp cuộn giấy, hoa, bóng bay, pháo giấy confetti, huy chương, cúp, sách, bút,
ngôi trường...) THAY VÌ cố sao chép đúng chủ đề "Animals & Nature" của Canva (không liên quan tới
ngữ cảnh ceremony của sky-app); (3) tổ chức các icon đã chọn thành 2-3 nhóm chủ đề đơn giản thay
vì 5 nhóm như Canva (VD nhóm "Học đường" — mũ tốt nghiệp, bằng cấp, sách, bút, ngôi trường; nhóm
"Ăn mừng" — bóng bay, pháo giấy, hoa, cúp, huy chương; nhóm "Trang trí" — các icon hình học/hoa
văn trung tính dùng lấp khoảng trống). Đây là công việc SƯU TẦM + CHỌN LỌC NỘI DUNG, không phải
việc code — cần Sonth tự tìm nguồn icon và cung cấp file SVG, còn phần code (mảng `ICON_PRESETS`,
cách import qua Vite, cách hiện trong `GraphicsPanel.tsx`) đã có sẵn hạ tầng từ GĐ15, chỉ cần đổ
nội dung thật vào.

Mục "Featured", "Badges & Emblems", "Characters" của Canva — không có ảnh chụp minh hoạ, nhưng
theo tên có thể đoán: "Featured" là 1 tuyển chọn các icon HOT/phổ biến nhất (không phải 1 chủ đề
riêng, chỉ là ưu tiên hiển thị trước); "Badges & Emblems" là các hình huy hiệu/khiên/ruy băng
trang trí (RẤT PHÙ HỢP ngữ cảnh ceremony — huy hiệu tốt nghiệp, ruy băng giải thưởng); "Characters"
là các icon hình người/mặt biểu cảm (ít liên quan ngữ cảnh trang trọng của lễ tốt nghiệp, có thể
BỎ QUA hoàn toàn không cần làm). Với sky-app, ưu tiên: làm "Badges & Emblems" trước (giá trị cao
nhất cho ngữ cảnh), gộp phần "Featured" thành đơn giản là hiện các icon MỚI ADD/phổ biến nhất lên
đầu danh sách (không cần khái niệm riêng), bỏ hẳn "Characters".

## Tổng kết cách tổ chức panel "Đồ họa" ở sky-app

Giữ cấu trúc 2 cụm chính (bỏ cụm VIDEO hoàn toàn, bỏ khái niệm riêng cho "Text Mask" vì đã có ở
Văn bản): cụm "Hình khối" gồm Basic Shapes (mở rộng enum `shape` với nhiều hình mới qua clip-path,
ưu tiên hexagon/pentagon/octagon/star/parallelogram trước), Arrows (8-10 mũi tên phổ biến, không
làm cơ chế "mở rộng tại chỗ"), Đường kẻ ngang+dọc (thêm field `lineStyle` cho nét đứt/chấm). Cụm
"Icon minh hoạ" gồm 2-3 nhóm chủ đề tự chọn phù hợp ceremony (Học đường, Ăn mừng, Trang trí/Huy
hiệu) với 20-40 icon SƯU TẦM (không tự vẽ), thay hẳn nội dung "Animals & Nature/Characters" không
liên quan của Canva. Cả 2 cụm dùng chung interaction model kéo-thả đã thống nhất, tile size theo
đúng chuẩn đã định ở GĐ15 (60×60px cho shape, 48×48px cho icon).

## Checklist kỹ thuật cần làm

- [ ] Mở rộng enum `ShapeItem.shape` — thêm hexagon, pentagon, octagon, parallelogram (polygon
      đơn giản, làm TRƯỚC)
- [ ] Sao 5 cánh — TÁI DÙNG đúng toạ độ đã viết cho Frame preset "Sao 5 cánh" (GĐ16), KHÔNG viết
      2 lần ở 2 nơi
- [ ] Giọt nước, bong bóng chat — hình học phức tạp hơn, có thể cần `path()` thay `polygon()` đơn
      (làm SAU nhóm polygon dễ)
- [ ] Backlog: khối mây-hoa lượn sóng, hình "pac-man" — độ phức tạp cao/giá trị thấp, để sau
- [ ] 8-10 mũi tên phổ biến (chevron/thẳng/tam giác đặc × 4 hướng) — KHÔNG làm cơ chế "mở rộng
      tại chỗ" kiểu "More Arrows" của Canva
- [ ] Field mới `lineStyle?: 'solid' | 'dashed' | 'dotted'` vào `ShapeItem` (chỉ có ý nghĩa khi
      `shape === 'line'`) — đổi render đường kẻ dùng `border-top`/`border-style` thay `background`
      hiện tại, để CSS tự xử lý nét đứt/chấm
- [ ] Preset "Đường kẻ" — ít nhất: mảnh-đặc, dày-đặc, rất dày-đặc, mảnh-chấm, vừa-đứt, mảnh-đứt
- [x] Quyết định BỎ HOÀN TOÀN cụm VIDEO (VideoBox/Video Mask/Transparent Video) — không có
      `VideoItem` type, thêm hỗ trợ video là hạng mục kỹ thuật lớn ngoài phạm vi bộ palette này
- [ ] Sưu tầm 20-40 icon minh hoạ phù hợp ceremony (mũ tốt nghiệp, bằng cấp cuộn giấy, hoa, bóng
      bay, pháo giấy confetti, huy chương, cúp, sách, bút, ngôi trường) — **CẦN Sonth tự tìm
      nguồn + cung cấp file SVG**, phần code (mảng `ICON_PRESETS`, import qua Vite) đã có sẵn hạ
      tầng từ GĐ15
- [ ] Tổ chức icon thành 2-3 nhóm chủ đề: "Học đường", "Ăn mừng", "Trang trí/Huy hiệu" — ưu tiên
      "Huy hiệu" (Badges & Emblems) làm TRƯỚC (giá trị cao nhất cho ngữ cảnh)
- [x] Quyết định BỎ "Characters" (icon người/mặt biểu cảm) — không liên quan ngữ cảnh trang trọng
- [x] Quyết định gộp "Featured" thành hiện icon mới-add/phổ biến nhất lên đầu — không cần khái
      niệm/UI riêng
