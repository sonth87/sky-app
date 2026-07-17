# 21 — Layout Versioning (publish/draft, lịch sử version, switch, Event↔version)

> Yêu cầu MỚI (2026-07-16, xem [20](20-rasoat-2026-07-16.md) §A1): layout cần **publish/draft**,
> **lịch sử version đầy đủ**, **switch version**, và Event **ghim version đã chọn**. Đây là nền
> tảng cho cả đồng bộ cloud (Supabase — giai đoạn cuối) LẪN dùng offline (switch version không
> cần cloud). Vì cần cho cả 2, versioning làm TRƯỚC Supabase.

## 1. Vì sao cần versioning (2 động lực độc lập)

1. **An toàn khi sửa layout đang được Event dùng** (giải lỗ hổng A4/file 20): designer sửa
   layout sau khi Event đã map biến → nếu runtime tự lấy bản mới nhất, token đổi sẽ hiện rỗng
   âm thầm giữa lễ. Version + ghim giải quyết: Event dùng đúng version đã map, không bị đổi ngầm.
2. **Đồng bộ cloud có kiểm soát** (A1b/file 20): khi kéo layout từ cloud về, cần biết "bản nào
   mới hơn", cần vùng nháp để sửa mà chưa công bố, cần pull thủ công (không tự ghi đè máy local).

## 2. Mô hình publish/draft

```
1 LayoutDocument (id ổn định) có:
  ├─ draft            ← bản đang sửa (chỉ 1), CHƯA công bố. Save nhiều lần vẫn là draft.
  └─ versions[]       ← lịch sử bản ĐÃ PUBLISH (v1, v2, v3...), bất biến sau khi publish

Publish = đóng băng draft hiện tại thành 1 version mới (vN+1), draft tiếp tục sửa từ đó.
```

- **Save ≠ Publish.** Sửa + Save nhiều lần → vẫn cập nhật `draft`, KHÔNG tăng version, KHÔNG ảnh
  hưởng Event nào đang dùng version đã publish.
- **Publish** → snapshot `draft` hiện tại thành version mới (bất biến), tăng số version. Đây là
  lúc "công bố cho Event dùng được".
- **Vùng nháp riêng**: draft là khu vực tách biệt — có thể sửa layout đang được nhiều Event dùng
  mà không đụng gì tới các Event đó (chúng vẫn trỏ version cũ) cho tới khi user chủ động publish
  VÀ Event chủ động update.

## 3. Schema (draft — chốt cụ thể khi code GĐ2)

```ts
export interface LayoutDocument {
  id: string;                    // ổn định qua mọi version
  name: string;
  description?: string;
  currentDraft: LayoutContent;   // bản đang sửa (variants[], variables[]...)
  publishedVersions: LayoutVersion[];  // lịch sử đã publish, mới nhất ở cuối
  latestPublishedVersion?: number;     // = publishedVersions.at(-1)?.version, tiện query
  createdAt: string;
  updatedAt: string;             // lần save draft gần nhất
}

export interface LayoutVersion {
  version: number;               // 1, 2, 3...
  content: LayoutContent;        // SNAPSHOT bất biến của draft lúc publish
  publishedAt: string;
  note?: string;                 // ghi chú thay đổi (optional, user nhập lúc publish)
}

// LayoutContent = phần "hình" thật sự (tách khỏi metadata version) — chính là những gì file 04
// mô tả: variants[], variables[]. Đổi tên gói lại để version hoá được.
export interface LayoutContent {
  variants: LayoutVariant[];
  variables?: LayoutVariableRef[];
  defaultVariantAspectId?: string;
}
```

**Schema SQL (bảng, thêm ở GĐ2):**
```
layout_document   (id, name, description, latest_published_version, created_at, updated_at)
layout_draft      (layout_document_id FK PRIMARY, content_json)          -- 1 draft / layout
layout_version    (layout_document_id FK, version, content_json, published_at, note,
                   PRIMARY KEY(layout_document_id, version))              -- N version / layout
```
`content_json` giữ nguyên cấu trúc `LayoutContent` dạng JSON (variants lồng nhau tự do) — nhất
quán với quyết định "JSON blob cho phần lồng nhau" ở [18](18-luu-tru-sqlite-supabase.md).

## 4. Switch version (offline, không cần cloud)

- Trong editor / Layout Library: xem danh sách version của 1 layout (v1..vN + draft), preview
  từng bản.
- **Khôi phục về version cũ** = copy `content` của version đó thành draft mới (không xóa lịch
  sử — bản khôi phục publish ra sẽ là vN+1 mang nội dung của bản cũ). Không có "xóa version".
- Đây là thao tác thuần local (SQLite), hoạt động không cần Supabase.

## 5. Event ↔ layout version (giải lỗ hổng A4, theo đúng lời Sonth chốt)

`EventLayoutRef` **ghim version cụ thể**, không trỏ "bản mới nhất":

```ts
export interface EventLayoutRef {
  layoutId: string;
  layoutVersion: number;         // MỚI — version ĐÃ CHỌN lúc gán vào Event (ghim cứng)
  selector?: LayoutSelector;
  overrides?: Record<string, Partial<Pick<LayoutVariant, 'background'>>>;
  fieldMap: Record<string, FieldMapSource>;  // map theo token của ĐÚNG version này
}
```

**Luồng khi layout có version mới hơn version Event đang ghim (chốt theo lời Sonth):**

```
1. Event thấy NOTICE "layout X đã có bản mới (v3, Event đang dùng v2)".
2. User chọn:
   ├─ Update  → hệ thống CHECK các token của v3 vs fieldMap hiện tại:
   │             ├─ khớp hết (token không đổi)      → cập nhật layoutVersion = 3, xong.
   │             └─ CHƯA khớp/thiếu (token đổi/thêm) → thông báo "layout mới có token chưa gán
   │                nguồn" + HỎI "muốn sang màn map biến không?"
   │                   ├─ Có   → mở màn Ghép biến (Bước 4 wizard) với v3
   │                   └─ Không → chỉ update layoutVersion (token mới sẽ hiện rỗng, fail-soft)
   └─ Không update → bỏ qua, Event giữ v2 nguyên vẹn.
```

- **KHÔNG có tự động đổi version giữa lễ** — mọi thay đổi version của Event đều do user chủ động
  bấm Update. Đúng triết lý "không tự động" xuyên suốt.
- Runtime luôn load `LayoutVersion` đúng theo `EventLayoutRef.layoutVersion` (không load draft,
  không load latest) → lễ đang chạy tuyệt đối ổn định dù designer đang sửa layout đó.

## 6. Quan hệ với đồng bộ cloud (Supabase — giai đoạn cuối)

Khi có Supabase, version chính là đơn vị đồng bộ:
- Layout đã kéo từ cloud có **id đồng bộ** app↔cloud. Cloud có version mới → app hiện **notice
  "có bản cập nhật"**, KHÔNG tự ghi đè. User **tự pull** (Electron: thủ công).
- `publishedVersions` đồng bộ được (bất biến, an toàn merge); `currentDraft` là **cục bộ máy**
  (không đồng bộ, hoặc đồng bộ riêng theo user — chốt ở giai đoạn Supabase).
- Vì versioning làm TRƯỚC Supabase, phần cloud chỉ cần thêm tầng đồng bộ lên trên mô hình version
  đã có — không phải thiết kế lại.

## 7. Phạm vi triển khai (đưa vào plan)

- **GĐ1 (schema):** `LayoutContent` tách khỏi metadata (để version hoá được) — thiết kế type
  ngay từ đầu, dù GĐ1 chưa làm UI version.
- **GĐ2 (editor):** bảng SQL `layout_document`/`layout_draft`/`layout_version`; nút Publish;
  danh sách version + preview + khôi phục; vùng draft tách biệt. `LayoutStore` thêm
  `saveDraft`/`publish`/`listVersions`/`getVersion`/`restoreVersion`.
- **GĐ3/4:** `EventLayoutRef.layoutVersion` (ghim); notice + luồng update ở §5.
- **Giai đoạn cuối (Supabase):** tầng đồng bộ version + pull thủ công + notice bản mới.

## 8. Câu hỏi mở
- Giới hạn số version giữ lại? (đề xuất: không giới hạn cứng, layout nhỏ; có nút "dọn version cũ"
  thủ công nếu cần — không tự xóa).
- Draft có cần auto-save định kỳ (tránh mất khi crash) hay chỉ save khi user bấm? (đề xuất:
  auto-save draft debounce, vì draft là vùng an toàn không ảnh hưởng Event).
