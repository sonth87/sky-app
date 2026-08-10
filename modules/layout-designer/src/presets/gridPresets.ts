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
  // Lưới đều mở rộng (content-spec-luoi.md — map "Grid Galleries", độ ưu tiên cao nhất, không cần
  // kỹ thuật mới, chỉ thêm entry cùng công thức toạ độ như "Lưới 3 cột ảnh" ở trên).
  {
    label: 'Lưới 2×3',
    items: [
      { id: 'i1', type: 'image', box: { x: 0, y: 0, w: 190, h: 190, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i2', type: 'image', box: { x: 200, y: 0, w: 190, h: 190, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i3', type: 'image', box: { x: 0, y: 200, w: 190, h: 190, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i4', type: 'image', box: { x: 200, y: 200, w: 190, h: 190, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i5', type: 'image', box: { x: 0, y: 400, w: 190, h: 190, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i6', type: 'image', box: { x: 200, y: 400, w: 190, h: 190, z: 0 }, fit: 'cover' } as LayoutItem,
    ],
  },
  {
    label: 'Lưới 3×3',
    items: [
      { id: 'i1', type: 'image', box: { x: 0, y: 0, w: 100, h: 100, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i2', type: 'image', box: { x: 105, y: 0, w: 100, h: 100, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i3', type: 'image', box: { x: 210, y: 0, w: 100, h: 100, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i4', type: 'image', box: { x: 0, y: 105, w: 100, h: 100, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i5', type: 'image', box: { x: 105, y: 105, w: 100, h: 100, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i6', type: 'image', box: { x: 210, y: 105, w: 100, h: 100, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i7', type: 'image', box: { x: 0, y: 210, w: 100, h: 100, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i8', type: 'image', box: { x: 105, y: 210, w: 100, h: 100, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i9', type: 'image', box: { x: 210, y: 210, w: 100, h: 100, z: 0 }, fit: 'cover' } as LayoutItem,
    ],
  },
  {
    label: 'Hàng ngang 4 ảnh',
    items: [
      { id: 'i1', type: 'image', box: { x: 0, y: 0, w: 120, h: 120, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i2', type: 'image', box: { x: 125, y: 0, w: 120, h: 120, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i3', type: 'image', box: { x: 250, y: 0, w: 120, h: 120, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i4', type: 'image', box: { x: 375, y: 0, w: 120, h: 120, z: 0 }, fit: 'cover' } as LayoutItem,
    ],
  },
  {
    label: 'Cột dọc 4 ảnh',
    items: [
      { id: 'i1', type: 'image', box: { x: 0, y: 0, w: 120, h: 120, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i2', type: 'image', box: { x: 0, y: 125, w: 120, h: 120, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i3', type: 'image', box: { x: 0, y: 250, w: 120, h: 120, z: 0 }, fit: 'cover' } as LayoutItem,
      { id: 'i4', type: 'image', box: { x: 0, y: 375, w: 120, h: 120, z: 0 }, fit: 'cover' } as LayoutItem,
    ],
  },
  // "Chồng ảnh ngẫu nhiên" (content-spec-luoi.md — map Slider Kiểu 6 "scattered/stacked photo
  // pile") — dùng field `box.rotation` CÓ SẴN, không cần field/kỹ thuật mới. Góc xoay + lệch vị
  // trí nhẹ tính sẵn để tạo hiệu ứng chồng ảnh polaroid đổ ra bàn, z tăng dần theo thứ tự đặt.
  {
    label: 'Chồng ảnh ngẫu nhiên',
    items: [
      { id: 'i1', type: 'image', box: { x: 0, y: 0, w: 220, h: 220, z: 0, rotation: -8 }, fit: 'cover' } as LayoutItem,
      { id: 'i2', type: 'image', box: { x: 30, y: 15, w: 220, h: 220, z: 1, rotation: 5 }, fit: 'cover' } as LayoutItem,
      { id: 'i3', type: 'image', box: { x: 15, y: 35, w: 220, h: 220, z: 2, rotation: -3 }, fit: 'cover' } as LayoutItem,
      { id: 'i4', type: 'image', box: { x: 45, y: 5, w: 220, h: 220, z: 3, rotation: 10 }, fit: 'cover' } as LayoutItem,
    ],
  },
];
