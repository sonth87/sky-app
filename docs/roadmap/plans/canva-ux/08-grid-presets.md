---
status: proposed
target_version: layout-designer-v0.21.0
---

# GĐ17 — Lưới: preset đa-item (batch-spawn) + LoopItem preset "động"

## Lưới "động" — dùng lại `overrides`, không hạ tầng mới

`{kind:'itemType', type:'loop', label:'Lưới 3 cột', overrides:{direction:'grid', columns:3,
gap:12, itemBox:{w:220,h:220}}}` — xong, không cần gì thêm.

## Lưới "tĩnh" — `SpawnKind` biến thể mới

```ts
| { kind: 'preset'; items: LayoutItem[]; label: string } // items: toạ độ TƯƠNG ĐỐI, item[0] tại (0,0)
```

`useSpawnDrag.ts`'s mouseup handler — nhánh theo `kind`:
```ts
if (spawnKind.kind === 'preset') {
  const dropPoint = screenPointToCanvas(...); // y hệt tính toán hiện tại cho 1 item
  const newItems = spawnKind.items.map((template) => ({
    ...template,
    id: nextSpawnId(template.type),
    box: { ...template.box, x: template.box.x + dropPoint.x, y: template.box.y + dropPoint.y },
  }));
  const commands = newItems.map((it) => addItemCommand(variant.aspect.id, it, editingLoopId));
  editor.store.getState().dispatch(commands.length > 1 ? batchCommand(commands) : commands[0]);
} else {
  // nhánh CŨ, giữ nguyên y hệt hiện tại — itemType/var
}
```

## Nội dung preset — ví dụ cụ thể (không chỉ mô tả chung)

```ts
// modules/layout-designer/src/presets/gridPresets.ts
export const GRID_PRESETS: { label: string; items: LayoutItem[] }[] = [
  {
    label: 'Lưới 2×2 + tiêu đề',
    items: [
      { id: '_t', type: 'text', box: { x: 0, y: 0, w: 400, h: 50 }, content: 'Tiêu đề', fontSize: 28, fontWeight: 700, align: 'center' },
      { id: '_i1', type: 'image', box: { x: 0, y: 60, w: 195, h: 195 }, fit: 'cover' },
      { id: '_i2', type: 'image', box: { x: 205, y: 60, w: 195, h: 195 }, fit: 'cover' },
      { id: '_i3', type: 'image', box: { x: 0, y: 265, w: 195, h: 195 }, fit: 'cover' },
      { id: '_i4', type: 'image', box: { x: 205, y: 265, w: 195, h: 195 }, fit: 'cover' },
    ],
  },
];
```
`id` trong preset là placeholder tạm (bị `nextSpawnId` GHI ĐÈ lúc spawn thật) — chỉ cần DUY NHẤT
TRONG PHẠM VI 1 preset (không đụng `id` thật nào trên canvas).

## UI `GridPresetsPanel.tsx`

Grid `grid-cols-2 gap-3` tile LỚN HƠN (140×90px, tỷ lệ ngang vì layout lưới thường ngang) — mỗi
tile render mini-preview THẬT bằng `LayoutRenderer` (component đã có, dùng ở
`CrossLayoutVariantPickerModal` cho thumbnail layout) với 1 `LayoutContent` giả tạo TỪ CHÍNH
`items` của preset (bọc 1 `variant` tối giản `{aspect, refW:400, refH:355, items}`) + 1
`record` mẫu rỗng — render preview THẬT, không phải ảnh tĩnh vẽ tay, tự động khớp khi preset đổi.

## Definition of done

- [ ] Kéo tile Lưới tĩnh → chèn đúng N item, đúng vị trí tương đối, ĐÚNG 1 bước undo.
- [ ] Kéo tile Lưới động → chèn 1 LoopItem cấu hình sẵn.
- [ ] Luồng spawn CŨ (itemType/var) không hồi quy.
- [ ] Test nhánh `'preset'` + `batchCommand` tích hợp đúng.

