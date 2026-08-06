---
status: reference
purpose: >
  Tài liệu MÔ TẢ NỘI DUNG (không phải phase triển khai có số GĐ riêng) cho nhóm "Văn bản" trong
  side palette kiểu Canva. Đọc file này KHÔNG cần xem lại ảnh chụp Canva gốc — mọi thứ nhìn thấy
  trong ảnh đã được diễn giải lại bằng lời ở đây. File này là NGUỒN NỘI DUNG cho việc triển khai
  `TextPresetsPanel.tsx` đã nhắc ở `10-rail-assembly.md` (GĐ19) — file đó giữ phần cơ chế
  (component nào, spawn qua đâu), file NÀY giữ phần "có bao nhiêu preset, preset nào, trông như
  thế nào, hoạt động ra sao".
related_phase: GĐ19 (10-rail-assembly.md, mục "TextPresetsPanel.tsx")
source_images: image - 1.png (Titles/Paragraphs), image - 2.png (Text Mask)
---

# Nhóm "Văn bản" — mô tả chi tiết toàn bộ nội dung và hành vi

> Ảnh nguồn: [`image - 1.png`](./image%20-%201.png) (mục Titles/Paragraphs), [`image - 2.png`](./image%20-%202.png) (mục Text Mask) — cùng thư mục.

## Bối cảnh chung: đây là cái gì, dùng để làm gì

Khi người dùng bấm vào tab "Văn bản" ở cột palette bên trái, họ đang tìm một cách NHANH để đưa
chữ vào slide mà không phải tự tay chỉnh font-size, màu, độ đậm từ đầu. Ý tưởng gốc của Canva là:
thay vì đưa ra một ô nhập chữ trống trơn rồi bắt người dùng tự mở property panel để style, thì đưa
ra sẵn một loạt các "khối chữ mẫu" — mỗi khối đã có sẵn kiểu chữ, cỡ chữ, màu sắc, độ đậm hoàn
chỉnh, và quan trọng nhất là MỖI Ô XEM TRƯỚC (tile) không phải là 1 icon chữ "T" chung chung, mà
là chính đoạn chữ mẫu đó được RENDER THẬT theo đúng style của nó. Nhìn vào panel, người dùng thấy
ngay "Huge Title" là 1 dòng chữ to đậm thật, "Elegant Title" là 1 dòng chữ nghiêng kiểu chữ viết
tay thanh mảnh thật — không phải đọc tên rồi đoán, mà THẤY LUÔN kết quả. Khi kéo (hoặc trong
sky-app là kéo-thả theo interaction model đã thống nhất toàn palette) 1 tile ra ngoài canvas, hệ
thống tạo ra 1 khối chữ mới mang chính xác các thuộc tính style của tile đó, với nội dung chữ mặc
định là tên gợi nhớ của kiểu đó (VD kéo tile "Huge Title" ra thì chữ mặc định hiện lên canvas có
thể là chữ "Tiêu đề lớn" hoặc giữ nguyên placeholder để người dùng tự gõ lại) — người dùng sau đó
double-click vào khối chữ đó trên canvas để sửa lại nội dung thành tên thật/lời chúc thật, còn
kiểu chữ (font, cỡ, đậm, nghiêng, màu) giữ nguyên như tile đã định nghĩa.

## Cấu trúc điều hướng con bên trong panel "Văn bản"

Panel không phẳng — nó có một danh sách điều hướng con nằm dọc bên trong (khác với cấp Rail bên
ngoài cùng, đây là cấp điều hướng THỨ HAI, chỉ tồn tại bên trong panel "Văn bản"). Nhìn vào ảnh
Canva gốc, danh sách con này gồm 6 mục xếp dọc: "Themed Text", "Titles" (mục đang được chọn, tô
nền xanh nhạt để phân biệt), "Paragraphs", "Collapsible Text", "Text Marquee", "Text Mask". Khi
người dùng bấm vào 1 mục trong danh sách con này, phần nội dung bên phải (khu vực hiển thị các
tile) đổi sang hiện đúng bộ nội dung của mục đó — đúng kiểu điều hướng master-detail 2 cấp, không
phải xổ xuống (dropdown) hay tab ngang, mà là danh sách dọc cố định bên trái của panel con.

Với sky-app, quyết định: KHÔNG bắt chước y nguyên 6 mục — trong đó có 1 mục ("Collapsible Text")
đã được xác nhận loại bỏ hoàn toàn từ trước (vì slide LED trình chiếu không có tương tác click để
mở/đóng, khái niệm "văn bản có thể thu gọn" không có ý nghĩa gì trên 1 màn hình không ai bấm vào
được). Còn lại 5 mục kia được xem xét riêng từng cái ngay dưới đây, có mục giữ, có mục cần suy
nghĩ thêm vì bản chất "trình chiếu tĩnh, không tương tác" của sky-app khác hẳn "trang web có thể
cuộn, click, hover" của Canva.

## Mục con thứ nhất: "Titles" — chữ tiêu đề với nhiều kiểu dáng khác nhau

![Panel Văn bản — điều hướng con bên trái (Themed Text/Titles/Paragraphs/Collapsible Text/Text Marquee/Text Mask) và nội dung mục Titles + đầu mục Paragraphs](./image%20-%201.png)

Đây là mục con QUAN TRỌNG NHẤT và có nội dung phong phú nhất trong ảnh chụp gốc. Nó là một cột
dọc các dòng chữ mẫu, mỗi dòng 1 kiểu khác hẳn nhau về cỡ chữ, độ đậm, font family, và có dòng còn
có chữ nghiêng hoặc chữ hoa toàn bộ. Đếm được 12 kiểu riêng biệt trong ảnh, xếp từ trên xuống dưới
theo đúng thứ tự Canva hiển thị (thứ tự này có ý nghĩa — Canva xếp không theo cỡ chữ tăng dần hay
giảm dần một cách máy móc, mà xen kẽ để người dùng lướt mắt thấy đa dạng ngay từ đầu):

Kiểu đầu tiên là "CAPS TITLE" — toàn bộ chữ hoa, độ đậm vừa phải (không quá đậm, không mảnh), có
dàn cách chữ (letter-spacing) rộng hơn bình thường một chút, tạo cảm giác trang trọng, kiểu chữ
gần giống serif nhẹ. Kiểu thứ hai "Small Title" là dòng chữ thường (không hoa toàn bộ), đậm, cỡ
nhỏ nhất trong cả danh sách — dùng cho những chỗ cần 1 dòng nhãn ngắn không chiếm nhiều diện tích.
Kiểu thứ ba "Business Title" mang phong cách serif cổ điển, độ đậm trung bình, cỡ chữ trung bình
— gợi cảm giác chuyên nghiệp, nghiêm túc, kiểu chữ có chân (có gạch nhỏ ở đầu/cuối mỗi nét chữ).
Kiểu thứ tư "Huge Title" là dòng chữ TO NHẤT trong toàn bộ danh sách, đậm, font sans-serif (không
chân), chiếm gần hết chiều rộng của tile xem trước — đây là kiểu dùng cho tiêu đề chính, chữ đầu
tiên người xem nhìn thấy trên slide. Kiểu thứ năm "Bold Title" đậm, cỡ trung bình-lớn, sans-serif,
không có gì đặc biệt về hiệu ứng nhưng độ đậm rất rõ, tạo cảm giác chắc chắn dứt khoát. Kiểu thứ
sáu "Elegant Title" hoàn toàn khác — chữ NGHIÊNG, font serif mảnh, đường nét thanh, kiểu chữ gợi
cảm giác thư pháp/trang trọng nhẹ nhàng, cỡ chữ trung bình. Kiểu thứ bảy "Classic Title" chữ
thường (không nghiêng, không hoa), serif, độ đậm nhẹ (không đậm bằng Business Title), cỡ trung
bình — đơn giản, cổ điển, ít điểm nhấn. Kiểu thứ tám "MAGAZINE TITLE" chữ hoa toàn bộ, serif đậm,
cỡ lớn hơn "Business Title" một chút, tạo cảm giác giống tiêu đề bìa tạp chí thời trang. Kiểu thứ
chín "TALL TITLE" là kiểu ĐẶC BIỆT — chữ hoa, font được co hẹp theo chiều ngang (condensed) khiến
mỗi ký tự trông cao và gầy bất thường so với chiều rộng, đậm, cỡ khá lớn — hiệu ứng thị giác rất
khác các kiểu khác vì tỷ lệ ký tự không bình thường. Kiểu thứ mười "Small Running Title" chữ
thường, mảnh (font-weight nhẹ), cỡ nhỏ, không có gì nổi bật — dùng cho dòng chữ phụ chạy ngang,
ít gây chú ý. Kiểu thứ mười một "FASHION TITLE" chữ hoa nhưng cỡ NHỎ (letter-spacing rộng, giống
tên thương hiệu thời trang cao cấp), serif, độ đậm nhẹ — tinh tế, sang trọng kiểu tối giản. Kiểu
cuối cùng "Thin Title" chữ thường, cỡ LỚN (chỉ nhỏ hơn Huge Title một chút), nhưng độ đậm RẤT NHẸ
(font-weight thin/light), sans-serif — tạo hiệu ứng vừa to vừa nhẹ nhàng, tương phản với "Huge
Title" (to và đậm).

Với sky-app, việc chuyển 12 kiểu này thành các preset cụ thể là hoàn toàn khả thi ngay — mỗi kiểu
map trực tiếp vào các field đã có sẵn của `TextItem` (`fontSize`, `fontWeight`, `fontFamily`,
`uppercase`, `italic`, `color`), không cần field mới nào. Cái duy nhất chưa có sẵn trong hệ thống
font hiện tại là "font co hẹp theo chiều ngang" (kiểu TALL TITLE) — sky-app cần có ít nhất 1 font
condensed trong bộ font đang dùng (hoặc dùng CSS `transform: scaleX(0.8)` giả lập co hẹp nếu
không có font condensed thật, chấp nhận được vì đây chỉ là hiệu ứng thị giác, không ảnh hưởng gì
tới logic). Mỗi tile xem trước trong panel phải RENDER CHỮ THẬT theo đúng style (không phải icon
chữ T chung), cỡ chữ trong tile được co nhỏ tỷ lệ để vừa khung tile (VD tile cao 50px thì chữ hiển
thị trong tile nhỏ hơn cỡ chữ thật sẽ áp khi kéo ra canvas — giống cách các preset text khác của
sky-app đã làm, tính theo tỷ lệ scale-to-fit).

## Mục con thứ hai: "Paragraphs" — đoạn văn dài, không phải tiêu đề ngắn

Ngay dưới "Titles" trong ảnh gốc là phần bắt đầu của mục "Paragraphs" — khác hẳn Titles (những
dòng ngắn, cỡ lớn), Paragraphs hiện các đoạn văn DÀI nhiều câu, cỡ chữ nhỏ vừa đủ đọc, mục đích
để xem trước FONT FAMILY trông như thế nào khi dùng cho nội dung dài (không phải xem trước cỡ/độ
đậm như Titles). Nhìn thấy được 2 đoạn trong ảnh (bị cắt ở dưới nên chưa biết còn bao nhiêu đoạn
nữa): đoạn 1 dùng font "Helvetica Light" với nội dung mẫu tự giới thiệu chính font đó ("Helvetica
Light is an easy-to-read font, with tall and narrow letters, that works well on almost any
site."), đoạn 2 bắt đầu bằng "Avenir Light is a clean and stylish font..." (bị cắt, chưa đọc hết
câu). Đây chính là MẪU THIẾT KẾ đặc trưng của Canva cho mục Paragraphs: mỗi font family có 1 đoạn
văn TỰ GIỚI THIỆU chính nó, nội dung mẫu luôn là 1 câu mô tả đặc điểm của font đó (dễ đọc, chữ cao
gầy, sạch sẽ, thanh lịch...) — vừa cho xem trước font, vừa cho biết tên font ngay trong nội dung
mẫu mà không cần label riêng bên dưới.

Với sky-app, mục "Paragraphs" có giá trị THẤP HƠN "Titles" vì bản chất nội dung trên slide ceremony
(tên người, lời chúc, thông tin buổi lễ) hầu như luôn là những câu NGẮN, không phải đoạn văn dài
nhiều câu — nhưng không có nghĩa là bỏ hẳn, vẫn nên có một bộ nhỏ preset "Đoạn văn" cho các trường
hợp cần chú thích/mô tả dài hơn (VD phần giới thiệu thành tích, trích dẫn...). Thay vì bịa nội
dung mẫu tiếng Anh tự giới thiệu font như Canva (không hợp ngữ cảnh tiếng Việt của ceremony), nội
dung mẫu nên là 1 câu tiếng Việt trung tính có thể áp dụng chung (VD "Đây là đoạn văn mẫu, dùng để
xem trước kiểu chữ này trông như thế nào khi có nhiều dòng.") — cùng 1 câu mẫu DÙNG CHUNG cho mọi
preset Paragraphs (khác Titles — mỗi Titles có TÊN riêng làm nội dung, còn Paragraphs chỉ cần 1
câu mẫu chung vì mục đích là xem trước font/cỡ chữ áp cho đoạn dài, không cần tên riêng cho từng
preset).

## Mục con thứ ba: "Text Mask" — chữ được "lấp đầy" bằng ảnh hoặc hiệu ứng màu đặc biệt

![Mục Text Mask — chữ lấp bằng vân gỗ, gradient tím-hồng, ảnh cỏ thật (UNTOLD STORIES), họa tiết gai (dấu &), kim loại (CULTURE)](./image%20-%202.png)

Đây là mục con có hiệu ứng THỊ GIÁC PHỨC TẠP NHẤT trong toàn bộ nhóm Văn bản, và cũng là mục sky-
app CHƯA CÓ khả năng kỹ thuật để làm ngay (cần thêm field/logic mới, không chỉ là preset style
thông thường). Nhìn vào ảnh mẫu: có 1 dòng chữ script mảnh màu cam nhạt "Unleash Your Best" nằm
ngay dưới 1 khối chữ bị cắt ở đầu ảnh trông như được lấp đầy bằng HỌA TIẾT GỖ (các đường vân gỗ
nâu cam chạy dọc theo hình dạng chữ, như thể nhìn xuyên qua các con chữ để thấy 1 miếng gỗ thật ở
phía sau). Tiếp theo là số "03" cỡ rất lớn được lấp bằng HỌA TIẾT TÍM/HỒNG loang màu (giống vết
màu nước hoặc marble), đặt cạnh dòng chữ thường "THE WORST DAYS MAKE THE BEST STORIES" màu cam
cam bình thường (không có hiệu ứng mask, chỉ để đối chiếu). Nổi bật nhất là chữ "UNTOLD STORIES"
cỡ rất lớn, đậm, được lấp đầy hoàn toàn bằng 1 TẤM ẢNH CHỤP THẬT (ảnh cỏ/cây xanh) — nhìn vào từng
con chữ sẽ thấy y hệt như đang nhìn qua 1 lỗ cắt hình chữ đó vào tấm ảnh cỏ phía sau, đúng nghĩa
đen "ảnh nằm trong hình dạng chữ". Ngay dưới là "Be The Exception" chữ đậm màu xanh lá đặc — đây
KHÔNG có hiệu ứng mask, chỉ là màu đặc bình thường, được xếp cạnh các mẫu có mask để minh hoạ sự
khác biệt. "LET'S TALK" chữ đen đậm bình thường đặt cạnh 1 ký hiệu "&" (dấu và, ampersand) được
lấp bằng HỌA TIẾT GAI/TUA rua đen trắng (trông như lông nhím hoặc vân gỗ chạm khắc rất chi tiết).
"CULTURE" được lấp bằng HỌA TIẾT KIM LOẠI/CHROME bóng (như mặt kim loại phản chiếu sáng-tối loang
lổ). Cuối cùng "Crème De La Crème" chữ nghiêng script mảnh màu xám — không mask, chỉ để minh hoạ
1 kiểu chữ trang trí thêm vào danh sách.

Bản chất kỹ thuật của "Text Mask": đây là kỹ thuật CSS "background-clip: text" — thay vì tô màu
đặc cho chữ, người ta đặt 1 ảnh/gradient/họa tiết làm nền, sau đó "cắt" nền đó theo đúng hình dạng
của các ký tự chữ, làm cho phần nào KHÔNG phải chữ bị ẩn đi, chỉ còn lại đúng phần ảnh/họa tiết
nằm "trong" hình con chữ hiện ra. Kỹ thuật này chạy tốt trên mọi trình duyệt Chromium hiện đại (cả
Electron renderer và Web build của sky-app đều dùng Chromium/WebKit-based engine, không có rào
cản tương thích).

Để làm được ở sky-app, cần thêm 1 field mới vào `TextItem` — tạm gọi `textFill?: { kind: 'image';
src: string } | { kind: 'gradient'; value: string }` — khi field này CÓ giá trị, cách render đổi
hẳn: bỏ `color` (không tô màu đặc nữa), thay vào đó set CSS `background-image` (ảnh hoặc gradient
CSS string tương ứng), `background-clip: text`, `-webkit-background-clip: text`, `color:
transparent`, `background-size: cover` (nếu là ảnh, để ảnh lấp đầy toàn bộ vùng chữ, không bị lặp
lại kiểu tile). Property Panel cần thêm 1 Section mới "Hiệu ứng chữ" (hoặc gộp vào Section màu chữ
hiện có, đổi thành 3 lựa chọn: "Màu đặc" / "Gradient" / "Ảnh") — khi chọn "Ảnh" thì mở
`MediaLibraryModal` (đã có từ GĐ14) để chọn ảnh làm họa tiết lấp chữ, khi chọn "Gradient" thì dùng
lại đúng cơ chế gradient CSS string đã có ở `ShapeItem.fill`/`RibbonItem.bg`.

Về nội dung preset cụ thể cho Text Mask ở sky-app: vì đây là hiệu ứng "làm nổi bật 1 vài chữ đặc
biệt" (không phải dùng cho câu dài), preset nên tập trung vào các GRADIENT MÀU SẴN (không cần ảnh
thật, vì ảnh phải do người dùng tự chọn) — VD gradient vàng-kim (phù hợp không khí lễ tốt nghiệp,
kiểu "chữ vàng nổi bật"), gradient bạc/kim loại tương tự chữ "CULTURE" trong ảnh mẫu, gradient
xanh-navy-trắng match tinh thần trang trọng học đường. Tuỳ chọn "lấp bằng ảnh thật" (giống "UNTOLD
STORIES") vẫn giữ, nhưng đó là 1 CHỨC NĂNG (chọn ảnh) chứ không phải 1 "preset" cố định — không
cần tạo sẵn preset ảnh nào, chỉ cần UI cho phép user tự chọn khi cần.

## Mục con thứ tư: "Text Marquee" — chữ chạy ngang tự động

Trong ảnh gốc, mục này chỉ xuất hiện dưới dạng tên trong danh sách điều hướng con, KHÔNG có ảnh
chụp nội dung chi tiết bên trong (không có ảnh nào cho thấy các tile thật của Text Marquee). Dựa
theo tên và hiểu biết chung về Canva: đây là hiệu ứng chữ tự động DI CHUYỂN LIÊN TỤC theo chiều
ngang qua khung chứa (giống biển hiệu LED chạy chữ ở cửa hàng, hoặc dòng tin tức chạy ở dưới màn
hình tin tức truyền hình) — chữ chạy từ phải sang trái (hoặc trái sang phải) LẶP LẠI VÔ HẠN, không
cần ai bấm nút gì để chạy, tự động chạy ngay khi hiển thị.

Đây là điểm ĐẶC BIỆT trong toàn bộ nhóm Văn bản: KHÔNG như "Collapsible Text" (loại bỏ vì cần
click/tương tác — không có ý nghĩa trên màn hình LED tĩnh), "Text Marquee" KHÔNG cần bất kỳ tương
tác click/hover nào — nó chỉ là 1 animation CSS tự chạy liên tục (dùng `@keyframes` dịch chuyển
`transform: translateX()` lặp vô hạn qua `animation: marquee 8s linear infinite` hoặc tương tự).
Về bản chất, hiệu ứng này HOÀN TOÀN PHÙ HỢP với ngữ cảnh sky-app — thực tế, biển hiệu LED chạy chữ
là 1 hình thức trình chiếu RẤT PHỔ BIẾN trong các buổi lễ tốt nghiệp/sự kiện (chạy dòng chữ chúc
mừng, tên nhà tài trợ, thông báo...) — nên khác với quyết định loại "Collapsible Text", mục này
NÊN GIỮ LẠI cho sky-app, không loại bỏ.

Cách triển khai: thêm field `marquee?: { speed: number; direction: 'left' | 'right' }` vào
`TextItem` (tương tự cách `shadow` là field optional không ảnh hưởng item khi không set) — khi có
giá trị, render bọc nội dung chữ trong `<div>` với animation CSS chạy lặp vô hạn theo tốc độ/hướng
đã cấu hình, `overflow: hidden` trên khung chứa để chữ "biến mất" đúng ở biên khung khi chạy qua.
Preset cho panel: 2-3 tốc độ khác nhau (chậm/vừa/nhanh) x 2 hướng (trái/phải) là đủ, không cần
nhiều biến thể — người dùng chọn tốc độ/hướng qua Property Panel sau khi đã thả 1 khối chữ marquee
vào canvas, preset chỉ cần cho 1 điểm khởi đầu hợp lý (VD tốc độ vừa, chạy từ phải sang trái, đúng
với cách đọc chữ tự nhiên của người Việt — chữ xuất hiện từ bên phải rồi trôi dần sang trái để
đọc).

## Mục con thứ năm: "Themed Text" — bộ chữ đã phối theo 1 chủ đề thị giác nhất quán

Mục này nằm ĐẦU TIÊN trong danh sách điều hướng con của ảnh gốc, nhưng KHÔNG có ảnh chụp nội dung
chi tiết (chỉ thấy tên trong danh sách). Theo cách hiểu chung về "Themed" trong Canva: đây là các
bộ chữ được nhóm theo 1 CHỦ ĐỀ THẨM MỸ cụ thể (VD chủ đề "Retro", "Minimalist", "Vintage
Handwritten"...) — mỗi chủ đề gồm NHIỀU kiểu chữ (tương tự các kiểu trong "Titles") nhưng đã được
chọn lọc để CÙNG PHỐI HỢP ĂN Ý VỚI NHAU về màu sắc/font, giúp người dùng không phải tự phối 1
tiêu đề + 1 phụ đề + 1 đoạn văn sao cho hợp mắt — chỉ cần chọn "chủ đề" phù hợp, mọi khối chữ kéo
ra từ chủ đề đó sẽ tự động hài hoà với nhau.

Với sky-app, mục này có giá trị THỰC SỰ vì bối cảnh ceremony thường có 1 "màu chủ đề" cố định
xuyên suốt cả buổi lễ (VD trường có màu logo/đồng phục riêng: xanh-vàng, đỏ-trắng...) — 1 bộ
"Themed Text" phối theo đúng màu trường sẽ tiết kiệm rất nhiều công chỉnh tay cho người thiết kế
layout. Tuy nhiên, đây là tính năng PHỤ THUỘC vào việc "Titles"/preset cơ bản đã có trước (không
làm trước khi có preset cơ bản, vì bản chất Themed Text chỉ là các preset Titles/Paragraphs được
NHÓM LẠI theo bộ màu, không phải kiểu chữ hoàn toàn mới) — nên xếp độ ưu tiên THẤP HƠN "Titles",
làm sau khi "Titles" đã ổn định, và số lượng theme ban đầu nên ít (2-3 theme màu phổ biến cho lễ
tốt nghiệp: theme "Xanh-Vàng" kiểu học viện, theme "Đỏ-Trắng" trang trọng, theme "Trắng-Kim"
sang trọng) hơn là làm nhiều theme ngay từ đầu.

## Tổng kết cách tổ chức panel "Văn bản" ở sky-app

Điều hướng con bên trong panel giữ 5 mục (bỏ "Collapsible Text"): "Themed Text" (làm sau, ưu tiên
thấp), "Titles" (làm TRƯỚC TIÊN, nội dung phong phú nhất, giá trị cao nhất), "Paragraphs" (làm
sau Titles, bộ nhỏ, nội dung mẫu tiếng Việt trung tính), "Text Marquee" (GIỮ LẠI vì phù hợp LED
display, không phải bỏ như Collapsible), "Text Mask" (làm sau cùng vì cần field kỹ thuật mới
`textFill`, phức tạp hơn các mục khác). Mỗi mục con là 1 view riêng trong cùng 1 danh sách điều
hướng dọc bên trái của panel (không phải Tab ngang, không phải dropdown) — đúng cấu trúc master-
detail 2 cấp đã thấy trong ảnh Canva gốc. Toàn bộ tile trong mọi mục con áp dụng CHUNG 1 quy tắc
tương tác đã thống nhất cho cả palette: kéo-thả để chèn (không phải click-để-chèn-ngay).

## Checklist kỹ thuật cần làm

- [ ] 12 preset "Titles" (CAPS TITLE, Small Title, Business Title, Huge Title, Bold Title, Elegant
      Title, Classic Title, MAGAZINE TITLE, TALL TITLE, Small Running Title, FASHION TITLE, Thin
      Title) — map field có sẵn của `TextItem` (`fontSize`/`fontWeight`/`fontFamily`/`uppercase`/
      `italic`/`color`), không cần field mới
- [ ] Xử lý "TALL TITLE" (chữ co hẹp chiều ngang) — tìm 1 font condensed trong bộ font đang dùng,
      hoặc dùng CSS `transform: scaleX(0.8)` giả lập nếu không có font condensed
- [ ] Preset "Paragraphs" (bộ nhỏ, không cần nhiều) — nội dung mẫu 1 câu tiếng Việt trung tính
      dùng CHUNG cho mọi preset (khác Titles — mỗi Titles có tên riêng làm nội dung)
- [ ] Field mới `textFill?: { kind: 'image'; src: string } | { kind: 'gradient'; value: string }`
      vào `TextItem` — khi có giá trị, ưu tiên thay `color`, render qua CSS `background-clip:
      text` + `-webkit-background-clip: text` + `color: transparent`
- [ ] Property Panel — Section "Hiệu ứng chữ" mới: 3 lựa chọn Màu đặc / Gradient / Ảnh (chọn Ảnh
      → mở `MediaLibraryModal` đã có từ GĐ14)
- [ ] Preset Text Mask — vài gradient màu sẵn phù hợp ceremony (vàng-kim, bạc/kim loại, xanh-navy-
      trắng); KHÔNG cần preset ảnh sẵn, chỉ cần UI cho tự chọn ảnh
- [ ] Field mới `marquee?: { speed: number; direction: 'left' | 'right' }` vào `TextItem` — render
      qua CSS `@keyframes`/`animation: ... infinite`, `overflow: hidden` trên khung chứa
- [ ] Preset Text Marquee — 2-3 tốc độ (chậm/vừa/nhanh) × 2 hướng, mặc định hợp lý: tốc độ vừa,
      chạy phải→trái
- [ ] Themed Text (ưu tiên THẤP, làm SAU CÙNG khi Titles đã ổn định) — 2-3 theme màu ceremony phổ
      biến: "Xanh-Vàng" (học viện), "Đỏ-Trắng" (trang trọng), "Trắng-Kim" (sang trọng)
- [x] Quyết định BỎ HẲN "Collapsible Text" — không có ý nghĩa trên màn hình LED không tương tác
      (đã chốt từ trước, ghi nhận lại ở đây cho đủ bộ)
