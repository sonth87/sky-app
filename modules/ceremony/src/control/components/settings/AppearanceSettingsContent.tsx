import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useControlStore } from '../../store';
import type { AppFont, ShadowLevel, ThemeMode, ThemePalette } from '../../store';
import { FONT_STACK } from '../../theme';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Slider } from '../ui/slider';
import { cn } from '../../lib/cn';

const THEME_MODE_OPTIONS: { value: ThemeMode; Icon: typeof Sun; labelKey: string }[] = [
  { value: 'light', Icon: Sun, labelKey: 'settingsModal.themeLight' },
  { value: 'dark', Icon: Moon, labelKey: 'settingsModal.themeDark' },
  { value: 'system', Icon: Monitor, labelKey: 'settingsModal.themeSystem' },
];

// Dải màu đại diện mỗi theme (primary/secondary/accent/destructive) — lấy đúng giá trị oklch
// light-mode của từng theme registry đã cài trong styles.css, để user thấy trước cả bộ màu
// (kiểu preview theme của Slack) trước khi chọn, không chỉ 1 màu primary.
const PALETTE_OPTIONS: {
  value: ThemePalette;
  label: string;
  swatches: [string, string, string, string];
}[] = [
  {
    value: 'green',
    label: 'Green',
    swatches: ['oklch(0.723 0.219 149.579)', 'oklch(0.967 0.001 286.375)', 'oklch(0.21 0.006 285.885)', 'oklch(0.577 0.245 27.325)'],
  },
  {
    value: 'violet-bloom',
    label: 'Violet Bloom',
    swatches: ['oklch(0.5393 0.2713 286.7462)', 'oklch(0.9540 0.0063 255.4755)', 'oklch(0.5445 0.1903 259.4848)', 'oklch(0.6290 0.1902 23.0704)'],
  },
  {
    value: 'yellow',
    label: 'Yellow',
    swatches: ['oklch(0.795 0.184 86.047)', 'oklch(0.967 0.001 286.375)', 'oklch(0.21 0.006 285.885)', 'oklch(0.577 0.245 27.325)'],
  },
  {
    value: 'tangerine',
    label: 'Tangerine',
    swatches: ['oklch(0.6397 0.1720 36.4421)', 'oklch(0.9670 0.0029 264.5419)', 'oklch(0.3791 0.1378 265.5222)', 'oklch(0.6368 0.2078 25.3313)'],
  },
  {
    value: 'summer',
    label: 'Summer',
    swatches: ['oklch(0.70 0.17 28.12)', 'oklch(0.81 0.15 72.19)', 'oklch(0.64 0.22 28.81)', 'oklch(0.57 0.20 26.41)'],
  },
  {
    value: 'starry-night',
    label: 'Starry Night',
    swatches: ['oklch(0.4815 0.1178 263.3758)', 'oklch(0.8567 0.1164 81.0092)', 'oklch(0.6896 0.0714 234.0387)', 'oklch(0.2611 0.0376 322.5267)'],
  },
  {
    value: 'blue',
    label: 'Blue',
    swatches: ['oklch(0.623 0.214 259.815)', 'oklch(0.967 0.001 286.375)', 'oklch(0.967 0.001 286.375)', 'oklch(0.577 0.245 27.325)'],
  },
  {
    value: 'red',
    label: 'Red',
    swatches: ['oklch(0.637 0.237 25.331)', 'oklch(0.967 0.001 286.375)', 'oklch(0.967 0.001 286.375)', 'oklch(0.577 0.245 27.325)'],
  },
  {
    value: 'orange',
    label: 'Orange',
    swatches: ['oklch(0.705 0.213 47.604)', 'oklch(0.967 0.001 286.375)', 'oklch(0.967 0.001 286.375)', 'oklch(0.577 0.245 27.325)'],
  },
  {
    value: 'rose',
    label: 'Rose',
    swatches: ['oklch(0.645 0.246 16.439)', 'oklch(0.967 0.001 286.375)', 'oklch(0.967 0.001 286.375)', 'oklch(0.577 0.245 27.325)'],
  },
  {
    value: 'modern-minimal',
    label: 'Modern Minimal',
    swatches: ['oklch(0.62 0.19 259.76)', 'oklch(0.97 0 0)', 'oklch(0.95 0.03 233.56)', 'oklch(0.64 0.21 25.39)'],
  },
  {
    value: 'clean-slate',
    label: 'Clean Slate',
    swatches: ['oklch(0.59 0.20 277.12)', 'oklch(0.93 0.01 264.53)', 'oklch(0.93 0.03 272.79)', 'oklch(0.64 0.21 25.33)'],
  },
  {
    value: 'amber-minimal',
    label: 'Amber Minimal',
    swatches: ['oklch(0.7686 0.1647 70.0804)', 'oklch(0.9670 0.0029 264.5419)', 'oklch(0.9869 0.0214 95.2774)', 'oklch(0.6368 0.2078 25.3313)'],
  },
  {
    value: 'graphite',
    label: 'Graphite',
    swatches: ['oklch(0.4891 0 0)', 'oklch(0.9067 0 0)', 'oklch(0.8078 0 0)', 'oklch(0.5594 0.1900 25.8625)'],
  },
  {
    value: 'mono',
    label: 'Mono',
    swatches: ['oklch(0.5555 0 0)', 'oklch(0.9702 0 0)', 'oklch(0.9702 0 0)', 'oklch(0.5830 0.2387 28.4765)'],
  },
  {
    value: 'cosmic-night',
    label: 'Cosmic Night',
    swatches: ['oklch(0.5417 0.1790 288.0332)', 'oklch(0.9174 0.0435 292.6901)', 'oklch(0.9221 0.0373 262.1410)', 'oklch(0.6861 0.2061 14.9941)'],
  },
  {
    value: 'midnight-bloom',
    label: 'Midnight Bloom',
    swatches: ['oklch(0.57 0.20 283.08)', 'oklch(0.82 0.07 249.35)', 'oklch(0.65 0.06 117.43)', 'oklch(0.64 0.21 25.33)'],
  },
  {
    value: 'caffeine',
    label: 'Caffeine',
    swatches: ['oklch(0.4341 0.0392 41.9938)', 'oklch(0.9200 0.0651 74.3695)', 'oklch(0.9310 0 0)', 'oklch(0.6271 0.1936 33.3390)'],
  },
  {
    value: 'bubblegum',
    label: 'Bubblegum',
    swatches: ['oklch(0.6209 0.1801 348.1385)', 'oklch(0.8095 0.0694 198.1863)', 'oklch(0.9195 0.0801 87.6670)', 'oklch(0.7091 0.1697 21.9551)'],
  },
  {
    value: 'catppuccin',
    label: 'Catppuccin',
    swatches: ['oklch(0.5547 0.2503 297.0156)', 'oklch(0.8575 0.0145 268.4756)', 'oklch(0.6820 0.1448 235.3822)', 'oklch(0.5505 0.2155 19.8095)'],
  },
  {
    value: 'ocean-breeze',
    label: 'Ocean Breeze',
    swatches: ['oklch(0.7227 0.1920 149.5793)', 'oklch(0.9514 0.0250 236.8242)', 'oklch(0.9505 0.0507 163.0508)', 'oklch(0.6368 0.2078 25.3313)'],
  },
];

const FONT_OPTIONS: { value: AppFont; label: string }[] = [
  { value: 'system-ui', label: 'Sans Serif (hệ thống)' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Roboto', label: 'Roboto Vietnamese' },
  { value: 'Be Vietnam Pro', label: 'Be Vietnam Pro' },
  { value: 'SF Pro Vietnamese', label: 'SF Pro Vietnamese' },
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'EB Garamond', label: 'EB Garamond' },
  { value: 'Lora', label: 'Lora Vietnamese' },
  { value: 'Crimson Pro', label: 'Crimson Pro' },
  { value: 'Source Serif Pro', label: 'Source Serif Pro' },
];

const SHADOW_OPTIONS: { value: ShadowLevel; labelKey: string }[] = [
  { value: 'none', labelKey: 'settingsModal.shadowNone' },
  { value: 'soft', labelKey: 'settingsModal.shadowSoft' },
  { value: 'medium', labelKey: 'settingsModal.shadowMedium' },
  { value: 'bold', labelKey: 'settingsModal.shadowBold' },
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">{children}</label>;
}

/** Tab Appearance của SettingsModal — Theme (mode/palette), Font, Letter Spacing, Spacing, Shadow. */
export function AppearanceSettingsContent() {
  const { t } = useTranslation();
  const themeMode = useControlStore((s) => s.themeMode);
  const setThemeMode = useControlStore((s) => s.setThemeMode);
  const themePalette = useControlStore((s) => s.themePalette);
  const setThemePalette = useControlStore((s) => s.setThemePalette);
  const appFont = useControlStore((s) => s.appFont);
  const setAppFont = useControlStore((s) => s.setAppFont);
  const letterSpacing = useControlStore((s) => s.letterSpacing);
  const setLetterSpacing = useControlStore((s) => s.setLetterSpacing);
  const appSpacing = useControlStore((s) => s.appSpacing);
  const setAppSpacing = useControlStore((s) => s.setAppSpacing);
  const shadowLevel = useControlStore((s) => s.shadowLevel);
  const setShadowLevel = useControlStore((s) => s.setShadowLevel);

  return (
    <div className="flex flex-col gap-5">
      {/* Theme Mode + Palette — 2 cột song song */}
      <div className="grid grid-cols-[auto_1fr] gap-6">
        <div className="flex flex-col gap-2">
          <FieldLabel>{t('settingsModal.themeMode')}</FieldLabel>
          <div className="flex flex-col gap-1.5">
            {THEME_MODE_OPTIONS.map(({ value, Icon, labelKey }) => (
              <button
                key={value}
                onClick={() => setThemeMode(value)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap',
                  themeMode === value
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'bg-card border-border text-foreground hover:border-primary/50'
                )}
              >
                <Icon size={14} />
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel>{t('settingsModal.themePalette')}</FieldLabel>
          <div className="grid grid-cols-3 gap-2 max-h-[260px] overflow-y-auto pr-1">
            {PALETTE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setThemePalette(opt.value)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                  themePalette === opt.value
                    ? 'border-primary bg-accent text-foreground'
                    : 'border-border bg-card text-foreground hover:border-primary/50'
                )}
              >
                <span className="flex gap-1 flex-shrink-0">
                  {opt.swatches.map((color, i) => (
                    <span key={i} className="h-5 w-5 rounded-md" style={{ backgroundColor: color }} />
                  ))}
                </span>
                <span className="flex-1 text-left truncate">{opt.label}</span>
                {themePalette === opt.value && <Check size={14} className="text-primary flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Font + Letter Spacing + Spacing + Shadow — lưới rộng */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-5">
        <div className="flex flex-col gap-1.5">
          <FieldLabel>{t('settingsModal.font')}</FieldLabel>
          <Select value={appFont} onValueChange={(v) => setAppFont(v as AppFont)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} style={{ fontFamily: FONT_STACK[opt.value] }}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground truncate" style={{ fontFamily: FONT_STACK[appFont] }}>
            {FONT_OPTIONS.find((o) => o.value === appFont)?.label}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel>{t('settingsModal.shadow')}</FieldLabel>
          <div className="grid grid-cols-4 gap-2">
            {SHADOW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setShadowLevel(opt.value)}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-semibold border transition-colors',
                  shadowLevel === opt.value
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'bg-card border-border text-foreground hover:border-primary/50'
                )}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <FieldLabel>{t('settingsModal.letterSpacing')}</FieldLabel>
            <span className="text-xs text-muted-foreground font-mono">{letterSpacing.toFixed(3)}em</span>
          </div>
          <Slider value={[letterSpacing]} onValueChange={([v]) => setLetterSpacing(v)} min={-0.05} max={0.1} step={0.005} />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <FieldLabel>{t('settingsModal.spacing')}</FieldLabel>
            <span className="text-xs text-muted-foreground font-mono">{appSpacing.toFixed(2)}rem</span>
          </div>
          <Slider value={[appSpacing]} onValueChange={([v]) => setAppSpacing(v)} min={0.15} max={0.4} step={0.01} />
        </div>
      </div>
    </div>
  );
}
