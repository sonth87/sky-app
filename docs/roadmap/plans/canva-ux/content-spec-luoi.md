---
status: reference
purpose: >
  Tài liệu MÔ TẢ NỘI DUNG cho nhóm "Lưới" trong side palette kiểu Canva. Đọc file này KHÔNG cần
  xem lại ảnh chụp Canva gốc. File này là NGUỒN NỘI DUNG cho `GridPresetsPanel.tsx` đã nhắc ở
  `08-grid-presets.md` (GĐ17) — file đó giữ cơ chế (`SpawnKind: 'preset'`, `batchCommand`), file
  NÀY giữ danh mục nội dung thật + mở rộng khái niệm "Lưới" rộng hơn nhiều so với 1 bố cục N-ô
  tĩnh đơn giản.
related_phase: GĐ17 (08-grid-presets.md)
source_images: image - 9.png (Pro Galleries), image - 10.png (Slider Galleries)
---

# Nhóm "Lưới" — mô tả chi tiết toàn bộ nội dung và hành vi

> Ảnh nguồn: [`image - 9.png`](./image%20-%209.png) (Pro Galleries), [`image - 10.png`](./image%20-%2010.png) (Slider Galleries) — cùng thư mục.

## Bối cảnh chung: "Lưới" trong Canva rộng hơn nhiều so với hiểu ban đầu

Trước khi xem ảnh chụp, cách hiểu "Lưới" đơn giản nhất là "1 bố cục cố định gồm N ô, mỗi ô 1 ảnh,
đặt cạnh nhau đều nhau kiểu bàn cờ" — đúng với những gì `08-grid-presets.md` (GĐ17) đã thiết kế
ban đầu (VD "Lưới 2×2 + tiêu đề"). Nhưng nhìn vào ảnh chụp thật của Canva, "Lưới" (mục Canva gọi
là "Grids"/"Galleries") là 1 KHÁI NIỆM RỘNG HƠN RẤT NHIỀU, bao gồm ít nhất 4 KIỂU BỐ CỤC KHÁC HẲN
NHAU về bản chất, không chỉ là "N ô đều nhau":

## Cấu trúc điều hướng con: 5 mục

Danh sách điều hướng con bên trái panel gồm: "Recommended" (Đề xuất — tuyển chọn tổng hợp từ các
mục khác, không phải 1 loại bố cục riêng, chỉ là màn hình mặc định gợi ý), "Pro Galleries" (đang
được chọn ở 1 trong 2 ảnh), "Grid Galleries", "Slider Galleries" (đang được chọn ở ảnh còn lại),
"More Galleries" (Thêm — chứa các bố cục KHÔNG rơi vào 3 nhóm chính, mang tính sáng tạo/đặc biệt).

## Mục "Pro Galleries" — bố cục collage KHÔNG ĐỀU, các ô có kích thước khác nhau, đã phối bằng ảnh mẫu thật

![Mục Pro Galleries — 3 biến thể collage không đều (ô lớn+nhiều ô nhỏ lệch), preview bằng ảnh thật, nút mũi tên trái-phải xem biến thể](./image%20-%209.png)

Đây là kiểu bố cục PHỨC TẠP NHẤT về mặt sắp xếp: KHÔNG giống lưới bàn cờ (mọi ô cùng kích thước),
mà là 1 bố cục kiểu MOODBOARD — trong 1 khối tổng thể, có 1-2 Ô LỚN chiếm nhiều diện tích, xen với
NHIỀU Ô NHỎ khác nhau kích cỡ, sắp xếp lệch nhau tạo cảm giác NGHỆ THUẬT/PHÓNG KHOÁNG chứ không
cứng nhắc đối xứng. Nhìn vào ảnh mẫu (dùng ảnh chụp thật: toà nhà, mặt cỏ sân tennis xanh, chanh
vàng, cồn cát, cây lá xanh, người đi xe đạp cạnh biển...) thấy 3 BIẾN THỂ bố cục khác nhau của
CÙNG 1 "kiểu" Pro Gallery: biến thể 1 có 1 ô ảnh cao chiếm cả cột phải (ảnh chanh trải dài), các ô
còn lại xếp 3×2 bên trái với kích cỡ không đều nhau; biến thể 2 đơn giản hơn — chỉ 1 dải ảnh RỘNG
CHIẾM TOÀN BỘ CHIỀU NGANG (không chia ô gì, chỉ 1 ảnh full-width, có thể tính là dạng "Pro
Gallery 1 ô" cho trường hợp muốn nhấn 1 tấm ảnh duy nhất thật lớn); biến thể 3 có 1 ô lớn bên trái
(cồn cát), cụm ô nhỏ ở giữa, và 1 ô dọc cao bên phải (người đi xe đạp) — mỗi biến thể là 1 "công
thức sắp xếp KHÁC NHAU" chứ không phải chỉnh size 1 layout chung.

Điểm ĐẶC BIỆT QUAN TRỌNG cần lưu ý: MỌI tile xem trước trong "Pro Galleries" đều hiện SẴN ẢNH MẪU
THẬT (không phải khung trống với chữ "kéo ảnh vào đây") — nghĩa là khi người dùng nhìn vào panel,
họ thấy NGAY layout đó đẹp như thế nào NẾU dùng ảnh, không phải tự hình dung. Có các NÚT MŨI TÊN
TRÁI-PHẢI (`‹` `›`) đặt ở 2 bên mép mỗi preview lớn — đây là tính năng CUỘN NGANG để xem THÊM biến
thể khác của "gần giống kiểu bố cục đó" (không phải chuyển sang bố cục hoàn toàn khác, mà xem các
"phiên bản anh em" cùng 1 gu thẩm mỹ, có thể khác về màu ảnh mẫu minh hoạ hoặc lệch tỷ lệ 1 chút).

Với sky-app: khái niệm "layout không đều, nhiều ô kích cỡ khác nhau xếp lệch" ĐÃ CÓ SẴN 1 phần
trong preset hiện tại của GĐ17 (VD "Lưới 1 lớn + 2 nhỏ") — nhưng số lượng RẤT ÍT (1 preset) so
với "hàng chục biến thể" mà Canva cung cấp. Việc "hiện sẵn ảnh mẫu thật trong tile xem trước" là
1 QUYẾT ĐỊNH THIẾT KẾ quan trọng cần áp dụng — thay vì tile chỉ hiện các ô màu xám placeholder
(cách GĐ17 hiện đang làm), nên đổi sang dùng 1-2 TẤM ẢNH MẪU CỐ ĐỊNH (VD 1 ảnh phong cảnh trung
tính do Sonth chọn, dùng CHUNG cho MỌI tile xem trước) để người dùng thấy trước layout đẹp ra sao
khi có ảnh thật — đây là 1 THAY ĐỔI NHỎ về cách hiện preview (không phải thay đổi kỹ thuật spawn),
làm tile "sống" hơn hẳn so với chỉ hiện khối màu xám trừu tượng. Về "nút mũi tên xem biến thể" —
tính năng này có giá trị NHƯNG PHỨC TẠP THÊM 1 lớp UI cuộn-ngang-trong-1-tile, có thể BỎ QUA ở
bản đầu (chỉ hiện 1 biến thể/preset, không cần cơ chế cuộn xem thêm biến thể của cùng 1 preset —
nếu cần nhiều biến thể, đơn giản hoá bằng cách coi mỗi biến thể là 1 TILE RIÊNG trong lưới, không
cần cơ chế cuộn ẩn bên trong 1 tile).

## Mục "Grid Galleries" — bố cục lưới ĐỀU, các ô cùng kích thước (không có ảnh chụp chi tiết riêng nhưng suy luận được từ tên + đối chiếu)

Mục này KHÔNG có ảnh chụp minh hoạ riêng (2 ảnh gửi chỉ chụp "Pro Galleries" và "Slider
Galleries"), nhưng dựa vào tên và cách phân loại của Canva (đặt ngay cạnh "Pro Galleries" — ngụ ý
đây là bản ĐƠN GIẢN HƠN, không "Pro"), có thể suy luận chắc chắn: "Grid Galleries" là các bố cục
lưới ĐỀU NHAU — 2×2, 3×3, 2×3, hàng ngang N ô cùng kích thước, không có ô lớn/nhỏ lệch nhau như
"Pro Galleries". Đây CHÍNH LÀ khái niệm "Lưới tĩnh" mà `08-grid-presets.md` (GĐ17) đã thiết kế
từ đầu (VD "Lưới 3 cột ảnh" — 6 ảnh cùng kích thước 130×130 xếp 3×2) — nghĩa là công việc GĐ17 đã
làm từ trước ĐÚNG VỚI mục "Grid Galleries" này, không cần thiết kế lại, chỉ cần MỞ RỘNG SỐ LƯỢNG
biến thể (thêm nhiều tỷ lệ lưới khác: 2×2, 2×3, 3×2, 4 cột, 1 hàng ngang 3-4-5 ô, 1 cột dọc 3-4
ô...) chứ không cần khái niệm mới.

## Mục "Slider Galleries" — các dạng trình chiếu/mosaic ĐẶC BIỆT, một số có tính TƯƠNG TÁC

![Mục Slider Galleries — slideshow có mũi tên+đếm "1/12", dải ảnh khung tròn, mosaic hình thoi, mosaic tam giác, thẻ chữ+ảnh, chồng ảnh xoay ngẫu nhiên](./image%20-%2010.png)

Đây là mục có nội dung ĐA DẠNG VÀ PHỨC TẠP NHẤT, gồm ít nhất 5 KIỂU KHÁC HẲN NHAU về bản chất kỹ
thuật, cần tách riêng từng kiểu để hiểu đúng — không được gộp chung là "1 loại Slider":

**Kiểu 1 — Slideshow có điều hướng (carousel thật, tương tác click):** 1 ảnh lớn (cành hoa trước
bầu trời xanh ngọc) với 2 nút mũi tên `‹` `›` đặt chồng lên 2 bên mép ảnh, và Ở GÓC DƯỚI-PHẢI có
số đếm "1/12" — xác nhận đây là 1 slideshow CÓ 12 ẢNH, người xem bấm mũi tên để CHUYỂN QUA ẢNH KẾ
TIẾP, chỉ 1 ảnh hiện tại 1 thời điểm. Đây là tính năng TƯƠNG TÁC THẬT (cần click để hoạt động) —
theo đúng nguyên tắc đã xác lập cho sky-app từ trước (loại bỏ "Collapsible Text" vì cần tương tác
click, màn hình LED không ai bấm được), kiểu bố cục NÀY VỀ BẢN CHẤT TƯƠNG TÁC CŨNG KHÔNG PHÙ HỢP
trực tiếp — NHƯNG có 1 hướng chuyển đổi hợp lý: thay "bấm mũi tên để chuyển" bằng "TỰ ĐỘNG CHUYỂN
ẢNH SAU MỖI N GIÂY" (giống cách đã quyết định giữ "Text Marquee" — tự chạy, không cần click).
Điều này biến "Slideshow tương tác" thành "Slideshow tự động" — vẫn giữ được GIÁ TRỊ THẨM MỸ (1
ô hiện nhiều ảnh thay nhau theo thời gian, tiết kiệm diện tích màn hình) mà KHÔNG cần tương tác.

**Kiểu 2 — Dải ảnh hình tròn (circular mask row):** nhiều ảnh được cắt theo hình TRÒN, xếp thành 1
HÀNG NGANG cạnh nhau (ảnh toà nhà màu vàng nâu trong khung tròn, ảnh người mặc đồ trắng trong
khung tròn, các khung tròn khác bị cắt ở mép ảnh chụp), cũng có mũi tên điều hướng 2 bên — ngụ ý
đây cũng là 1 dải CÓ THỂ CUỘN NGANG để xem thêm ảnh tròn khác nếu số ảnh nhiều hơn số ô hiện trên
màn hình. Về bản chất, đây là sự KẾT HỢP giữa "Khung tròn" (đã có từ `07-frames-mask-shapes.md`,
field `clipPath`/`shape:'circle'`) VỚI "Lưới" (nhiều ô xếp hàng) — không phải 1 khái niệm hoàn
toàn mới, chỉ là ÁP DỤNG khung tròn cho TỪNG Ô của 1 lưới hàng ngang. Phần "cuộn ngang xem thêm"
có thể BỎ (giống quyết định đã đưa ra cho "Pro Galleries") — chỉ cần hiện ĐỦ SỐ Ô trong 1 preset
cố định (VD preset "4 ảnh tròn hàng ngang"), không cần cơ chế cuộn thêm.

**Kiểu 3 — Mosaic hình thoi/tessellation (diagonal diamond grid):** NHIỀU ảnh nhỏ được xếp theo
1 PATTERN HÌNH HỌC ĐẶC BIỆT — các ô được XOAY 45 ĐỘ tạo thành 1 lưới hình thoi liên tục (như gạch
lát sàn kiểu kim cương), mỗi ô trong lưới đó là 1 ảnh khác nhau (biển xanh ngọc, chanh vàng, toà
nhà, cây lá). Đây là 1 kỹ thuật CSS PHỨC TẠP — không phải đơn giản đặt N `<div>` cạnh nhau, mà cần
XOAY TOÀN BỘ LƯỚI 45 độ (`transform: rotate(45deg)` trên container), rồi XOAY NGƯỢC LẠI từng ảnh
con bên trong `-45deg` (để ảnh hiện đúng chiều bình thường, không bị nghiêng theo lưới) — kỹ
thuật "xoay lưới rồi xoay ngược nội dung con" là cách chuẩn để làm mosaic hình thoi bằng CSS. Đây
là kiểu bố cục MANG TÍNH NGHỆ THUẬT CAO, phức tạp về CSS nhưng KHÔNG cần field/logic mới trong data
model (`GalleryItem`/preset tĩnh vẫn dùng được, chỉ khác ở CSS render của riêng preset này).

**Kiểu 4 — Mosaic tam giác (triangle tessellation):** tương tự Kiểu 3 nhưng lưới chia bằng CÁC
HÌNH TAM GIÁC (không phải hình thoi) — mỗi ô là 1 tam giác cắt từ 1 ảnh, ghép nhiều tam giác tạo
thành khối tổng thể. Kỹ thuật tương tự Kiểu 3 (clip-path polygon tam giác cho từng ô, xếp NHIỀU
ô LỒNG VÀO NHAU để lấp đầy khoảng trống — 2 tam giác úp ngược nhau lấp đầy 1 hình vuông, là cách
làm mosaic tam giác chuẩn).

**Kiểu 5 — Thẻ chú thích kết hợp (text + image caption card):** 1 khối gồm 2 PHẦN — phần bên trái
là 1 nền màu (xanh lá nhạt trong ảnh mẫu) chứa CHỮ ("Add a Title" — placeholder tiêu đề + 1 dòng
mô tả placeholder ngay dưới), phần bên phải là 1 Ô ẢNH — đây LÀ 1 khái niệm hoàn toàn KHÁC các
kiểu trên: không phải "N ảnh xếp lưới", mà là "1 CẶP GỒM VÙNG CHỮ + VÙNG ẢNH" ghép cạnh nhau, có
thể hiểu là 1 BIẾN THỂ của khái niệm "Lưới tĩnh, mỗi ô 1 loại nội dung khác nhau" đã có trong GĐ17
(1 ô là TextItem, 1 ô là ImageItem, đặt cạnh nhau) — CHỈ KHÁC là preset này có SẴN 1 KHỐI MÀU NỀN
đặt sau chữ (giống 1 `ShapeItem` nền màu đặt DƯỚI `TextItem`, chứ không phải màu nền trong suốt
như slide thông thường).

**Kiểu 6 — Chồng ảnh rải ngẫu nhiên (scattered/stacked photo pile):** NHIỀU ảnh chồng lên nhau,
mỗi ảnh XOAY 1 GÓC NHẸ KHÁC NHAU (không đồng nhất — mỗi ảnh xoay ngẫu nhiên vài độ), tạo cảm giác
như 1 CHỒNG ẢNH POLAROID bị đổ ra bàn 1 cách tự nhiên, không ngăn nắp — ảnh này CHE 1 PHẦN ảnh
kia (Z-order chồng lấp có chủ đích, không phải lỗi canh). Đây là 1 hiệu ứng THẨM MỸ RẤT ĐẶC TRƯNG
của Canva, tạo cảm giác "phong cách sổ tay/scrapbook" — về kỹ thuật, đây chính là 4-6 `ImageItem`
ĐỘC LẬP đặt CHỒNG LẤN vị trí (box.x/box.y gần nhau hoặc trùng nhau 1 phần) VÀ MỖI ITEM CÓ
`box.rotation` KHÁC NHAU (field `rotation` đã CÓ SẴN trong `Box` type của sky-app — không cần field
mới nào cả, chỉ cần 1 preset ĐẶT SẴN N ảnh với toạ độ chồng lấp + góc xoay ngẫu nhiên nhẹ được tính
trước, VD 4 ảnh xoay lần lượt -8°, 5°, -3°, 10°).

Với sky-app, đánh giá 6 kiểu trên theo mức độ PHÙ HỢP + ĐỘ KHẢ THI: Kiểu 6 (chồng ảnh xoay ngẫu
nhiên) là DỄ NHẤT và PHÙ HỢP TỨC THÌ (dùng field `rotation` có sẵn, không cần gì mới, chỉ là 1
preset đặc biệt trong GĐ17's `GRID_PRESETS`). Kiểu 2 (dải ảnh tròn hàng ngang) và Kiểu 5 (thẻ chữ
+ ảnh) cũng DỄ, chỉ là preset tĩnh với các item khác loại/hình dạng, không cần kỹ thuật mới. Kiểu
1 (slideshow) đòi hỏi 1 CƠ CHẾ MỚI HOÀN TOÀN — không phải 1 preset tĩnh spawn 1 lần, mà là 1
LAYOUTITEM TYPE MỚI có khả năng "tự động đổi ảnh hiện tại theo thời gian" (cần field như `images:
string[]`, `intervalSeconds: number`, và LOGIC RUNTIME chạy `setInterval` đổi ảnh đang hiện —
tương tự độ phức tạp của tính năng GalleryItem đã bàn ở cuộc trước, nhưng THÊM PHẦN ANIMATION/timer
mà GalleryItem hiện tại KHÔNG có, vì GalleryItem chỉ hiện TẤT CẢ ảnh cùng lúc dạng lưới tĩnh, không
luân phiên theo thời gian) — xếp vào MỤC RIÊNG cần quyết định kiến trúc thêm, KHÔNG làm chung với
GĐ17's static-preset đơn giản. Kiểu 3 và Kiểu 4 (mosaic thoi/tam giác) là THUẦN KỸ THUẬT CSS,
KHẢ THI nhưng cần thời gian viết CSS `transform`/`clip-path` cẩn thận, độ ưu tiên THẤP vì tính
trang trí nghệ thuật cao hơn phục vụ nội dung thực tế của ceremony.

## Mục "More Galleries" — không có ảnh minh hoạ chi tiết riêng

Chỉ xuất hiện tên trong danh sách điều hướng, không có ảnh chụp nội dung — theo cách Canva tổ
chức (đặt "More" ở cuối danh sách các mục CÓ TÊN CỤ THỂ), đây LÀ NƠI CHỨA các bố cục KHÔNG rơi
gọn vào 3 nhóm chính (Pro/Grid/Slider), có thể gồm các layout theo MÙA/SỰ KIỆN đặc biệt hoặc thử
nghiệm mới. Với sky-app, không cần tạo mục tương ứng ngay — khi phát sinh preset mới không thuộc
"lưới đều"/"lưới không đều"/"slideshow-mosaic-chồng ảnh" đã có, có thể thêm 1 mục "Khác" tương tự,
nhưng KHÔNG BẮT BUỘC PHẢI CÓ ngay từ đầu.

## Liên kết với "Lưới ảnh lặp"/"Dải phim"/"Collage" đã nhắc ở file Khung

File `content-spec-khung.md` (nhóm Khung) có nhắc tới 3 hiệu ứng thấy TRONG ảnh chụp nhóm Khung
nhưng đã được CHUYỂN QUA đây vì bản chất là "Lưới" không phải "Khung": "Lưới ảnh lặp" (1 ảnh được
lặp lại nhiều lần trong các ô nhỏ xếp bàn cờ — kỹ thuật: N `ImageItem` cùng dùng CHUNG 1
`src`, đặt cạnh nhau trong 1 preset tĩnh — không có gì đặc biệt hơn `Lưới` thông thường ngoại trừ
tất cả ô CÙNG DÙNG 1 ẢNH thay vì mỗi ô 1 ảnh khác), "Dải phim chia nhiều băng" (ảnh gốc bị CHIA
thành N dải dọc có viền đen ngăn cách, giống phim nhựa — về bản chất là N `ImageItem` xếp cạnh
nhau, mỗi item hiện 1 PHẦN của CÙNG 1 ảnh gốc thông qua kỹ thuật crop `background-position` lệch
nhau, một biến thể phức tạp hơn "lưới ảnh lặp" vì cần TÍNH TOÁN VỊ TRÍ CROP cho từng dải sao cho
khi ghép lại đúng là ảnh gốc liên tục, không phải việc đơn giản), "Collage nhiều ô không đều kèm
1 ô màu đặc" (chính là "Pro Galleries" đã mô tả kỹ ở trên, chỉ là xuất hiện lại trong ảnh chụp
Khung vì Canva xếp gần nhau trong trải nghiệm duyệt tổng thể).

## Tổng kết cách tổ chức panel "Lưới" ở sky-app, kèm mức ưu tiên triển khai

Sắp theo mức ưu tiên GIẢM DẦN:

1. **Lưới đều (map với "Grid Galleries")** — MỞ RỘNG số lượng preset hiện có của GĐ17 (2×2, 2×3,
   3×2, 3×3, 1 hàng ngang N ô, 1 cột dọc N ô) — không cần kỹ thuật mới, chỉ cần viết thêm nhiều
   entry vào `GRID_PRESETS`.
2. **Lưới không đều (map với "Pro Galleries")** — mở rộng thêm nhiều biến thể "1 ô lớn + nhiều ô
   nhỏ lệch" ngoài preset hiện có, ĐỔI CÁCH HIỆN PREVIEW sang dùng ảnh mẫu thật cố định (1-2 tấm)
   thay khối màu xám trừu tượng, để người dùng thấy đẹp ngay khi nhìn panel.
3. **Chồng ảnh xoay ngẫu nhiên (map với Slider Kiểu 6)** — dùng field `rotation` có sẵn, thêm 1-2
   preset mới, độ khó THẤP, giá trị thẩm mỹ cao (phong cách scrapbook/kỷ niệm rất hợp ceremony).
4. **Dải ảnh khung tròn hàng ngang + Thẻ chữ-ảnh kết hợp (map với Slider Kiểu 2, 5)** — preset
   tĩnh kết hợp field đã có (`shape:'circle'` + lưới, hoặc `ShapeItem` nền + `TextItem` + ảnh) —
   độ khó THẤP.
5. **Mosaic hình thoi/tam giác (map với Slider Kiểu 3, 4)** — thuần CSS `transform`/`clip-path`
   phức tạp hơn, độ ưu tiên TRUNG BÌNH, làm khi 4 mục trên đã ổn định.
6. **Slideshow tự động đổi ảnh theo thời gian (map với Slider Kiểu 1, đã BỎ tương tác click)** —
   ĐÂY LÀ HẠNG MỤC KIẾN TRÚC RIÊNG, cần 1 LayoutItem type mới (hoặc mở rộng GalleryItem thêm mode
   "slideshow" bên cạnh mode "lưới tĩnh" đã có) với logic runtime chạy timer đổi ảnh — KHÔNG làm
   chung batch với các preset tĩnh khác của GĐ17, cần bàn riêng về thiết kế trước khi code (VD:
   timer chạy trong Canvas editor để preview có cần thấy animation không, hay chỉ chạy lúc trình
   chiếu thật; đồng bộ timer giữa nhiều màn hình LED nếu ceremony dùng nhiều màn cùng lúc chạy
   cùng 1 slideshow có cần khớp khung hình không).
7. **Lưới ảnh lặp, Dải phim chia băng** (nhắc lại từ file Khung) — độ ưu tiên THẤP, giá trị trang
   trí thuần, không phục vụ nội dung ceremony thực tế rõ ràng.

## Checklist kỹ thuật cần làm

- [ ] Mở rộng `GRID_PRESETS` (Lưới đều = "Grid Galleries") — thêm 2×2, 2×3, 3×2, 3×3, hàng ngang
      N ô, cột dọc N ô — không cần kỹ thuật mới, chỉ thêm entry
- [ ] Mở rộng preset "Lưới không đều" (= "Pro Galleries") — thêm nhiều biến thể "1 ô lớn + nhiều
      ô nhỏ lệch" ngoài preset hiện có
- [ ] Đổi cách hiện preview `GridPresetsPanel.tsx` — dùng 1-2 ẢNH MẪU THẬT cố định thay khối màu
      xám trừu tượng hiện tại — **CẦN Sonth cung cấp 1-2 ảnh phong cảnh/mẫu trung tính** dùng
      chung cho mọi tile preview
- [ ] Preset "chồng ảnh xoay ngẫu nhiên" (= Slider Kiểu 6) — dùng field `rotation` có sẵn trong
      `Box`, KHÔNG cần field mới — 4-6 ảnh đặt chồng lấp vị trí + góc xoay nhẹ khác nhau tính sẵn
      (VD -8°, 5°, -3°, 10°) — độ khó THẤP, làm SỚM
- [ ] Preset "dải ảnh khung tròn hàng ngang" (= Slider Kiểu 2) — kết hợp `shape:'circle'` (có sẵn)
      + nhiều `ImageItem` xếp hàng ngang — độ khó THẤP
- [ ] Preset "thẻ chữ + ảnh kết hợp" (= Slider Kiểu 5) — `ShapeItem` nền màu + `TextItem` +
      `ImageItem` đặt cạnh nhau trong 1 preset — độ khó THẤP
- [ ] Backlog: mosaic hình thoi (= Slider Kiểu 3) — CSS `transform: rotate(45deg)` container +
      `rotate(-45deg)` từng ảnh con để xoay ngược lại đúng chiều — độ khó TRUNG BÌNH
- [ ] Backlog: mosaic tam giác (= Slider Kiểu 4) — `clip-path` polygon tam giác, nhiều ô LỒNG VÀO
      NHAU (2 tam giác úp ngược lấp đầy 1 hình vuông) — độ khó TRUNG BÌNH
- [ ] **QUYẾT ĐỊNH KIẾN TRÚC RIÊNG — chưa code ngay**: Slideshow tự động đổi ảnh theo thời gian
      (= Slider Kiểu 1, đã bỏ tương tác click) — cần 1 LayoutItem type mới HOẶC mở rộng
      `GalleryItem` (GĐ14.6, nếu đã làm) thêm mode `'slideshow'` bên cạnh mode lưới tĩnh, với
      logic runtime chạy timer đổi ảnh — cần bàn riêng TRƯỚC khi code: (1) timer có chạy trong
      Canvas editor lúc thiết kế hay chỉ chạy lúc trình chiếu thật; (2) đồng bộ timer giữa nhiều
      màn hình LED nếu ceremony dùng nhiều màn cùng lúc có cần khớp khung hình không
- [x] Quyết định KHÔNG làm "Recommended"/"More Galleries" thành mục riêng — chỉ là tuyển chọn/
      catch-all, không phải loại bố cục có bản chất kỹ thuật riêng
- [x] Xác nhận "Lưới ảnh lặp"/"Dải phim chia băng" (nhắc từ file Khung) — độ ưu tiên THẤP, để
      backlog xa, không chặn các mục trên
