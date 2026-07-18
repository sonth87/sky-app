import type { AssetPort } from '@sky-app/service-contracts';
import '../bridge-types.js';

/**
 * Electron AssetPort — routes to main process (apps/shell-electron/electron/ipc.ts's
 * kernel:layoutAsset:* channels). Ảnh copy vào ceremony-data/assets/layout/, resolve qua
 * protocol ceremony-asset:// đã đăng ký sẵn.
 */
export function createElectronAssetPort(): AssetPort {
  return {
    async pickAndSaveImage() {
      return (await window.sky.invoke('kernel:layoutAsset:pick')) as Awaited<ReturnType<AssetPort['pickAndSaveImage']>>;
    },
    async resolveAssetUrl(relativePath) {
      return (await window.sky.invoke('kernel:layoutAsset:resolve', relativePath)) as string;
    },
  };
}
