// Preset khung/bóng/hình dạng/hiệu ứng đặc biệt cho ImageItem — port từ my-builder
// (packages/shared/src/imageFrames.ts, PROJECTS/my-builder). Dùng chung ở renderer.tsx,
// ItemContent.tsx và ImageFramePanel.tsx (editor), cùng lý do với shapeClipPaths.ts.
//
// 4 nhóm preset:
//   - FRAME_PRESETS   → viền (CSS border/borderRadius)
//   - SHADOW_PRESETS  → đổ bóng khối (box-shadow)
//   - SHAPE_PRESETS   → clip-path/borderRadius (hình dạng trang trí)
//   - SPECIAL_PRESETS → hiệu ứng trang trí (băng dính/polaroid/vintage) — 1 số cần thêm DOM
//     markup (requiresCustomMarkup=true), xử lý tại renderer.tsx/ItemContent.tsx.
//   - DROP_SHADOW_PRESETS → filter drop-shadow() (cộng dồn với ImageItem.filter khi render).
//
// BỎ "Text Shadow" preset của my-builder (chỉ dùng cho text node bên đó) — sky-app đã có
// TextShadow type + ShadowControl riêng cho TextItem/ShapeItem, không lẫn vào đây.

export interface FramePresetStyle {
  border?: string;
  borderRadius?: string;
}

export interface FramePreset {
  value: string;
  label: string;
  style: FramePresetStyle;
}

export interface ShadowPreset {
  value: string;
  label: string;
  boxShadow: string;
}

export interface ShapePreset {
  value: string;
  label: string;
  /** CSS clip-path; undefined = hình dùng borderRadius thay vì cắt */
  clipPath?: string;
  /** CSS border-radius; có giá trị khi hình dựa trên bo góc (không phải clip-path) */
  borderRadius?: string;
}

export type SpecialFrameStyle = 'none' | 'tape' | 'polaroid' | 'vintage';

export interface SpecialPreset {
  value: SpecialFrameStyle;
  label: string;
  description: string;
  /** true = renderer cần thêm DOM node phụ (VD 4 dải băng dính góc) */
  requiresCustomMarkup: boolean;
  /** CSS áp thẳng lên container khi requiresCustomMarkup=false */
  cssStyle?: Record<string, string>;
}

export interface DropShadowPreset {
  value: string;
  label: string;
  /** Token filter drop-shadow(...) hoặc "none" */
  dropShadow: string;
}

// ── Frame Presets ─────────────────────────────────────────────────────────

export const FRAME_PRESETS: FramePreset[] = [
  { value: 'none', label: 'Không viền', style: { border: 'none', borderRadius: '0px' } },
  { value: 'thin-black', label: 'Đen mảnh', style: { border: '1px solid #000000', borderRadius: '0px' } },
  { value: 'medium-black', label: 'Đen vừa', style: { border: '3px solid #000000', borderRadius: '0px' } },
  { value: 'thick-black', label: 'Đen dày', style: { border: '6px solid #000000', borderRadius: '0px' } },
  { value: 'thin-white', label: 'Trắng mảnh', style: { border: '2px solid #ffffff', borderRadius: '0px' } },
  { value: 'thick-white', label: 'Trắng dày', style: { border: '6px solid #ffffff', borderRadius: '0px' } },
  { value: 'thin-gray', label: 'Xám', style: { border: '2px solid #9ca3af', borderRadius: '0px' } },
  { value: 'dashed-black', label: 'Nét đứt', style: { border: '2px dashed #000000', borderRadius: '0px' } },
  { value: 'dotted-black', label: 'Chấm chấm', style: { border: '3px dotted #000000', borderRadius: '0px' } },
  { value: 'double-black', label: 'Viền đôi', style: { border: '4px double #000000', borderRadius: '0px' } },
  { value: 'rounded-thin', label: 'Bo tròn', style: { border: '2px solid #000000', borderRadius: '12px' } },
  { value: 'rounded-thick', label: 'Bo tròn dày', style: { border: '4px solid #000000', borderRadius: '12px' } },
];

// ── Shadow Presets ────────────────────────────────────────────────────────

export const SHADOW_PRESETS: ShadowPreset[] = [
  { value: 'none', label: 'Không bóng', boxShadow: 'none' },
  { value: 'soft', label: 'Nhẹ', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' },
  { value: 'medium', label: 'Vừa', boxShadow: '0 4px 16px rgba(0,0,0,0.20)' },
  { value: 'hard', label: 'Đậm', boxShadow: '4px 4px 0px rgba(0,0,0,0.85)' },
  { value: 'deep', label: 'Sâu', boxShadow: '0 8px 32px rgba(0,0,0,0.35)' },
  { value: 'offset-bottom', label: 'Lệch đáy', boxShadow: '0 10px 0 rgba(0,0,0,0.25)' },
  { value: 'spread', label: 'Toả rộng', boxShadow: '0 0 0 8px rgba(0,0,0,0.10)' },
  { value: 'glow-white', label: 'Rạng trắng', boxShadow: '0 0 20px 4px rgba(255,255,255,0.60)' },
  { value: 'glow-blue', label: 'Rạng xanh', boxShadow: '0 0 20px 6px rgba(59,130,246,0.55)' },
  { value: 'glow-pink', label: 'Rạng hồng', boxShadow: '0 0 20px 6px rgba(236,72,153,0.50)' },
  { value: 'retro-hard', label: 'Retro', boxShadow: '5px 5px 0px #000000' },
  { value: 'layered', label: 'Nhiều lớp', boxShadow: '0 2px 4px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.16)' },
  { value: 'inset-soft', label: 'Lõm nhẹ', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.15)' },
  { value: 'inset-hard', label: 'Lõm đậm', boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.40)' },
  { value: 'inset-deep', label: 'Lõm sâu', boxShadow: 'inset 0 6px 20px rgba(0,0,0,0.30)' },
];

// ── Drop Shadow Presets (filter: drop-shadow(), cộng dồn với ImageItem.filter) ─────────────

export const DROP_SHADOW_PRESETS: DropShadowPreset[] = [
  { value: 'none', label: 'Không bóng', dropShadow: 'none' },
  { value: 'soft', label: 'Nhẹ', dropShadow: 'drop-shadow(0 2px 6px rgba(0,0,0,0.20))' },
  { value: 'medium', label: 'Vừa', dropShadow: 'drop-shadow(0 4px 12px rgba(0,0,0,0.32))' },
  { value: 'hard', label: 'Đậm', dropShadow: 'drop-shadow(3px 3px 0px rgba(0,0,0,0.80))' },
  { value: 'deep', label: 'Sâu', dropShadow: 'drop-shadow(0 8px 24px rgba(0,0,0,0.45))' },
  { value: 'glow-white', label: 'Rạng trắng', dropShadow: 'drop-shadow(0 0 14px rgba(255,255,255,0.80))' },
  { value: 'glow-blue', label: 'Rạng xanh', dropShadow: 'drop-shadow(0 0 12px rgba(59,130,246,0.70))' },
  { value: 'glow-pink', label: 'Rạng hồng', dropShadow: 'drop-shadow(0 0 12px rgba(236,72,153,0.65))' },
  { value: 'float', label: 'Bồng bềnh', dropShadow: 'drop-shadow(0 12px 8px rgba(0,0,0,0.18))' },
];

// ── Shape Presets ─────────────────────────────────────────────────────────

export const SHAPE_PRESETS: ShapePreset[] = [
  { value: 'none', label: 'Vuông', borderRadius: '0px' },
  { value: 'rounded-sm', label: 'Bo nhẹ', borderRadius: '4px' },
  { value: 'rounded-md', label: 'Bo vừa', borderRadius: '12px' },
  { value: 'rounded-lg', label: 'Bo lớn', borderRadius: '24px' },
  { value: 'squircle', label: 'Squircle', borderRadius: '40%' },
  { value: 'circle', label: 'Tròn', clipPath: 'ellipse(50% 50% at 50% 50%)' },
  { value: 'hexagon', label: 'Lục giác', clipPath: 'polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)' },
  { value: 'diamond', label: 'Kim cương', clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' },
  { value: 'arch-top', label: 'Vòm', clipPath: 'ellipse(50% 60% at 50% 60%)' },
  { value: 'triangle', label: 'Tam giác', clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' },
  { value: 'star', label: 'Ngôi sao', clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' },
  { value: 'parallelogram', label: 'Xiên', clipPath: 'polygon(15% 0%, 100% 0%, 85% 100%, 0% 100%)' },
];

// ── Special Presets ───────────────────────────────────────────────────────

export const SPECIAL_PRESETS: SpecialPreset[] = [
  { value: 'none', label: 'Không', description: 'Không hiệu ứng đặc biệt', requiresCustomMarkup: false },
  { value: 'tape', label: 'Băng dính', description: 'Trang trí 4 góc như dán băng dính', requiresCustomMarkup: true },
  {
    value: 'polaroid',
    label: 'Polaroid',
    description: 'Viền trắng như ảnh Polaroid, hơi nghiêng',
    requiresCustomMarkup: false,
    cssStyle: {
      background: '#ffffff',
      padding: '8px 8px 40px 8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      transform: 'rotate(-1.5deg)',
    },
  },
  {
    value: 'vintage',
    label: 'Cổ điển',
    description: 'Viền dày kiểu ảnh cũ',
    requiresCustomMarkup: false,
    cssStyle: {
      border: '8px solid #d4b896',
      outline: '1px solid #a08060',
      outlineOffset: '-12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.30)',
    },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────

export function getSpecialPreset(value: string | undefined): SpecialPreset | undefined {
  if (!value) return undefined;
  return SPECIAL_PRESETS.find((p) => p.value === value);
}

export function getShapePreset(value: string | undefined): ShapePreset | undefined {
  if (!value) return undefined;
  return SHAPE_PRESETS.find((p) => p.value === value);
}
