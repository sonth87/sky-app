---
status: reference
purpose: >
  Tài liệu MÔ TẢ NỘI DUNG cho nhóm "Khung" trong side palette kiểu Canva. Đọc file này KHÔNG cần
  xem lại ảnh chụp Canva gốc. File này là NGUỒN NỘI DUNG cho `FramesPanel.tsx` đã nhắc ở
  `07-frames-mask-shapes.md` (GĐ16) — file đó giữ cơ chế (`clipPath` field, cách spawn), file
  NÀY giữ danh mục nội dung thật (bao nhiêu khung, khung nào, phân nhóm ra sao).
related_phase: GĐ16 (07-frames-mask-shapes.md)
source_images: image - 6.png (Giấy/Hoa/Đốm màu/Retro/Thư), image - 7.png (Hình dạng cơ bản/Phim và ảnh/Thiết bị), image - 8.png (lưới nhiều hình khung không tên)
---

# Nhóm "Khung" — mô tả chi tiết toàn bộ nội dung và hành vi

> Ảnh nguồn: [`image - 6.png`](./image%20-%206.png) (Giấy/Hoa/Đốm màu/Retro/Thư), [`image - 7.png`](./image%20-%207.png) (Hình dạng cơ bản/Phim và ảnh/Thiết bị), [`image - 8.png`](./image%20-%208.png) (lưới nhiều hình khung không tên cụm) — cùng thư mục.

## Bối cảnh chung: Khung khác Đồ họa ở điểm nào

Điểm cần hiểu RÕ NGAY từ đầu: "Khung" (Frame) trong Canva KHÔNG PHẢI 1 hình trang trí độc lập
đứng 1 mình như "Đồ họa" — nó là 1 CÁI VỎ RỖNG có hình dạng nhất định, và bên trong vỏ đó LUÔN
CHỨA 1 TẤM ẢNH bị cắt theo đúng hình dạng vỏ. Khi kéo 1 tile "Khung hình tam giác" ra canvas, kết
quả không phải 1 hình tam giác tô màu đặc (đó là việc của "Đồ họa") — mà là 1 Ô CHỨA ẢNH có hình
tam giác, ban đầu trống (hiện placeholder xám hoặc gradient để thấy trước silhouette), sau đó
người dùng CHỌN 1 ẢNH THẬT để lấp vào, và ảnh đó sẽ chỉ hiện đúng phần nằm TRONG silhouette tam
giác, phần ngoài bị cắt bỏ hoàn toàn (không hiện). Ảnh trong tất cả các ảnh chụp minh hoạ mà Sonth
gửi đều dùng CHUNG 1 tấm ảnh mẫu (phong cảnh đồi núi xanh, bầu trời xanh có mây trắng) để demo —
điều này xác nhận rõ: các tile trong panel Khung không phải mỗi tile 1 ảnh riêng, mà TẤT CẢ tile
cùng minh hoạ với 1 ẢNH DEMO GIỐNG NHAU, chỉ khác nhau ở HÌNH DẠNG cắt — đúng bản chất "khung là
hình dạng, không phải nội dung".

Bản chất kỹ thuật: đây CHÍNH LÀ field `clipPath` đã thiết kế cho `ImageItem` từ GĐ16
(`07-frames-mask-shapes.md`) — mỗi "khung" trong tài liệu này tương ứng với 1 giá trị CSS
`clip-path` cụ thể (`polygon()` cho hình đa giác, `path()` cho hình phức tạp/hữu cơ, hoặc đơn giản
là `border-radius: 50%` cho hình tròn — không phải MỌI khung đều cần clip-path phức tạp, hình
tròn/chữ nhật dùng cơ chế có sẵn `borderRadius`/`shape` của `ImageItem`).

## Cấu trúc điều hướng: thanh tìm kiếm + các cụm nội dung cuộn dọc, MỖI CỤM có nút "Xem tất cả"

Khác nhóm Đồ họa (điều hướng con là danh sách CỐ ĐỊNH bên trái, nội dung đổi theo mục đang chọn),
nhóm Khung tổ chức theo kiểu KHÁC: có 1 thanh ở trên cùng cho phép NHẬP MÔ TẢ ("Mô tả thành phần
lý tưởng" — placeholder gợi ý người dùng gõ tả bằng lời cái khung họ muốn tìm, có cả icon micro
để nói bằng giọng — đây là 1 tính năng TÌM KIẾM BẰNG AI/NGÔN NGỮ TỰ NHIÊN, không phải ô search từ
khoá đơn giản), và bên dưới là 1 TRANG DUY NHẤT cuộn dọc qua nhiều CỤM nội dung xếp liên tiếp,
MỖI CỤM có tên riêng + nút "Xem tất cả" ở góc phải cụm đó (không phải điều hướng qua danh sách bên
trái cố định như Đồ họa). Nút "< Khung" ở góc trên cùng bên trái là nút BACK (quay lại màn hình
cha, chứng tỏ đây đang ở 1 "màn hình con" đã drill-down từ 1 nơi khác — có thể từ chính panel
"Khung" cấp 1, bấm vào rồi mới drill xuống màn hình chi tiết này).

Với sky-app, tính năng "tìm bằng mô tả ngôn ngữ tự nhiên + giọng nói" là MỘT HẠNG MỤC AI RIÊNG,
không nằm trong phạm vi kỹ thuật của bộ palette này (cần tích hợp mô hình AI hiểu ngôn ngữ, ánh xạ
mô tả sang tag/danh mục khung phù hợp) — TẠM THAY bằng 1 ô tìm kiếm ĐƠN GIẢN theo TÊN/TAG (search
text thường, giống các nơi khác trong sky-app đã làm — VD search ảnh trong Media Library), không
làm tìm kiếm AI ngay từ đầu. Cấu trúc "nhiều cụm cuộn dọc, mỗi cụm có Xem tất cả" thì GIỮ NGUYÊN
— đây là mô hình UI hợp lý và không đòi hỏi kỹ thuật AI gì, chỉ là bố cục hiển thị.

## Cụm "Giấy" (Paper) — hiệu ứng cắt/viền giống giấy thật

![Màn hình Khung — thanh tìm kiếm "Mô tả thành phần lý tưởng" + các cụm Giấy/Hoa/Đốm màu/Retro/Thư (chữ A-B-C-D)](./image%20-%206.png)

4 tile trong cụm này đều dùng chung ảnh demo phong cảnh, nhưng mỗi tile cắt theo 1 kiểu liên quan
tới CHẤT LIỆU GIẤY: tile đầu cắt ảnh theo 1 viền RÁCH/XÉ không đều (như xé 1 mảnh giấy ra khỏi tờ
lớn, mép không thẳng mà lởm chởm tự nhiên — kỹ thuật "torn paper edge"), tile thứ hai là 1 DẢI
NGANG MỎNG của chính ảnh đó (như cắt 1 lát mỏng ngang từ ảnh, tạo cảm giác 1 dải băng ảnh chứ
không phải toàn ảnh), tile thứ ba là ảnh được ĐÓNG KHUNG với 1 viền TRẮNG DÀY xung quanh (giống 1
tấm ảnh polaroid/ảnh lồng khung có mat-board viền trắng cổ điển — đây khác các tile khác, KHÔNG
cắt bớt nội dung ảnh, chỉ THÊM viền trắng bọc quanh), tile cuối là 1 DẢI DỌC RẤT MỎNG (tương tự
tile 2 nhưng xoay hướng đứng, hoặc là 1 phần bị cắt hẹp hơn).

Với sky-app: hiệu ứng "viền trắng đóng khung" (tile 3) đã CÓ SẴN qua field `borderW`/`borderColor`
của `ImageItem` — không cần gì mới, chỉ cần 1 preset đặt `borderW` lớn (VD 20-30px) + `borderColor:
'#ffffff'` để tạo hiệu ứng mat-board. Hiệu ứng "viền rách không đều" (tile 1) là khó nhất về mặt
kỹ thuật — cần 1 giá trị `clip-path: polygon(...)` với RẤT NHIỀU điểm toạ độ lởm chởm giả lập mép
xé (không phải 1 hình học đơn giản, phải tự vẽ toạ độ tay hoặc dùng công cụ vẽ path để tạo hình
dạng ngẫu nhiên trông tự nhiên) — xếp vào backlog làm sau, không phải hình dễ nhất để bắt đầu.
Hiệu ứng "dải ngang/dọc mỏng" (tile 2, 4) chỉ đơn giản là đặt `box.h` (hoặc `box.w`) rất nhỏ so
với `box.w` (hoặc `box.h`) — tức là 1 tỷ lệ khung ảnh RẤT DẸT, không cần field mới, chỉ cần
`suggestedBox` với tỷ lệ cạnh chênh lệch lớn (VD `w: 400, h: 60` cho dải ngang).

## Cụm "Hoa" (Flower) — hình dạng hữu cơ mềm mại kiểu cánh hoa/mây

4 tile: tile đầu là 1 hình như "MÁI VÒM CÓ MÉP LƯỢN SÓNG" ở phía trên (giống hình 1 cái mái nhà
cong với đường viền trên gợn sóng nhẹ, phần dưới thẳng), tile hai và ba là 2 biến thể của hình
"MÂY/BÔNG HOA" (khối tròn có nhiều "múi" lượn ra ngoài như những cánh hoa xếp quanh 1 tâm, tương
tự hình "khối mây-hoa" đã nhắc ở file Đồ họa's "Basic Shapes" — 2 nhóm này CÓ THỂ DÙNG CHUNG 1
đường path, chỉ khác mục đích sử dụng: 1 bên là hình khối tô màu đặc, bên này là khung chứa ảnh),
tile bốn bị cắt ở mép ảnh (không đoán được chính xác, có thể là 1 hình tam giác/hình khác).

Với sky-app: đây là các hình dạng HỮU CƠ (organic shape) — không thể tạo bằng `polygon()` với
điểm góc thẳng, cần dùng `clip-path: path(...)` với các đường cong Bezier thật (path SVG dạng
"M ... C ... C ... Z"). Đây là công việc cần 1 CÔNG CỤ VẼ PATH TRỰC QUAN (Sonth tự vẽ hình mong
muốn trong 1 tool như Figma/Inkscape, xuất ra path SVG, rồi dán path đó vào code) — KHÔNG THỂ
đoán/tự viết toạ độ path phức tạp này chỉ bằng cách nhìn ảnh và ước lượng số, sẽ cho ra hình sai
lệch. Xếp vào NHÓM CÔNG VIỆC CẦN CÔNG CỤ THIẾT KẾ RIÊNG, không làm bằng cách viết code thuần.

## Cụm "Đốm màu" (Color Blob/Splotch) — hình dạng amip/vết mực loang

3-4 tile hiện các hình dạng KHÔNG ĐỐI XỨNG, giống 1 vết mực/sơn loang ra tự nhiên (không có cạnh
thẳng nào, toàn đường cong bất định hình): tile đầu là 1 khối lớn tương tự đám mây mềm, tile hai
là 1 hình như con amip (bất định hình rõ rệt hơn tile đầu, có các "ngón" nhô ra không đều), tile
ba tương tự tile hai nhưng biến thể khác 1 chút.

Cùng nhóm kỹ thuật với "Hoa" — cần `path()` vẽ tay bằng công cụ thiết kế, KHÔNG tự đoán toạ độ.
Về mức độ ưu tiên: nhóm "Đốm màu"/"Hoa" mang tính TRANG TRÍ NGHỆ THUẬT nhiều hơn PHỤC VỤ ceremony
thực tế (không giống "Thư" — cắt ảnh theo chữ cái, hay "Hình dạng cơ bản" — có giá trị dùng ngay)
— xếp độ ưu tiên THẤP trong toàn bộ nhóm Khung, làm sau cùng.

## Cụm "Retro" — viền chấm bi/họa tiết nửa tông cổ điển

2-3 tile hiện ảnh được đóng khung bởi 1 VIỀN DÀY gồm CÁC ĐỐM NHỎ (halftone dot pattern — giống
kiểu in ấn cổ trước khi có máy in màu hiện đại, dùng các chấm tròn nhỏ mật độ khác nhau để giả lập
độ đậm nhạt) xếp thành khung bo góc quanh ảnh — tile đầu là hình OVAL (elip) với viền chấm, tile
hai là hình CHỮ NHẬT với cùng kiểu viền chấm.

Về kỹ thuật: viền "họa tiết chấm" này KHÔNG THỂ làm bằng `clip-path` đơn thuần (clip-path chỉ định
nghĩa được HÌNH DẠNG vùng hiện/ẩn, không định nghĩa được HOẠ TIẾT của viền) — cần 1 lớp `<div>`
riêng đặt ĐÈ LÊN TRÊN ảnh, chứa 1 ảnh PNG/SVG có nền trong suốt ở giữa và hoạ tiết chấm ở viền
xung quanh (kiểu "border image" hoặc đơn giản là 1 ảnh overlay PNG có lỗ trong suốt ở giữa đúng
hình chữ nhật/oval để lộ ảnh thật bên dưới) — đây là 1 CÁCH LÀM KHÁC HẲN so với mọi loại Khung
khác (không dùng `clipPath` field mà cần 1 field MỚI, VD `frameOverlay?: string` chứa đường dẫn
tới 1 ảnh PNG viền trang trí đặt `position: absolute` phủ lên trên ảnh chính, `pointer-events:
none`, `z-index` cao hơn ảnh). Đây là loại Khung PHỨC TẠP NHẤT về kỹ thuật trong toàn bộ nhóm —
cần asset PNG viền được thiết kế sẵn (không tự vẽ bằng code), xếp vào backlog xa, chỉ làm khi có
asset viền trang trí thật do Sonth cung cấp.

## Cụm "Thư" (Letter) — cắt ảnh theo hình DẠNG CHỮ CÁI, mỗi chữ 1 khung riêng

Đây là cụm ĐẶC BIỆT và THÚ VỊ NHẤT: ảnh demo được cắt theo silhouette của TỪNG CHỮ CÁI trong bảng
chữ — nhìn thấy rõ 4 tile đầu tiên là chữ "A", "B", "C", "D" (mỗi chữ 1 tile, ảnh phong cảnh hiện
RÕ HÌNH DẠNG của chính chữ cái đó, y hệt cách "Thư" (Frame chữ) trong các ứng dụng thiết kế khác
hoạt động) — và chắc chắn cụm này còn tiếp tục cho ĐỦ 26 CHỮ (chỉ bị cắt ở mép ảnh chụp, không có
lý do gì Canva chỉ làm 4 chữ rồi dừng).

Với sky-app: đây là tính năng có GIÁ TRỊ THỰC SỰ CAO cho ngữ cảnh ceremony — tưởng tượng dùng chữ
cái đầu tên trường/tên khoá học được lấp bằng ảnh thật (VD chữ "K" lấp ảnh khuôn viên trường, cho
1 slide tiêu đề khoá "K15") — rất ấn tượng và mang tính cá nhân hoá cao. Về kỹ thuật: mỗi chữ cái
A-Z (và có thể cả chữ số 0-9) cần 1 giá trị `clip-path: path(...)` riêng theo ĐÚNG HÌNH DẠNG con
chữ của 1 FONT CỤ THỂ (không có font nào thì không vẽ được path chữ — cần chọn 1 font đậm/rõ nét
làm chuẩn, VD font sans-serif đậm dễ nhận diện, rồi trích xuất outline path của từng ký tự từ font
đó bằng 1 công cụ chuyển font-to-SVG-path, KHÔNG thể tự viết tay 26+10 path phức tạp này). Đây là
công việc CẦN CÔNG CỤ CHUYÊN DỤNG (có các tool online chuyển "text to SVG path" theo font tuỳ
chọn, output ra đúng chuỗi path để dùng trực tiếp) — 1 lần làm xong CHO CẢ BỘ 26+10 KÝ TỰ, sau đó
lưu thành 1 bảng hằng số (`LETTER_CLIP_PATHS: Record<string, string>`) dùng vĩnh viễn, không cần
làm lại. Ưu tiên: xếp độ ưu tiên TRUNG BÌNH-CAO (giá trị sử dụng thực tế lớn hơn "Hoa"/"Đốm màu",
nhưng cần công cụ hỗ trợ nên không làm được ngay lập tức bằng code thuần).

## Cụm "Hình dạng cơ bản" (Basic Shapes) — hình học đơn giản áp dụng cho ảnh

![Cụm Hình dạng cơ bản (chữ nhật/lưới ảnh nhỏ/tròn), Phim và ảnh (Polaroid/collage/filmstrip), Thiết bị (điện thoại/màn hình/tablet)](./image%20-%207.png)

4 tile: hình chữ nhật thường (tỷ lệ ngang, giống ảnh gốc không cắt gì đặc biệt — đây là "khung"
CƠ BẢN NHẤT, thực chất chỉ là 1 `ImageItem` bình thường không có `clipPath`, để trong danh sách
Khung cho ĐỦ BỘ lựa chọn từ đơn giản tới phức tạp), 1 LƯỚI ẢNH NHỎ (ảnh demo bị chia thành nhiều ô
vuông nhỏ xếp cạnh nhau như bàn cờ — thực chất đây không phải "1 khung", mà là 1 HIỆU ỨNG lặp lại
nhiều bản sao của cùng 1 ảnh trong các ô lưới, tạo cảm giác pattern/mosaic từ 1 ảnh gốc), hình
TRÒN (dùng `borderRadius: 50%` có sẵn, không cần `clipPath`), và 1 hình bị cắt ở mép (có thể là
tam giác — trùng với hình đã thấy ở cụm khác).

Với sky-app: 3/4 tile trong cụm này đã có sẵn công cụ kỹ thuật từ trước (chữ nhật = `ImageItem`
mặc định, tròn = `shape:'circle'` có sẵn, tam giác = `clipPath` đã làm ở GĐ16 gốc) — đây là cụm
DỄ LÀM NHẤT, có thể hoàn thành ngay lập tức không cần thêm field mới nào. Riêng hiệu ứng "lưới ảnh
lặp" (tile 2) là 1 khái niệm HOÀN TOÀN KHÁC BẢN CHẤT so với "cắt theo silhouette" — nó không cắt 1
ảnh theo 1 hình, mà LẶP LẠI ảnh đó nhiều lần trong 1 lưới — về bản chất kỹ thuật giống CSS
`background-repeat` hoặc tạo N `<div>` con mỗi cái hiện cùng 1 ảnh với `background-position` khác
nhau (để mô phỏng hiệu ứng mosaic từ 1 tấm). Đây là 1 tính năng ĐỘC LẬP, khác hẳn cơ chế
`clipPath`, nên KHÔNG xếp vào "Khung" mà nên hiểu là 1 dạng đặc biệt liên quan tới nhóm "Lưới" (đề
cập kỹ hơn ở file `content-spec-luoi.md`) — chỉ ghi chú ở đây để không quên, không triển khai
trùng lặp ở cả 2 nhóm.

## Cụm "Phim và ảnh" (Film and Photo) — hiệu ứng gợi nhớ đồ vật chụp ảnh thật

3 tile: tile đầu là 1 KHUNG POLAROID — ảnh có viền trắng dày đều quanh 3 cạnh, nhưng cạnh DƯỚI có
1 KHOẢNG TRẮNG RỘNG HƠN HẲN 3 cạnh còn lại (mô phỏng đúng hình dạng phim polaroid thật, nơi có
khoảng trống để viết chú thích tay bên dưới ảnh) — khác hẳn khung "viền trắng đều" đã thấy ở cụm
Giấy (viền đều 4 cạnh), đây là viền LỆCH có chủ đích. Tile hai là 1 BỘ SƯU TẬP/COLLAGE nhiều ảnh
xếp cạnh nhau với TỶ LỆ KHÔNG ĐỀU (1 ô lớn, vài ô nhỏ, có 1 ô màu đen riêng biệt — không phải toàn
bộ đều là ảnh, có thể là 1 ô để trống/màu nền) — đây thực chất là 1 dạng LƯỚI GALLERY, tương tự
khái niệm sẽ mô tả kỹ ở file "Lưới", không phải "1 khung cho 1 ảnh" mà "N khung cho N ảnh xếp
thành cụm". Tile ba là hiệu ứng DẢI PHIM (film strip) — ảnh bị chia thành các BĂNG DỌC có viền
đen dày ngăn cách, gợi hình ảnh 1 cuộn phim nhựa thật với các khung hình liên tiếp.

Với sky-app: khung Polaroid (viền lệch, dày hơn ở đáy) có thể làm bằng field `borderW` hiện tại
NHƯNG với 1 BIẾN THỂ MỚI — hiện tại `borderW` là 1 số DUY NHẤT áp CHUNG cho cả 4 cạnh (border đều),
cần field mới `borderSides?: { top: number; right: number; bottom: number; left: number }` (ghi
đè `borderW` khi có giá trị, cho phép mỗi cạnh 1 độ dày riêng) để làm được hiệu ứng polaroid —
không phức tạp về CSS (`border-top-width`/`border-bottom-width` riêng biệt là chuẩn CSS), chỉ cần
thêm field data + UI cho phép chỉnh 4 cạnh riêng trong Property Panel (hoặc đơn giản hơn: chỉ cần
1 PRESET CỐ ĐỊNH "khung polaroid" với 4 giá trị border đã định sẵn — VD top/left/right: 12px,
bottom: 50px — không cần làm UI tuỳ chỉnh 4 cạnh cho MỌI ImageItem, chỉ cần preset này tồn tại
sẵn là đủ giá trị sử dụng, đơn giản hoá đáng kể). Hiệu ứng "dải phim" (film strip) là 1 BIẾN THỂ
CỦA "LƯỚI" (chia ảnh gốc thành N dải dọc rồi hiện lần lượt, có viền đen ngăn cách) — cũng nên xử
lý ở nhóm Lưới, không phải nhóm Khung.

## Cụm "Thiết bị" (Device) — cắt ảnh theo hình dạng thiết bị điện tử

3 tile: hình dạng ĐIỆN THOẠI (silhouette 1 chiếc smartphone đứng, bo góc, có khoảng viền đen quanh
"màn hình" nơi ảnh hiện ra — giống mockup app trên store), hình dạng MÀN HÌNH MÁY TÍNH ĐỂ BÀN
(khung monitor với đế đứng phía dưới), hình dạng MÁY TÍNH BẢNG (tương tự điện thoại nhưng tỷ lệ
rộng hơn, không có phần "đế" như monitor).

Với sky-app: đây là cụm CÓ GIÁ TRỊ SỬ DỤNG THẤP NHẤT cho ngữ cảnh ceremony (không có lý do rõ ràng
để 1 slide tốt nghiệp cần hiện ảnh trong khung hình điện thoại/máy tính) — trừ khi dùng cho mục
đích rất đặc thù (VD slide giới thiệu "quét mã QR bằng điện thoại để xem video kỷ niệm" thì khung
điện thoại có thể hợp lý để minh hoạ). Xếp vào BACKLOG, không làm trong phạm vi bản đầu, chỉ ghi
nhận lại để biết Canva có mục này, KHÔNG PHẢI THIẾU SÓT nếu sky-app bỏ qua hoàn toàn nhóm này.

## Danh sách hình khối rời trong lưới lớn (không thuộc cụm có tên, xuất hiện ở phần cuộn sâu hơn)

![Lưới lớn nhiều hình khung không tên cụm: tam giác/thoi/sao/tim/bình hành, hiệu ứng rách giấy, lỗ phim 35mm, viền dây cáp, 3 dải dọc](./image%20-%208.png)

Ngoài các cụm có TÊN RIÊNG kể trên, có 1 phần lưới lớn (nhìn thấy ở 1 trong các ảnh chụp) hiện
THÊM nhiều hình dạng khung KHÔNG có tên cụm cụ thể, xếp liên tiếp thành lưới 3 cột: tam giác
(nhọn lên), hình thoi, sao 5 cánh, hình tròn có MÉP LƯỢN SÓNG (hoa/bánh răng — giống hình đã thấy
ở "Hoa"), mũi tên/chevron chỉ 1 hướng, hình tim, hình bình hành (nghiêng), hình chữ nhật BO GÓC
VỚI MÉP LƯỢN SÓNG NHẸ (giống 1 con dấu/tem chứng nhận, khác hình "hoa" ở độ lượn sóng ít hơn và
rõ là hình CHỮ NHẬT chứ không phải hình TRÒN), hình chữ nhật thường, hình chữ nhật với 1 ĐƯỜNG RÁCH
DỌC chạy qua giữa (torn effect kiểu 1 — như ảnh bị xé làm 2 rồi ghép lại có đường nứt), 1 biến thể
khác của đường rách (torn effect kiểu 2 — hình dạng đường nứt khác, không đối xứng với kiểu 1),
hình chữ nhật có LỖ TRÒN NHỎ Ở 2 MÉP TRÁI-PHẢI theo hàng dọc (giả lập lỗ tròn của phim nhựa 35mm —
"film sprocket holes", một biến thể khác của hiệu ứng phim đã nhắc ở cụm Phim và ảnh, nhưng đây là
làm cho 1 ảnh ĐƠN chứ không phải chia dải), rồi tiếp tục hình chữ nhật thường, và 2 DẢI DỌC cạnh
nhau có viền giống "DÂY CÁP CẦU TREO" (các đường kẻ ngang nhỏ đều đặn nối 2 bên, gợi hình ảnh cấu
trúc cầu dây văng — hiệu ứng viền trang trí RẤT ĐẶC BIỆT, khó đoán chính xác công dụng, có thể chỉ
là 1 kiểu viền hoa văn công nghiệp/kỹ thuật), và 1 LAYOUT 3 DẢI DỌC xếp cạnh nhau với viền trắng
mảnh ngăn cách (giống 1 bộ 3 ảnh cùng 1 nguồn xếp thành bố cục chia 3 cột đều nhau — lại là 1 biến
thể của khái niệm "Lưới", không phải "1 khung 1 ảnh").

Với sky-app: phần lớn các hình dạng KHÔNG TÊN này TRÙNG LẶP với các cụm đã mô tả ở trên (sao,
tam giác, thoi, tim, mây-hoa, bình hành đã lặp lại từ cụm khác — Canva cho hiện lại các hình phổ
biến ở NHIỀU nơi để dễ tìm, không phải mỗi hình chỉ xuất hiện 1 lần duy nhất) — sky-app KHÔNG cần
tạo trùng lặp, chỉ cần 1 NGUỒN DUY NHẤT cho mỗi hình dạng (đặt trong 1 bảng hằng số chung
`FRAME_CLIP_PATHS`), rồi HIỂN THỊ LẠI hình đó ở nhiều mục nếu cần (VD sao 5 cánh xuất hiện cả ở
"Hình dạng cơ bản" và ở lưới rời này — chỉ là 2 CÁCH TRUY CẬP tới CÙNG 1 preset, không phải 2
preset khác nhau). 2 hiệu ứng THỰC SỰ MỚI đáng chú ý ở đây: "đường rách dọc" (torn effect áp cho
1 ảnh ĐƠN, không phải viền toàn khung như cụm Giấy) và "lỗ tròn phim 35mm ở viền" — cả 2 đều thuộc
nhóm KỸ THUẬT PHỨC TẠP (cần path/overlay tự vẽ, không làm được bằng polygon đơn giản), xếp backlog
xa cùng nhóm với "Retro"/"Hoa"/"Đốm màu".

## Tổng kết cách tổ chức panel "Khung" ở sky-app, kèm mức ưu tiên triển khai

Sắp theo mức ưu tiên GIẢM DẦN (làm trước → làm sau):

1. **Hình dạng cơ bản** (chữ nhật/tròn/tam giác/kim cương/lục giác/sao — TÁI DÙNG toạ độ đã có ở
   GĐ16 gốc và mở rộng thêm từ nhóm Đồ họa) — không cần field mới, làm NGAY được.
2. **Giấy — biến thể viền trắng đóng khung** (dùng `borderW`/`borderColor` có sẵn) — không cần
   field mới, làm NGAY được. Biến thể "viền rách"/"dải mỏng" của cụm Giấy xếp sau (dải mỏng dễ,
   viền rách khó).
3. **Phim và ảnh — khung Polaroid** (cần field mới `borderSides` HOẶC đơn giản hơn là 1 preset
   cứng với 4 giá trị border định sẵn, không cần UI tuỳ chỉnh) — độ phức tạp THẤP-TRUNG BÌNH.
4. **Thư (chữ cái A-Z)** — giá trị sử dụng cao nhưng cần công cụ chuyển font-to-path (làm 1 lần,
   dùng mãi) — độ phức tạp TRUNG BÌNH, phụ thuộc công cụ ngoài code.
5. **Hoa, Đốm màu, Retro, các hiệu ứng "rách"/"lỗ phim 35mm"** — cần vẽ path tay bằng công cụ
   thiết kế hoặc cần asset overlay PNG có sẵn — độ phức tạp CAO, giá trị sử dụng thấp hơn các mục
   trên cho ngữ cảnh ceremony, xếp backlog xa.
6. **Thiết bị** (điện thoại/màn hình/tablet) — giá trị sử dụng thấp nhất, bỏ hoàn toàn khỏi phạm
   vi trừ khi có nhu cầu cụ thể phát sinh.

Các khái niệm "Lưới ảnh lặp", "Collage nhiều ô", "Dải phim chia nhiều băng", "3 dải dọc cạnh nhau"
tuy xuất hiện lẫn trong ảnh chụp nhóm Khung, nhưng bản chất KHÔNG PHẢI "1 khung cho 1 ảnh" mà là
"nhiều khung/nhiều ảnh xếp thành 1 cụm" — được chuyển hẳn sang mô tả ở `content-spec-luoi.md` để
tránh 2 tài liệu định nghĩa trùng lặp cùng 1 tính năng.

## Checklist kỹ thuật cần làm

- [ ] Hình dạng cơ bản (chữ nhật/tròn/tam giác/kim cương/lục giác/sao) — TÁI DÙNG toạ độ đã có ở
      GĐ16 gốc + mở rộng thêm từ nhóm Đồ họa, KHÔNG cần field mới — làm TRƯỚC TIÊN
- [ ] Giấy — biến thể viền trắng đóng khung (`borderW`/`borderColor` có sẵn của `ImageItem`) —
      không cần field mới, làm NGAY được cùng đợt với mục trên
- [ ] Giấy — biến thể "dải ngang/dọc mỏng" (chỉ cần `suggestedBox` tỷ lệ cạnh chênh lệch lớn,
      VD `w:400,h:60`) — không cần field mới
- [ ] Backlog: Giấy — biến thể "viền rách không đều" (cần `path()` với nhiều điểm toạ độ lởm
      chởm, khó nhất trong cụm Giấy)
- [ ] Field mới `borderSides?: { top: number; right: number; bottom: number; left: number }` vào
      `ImageItem` (ghi đè `borderW` khi có giá trị) — HOẶC đơn giản hơn: 1 preset cứng "khung
      Polaroid" với 4 giá trị border định sẵn (VD top/left/right: 12px, bottom: 50px), không cần
      UI tuỳ chỉnh 4 cạnh cho mọi ImageItem
- [ ] Thư (chữ cái A-Z, có thể cả số 0-9) — cần 1 CÔNG CỤ NGOÀI CODE để chuyển font-to-SVG-path
      (chọn 1 font đậm/rõ nét làm chuẩn) — làm 1 LẦN, lưu thành bảng hằng số
      `LETTER_CLIP_PATHS: Record<string, string>`, dùng vĩnh viễn
- [ ] Backlog: Hoa, Đốm màu (hình dạng hữu cơ, cần `path()` vẽ tay bằng công cụ thiết kế như
      Figma/Inkscape rồi xuất SVG path — KHÔNG tự đoán toạ độ)
- [ ] Backlog: Retro (viền chấm bi/halftone) — cần field MỚI `frameOverlay?: string` (ảnh PNG viền
      trang trí đặt đè lên trên, `position:absolute`, `pointer-events:none`) + ASSET PNG viền
      thật do Sonth cung cấp, không tự vẽ bằng code
- [ ] Backlog: hiệu ứng "đường rách dọc" áp cho 1 ảnh đơn, "lỗ tròn phim 35mm ở viền" — cùng nhóm
      kỹ thuật path/overlay phức tạp như Retro/Hoa/Đốm màu
- [x] Quyết định BỎ nhóm "Thiết bị" (điện thoại/màn hình/tablet) — giá trị sử dụng thấp nhất cho
      ngữ cảnh ceremony, không làm trừ khi có nhu cầu cụ thể phát sinh
- [x] Xác nhận "Lưới ảnh lặp"/"Collage"/"Dải phim"/"3 dải dọc" KHÔNG thuộc phạm vi file này — đã
      chuyển mô tả sang `content-spec-luoi.md`, không cần làm trùng ở đây
