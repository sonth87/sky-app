import type { WallpaperConfig } from '@sonth87/device-layout';

/**
 * Overrides device-layout's built-in "Pictures" wallpaper set — device-layout
 * itself has 16 (55MB total); sky-app ships a smaller subset to keep this
 * repo's size down (see docs/dev/history.md). Passed via SkyDeviceLayout's
 * wallpapers prop → DeviceLayout → WallpaperCatalogProvider.
 *
 * Path TƯƠNG ĐỐI ('./wallpapers/...') — bắt buộc, không phải style. index.html
 * có thể được load từ dist/ gốc HOẶC userData/renderer-updates/<version>/ (OTA/
 * update-qua-file — xem electron/slide/renderer-updater.ts), 2 thư mục khác
 * nhau. Path tuyệt đối ('/wallpapers/...') bị Chromium resolve theo gốc ổ đĩa
 * (file:///wallpapers/...) khi loadFile() không phải từ dist/ gốc → 404. Path
 * tương đối resolve theo document.baseURI (thư mục chứa index.html đang load)
 * → luôn đúng, vì mọi bản OTA đều zip nguyên dist/ (wallpapers/ luôn cùng cấp
 * index.html — xem scripts/build-renderer-bundle.mjs).
 */
export const WALLPAPERS: WallpaperConfig[] = [
  { id: 'bg-1', name: 'Sequoia Night', kind: 'picture', url: './wallpapers/bg-1.jpg', thumbnail: './wallpapers/bg-1.jpg' },
  { id: 'bg-2', name: 'Deep Space', kind: 'picture', url: './wallpapers/bg-2.jpg', thumbnail: './wallpapers/bg-2.jpg' },
  { id: 'bg-6', name: 'Dusk', kind: 'picture', url: './wallpapers/bg-6.jpg', thumbnail: './wallpapers/bg-6.jpg' },
  { id: 'bg-7', name: 'Midnight', kind: 'picture', url: './wallpapers/bg-7.jpg', thumbnail: './wallpapers/bg-7.jpg' },
  { id: 'bg-8', name: 'Mountain', kind: 'picture', url: './wallpapers/bg-8.jpg', thumbnail: './wallpapers/bg-8.jpg' },
  { id: 'bg-10', name: 'Stars', kind: 'picture', url: './wallpapers/bg-10.jpg', thumbnail: './wallpapers/bg-10.jpg' },
];
