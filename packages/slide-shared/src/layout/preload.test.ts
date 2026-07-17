import { describe, expect, it } from 'vitest';
import { collectLayoutImagePaths, collectNextRecordImagePaths } from './preload.js';
import type { LayoutContent } from './types.js';
import type { CanonicalGroup, CanonicalSubject } from './canonical.js';

function makeSubject(overrides: Partial<CanonicalSubject> = {}): CanonicalSubject {
  return {
    id: 's1',
    full_name: 'A',
    subjectType: 'student',
    image_relative_path: 'avatar/s1.jpg',
    extra: {},
    ...overrides,
  };
}

function contentWithVariants(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '16:9', w: 16, h: 9 },
        refW: 1920,
        refH: 1080,
        background: { kind: 'image', src: 'bg/16x9.jpg' },
        items: [
          { id: 'i1', type: 'image', box: { x: 0, y: 0, w: 100, h: 100 }, varKey: 'image_relative_path' },
          { id: 'i2', type: 'text', box: { x: 0, y: 0, w: 100, h: 40 }, content: '@full_name', fontSize: 20 },
        ],
      },
      {
        aspect: { id: '21:9', w: 21, h: 9 },
        refW: 2520,
        refH: 1080,
        background: { kind: 'image', src: 'bg/21x9.jpg' },
        items: [],
      },
    ],
  };
}

describe('collectLayoutImagePaths', () => {
  it('gom ảnh nền của TẤT CẢ variant + ảnh của record cá nhân', () => {
    const paths = collectLayoutImagePaths(contentWithVariants(), makeSubject());
    expect(paths).toContain('bg/16x9.jpg');
    expect(paths).toContain('bg/21x9.jpg');
    expect(paths).toContain('avatar/s1.jpg');
  });

  it('background kind=color không thêm gì vào danh sách', () => {
    const content: LayoutContent = {
      variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, background: { kind: 'color', color: '#000' }, items: [] }],
    };
    expect(collectLayoutImagePaths(content, makeSubject())).toEqual([]);
  });

  it('record là group có members → gom ảnh của TỪNG member', () => {
    const group: CanonicalGroup = {
      id: 'g1',
      subjectType: 'group',
      full_name: 'Nhóm A',
      extra: {},
      members: [makeSubject({ id: 'm1', image_relative_path: 'avatar/m1.jpg' }), makeSubject({ id: 'm2', image_relative_path: 'avatar/m2.jpg' })],
    };
    const paths = collectLayoutImagePaths(contentWithVariants(), group);
    expect(paths).toContain('avatar/m1.jpg');
    expect(paths).toContain('avatar/m2.jpg');
  });

  it('group KHÔNG có members (danh nghĩa) → không lỗi, chỉ có ảnh nền', () => {
    const group: CanonicalGroup = { id: 'g1', subjectType: 'group', full_name: 'Phòng CNTT', extra: {} };
    const paths = collectLayoutImagePaths(contentWithVariants(), group);
    expect(paths).toEqual(expect.arrayContaining(['bg/16x9.jpg', 'bg/21x9.jpg']));
    expect(paths.some((p) => p.startsWith('avatar/'))).toBe(false);
  });

  it('không trùng lặp path (Set khử trùng)', () => {
    const content: LayoutContent = {
      variants: [
        { aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, background: { kind: 'image', src: 'bg.jpg' }, items: [] },
        { aspect: { id: '4:3', w: 4, h: 3 }, refW: 1440, refH: 1080, background: { kind: 'image', src: 'bg.jpg' }, items: [] },
      ],
    };
    expect(collectLayoutImagePaths(content, makeSubject())).toEqual(['bg.jpg']);
  });

  it('gom varKey nằm bên trong LoopItem.itemTemplate', () => {
    const content: LayoutContent = {
      variants: [
        {
          aspect: { id: '16:9', w: 16, h: 9 },
          refW: 1920,
          refH: 1080,
          items: [
            {
              id: 'loop1',
              type: 'loop',
              box: { x: 0, y: 0, w: 800, h: 400 },
              itemTemplate: [{ id: 'sub1', type: 'image', box: { x: 0, y: 0, w: 100, h: 100 }, varKey: 'image_relative_path' }],
              itemBox: { w: 100, h: 100 },
              direction: 'row',
              source: 'members',
              overflow: 'shrink',
            },
          ],
        },
      ],
    };
    const group: CanonicalGroup = {
      id: 'g1',
      subjectType: 'group',
      full_name: 'Nhóm',
      extra: {},
      members: [makeSubject({ id: 'm1', image_relative_path: 'avatar/m1.jpg' })],
    };
    expect(collectLayoutImagePaths(content, group)).toContain('avatar/m1.jpg');
  });
});

describe('collectNextRecordImagePaths', () => {
  it('nextRecord null → mảng rỗng, không lỗi', () => {
    expect(collectNextRecordImagePaths(contentWithVariants(), null)).toEqual([]);
  });

  it('nextRecord có giá trị → uỷ quyền collectLayoutImagePaths', () => {
    const paths = collectNextRecordImagePaths(contentWithVariants(), makeSubject());
    expect(paths).toContain('avatar/s1.jpg');
  });
});
