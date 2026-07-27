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
      <div style={{ padding: '15px 15px 10px', fontWeight: 700, fontSize: 13 }}>Thành phần</div>
      <div style={{ padding: '0 14px 6px', fontSize: 11, color: '#9a9bab', lineHeight: 1.45 }}>Kéo từng khối ra canvas.</div>
      <div style={{ padding: '8px 14px 14px', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
        {COMPONENT_TILES.map((t) => {
          const def: ItemTypeDefinition | undefined = editor.itemTypes.get(t.type);
          return (
            <div
              key={t.type}
              onMouseDown={onSpawnDown({ kind: 'itemType', type: t.type as any, label: def?.label ?? t.label })}
              style={{ height: 60, border: '1px solid #e6e6ee', borderRadius: 11, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, fontWeight: 600, fontSize: 11, color: '#5c5d6e', cursor: 'grab', background: '#fcfcfd' }}
            >
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              {t.label}
            </div>
          );
        })}
      </div>
    </>
  );
}
