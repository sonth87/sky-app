// LayoutDocument mẫu viết TAY (không qua editor UI) — dùng để test LayoutRenderer độc lập,
// theo GĐ1 DoD "1 LayoutDocument mẫu thủ công + test render độc lập".

import type { LayoutContent, LayoutDocument } from './types.js';
import type { CanonicalGroup, CanonicalSubject } from './canonical.js';

/** Layout mẫu "Vinh danh cá nhân" — 1 variant 16:9, text + ảnh, dùng token @full_name/@gpa. */
export const sampleLayoutContent: LayoutContent = {
  variants: [
    {
      aspect: { id: '16:9', w: 16, h: 9 },
      refW: 1920,
      refH: 1080,
      background: { kind: 'color', color: '#001a4d' },
      items: [
        {
          id: 'avatar',
          type: 'image',
          box: { x: 100, y: 100, w: 400, h: 400 },
          varKey: 'image_relative_path',
          shape: 'circle',
          fit: 'cover',
        },
        {
          id: 'name',
          type: 'text',
          box: { x: 100, y: 550, w: 800, h: 100 },
          content: 'Xin chúc mừng @full_name',
          fontSize: 48,
          fontWeight: 700,
          color: '#fff',
          align: 'left',
        },
        {
          id: 'gpa',
          type: 'text',
          box: { x: 100, y: 660, w: 800, h: 60 },
          content: 'Điểm GPA: @gpa',
          fontSize: 28,
          color: '#ffd966',
          align: 'left',
        },
        {
          id: 'group-photos',
          type: 'loop',
          box: { x: 1000, y: 100, w: 800, h: 800 },
          itemTemplate: [
            {
              id: 'member-avatar',
              type: 'image',
              box: { x: 0, y: 0, w: 180, h: 180 },
              varKey: 'image_relative_path',
              shape: 'round',
            },
            {
              id: 'member-name',
              type: 'text',
              box: { x: 0, y: 185, w: 180, h: 30 },
              content: '@full_name',
              fontSize: 16,
              color: '#fff',
              align: 'center',
            },
          ],
          itemBox: { w: 180, h: 220 },
          direction: 'grid',
          columns: 4,
          gap: 12,
          source: 'members',
          overflow: 'truncate',
          maxItems: 8,
          overflowMoreText: '+@count_more người khác',
        },
      ],
      safeArea: { x: 40, y: 40, w: 1840, h: 1000 },
    },
    {
      // variant 25:9 — vị trí/nền RIÊNG (YC6), test resolveVariant chọn đúng theo tỷ lệ màn.
      aspect: { id: '25:9', w: 25, h: 9 },
      refW: 2500,
      refH: 900,
      background: { kind: 'color', color: '#1a0033' },
      items: [
        {
          id: 'name',
          type: 'text',
          box: { x: 200, y: 400, w: 1200, h: 100 },
          content: 'Xin chúc mừng @full_name',
          fontSize: 40,
          color: '#fff',
          align: 'left',
        },
      ],
    },
  ],
  variables: [
    { key: 'full_name', kind: 'text', required: true },
    { key: 'gpa', kind: 'text' },
    { key: 'image_relative_path', kind: 'image' },
  ],
  defaultVariantAspectId: '16:9',
};

export const sampleLayoutDocument: LayoutDocument = {
  id: 'vinh-danh-mau',
  name: 'Vinh danh — mẫu test',
  currentDraft: sampleLayoutContent,
  publishedVersions: [],
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z',
};

export const sampleSubject: CanonicalSubject = {
  id: 'sv-001',
  displayOrder: 0,
  full_name: 'NGUYỄN VĂN A',
  subjectType: 'student',
  image_relative_path: 'avatar/sv-001.jpg',
  extra: { gpa: '3.85', major_name: 'Công nghệ thông tin' },
};

export function makeGroupMembers(count: number): CanonicalSubject[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `sv-${i}`,
    displayOrder: i,
    full_name: `Sinh viên ${i}`,
    subjectType: 'student',
    image_relative_path: `avatar/sv-${i}.jpg`,
    extra: {},
  }));
}

export const sampleGroup: CanonicalGroup = {
  id: 'nhom-001',
  subjectType: 'group',
  full_name: '5 sinh viên xuất sắc nhất khoá',
  extra: { thanh_tich_tap_the: 'Giải Nhất' },
  members: makeGroupMembers(5),
};

/** Nhóm DANH NGHĨA — không kèm danh sách (11 §"Hai loại nhóm"), LoopItem phải tự ẩn. */
export const sampleNamedGroup: CanonicalGroup = {
  id: 'phong-cntt',
  subjectType: 'group',
  full_name: 'Phòng Công nghệ thông tin',
  extra: {},
};
