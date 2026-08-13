# 15 — Import / Export

> Yêu cầu mới, phát sinh từ quyết định #16 (2026-07-15, xem [14](14-rasoat-2026-07-15.md)):
> hệ thống KHÔNG tự động bảo vệ người dùng khỏi thiếu chuẩn bị (không validate chặn, không
> cơ chế tự động ghi `consumedIds`...) — thay vào đó **người dùng tự chịu trách nhiệm chuẩn
> bị trước**, và hệ thống hỗ trợ bằng khả năng import/export đầy đủ để họ tự kiểm tra, tự sao
> lưu, tự đối chiếu trước khi chạy lễ thật.
>
> ⚠️ **Bổ sung 2026-07-16:** (1) Import DATA (DataSource) có yêu cầu riêng chi tiết hơn — **modal
> import với diff git + màn kết quả + khóa tự nhiên**, tách thành [22](22-import-modal.md). File
> 15 này tập trung Export/Import **layout + Event bundle** (di chuyển giữa máy/môi trường). (2)
> Export bundle chứa PII (SĐT/CCCD) — xem cảnh báo §"Bảo mật" cuối file.

## Vì sao cần — nối lại với các quyết định "bỏ tự động" trước đó

Ba quyết định ở lượt trao đổi 2026-07-15 đều đi theo cùng 1 triết lý: **không dựng cơ chế tự
động/bảo vệ ngầm, đổi lại cho người dùng công cụ để tự chủ động**:

| Quyết định | Bỏ cái gì (tự động) | Đổi lại cần gì (chủ động) |
|---|---|---|
| A9 (file 08) | Chuyển Event active tự động theo lịch | Người dùng tự bấm kích hoạt |
| #15 (file 14) | Tự động ghi `consumedIds` khi "trao xong" | Người dùng tự mở, tự đánh dấu |
| #16 (file 14) | Validate chặn "phải có layoutRef mặc định" | Người dùng tự kiểm tra trước khi chạy |

→ **Import/Export chính là công cụ hiện thực hoá "tự chủ động"** — không có nó, các quyết
định "bỏ tự động" ở trên sẽ biến thành lỗ hổng thật (người dùng không có cách nào để tự kiểm
tra/chuẩn bị). Đây không phải tính năng phụ, mà là điều kiện cần để những quyết định kia an toàn.

## Hai loại export khác nhau — không gộp chung

### Loại 1 — layout-designer: export/import `LayoutDocument`

Đã có sẵn khái niệm này từ đầu (layout lưu qua `LayoutStore`, xem file 06) — phần MỚI ở đây là
**đóng gói thành file di chuyển được** (không chỉ lưu nội bộ store):

```ts
// Export: 1 hoặc nhiều LayoutDocument → 1 file JSON tự chứa (kèm asset)
interface LayoutExportBundle {
  version: number;
  exportedAt: string;
  layouts: LayoutDocument[];
  // Asset (ảnh nền, ring...) đóng gói cùng — base64 hoặc đường dẫn tương đối trong .zip
  assets: Record<string /* relative path */, string /* base64 hoặc giữ path nếu export dạng thư mục */>;
}
```

- **Export:** từ Layout Library (file 12) — chọn 1/nhiều layout → xuất file `.json` (kèm ảnh
  base64 nếu đơn giản) hoặc `.zip` (nếu ảnh nhiều, tránh JSON quá nặng).
- **Import:** kéo thả file vào Layout Library → validate schema version → thêm vào
  `LayoutStore` (trùng `id` thì hỏi "ghi đè hay giữ cả 2 — đổi id bản mới").
- **Dùng để:** sao lưu, chuyển layout giữa các máy/môi trường (dev → máy chạy lễ thật), chia
  sẻ layout giữa các trường/đơn vị dùng chung app.

### Loại 2 — ceremony/control: export thông tin vận hành (Event + variable + data)

Đây là phần Sonth nhấn mạnh: *"từ ceremony có thể export cả thông tin liên quan đến variable,
layout."* Khác Loại 1 ở chỗ đây là **export theo góc nhìn 1 đợt lễ cụ thể**, không phải theo
góc nhìn "1 layout đứng riêng":

```ts
interface EventExportBundle {
  version: number;
  exportedAt: string;
  event: EventDocument;              // gồm layoutRefs (có selector), customVariables, consumedIds
  // Layout ĐƯỢC THAM CHIẾU bởi event này — đóng gói kèm để file export tự chứa, không phụ
  // thuộc LayoutStore của máy đích còn giữ đúng layout hay không
  referencedLayouts: LayoutDocument[];
  dataSource?: DataSource;            // optional — có thể export riêng data, không kèm Event
  mappingProfile?: FieldMappingProfile;
}
```

- **Export:** từ màn hình quản lý Event trong `control/` — 1 nút "Xuất đợt lễ này" → gồm đủ
  Event + layout liên quan + data + mapping profile, thành 1 file tự chứa.
- **Import:** vào `control/` của 1 máy/môi trường khác → nạp lại đầy đủ, layout tham chiếu
  được **tự động thêm vào LayoutStore nếu chưa có** (không bắt phải import Loại 1 riêng trước).
- **Dùng để:** sao lưu trước khi chạy lễ thật (đúng tinh thần #16 — tự chuẩn bị), chuyển đợt
  lễ đã soạn từ máy dev sang máy trình chiếu thật, hoặc archive sau khi lễ kết thúc.

### Export riêng lẻ nhỏ hơn — cho việc kiểm tra nhanh

Không phải lúc nào cũng cần export cả Event. Vài export nhỏ, độc lập, phục vụ đúng nhu cầu
"tự kiểm tra trước khi chạy":

- **Export danh sách biến đang dùng của 1 Event** (`customVariables` + biến Global đã tham
  chiếu trong các layout gán vào Event đó) → dạng bảng CSV/JSON dễ đọc, để người vận hành đối
  chiếu bằng mắt "đủ chưa, đúng chưa" trước khi chạy — đúng nhu cầu "export thông tin liên
  quan đến variable" Sonth nêu.
- **Export `consumedIds` hiện tại của 1 DataSource** (gộp từ mọi Event từng dùng) → để người
  vận hành tự kiểm tra "còn bao nhiêu người chưa trao" trước khi mở đợt tiếp theo — thay thế
  đúng phần việc mà cơ chế tự động (đã bị bỏ ở #15) từng định làm, giờ chuyển thành thao tác
  chủ động: xem trước, tự sửa tay nếu cần (VD sửa nhầm, thêm/bớt thủ công).

## Ai làm import/export — đặt đúng chỗ theo ranh giới đã chốt

| Import/Export | Đặt ở | Vì sao |
|---|---|---|
| `LayoutDocument` (Loại 1) | `modules/layout-designer`, trong Layout Library (file 12) | Layout Library đã là nơi liệt kê/duyệt layout — thêm nút xuất/nhập vào đúng chỗ đã có |
| `EventDocument` + liên quan (Loại 2) | `modules/ceremony/src/control/` | Đúng khu vực quản trị đã chốt cho Event (file 13 §A8) |
| Export biến/consumedIds riêng lẻ | `modules/ceremony/src/control/`, gắn cạnh màn hình chi tiết Event | Thao tác kiểm tra nhanh, không cần rời màn hình đang soạn Event |

## Định dạng file — chọn gì

- **`.json`** cho trường hợp không có/ít ảnh nhị phân (VD chỉ export `EventDocument` +
  `customVariables`, không kèm layout có ảnh nặng).
- **`.zip`** (chứa `manifest.json` + thư mục `assets/`) khi export kèm `LayoutDocument` có
  ảnh nền/ring — tránh JSON phình to vì base64. Cấu trúc zip mirror cách `resolveAsset` đã
  hoạt động (đường dẫn tương đối), nên import lại không cần convert gì thêm.
- KHÔNG dùng định dạng riêng/nhị phân tuỳ biến — giữ JSON/zip để người dùng (kể cả không rành
  kỹ thuật, theo A6) có thể mở xem bằng công cụ thông thường nếu cần đối chiếu thủ công.

## Việc cần cập nhật ở các file khác (checklist đồng bộ)

- [ ] [06-luu-tru-va-giao-tiep.md](06-luu-tru-va-giao-tiep.md): `LayoutStore` interface nên có
      thêm `exportBundle(ids)` / `importBundle(bundle)`, không chỉ CRUD đơn lẻ.
- [ ] [10-quan-ly-dot-le-event.md](10-quan-ly-dot-le-event.md): `EventStore` interface tương tự
      cần `exportBundle(id)` / `importBundle(bundle)`.
- [ ] [12-thu-vien-layout.md](12-thu-vien-layout.md): thêm nút Export/Import vào UI Layout
      Library đã phác thảo (cạnh nút "Sao chép variant").
- [ ] [13-ceremony-mo-rong.md](13-ceremony-mo-rong.md): thêm bước Export/Import vào luồng
      "Trách nhiệm 1-2" (quản lý Event, active/switch) — đây là công cụ hỗ trợ trực tiếp #16.

## Bảo mật — Export bundle chứa PII (ghi thành văn, 2026-07-16)

`EventExportBundle` (và export DataSource) chứa **dữ liệu cá nhân**: họ tên, SĐT, CCCD/số định
danh của người tham dự — dạng file `.json`/`.zip` **không mã hóa**, di chuyển qua USB/email/máy
khác. Chấp nhận được cho công cụ offline nội bộ, nhưng:
- File 15 (và UI export) nên có **1 dòng cảnh báo** khi export kèm data: "File này chứa thông
  tin cá nhân — bảo quản/xóa sau khi dùng đúng quy định của đơn vị."
- Cân nhắc **tùy chọn "export không kèm cột nhạy cảm"** (bỏ SĐT/CCCD, chỉ giữ tên + thứ tự +
  ảnh) khi mục đích export chỉ để backup layout/cấu trúc, không cần data cá nhân đầy đủ.
- Khi có Supabase (giai đoạn cuối): dữ liệu PII lên cloud phải theo tenant RLS + cân nhắc mã
  hóa — ghi nhận cho giai đoạn đó, không phải việc bây giờ.

## Câu hỏi mở

- Export có cần **versioning/diff** không (VD so sánh 2 lần export để biết thay đổi gì) — hay
  chỉ cần "toàn bộ trạng thái tại thời điểm export" là đủ cho nhu cầu sao lưu/chuyển máy?
  Đề xuất: chưa cần, quá phức tạp so với nhu cầu hiện tại (sao lưu + chuyển máy, không phải
  version control).
- Import khi trùng `id` (layout hoặc Event đã tồn tại) — chốt hành vi cụ thể: hỏi người dùng
  mỗi lần, hay có tuỳ chọn "luôn ghi đè"/"luôn giữ cả 2" đặt trước?
- Export `consumedIds` — có cần cho phép **sửa tay** ngay trong file export rồi import lại
  (như 1 cách "sửa lỗi thủ công" nếu đánh dấu nhầm) hay chỉ export để xem, sửa phải qua UI?
