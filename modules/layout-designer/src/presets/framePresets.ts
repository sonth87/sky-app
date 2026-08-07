export interface FramePreset {
  label: string;
  clipPath: string;
  suggestedBox: { w: number; h: number };
}

export const FRAME_PRESETS: FramePreset[] = [
  {
    label: 'Tam giác',
    clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
    suggestedBox: { w: 240, h: 220 },
  },
  {
    label: 'Sao 5 cánh',
    clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
    suggestedBox: { w: 240, h: 240 },
  },
  {
    label: 'Trái tim',
    clipPath: "path('M 120 40 C 100 0, 20 0, 20 60 C 20 100, 120 160, 120 160 C 120 160, 220 100, 220 60 C 220 0, 140 0, 120 40 Z')",
    suggestedBox: { w: 240, h: 210 },
  },
  {
    label: 'Lục giác',
    clipPath: 'polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)',
    suggestedBox: { w: 240, h: 220 },
  },
];
