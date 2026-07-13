import type { WallpaperConfig } from '@sonth87/device-layout';

/**
 * Overrides device-layout's built-in "Pictures" wallpaper set — same subset
 * shipped by shell-electron (apps/shell-electron/src/wallpapers.ts), kept in
 * sync manually. Passed via SkyDeviceLayout's wallpapers prop.
 *
 * Path TUYỆT ĐỐI ('/wallpapers/...') — đúng cho web (Vite serves apps/shell-web/
 * public/ from the site root), khác shell-electron's relative-path requirement
 * (đó là do file:// base URI, không áp dụng ở đây).
 */
export const WALLPAPERS: WallpaperConfig[] = [
  { id: 'bg-1', name: 'Sequoia Night', kind: 'picture', url: '/wallpapers/bg-1.jpg', thumbnail: '/wallpapers/bg-1.jpg' },
  { id: 'bg-2', name: 'Deep Space', kind: 'picture', url: '/wallpapers/bg-2.jpg', thumbnail: '/wallpapers/bg-2.jpg' },
  { id: 'bg-6', name: 'Dusk', kind: 'picture', url: '/wallpapers/bg-6.jpg', thumbnail: '/wallpapers/bg-6.jpg' },
  { id: 'bg-7', name: 'Midnight', kind: 'picture', url: '/wallpapers/bg-7.jpg', thumbnail: '/wallpapers/bg-7.jpg' },
  { id: 'bg-8', name: 'Mountain', kind: 'picture', url: '/wallpapers/bg-8.jpg', thumbnail: '/wallpapers/bg-8.jpg' },
  { id: 'bg-10', name: 'Stars', kind: 'picture', url: '/wallpapers/bg-10.jpg', thumbnail: '/wallpapers/bg-10.jpg' },
];
