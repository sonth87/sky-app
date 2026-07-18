import type { AssetPort } from '@sky-app/service-contracts';
import { saveAssetBlob, loadAssetBlob } from '../asset-blob-store.js';

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
  };
}
