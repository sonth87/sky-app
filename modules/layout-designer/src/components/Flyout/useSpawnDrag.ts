import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import { addItemCommand } from '@sky-app/layout-editor-core';
import type { Editor } from '@sky-app/layout-editor-core';
import { screenPointToCanvas } from '../Canvas/helpers.js';

export type SpawnKind = { kind: 'itemType'; type: LayoutItem['type']; label: string } | { kind: 'var'; key: string; label: string };

let spawnIdCounter = 0;
export function nextSpawnId(prefix: string): string {
  spawnIdCounter += 1;
  return `${prefix}_${spawnIdCounter}`;
}

export function createSpawnedItem(spawnKind: SpawnKind, center: { x: number; y: number }, registry: Editor['itemTypes']): LayoutItem | null {
  if (spawnKind.kind === 'var') {
    const id = nextSpawnId('var');
    const w = 260;
    return {
      id,
      type: 'text',
      // KHÔNG còn Math.max(0, ...) clamp về biên (bỏ 2026-07-18) — cho phép spawn item ở toạ độ
      // âm khi thả NGOÀI Frame (Canvas cho kéo tự do, xem comment đầu Canvas.tsx).
      box: { x: Math.round(center.x - w / 2), y: Math.round(center.y - 20), w, h: 50 },
      content: `@${spawnKind.key}`,
      fontSize: 26,
      fontWeight: 700,
      color: '#2E3A5B',
      align: 'center',
      shadow: true,
    };
  }

  const def = registry.get(spawnKind.type);
  if (!def) return null;
  const id = nextSpawnId(spawnKind.type.slice(0, 4));
  const item = def.createDefault(id);
  const w = item.box.w,
    h = item.box.h;
  // KHÔNG còn Math.max(0, ...) clamp về biên (bỏ 2026-07-18) — xem comment ở nhánh 'var' ở trên.
  item.box = { ...item.box, x: Math.round(center.x - w / 2), y: Math.round(center.y - h / 2) };
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
      editor.store.getState().dispatch(addItemCommand(variant.aspect.id, newItem, editingLoopId));
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
