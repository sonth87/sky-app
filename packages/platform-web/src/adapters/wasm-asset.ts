import type { AssetPort, AssetQuery, AssetListResult, Asset } from '@sky-app/service-contracts';
import { saveAssetBlob, loadAssetBlob, saveAssetMeta, listAssetMeta, deleteAssetBlob, deleteAssetMeta } from '../asset-blob-store.js';

/** Mở `<input type="file">` ẩn — đối xứng adapters/asset.ts's pickFile (Web HTTP adapter),
 * trùng lặp có chủ đích: 2 adapter độc lập, không tạo phụ thuộc chéo chỉ vì 1 hàm nhỏ. */
function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.style.display = 'none';

    let resolved = false;
    const cleanup = () => {
      window.removeEventListener('focus', onFocus);
      input.remove();
    };
    const onFocus = () => {
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(null);
        }
      }, 300);
    };

    input.onchange = () => {
      resolved = true;
      cleanup();
      resolve(input.files?.[0] ?? null);
    };
    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    input.click();
  });
}

const objectUrlCache = new Map<string, string>();

/**
 * AssetPort chạy hoàn toàn trong trình duyệt (IndexedDB blob) — dùng khi `data-service` không
 * khả dụng, đối xứng adapters/sqlite-wasm-data.ts. `relativePath` trả về là "key blob" (KHÔNG
 * phải path file — file 06 "Ảnh nền & asset"), object URL tạo lúc resolve và CACHE lại (revoke
 * object URL cũ liên tục sẽ làm ảnh đang hiển thị mất nguồn giữa chừng).
 */
export function createWasmAssetPort(): AssetPort {
  return {
    async pickAndSaveImage() {
      const file = await pickFile();
      if (!file) return null;
      const key = `blob:${crypto.randomUUID()}`;
      await saveAssetBlob(key, file);
      // Metadata (Bước 11 kế hoạch resize/rotate, 2026-07-18 — Media Library) — object store PHỤ,
      // KHÔNG ảnh hưởng blob store hiện có (out of scope: "không bao giờ revoke object URL" giữ
      // nguyên, xem objectUrlCache bên dưới, đây là trade-off có chủ đích, không phải bug).
      await saveAssetMeta({ relativePath: key, name: file.name, sizeBytes: file.size, uploadedAt: new Date().toISOString() });
      return { relativePath: key };
    },

    async resolveAssetUrl(relativePath) {
      const cached = objectUrlCache.get(relativePath);
      if (cached) return cached;

      const blob = await loadAssetBlob(relativePath);
      if (!blob) return '';
      const url = URL.createObjectURL(blob);
      objectUrlCache.set(relativePath, url);
      return url;
    },

    async listAssets() {
      return listAssetMeta();
    },

    async deleteAsset(relativePath) {
      // Delete both blob and metadata from IndexedDB
      await deleteAssetBlob(relativePath);
      await deleteAssetMeta(relativePath);
      // Revoke cached object URL if exists (WASM adapter caches object URLs)
      const cached = objectUrlCache.get(relativePath);
      if (cached) {
        URL.revokeObjectURL(cached);
        objectUrlCache.delete(relativePath);
      }
    },

    async saveImageBlob(file: Blob, filename: string) {
      const key = `blob:${crypto.randomUUID()}`;
      await saveAssetBlob(key, file);
      await saveAssetMeta({ relativePath: key, name: filename, sizeBytes: file.size, uploadedAt: new Date().toISOString() });
      return { relativePath: key };
    },

    async queryAssets(query: AssetQuery): Promise<AssetListResult> {
      const assets = await this.listAssets?.();
      if (!assets) return { assets: [], total: 0, page: 1, pageSize: 0 };

      let filtered = assets;
      if (query.search) {
        filtered = filtered.filter(a => a.name.toLowerCase().includes(query.search!.toLowerCase()));
      }

      const total = filtered.length;
      const page = query.page || 1;
      const pageSize = query.pageSize || 20;
      const start = (page - 1) * pageSize;

      return {
        assets: filtered.slice(start, start + pageSize).map(a => ({
          id: a.relativePath,
          type: 'image' as const,
          name: a.name,
          relativePath: a.relativePath,
          size: a.sizeBytes,
          uploadedAt: a.uploadedAt,
          source: 'local' as const,
        })),
        total,
        page,
        pageSize,
      };
    },

    async addAssetFromUrl(url: string): Promise<Asset> {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch URL: ${response.status}`);

      const blob = await response.blob();
      const filename = url.split('/').pop() || 'downloaded-image';

      const result = await this.saveImageBlob?.(blob, filename);
      if (!result) throw new Error('Failed to save image from URL');

      return {
        id: result.relativePath,
        type: 'image' as const,
        name: filename,
        relativePath: result.relativePath,
        source: 'url' as const,
      };
    },
  };
}
