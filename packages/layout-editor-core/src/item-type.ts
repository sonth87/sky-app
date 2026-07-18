// Item-type registry — mỗi loại item (text/image/shape/ribbon/loop) khai 1 entry: default box,
// hàm tạo item mới. Cách RENDER + property-panel thuộc UI React (sub-bước 2.3, modules/
// layout-designer) — package này (không React) chỉ giữ phần dữ liệu/thuần của registry, UI
// đăng ký thêm renderer/panel riêng ở tầng của nó (23-editor-core-architecture.md §2.6).

import type { Box, LayoutItem } from '@sky-app/slide-shared';

export interface ItemTypeDefinition<T extends LayoutItem = LayoutItem> {
  type: T['type'];
  label: string;
  defaultBox: Box;
  /** Tạo 1 item mới của loại này, `id` do caller cấp (uuid) — factory chỉ điền default field. */
  createDefault(id: string, box?: Box): T;
}

export class ItemTypeRegistry {
  private types = new Map<string, ItemTypeDefinition>();

  register<T extends LayoutItem>(def: ItemTypeDefinition<T>): void {
    this.types.set(def.type, def as unknown as ItemTypeDefinition);
  }

  get(type: string): ItemTypeDefinition | undefined {
    return this.types.get(type);
  }

  list(): ItemTypeDefinition[] {
    return [...this.types.values()];
  }
}

const DEFAULT_TEXT_BOX: Box = { x: 100, y: 100, w: 400, h: 80 };
const DEFAULT_IMAGE_BOX: Box = { x: 100, y: 100, w: 300, h: 300 };
const DEFAULT_SHAPE_BOX: Box = { x: 100, y: 100, w: 200, h: 200 };
const DEFAULT_RIBBON_BOX: Box = { x: 100, y: 100, w: 400, h: 60 };
const DEFAULT_LOOP_BOX: Box = { x: 100, y: 100, w: 800, h: 400 };

/** Đăng ký sẵn 5 loại item chuẩn (04-schema-layout-document.md) — dùng cho registry mặc định. */
export function registerDefaultItemTypes(registry: ItemTypeRegistry): void {
  registry.register<Extract<LayoutItem, { type: 'text' }>>({
    type: 'text',
    label: 'Văn bản',
    defaultBox: DEFAULT_TEXT_BOX,
    createDefault: (id, box = DEFAULT_TEXT_BOX) => ({
      id,
      type: 'text',
      box,
      content: 'Văn bản mới',
      fontSize: 32,
      // #2E3A5B (xanh navy đậm), KHÔNG dùng trắng — Frame mặc định nền trắng (đổi 2026-07-18),
      // chữ trắng trên nền trắng vô hình lúc vừa kéo ra, phải tự đổi màu mới thấy được nội dung.
      color: '#2E3A5B',
      align: 'left',
    }),
  });

  registry.register<Extract<LayoutItem, { type: 'image' }>>({
    type: 'image',
    label: 'Hình ảnh',
    defaultBox: DEFAULT_IMAGE_BOX,
    createDefault: (id, box = DEFAULT_IMAGE_BOX) => ({
      id,
      type: 'image',
      box,
      fit: 'cover',
      shape: 'rect',
    }),
  });

  registry.register<Extract<LayoutItem, { type: 'shape' }>>({
    type: 'shape',
    label: 'Hình khối',
    defaultBox: DEFAULT_SHAPE_BOX,
    createDefault: (id, box = DEFAULT_SHAPE_BOX) => ({
      id,
      type: 'shape',
      box,
      shape: 'rect',
      fill: '#ffffff',
    }),
  });

  registry.register<Extract<LayoutItem, { type: 'ribbon' }>>({
    type: 'ribbon',
    label: 'Ruy băng',
    defaultBox: DEFAULT_RIBBON_BOX,
    createDefault: (id, box = DEFAULT_RIBBON_BOX) => ({
      id,
      type: 'ribbon',
      box,
      content: 'Ruy băng',
      fontSize: 24,
      bg: '#c1121f',
      color: '#ffffff',
    }),
  });

  registry.register<Extract<LayoutItem, { type: 'loop' }>>({
    type: 'loop',
    label: 'Khung lặp (nhóm)',
    defaultBox: DEFAULT_LOOP_BOX,
    createDefault: (id, box = DEFAULT_LOOP_BOX) => ({
      id,
      type: 'loop',
      box,
      itemTemplate: [],
      itemBox: { w: 180, h: 220 },
      direction: 'grid',
      source: 'members',
      overflow: 'shrink',
    }),
  });
}
