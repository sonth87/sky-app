import type { AssetMeta, AssetPort, AssetQuery, AssetListResult, Asset } from '@sky-app/service-contracts';

/** Mở `<input type="file">` ẩn, trả File đã chọn hoặc null nếu huỷ (không có cancel event
 * chuẩn trên input file — dùng timeout dựa trên window focus để phát hiện huỷ chọn). */
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
      // Dialog đóng (chọn hoặc huỷ) → window nhận lại focus. Đợi 1 tick để 'change' (nếu có)
      // kịp bắn trước, rồi coi như huỷ nếu 'change' chưa resolve.
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // "data:image/png;base64,AAAA..." → chỉ lấy phần sau dấu phẩy.
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Web AssetPort — gọi apps/data-service's REST backend (local-dev-only, đối xứng adapters/data.ts). */
export function createWebAssetPort(baseUrl = 'http://localhost:8094'): AssetPort {
  return {
    async pickAndSaveImage() {
      const file = await pickFile();
      if (!file) return null;
      const dataBase64 = await fileToBase64(file);

      const res = await fetch(`${baseUrl}/api/layout-assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, dataBase64 }),
      });
      if (!res.ok) throw new Error(`AssetPort pickAndSaveImage failed: ${res.status}`);
      return res.json();
    },

    async resolveAssetUrl(relativePath) {
      return `${baseUrl}/api/${relativePath}`;
    },

    async listAssets() {
      const res = await fetch(`${baseUrl}/api/layout-assets`);
      if (!res.ok) throw new Error(`AssetPort listAssets failed: ${res.status}`);
      return (await res.json()) as AssetMeta[];
    },

    async deleteAsset(relativePath) {
      const res = await fetch(`${baseUrl}/api/layout-assets/${encodeURIComponent(relativePath)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`AssetPort deleteAsset failed: ${res.status}`);
    },

    async saveImageBlob(file: Blob, filename: string) {
      const dataBase64 = await fileToBase64(file as File);
      const res = await fetch(`${baseUrl}/api/layout-assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, dataBase64 }),
      });
      if (!res.ok) throw new Error(`AssetPort saveImageBlob failed: ${res.status}`);
      return res.json();
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
