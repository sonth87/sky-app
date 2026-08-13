/**
 * AssetPort — chọn + lưu ảnh cho layout-designer, 3 tầng lưu trữ (docs/roadmap/plans/
 * layout-designer/06-luu-tru-va-giao-tiep.md §"Ảnh nền & asset"):
 *   Electron        → file trong ceremony-data/assets/, path tương đối
 *   Web+data-service → upload lưu cạnh .db server, path tương đối
 *   Web WASM (fallback) → blob trong IndexedDB, "key blob" (KHÔNG phải path file)
 *
 * `relativePath` trả về từ `pickAndSaveImage` là giá trị LƯU THẲNG vào LayoutItem.src/
 * Background.src — không phải URL hiển thị được ngay (WASM: key blob, không phải path).
 * Muốn hiển thị (VD trong <img src>), PHẢI qua `resolveAssetUrl` — 2 việc tách biệt vì
 * WASM cần tạo object URL (bất đồng bộ, cần giải phóng sau khi dùng qua revoke), khác hẳn
 * Electron/data-service chỉ cần build URL đồng bộ từ path.
 */
/** Metadata 1 ảnh đã lưu qua `pickAndSaveImage` — dùng bởi Media Library (Bước 11 kế hoạch
 * resize/rotate, 2026-07-18) để hiện lưới ảnh đã có, không cần mở file picker lại mỗi lần.
 * `relativePath` khớp giá trị dùng trong `LayoutItem.src`/`Background.src`. */
export interface AssetMeta {
  relativePath: string;
  name: string;
  sizeBytes: number;
  /** ISO 8601 string. */
  uploadedAt: string;
}

export type AssetType = 'image' | 'video' | 'font' | 'file' | 'icon';

/** Full Asset with metadata — GĐ14.5 mở rộng */
export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  relativePath: string; /** Giống AssetMeta.relativePath — lưu trong LayoutItem.src */
  size?: number;
  dimensions?: { width: number; height: number };
  mimeType?: string;
  uploadedAt?: string;
  tags?: string[];
  source: 'local' | 'url' | string;
}

export interface AssetQuery {
  type?: AssetType;
  search?: string;
  tags?: string[];
  page?: number;
  pageSize?: number;
}

export interface AssetListResult {
  assets: Asset[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AssetPort {
  /** Mở file picker, copy/upload ảnh đã chọn, trả về relativePath để lưu vào LayoutItem/Background.
   * `null` nếu user huỷ chọn file. */
  pickAndSaveImage(): Promise<{ relativePath: string } | null>;
  /** Chuyển `relativePath` (đã lưu trong layout) thành URL hiển thị được (`<img src>`). */
  resolveAssetUrl(relativePath: string): Promise<string>;
  /** Danh sách ảnh đã lưu qua `pickAndSaveImage`, mới nhất trước (Media Library, Bước 11).
   * Ảnh upload TRƯỚC khi tính năng này tồn tại KHÔNG bắt buộc xuất hiện (không backfill/quét
   * file mồ côi — giới hạn đã ghi trong plan). */
  listAssets(): Promise<AssetMeta[]>;
  /** Xoá 1 ảnh khỏi thư viện (optional, not all platforms may support deletion).
   * Chỉ xoá record metadata, file vật lý được GC sau (Electron) hoặc không bị xoá hẳn (Web).
   * Không ảnh hưởng layout đã dùng ảnh này — layout sẽ fallback fallbackText nếu ảnh mất. */
  deleteAsset?(relativePath: string): Promise<void>;
  /** Lưu Blob (từ drag-drop/file input) thành ảnh, trả về relativePath. Dùng bởi Media Library
   * upload tab. (optional, Media Library modal không visible nếu không có). */
  saveImageBlob?(file: Blob, filename: string): Promise<{ relativePath: string }>;

  /** GĐ14.5 — query assets với filter + pagination (thay thế listAssets).
   * Adapter có thể mặc định trả toàn bộ client-side, pagination chỉ implement khi cần thật. */
  queryAssets?(query: AssetQuery): Promise<AssetListResult>;

  /** GĐ14.5 — thêm asset từ URL ngoài. KHÁC my-builder: TẢI VỀ + LƯU LOCAL ngay vì sky-app
   * offline-first. Trả về Asset đã lưu với relativePath là local, không phải URL gốc. */
  addAssetFromUrl?(url: string): Promise<Asset>;
}
