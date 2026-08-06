import type { LayoutItem } from '@sky-app/slide-shared';

export interface GridPreset {
  label: string;
  items: LayoutItem[];
}

export const GRID_PRESETS: GridPreset[] = [
  {
    label: 'Lưới 2×2 + tiêu đề',
    items: [
      {
        id: 't1',
        type: 'text',
        box: { x: 0, y: 0, w: 400, h: 50, z: 0 },
        content: 'Tiêu đề',
        fontSize: 28,
        fontWeight: 700,
        align: 'center',
      } as LayoutItem,
      {
        id: 'i1',
        type: 'image',
        box: { x: 0, y: 60, w: 195, h: 195, z: 0 },
        fit: 'cover',
      } as LayoutItem,
      {
        id: 'i2',
        type: 'image',
        box: { x: 205, y: 60, w: 195, h: 195, z: 0 },
        fit: 'cover',
      } as LayoutItem,
      {
        id: 'i3',
        type: 'image',
        box: { x: 0, y: 265, w: 195, h: 195, z: 0 },
        fit: 'cover',
      } as LayoutItem,
      {
        id: 'i4',
        type: 'image',
        box: { x: 205, y: 265, w: 195, h: 195, z: 0 },
        fit: 'cover',
      } as LayoutItem,
    ],
  },
  {
    label: 'Lưới 3 cột ảnh',
    items: [
      {
        id: 'i1',
        type: 'image',
        box: { x: 0, y: 0, w: 130, h: 130, z: 0 },
        fit: 'cover',
      } as LayoutItem,
      {
        id: 'i2',
        type: 'image',
        box: { x: 135, y: 0, w: 130, h: 130, z: 0 },
        fit: 'cover',
      } as LayoutItem,
      {
        id: 'i3',
        type: 'image',
        box: { x: 270, y: 0, w: 130, h: 130, z: 0 },
        fit: 'cover',
      } as LayoutItem,
      {
        id: 'i4',
        type: 'image',
        box: { x: 0, y: 135, w: 130, h: 130, z: 0 },
        fit: 'cover',
      } as LayoutItem,
      {
        id: 'i5',
        type: 'image',
        box: { x: 135, y: 135, w: 130, h: 130, z: 0 },
        fit: 'cover',
      } as LayoutItem,
      {
        id: 'i6',
        type: 'image',
        box: { x: 270, y: 135, w: 130, h: 130, z: 0 },
        fit: 'cover',
      } as LayoutItem,
    ],
  },
  {
    label: 'Lưới 1 lớn + 2 nhỏ',
    items: [
      {
        id: 'i1',
        type: 'image',
        box: { x: 0, y: 0, w: 270, h: 270, z: 0 },
        fit: 'cover',
      } as LayoutItem,
      {
        id: 'i2',
        type: 'image',
        box: { x: 280, y: 0, w: 120, h: 130, z: 0 },
        fit: 'cover',
      } as LayoutItem,
      {
        id: 'i3',
        type: 'image',
        box: { x: 280, y: 140, w: 120, h: 130, z: 0 },
        fit: 'cover',
      } as LayoutItem,
    ],
  },
  {
    label: 'Lưới 2 cột tỷ lệ 1:2',
    items: [
      {
        id: 'i1',
        type: 'image',
        box: { x: 0, y: 0, w: 150, h: 150, z: 0 },
        fit: 'cover',
      } as LayoutItem,
      {
        id: 'i2',
        type: 'image',
        box: { x: 0, y: 160, w: 150, h: 150, z: 0 },
        fit: 'cover',
      } as LayoutItem,
      {
        id: 'i3',
        type: 'image',
        box: { x: 160, y: 0, w: 240, h: 310, z: 0 },
        fit: 'cover',
      } as LayoutItem,
    ],
  },
];
