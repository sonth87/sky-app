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
export interface AssetPort {
  /** Mở file picker, copy/upload ảnh đã chọn, trả về relativePath để lưu vào LayoutItem/Background.
   * `null` nếu user huỷ chọn file. */
  pickAndSaveImage(): Promise<{ relativePath: string } | null>;
  /** Chuyển `relativePath` (đã lưu trong layout) thành URL hiển thị được (`<img src>`). */
  resolveAssetUrl(relativePath: string): Promise<string>;
}
