// Schema LayoutDocument — theo docs/roadmap/plans/layout-designer/04-schema-layout-document.md
// (đã chốt: px trên canvas chuẩn refW×refH + scale-to-fit, token @var mở, LoopItem cho trao
// giải tập thể) + 11-canonical-da-loai-va-loop.md (LoopItem, CanonicalSubject/Group) +
// 21-layout-versioning.md (LayoutContent tách khỏi metadata version).

// ─── Tỷ lệ màn hình ──────────────────────────────────────────────
// Không đóng cứng union — cho phép preset + custom (YC6)
export interface AspectRatio {
  id: string; // "16:9", "21:9", "25:9", "4:3", hoặc "custom:1920x720"
  w: number; // 16
  h: number; // 9
  label?: string; // "Ultrawide 21:9"
}

// ─── Toạ độ + kích thước, THEO PX TRÊN CANVAS CHUẨN CỦA VARIANT ──
// Đơn vị là px "thiết kế" trên refW×refH của variant chứa item này, KHÔNG phải px màn hình
// thật. Render nhân với scaleX/scaleY = realW/refW, realH/refH (xem computeScale trong
// renderer.tsx) — 2 scale RIÊNG BIỆT (không phải min chung) để hỗ trợ stretch khi lệch tỷ lệ.
export interface Box {
  x: number; // px trên canvas chuẩn
  y: number; // px trên canvas chuẩn
  w: number; // px trên canvas chuẩn
  h: number; // px trên canvas chuẩn
  rotation?: number; // độ, mặc định 0
  z?: number; // z-index (thứ tự lớp)
}

export interface TextShadow {
  color?: string;
  blur?: number; // px trên canvas chuẩn
  offsetX?: number;
  offsetY?: number;
}

/** 3 nhóm field LỚN dùng cho per-field-group dirty tracking khi copy/đồng bộ item giữa các
 * variant (xem `sync.ts` ở layout-editor-core) — KHÔNG chia nhỏ hơn (VD sửa riêng `box.x` thì
 * CẢ CỤM 'box' ngừng nhận auto-sync, không chỉ riêng x) — đúng quyết định 2026-07-18: "nếu đã
 * thay đổi box thì riêng box không nên sync tự động nữa". */
export type SyncFieldGroup = 'box' | 'content' | 'style';

interface BaseItem {
  id: string;
  box: Box;
  opacity?: number; // 0..100
  locked?: boolean; // khoá không cho di chuyển trong editor
  name?: string; // nhãn hiện ở panel Layers

  // ─── Đồng bộ item copy giữa các variant (12-thu-vien-layout.md mở rộng 2026-07-18) ──────────
  /** Khoá đồng bộ ổn định, sinh 1 LẦN DUY NHẤT lúc item được TẠO MỚI (xem addItemCommand ở
   * layout-editor-core), KHÔNG đổi theo vòng đời item — KHÁC `id` (định danh kỹ thuật). Là
   * "danh tính nội dung" để item COPY tìm lại item GỐC nó bắt nguồn. */
  syncKey?: string;
  /** Trỏ `syncKey` của item NGUỒN TRỰC TIẾP mà item này được copy ra — CHỈ CÓ ở item COPY (item
   * gốc chưa từng bị copy thì không có field này). Quan hệ CHA-CON TRỰC TIẾP: B copy từ A thì
   * B.syncRef=A.syncKey; C copy tiếp từ B thì C.syncRef=B.syncKey (KHÔNG PHẢI A.syncKey) —
   * không flatten về gốc tối thượng, giống mô hình "git parent-commit". */
  syncRef?: string;
  /** Nhóm field mà item COPY này đã bị user tự sửa tay — nhóm nào có mặt ở đây thì auto-sync
   * KHÔNG còn ghi đè nhóm đó nữa. Chỉ có ý nghĩa khi có `syncRef`. */
  syncOverrides?: SyncFieldGroup[];
  /** true = TÁCH HẲN khỏi item cha — không còn nhận auto-sync cho BẤT KỲ field nào, kể cả field
   * chưa từng sửa tay. Không xoá `syncRef`/`syncKey` (giữ để biết lịch sử xuất xứ). */
  syncLocked?: boolean;
}

export interface TextItem extends BaseItem {
  type: 'text';
  content: string; // "Xin chúc mừng @full_name" — token @var mở (xem 09-quy-dinh-variable.md §1)
  fontFamily?: string;
  fontSize: number; // px trên canvas chuẩn — nhân với scale lúc render, như Box
  fontWeight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  vAlign?: 'top' | 'center' | 'bottom';
  italic?: boolean;
  uppercase?: boolean;
  lineHeight?: number;
  shadow?: boolean | TextShadow;
  // Cách xử lý khi text tràn box: co chữ / xuống dòng / cắt
  overflow?: 'shrink' | 'wrap' | 'clip';
}

export interface ImageItem extends BaseItem {
  type: 'image';
  // Nguồn ảnh: hoặc tĩnh (src) hoặc theo biến (varKey → mỗi record 1 ảnh)
  src?: string; // asset path tĩnh
  varKey?: string; // "anh_dai_dien" — bind biến ảnh; ưu tiên hơn src khi có record
  fit?: 'cover' | 'contain';
  shape?: 'rect' | 'round' | 'circle';
  borderW?: number; // px trên canvas chuẩn, nhân scale như mọi kích thước khác
  borderColor?: string;
  ring?: string; // ảnh viền overlay (giữ tính năng "ring" cũ)
  filter?: 'none' | 'bright' | 'gray' | 'warm';
  fallbackText?: string; // hiện khi không có ảnh — "Không có ảnh"
}

export interface ShapeItem extends BaseItem {
  type: 'shape';
  shape: 'rect' | 'circle' | 'triangle' | 'diamond' | 'frame' | 'line';
  fill?: string;
  stroke?: string;
  strokeW?: number;
  radius?: number; // bo góc cho rect
}

export interface RibbonItem extends BaseItem {
  type: 'ribbon';
  content: string; // có thể chứa @var
  bg?: string;
  color?: string;
  fontSize: number; // px trên canvas chuẩn
  fontWeight?: number;
  // ribbon = 1 dạng text đặc biệt có nền cắt góc; có thể coi là TextItem + style
}

/**
 * LoopItem — trao giải tập thể (11-canonical-da-loai-va-loop.md §"Item dạng Loop").
 * Thiết kế 1 khung (itemTemplate) 1 lần, tự lặp lại theo CanonicalGroup.members lúc render.
 * Loop chạy 0 lần (record là cá nhân, hoặc nhóm không có members) → tự ẩn, không lỗi.
 */
export interface LoopItem extends BaseItem {
  type: 'loop';
  // Layout con — CHỈ THIẾT KẾ 1 LẦN, áp dụng lặp lại cho từng phần tử trong members[]
  itemTemplate: LayoutItem[]; // các item con, toạ độ TƯƠNG ĐỐI trong 1 "ô" của loop
  itemBox: { w: number; h: number }; // kích thước 1 "ô" (px trên canvas chuẩn, như Box)

  // Cách dàn nhiều ô trong box tổng của LoopItem
  direction: 'row' | 'column' | 'grid';
  columns?: number; // dùng khi direction='grid'
  gap?: number; // px trên canvas chuẩn, khoảng cách giữa các ô

  // Nguồn danh sách — hiện chỉ có 1 nguồn hợp lệ: CanonicalGroup.members
  source: 'members';

  // Xử lý khi số lượng members VƯỢT quá chỗ chứa — người thiết kế chọn 1 trong 2 chiến lược
  overflow: 'shrink' | 'truncate';
  // 'shrink'  → giữ NGUYÊN toàn bộ members, itemBox tự co (scale xuống, tối thiểu minItemScale)
  //             để nhét vừa hết vào box tổng của LoopItem.
  // 'truncate' → hiện tối đa maxItems ô đầu (theo displayOrder), ô cuối thay bằng overflowMoreText
  maxItems?: number; // chỉ dùng khi overflow='truncate'
  overflowMoreText?: string; // "+@count_more" — @count_more là biến LOCAL tự động
}

// Union LayoutItem — nguồn chân lý DUY NHẤT (không lặp lại ở file khác)
export type LayoutItem = TextItem | ImageItem | ShapeItem | RibbonItem | LoopItem;

export interface Background {
  kind: 'image' | 'color' | 'gradient';
  src?: string; // asset path (kind=image)
  color?: string; // (kind=color)
  gradient?: string; // CSS gradient string (kind=gradient)
}

// ─── Variant: một biến thể theo tỷ lệ ───────────────────────────
export interface LayoutVariant {
  aspect: AspectRatio; // tỷ lệ của variant này
  refW: number; // canvas chuẩn dùng khi thiết kế, VD 1920
  refH: number; // VD 1080 (refW/refH nên khớp aspect.w/aspect.h)
  background?: Background; // ẢNH NỀN RIÊNG cho tỷ lệ này (YC6)
  items: LayoutItem[]; // VỊ TRÍ ITEM RIÊNG cho tỷ lệ này (YC6), toạ độ px trên refW×refH
  safeArea?: Box; // vùng an toàn (viền vàng trong prototype) — optional
}

export interface LayoutVariableRef {
  key: string; // "full_name"
  kind: 'text' | 'image';
  required?: boolean;
}

/**
 * LayoutContent — phần "hình" thật sự của layout, TÁCH KHỎI metadata version (21-layout-
 * versioning.md). Đây là những gì được snapshot mỗi lần publish, và những gì draft đang sửa.
 */
export interface LayoutContent {
  variants: LayoutVariant[]; // nhiều biến thể theo tỷ lệ; PHẢI có ít nhất 1
  variables?: LayoutVariableRef[]; // khai báo biến layout này DÙNG (tài liệu hoá, validate)
  defaultVariantAspectId?: string; // biến thể mặc định khi tỷ lệ màn không khớp cái nào
}

/**
 * LayoutVersion — 1 bản snapshot ĐÃ PUBLISH, bất biến (21-layout-versioning.md §3).
 */
export interface LayoutVersion {
  version: number; // 1, 2, 3...
  content: LayoutContent;
  publishedAt: string;
  note?: string;
}

/**
 * LayoutDocument — 1 layout logic đầy đủ vòng đời (draft + lịch sử version).
 * KHÔNG có field selector/điều kiện chọn (chốt 2026-07-15, xem file 14 §1a) — điều kiện thuộc
 * EventLayoutRef.selector (file 10), không thuộc layout.
 */
export interface LayoutDocument {
  id: string; // "vinh-danh-xuat-sac"
  name: string; // "Vinh danh — Xuất sắc"
  description?: string;
  currentDraft: LayoutContent; // bản đang sửa (chỉ 1), CHƯA công bố
  publishedVersions: LayoutVersion[]; // lịch sử đã publish, mới nhất ở cuối
  createdAt: string;
  updatedAt: string; // lần save draft gần nhất
}

// ─── Map: 1 bộ layout (VD 1 năm) ────────────────────────────────
export type LayoutDocumentMap = Record<string, LayoutDocument>;
