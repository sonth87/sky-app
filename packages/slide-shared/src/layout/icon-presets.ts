// Icon presets for GraphicsPanel — SVG files resolve via Vite asset URL
// In dev: Vite serves as-is; in build: Vite inlines/emits with hash names

export interface IconPreset {
  url: string;
  label: string;
}

// Placeholder URLs — these will be resolved by Vite at build time
export const ICON_PRESETS: IconPreset[] = [
  { url: new URL('./static-icons/star.svg', import.meta.url).href, label: 'Sao' },
  { url: new URL('./static-icons/heart.svg', import.meta.url).href, label: 'Trái tim' },
  { url: new URL('./static-icons/check.svg', import.meta.url).href, label: 'Kiểm tra' },
  { url: new URL('./static-icons/circle.svg', import.meta.url).href, label: 'Vòng tròn' },
  { url: new URL('./static-icons/arrow.svg', import.meta.url).href, label: 'Mũi tên' },
];
