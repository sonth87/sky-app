import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import { addItemCommand, batchCommand } from '@sky-app/layout-editor-core';
import type { Editor } from '@sky-app/layout-editor-core';
import { screenPointToCanvas } from '../Canvas/helpers.js';

export type SpawnKind =
  | { kind: 'itemType'; type: LayoutItem['type']; label: string; overrides?: Partial<LayoutItem> }
  | { kind: 'var'; key: string; label: string }
  | { kind: 'preset'; items: LayoutItem[]; label: string };

let spawnIdCounter = 0;
export function nextSpawnId(prefix: string): string {
  spawnIdCounter += 1;
  return `${prefix}_${spawnIdCounter}`;
}

export function createSpawnedItem(spawnKind: SpawnKind, center: { x: number; y: number }, registry: Editor['itemTypes']): LayoutItem | LayoutItem[] | null {
  if (spawnKind.kind === 'var') {
    const id = nextSpawnId('var');
    const w = 260;
    return {
      id,
      type: 'text',
      box: { x: Math.round(center.x - w / 2), y: Math.round(center.y - 20), w, h: 50 },
      content: `@${spawnKind.key}`,
      fontSize: 26,
      fontWeight: 700,
      color: '#2E3A5B',
      align: 'center',
      shadow: true,
    } as LayoutItem;
  }

  if (spawnKind.kind === 'preset') {
    // Multi-item preset: adjust positions relative to drop point
    const dropBox = spawnKind.items[0];
    if (!dropBox) return null;
    const offsetX = center.x - dropBox.box.x;
    const offsetY = center.y - dropBox.box.y;

    return spawnKind.items.map((template) => ({
      ...template,
      id: nextSpawnId(template.type.slice(0, 4)),
      box: {
        ...template.box,
        x: Math.round(template.box.x + offsetX),
        y: Math.round(template.box.y + offsetY),
      },
    }));
  }

  const def = registry.get(spawnKind.type);
  if (!def) return null;
  const id = nextSpawnId(spawnKind.type.slice(0, 4));
  const item = def.createDefault(id);
  const w = item.box.w,
    h = item.box.h;
  item.box = { ...item.box, x: Math.round(center.x - w / 2), y: Math.round(center.y - h / 2) };

  // Apply overrides if provided
  if (spawnKind.overrides) {
    return { ...item, ...spawnKind.overrides, id: item.id, box: item.box } as LayoutItem;
  }

  return item;
}

export function useSpawnDrag(
  editor: Editor,
  variant: LayoutVariant,
  getArtEl: () => HTMLDivElement | null,
  getRootEl: () => HTMLDivElement | null,
  editingLoopId?: string,
  editingRefW?: number,
  editingRefH?: number,
) {
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null);
  const dragRef = useRef<SpawnKind | null>(null);

  const onDown = useCallback(
    (spawnKind: SpawnKind) => (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = spawnKind;
      const rootRect = getRootEl()?.getBoundingClientRect();
      setGhost({ x: e.clientX - (rootRect?.left ?? 0), y: e.clientY - (rootRect?.top ?? 0), label: spawnKind.label });
    },
    [getRootEl],
  );

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const rootRect = getRootEl()?.getBoundingClientRect();
      const x = e.clientX - (rootRect?.left ?? 0);
      const y = e.clientY - (rootRect?.top ?? 0);
      setGhost((g) => (g ? { ...g, x, y } : g));
    }
    function onUp(e: MouseEvent) {
      const spawnKind = dragRef.current;
      dragRef.current = null;
      setGhost(null);
      if (!spawnKind) return;
      const artEl = getArtEl();
      if (!artEl) return;
      const refW = editingLoopId ? (editingRefW ?? variant.refW) : variant.refW;
      const refH = editingLoopId ? (editingRefH ?? variant.refH) : variant.refH;
      const point = screenPointToCanvas(artEl, refW, refH, e.clientX, e.clientY);
      if (!point) return;

      const registry = editor.itemTypes;
      const newItem = createSpawnedItem(spawnKind, point, registry);
      if (!newItem) return;

      const state = editor.store.getState();
      if (Array.isArray(newItem)) {
        const commands = newItem.map((item) => addItemCommand(variant.aspect.id, item, editingLoopId));
        state.dispatch(commands.length === 1 ? commands[0]! : batchCommand(commands));
      } else {
        state.dispatch(addItemCommand(variant.aspect.id, newItem, editingLoopId));
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [editor, variant, getArtEl, getRootEl, editingLoopId, editingRefW, editingRefH]);

  return { ghost, onDown };
}
