import type { AssetMeta, AssetPort, AssetQuery, AssetListResult, Asset } from '@sky-app/service-contracts';
import '../bridge-types.js';

/**
 * Electron AssetPort — routes to main process (apps/shell-electron/electron/ipc.ts's
 * kernel:layoutAsset:* channels). Ảnh copy vào ceremony-data/assets/layout/, resolve qua
 * protocol ceremony-asset:// đã đăng ký sẵn. `listAssets` (Bước 11 kế hoạch resize/rotate,
 * 2026-07-18) query metadata từ ceremony-db qua channel mới `kernel:layoutAsset:list`.
 */
export function createElectronAssetPort(): AssetPort {
  return {
    async pickAndSaveImage() {
      return (await window.sky.invoke('kernel:layoutAsset:pick')) as Awaited<ReturnType<AssetPort['pickAndSaveImage']>>;
    },
    async resolveAssetUrl(relativePath) {
      return (await window.sky.invoke('kernel:layoutAsset:resolve', relativePath)) as string;
    },
    async listAssets() {
      return (await window.sky.invoke('kernel:layoutAsset:list')) as AssetMeta[];
    },
    async deleteAsset(relativePath) {
      await window.sky.invoke('kernel:layoutAsset:delete', relativePath);
    },
    async saveImageBlob(file, filename) {
      const arrayBuffer = await file.arrayBuffer();
      return (await window.sky.invoke('kernel:layoutAsset:saveBlob', arrayBuffer, filename)) as { relativePath: string };
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
