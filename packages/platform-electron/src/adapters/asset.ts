import type { AssetMeta, AssetPort } from '@sky-app/service-contracts';
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
  };
}
