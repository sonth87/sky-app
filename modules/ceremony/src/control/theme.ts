import type { AppFont, ShadowLevel, ThemeMode, ThemePalette } from './store';
import { readPersistedState } from './storage-key';

const VALID_PALETTES: ThemePalette[] = [
  'green', 'violet-bloom', 'yellow', 'tangerine', 'summer', 'starry-night',
  'blue', 'red', 'orange', 'rose',
  'modern-minimal', 'clean-slate', 'amber-minimal', 'graphite', 'mono',
  'cosmic-night', 'midnight-bloom', 'caffeine',
  'bubblegum', 'catppuccin',
  'ocean-breeze',
];
const VALID_FONTS: AppFont[] = [
  'system-ui', 'Inter', 'Montserrat', 'Roboto', 'Be Vietnam Pro', 'SF Pro Vietnamese',
  'Playfair Display', 'EB Garamond', 'Lora', 'Crimson Pro', 'Source Serif Pro',
];
const VALID_SHADOW_LEVELS: ShadowLevel[] = ['none', 'soft', 'medium', 'bold'];

// Mỗi font "thân thiện" map sang font-family CSS thật (system-ui giữ nguyên stack mặc định của app).
export const FONT_STACK: Record<AppFont, string> = {
  'system-ui': "system-ui, 'Segoe UI', Roboto, sans-serif",
  Inter: "'Inter', system-ui, sans-serif",
  Montserrat: "'Montserrat', system-ui, sans-serif",
  Roboto: "'Roboto', system-ui, sans-serif",
  'Be Vietnam Pro': "'Be Vietnam Pro', system-ui, sans-serif",
  'SF Pro Vietnamese': "'SF Pro Vietnamese', system-ui, sans-serif",
  'Playfair Display': "'Playfair Display', Georgia, serif",
  'EB Garamond': "'EB Garamond', Georgia, serif",
  Lora: "'Lora', Georgia, serif",
  'Crimson Pro': "'Crimson Pro', Georgia, serif",
  'Source Serif Pro': "'Source Serif Pro', Georgia, serif",
};

// 3 mức đậm bóng đổ — Soft nhạt hơn, Bold đậm/rõ hơn baseline "medium" hiện có trong theme.
const SHADOW_PRESETS: Record<Exclude<ShadowLevel, 'none'>, Record<string, string>> = {
  soft: {
    '--shadow-2xs': '0px 2px 4px -1px hsl(0 0% 0% / 0.03)',
    '--shadow-xs': '0px 2px 4px -1px hsl(0 0% 0% / 0.03)',
    '--shadow-sm': '0px 2px 4px -1px hsl(0 0% 0% / 0.05), 0px 1px 1px -2px hsl(0 0% 0% / 0.05)',
    '--shadow': '0px 2px 4px -1px hsl(0 0% 0% / 0.05), 0px 1px 1px -2px hsl(0 0% 0% / 0.05)',
    '--shadow-md': '0px 2px 4px -1px hsl(0 0% 0% / 0.05), 0px 1px 2px -2px hsl(0 0% 0% / 0.05)',
    '--shadow-lg': '0px 2px 4px -1px hsl(0 0% 0% / 0.05), 0px 2px 3px -2px hsl(0 0% 0% / 0.05)',
    '--shadow-xl': '0px 2px 4px -1px hsl(0 0% 0% / 0.05), 0px 4px 5px -2px hsl(0 0% 0% / 0.05)',
    '--shadow-2xl': '0px 2px 4px -1px hsl(0 0% 0% / 0.12)',
  },
  medium: {
    '--shadow-2xs': '0px 4px 8px -1px hsl(0 0% 0% / 0.05)',
    '--shadow-xs': '0px 4px 8px -1px hsl(0 0% 0% / 0.05)',
    '--shadow-sm': '0px 4px 8px -1px hsl(0 0% 0% / 0.10), 0px 1px 2px -2px hsl(0 0% 0% / 0.10)',
    '--shadow': '0px 4px 8px -1px hsl(0 0% 0% / 0.10), 0px 1px 2px -2px hsl(0 0% 0% / 0.10)',
    '--shadow-md': '0px 4px 8px -1px hsl(0 0% 0% / 0.10), 0px 2px 4px -2px hsl(0 0% 0% / 0.10)',
    '--shadow-lg': '0px 4px 8px -1px hsl(0 0% 0% / 0.10), 0px 4px 6px -2px hsl(0 0% 0% / 0.10)',
    '--shadow-xl': '0px 4px 8px -1px hsl(0 0% 0% / 0.10), 0px 8px 10px -2px hsl(0 0% 0% / 0.10)',
    '--shadow-2xl': '0px 4px 8px -1px hsl(0 0% 0% / 0.25)',
  },
  bold: {
    '--shadow-2xs': '0px 6px 12px -1px hsl(0 0% 0% / 0.10)',
    '--shadow-xs': '0px 6px 12px -1px hsl(0 0% 0% / 0.10)',
    '--shadow-sm': '0px 6px 12px -1px hsl(0 0% 0% / 0.18), 0px 2px 4px -2px hsl(0 0% 0% / 0.18)',
    '--shadow': '0px 6px 12px -1px hsl(0 0% 0% / 0.18), 0px 2px 4px -2px hsl(0 0% 0% / 0.18)',
    '--shadow-md': '0px 6px 12px -1px hsl(0 0% 0% / 0.18), 0px 4px 8px -2px hsl(0 0% 0% / 0.18)',
    '--shadow-lg': '0px 6px 12px -1px hsl(0 0% 0% / 0.18), 0px 8px 12px -2px hsl(0 0% 0% / 0.18)',
    '--shadow-xl': '0px 6px 12px -1px hsl(0 0% 0% / 0.18), 0px 14px 18px -2px hsl(0 0% 0% / 0.18)',
    '--shadow-2xl': '0px 6px 12px -1px hsl(0 0% 0% / 0.40)',
  },
};
const NONE_SHADOW: Record<string, string> = Object.fromEntries(
  Object.keys(SHADOW_PRESETS.medium).map((k) => [k, 'none'])
);

/** Đọc cấu hình appearance/theme đã lưu (localStorage) — không set gì lên DOM, chỉ đọc. */
export function readPersistedTheme(): {
  mode: ThemeMode; palette: ThemePalette;
  font: AppFont; letterSpacing: number; spacing: number; shadowLevel: ShadowLevel;
} {
  const fallback = {
    mode: 'system' as ThemeMode, palette: 'green' as ThemePalette,
    font: 'Inter' as AppFont, letterSpacing: 0, spacing: 0.25, shadowLevel: 'medium' as ShadowLevel,
  };
  const state = readPersistedState();
  if (!state) return fallback;
  const mode = state.themeMode as ThemeMode | undefined;
  const palette = state.themePalette as ThemePalette | undefined;
  const font = state.appFont as AppFont | undefined;
  const letterSpacing = state.letterSpacing;
  const spacing = state.appSpacing;
  const shadowLevel = state.shadowLevel as ShadowLevel | undefined;
  return {
    mode: mode === 'light' || mode === 'dark' || mode === 'system' ? mode : fallback.mode,
    palette: palette && VALID_PALETTES.includes(palette) ? palette : fallback.palette,
    font: font && VALID_FONTS.includes(font) ? font : fallback.font,
    letterSpacing: typeof letterSpacing === 'number' ? letterSpacing : fallback.letterSpacing,
    spacing: typeof spacing === 'number' ? spacing : fallback.spacing,
    shadowLevel: shadowLevel && VALID_SHADOW_LEVELS.includes(shadowLevel) ? shadowLevel : fallback.shadowLevel,
  };
}

export interface CeremonyThemeInput {
  mode: ThemeMode;
  palette: ThemePalette;
  font: AppFont;
  letterSpacing: number;
  appSpacing: number;
  shadowLevel: ShadowLevel;
  /** Theme hiện tại của shell (device-layout) — dùng khi mode === 'system' (kế thừa). */
  shellResolvedColorScheme: 'light' | 'dark';
}

export interface CeremonyThemeStyle {
  /** 'dark' nếu resolved dark, else '' — thêm vào className root div. */
  className: string;
  /** Giá trị data-theme attribute — palette đang áp dụng. */
  dataTheme: ThemePalette;
  /** CSS variable inline (font/tracking/spacing/shadow) — set qua React style prop. */
  style: Record<string, string>;
}

/**
 * Tính class/attribute/style cần áp cho root div `.ceremony-root` — pure function,
 * KHÔNG đụng DOM. Thay thế applyTheme()/applyAppearance() cũ (từng set thẳng lên
 * document.documentElement, gây rò rỉ theme ra toàn shell — xem GĐ7.5+ fix theme
 * isolation). Gọi trong ControlApp's render body (useMemo), không phải side-effect.
 *
 * mode === 'system' nghĩa là "kế thừa theme từ shell" (đọc qua shellResolvedColorScheme,
 * lấy từ @sonth87/device-layout's useStore) — KHÔNG còn đọc trực tiếp OS's
 * prefers-color-scheme, vì trong ngữ cảnh app con chạy trong desktop-shell ảo, "theo
 * hệ thống" nên hiểu là theo shell chứ không phải theo OS thật.
 */
export function buildCeremonyThemeStyle(input: CeremonyThemeInput): CeremonyThemeStyle {
  const resolvedMode = input.mode === 'system' ? input.shellResolvedColorScheme : input.mode;

  const shadowVars = input.shadowLevel === 'none' ? NONE_SHADOW : SHADOW_PRESETS[input.shadowLevel];

  return {
    className: resolvedMode === 'dark' ? 'dark' : '',
    dataTheme: input.palette,
    style: {
      '--font-sans': FONT_STACK[input.font],
      '--tracking-normal': `${input.letterSpacing}em`,
      '--spacing': `${input.appSpacing}rem`,
      ...shadowVars,
    },
  };
}
