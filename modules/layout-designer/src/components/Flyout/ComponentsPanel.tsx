import type { Editor, ItemTypeDefinition } from '@sky-app/layout-editor-core';
import type { SpawnKind } from './useSpawnDrag.js';

export const COMPONENT_TILES: { type: string; icon: string; label: string }[] = [
  { type: 'text', icon: 'T', label: 'Chữ' },
  { type: 'image', icon: '▦', label: 'Ảnh' },
  { type: 'shape', icon: '◆', label: 'Shape' },
  { type: 'ribbon', icon: '⚑', label: 'Ribbon' },
  { type: 'loop', icon: '⟲', label: 'Khung lặp' },
];

export interface ComponentsPanelProps {
  editor: Editor;
  onSpawnDown: (k: SpawnKind) => (e: React.MouseEvent) => void;
}

export function ComponentsPanel({ editor, onSpawnDown }: ComponentsPanelProps) {
  return (
    <>
      <div className="px-[15px] pt-[15px] pb-[10px] font-bold text-[13px]">Thành phần</div>
      <div className="px-[14px] pb-[6px] text-[11px] text-[#9a9bab] leading-[1.45]">Kéo từng khối ra canvas.</div>
      <div className="p-[8px_14px_14px] overflow-y-auto grid grid-cols-2 gap-[9px]">
        {COMPONENT_TILES.map((t) => {
          const def: ItemTypeDefinition | undefined = editor.itemTypes.get(t.type);
          return (
            <div
              key={t.type}
              onMouseDown={onSpawnDown({ kind: 'itemType', type: t.type as any, label: def?.label ?? t.label })}
              className="h-[60px] border border-[#e6e6ee] rounded-[11px] flex flex-col items-center justify-center gap-[5px] font-semibold text-[11px] text-[#5c5d6e] cursor-grab bg-[#fcfcfd] hover:bg-neutral-50"
            >
              <span className="text-[16px]">{t.icon}</span>
              {t.label}
            </div>
          );
        })}
      </div>
    </>
  );
}
