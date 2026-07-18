// Flyout — panel nội dung theo group Rail đang active, theo prototype "Backdrop Editor 2a -
// keo tha.dc.html" §FLYOUT. Spawn item mới: kéo tile ra khỏi flyout → ghost theo con trỏ →
// thả trong vùng canvas → addItemCommand tại đúng vị trí thả (quy đổi qua screenPointToCanvas).

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import { addItemCommand, removeItemCommand } from '@sky-app/layout-editor-core';
import type { Editor, ItemTypeDefinition } from '@sky-app/layout-editor-core';
import { useEditorState } from './useEditor.js';
import { screenPointToCanvas } from './Canvas.js';
import type { RailGroup } from './Rail.js';

export interface FlyoutProps {
  editor: Editor;
  variant: LayoutVariant;
  group: RailGroup;
  getArtEl: () => HTMLDivElement | null;
  /** Phần tử root của LayoutDesignerApp (position:relative) — containing block CỤC BỘ cho ghost
   * label. KHÔNG dùng position:fixed + clientX/clientY trực tiếp: @sonth87/device-layout's
   * Window.tsx bọc app trong 1 motion.div giữ `transform` inline THƯỜNG TRỰC (kể cả scale(1)
   * lúc nghỉ) — transform ≠ none trên ancestor biến nó thành containing block cho fixed, khiến
   * ghost hiện lệch xa khỏi con trỏ chuột thật (bug thật, xác nhận qua ảnh chụp 2026-07-17). */
  getRootEl: () => HTMLDivElement | null;
}

export function Flyout({ editor, variant, group, getArtEl, getRootEl }: FlyoutProps) {
  const spawn = useSpawnDrag(editor, variant, getArtEl, getRootEl);

  return (
    <div style={{ width: 242, flex: 'none', borderRight: '1px solid #e6e6ee', background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {group === 'comp' && <ComponentsPanel editor={editor} onSpawnDown={spawn.onDown} />}
      {group === 'tpl' && <TemplatesPanel />}
      {group === 'coll' && <CollectionsPanel />}
      {group === 'var' && <VariablesPanel variant={variant} onSpawnDown={spawn.onDown} />}
      {group === 'img' && <ImagePanel />}
      {group === 'layers' && <LayersPanel editor={editor} variant={variant} />}
      {spawn.ghost && (
        <div
          style={{
            position: 'absolute',
            left: spawn.ghost.x + 10,
            top: spawn.ghost.y + 10,
            pointerEvents: 'none',
            zIndex: 9999,
            background: '#fff',
            border: '1px solid var(--accent-color, #4b57e6)',
            borderRadius: 8,
            padding: '6px 11px',
            fontWeight: 700,
            fontSize: 12,
            color: 'var(--accent-color, #4b57e6)',
            boxShadow: '0 10px 26px rgba(20,20,40,.25)',
          }}
        >
          {spawn.ghost.label}
        </div>
      )}
    </div>
  );
}

type SpawnKind = { kind: 'itemType'; type: LayoutItem['type']; label: string } | { kind: 'var'; key: string; label: string };

/** Hook quản lý kéo-thả spawn: mousedown trên tile palette → theo dõi con trỏ → thả vào canvas. */
function useSpawnDrag(editor: Editor, variant: LayoutVariant, getArtEl: () => HTMLDivElement | null, getRootEl: () => HTMLDivElement | null) {
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
      const point = screenPointToCanvas(artEl, variant, e.clientX, e.clientY);
      if (!point) return;

      const registry = editor.itemTypes;
      const newItem = createSpawnedItem(spawnKind, point, registry);
      if (!newItem) return;
      editor.store.getState().dispatch(addItemCommand(variant.aspect.id, newItem));
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [editor, variant, getArtEl, getRootEl]);

  return { ghost, onDown };
}

let spawnIdCounter = 0;
function nextSpawnId(prefix: string): string {
  spawnIdCounter += 1;
  return `${prefix}_${spawnIdCounter}`;
}

function createSpawnedItem(spawnKind: SpawnKind, center: { x: number; y: number }, registry: Editor['itemTypes']): LayoutItem | null {
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
      // #2E3A5B, KHÔNG dùng trắng — cùng lý do item-type.ts's DEFAULT_TEXT_BOX createDefault
      // (Frame mặc định nền trắng, chữ trắng vô hình lúc vừa kéo ra).
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

// ─── Panel: Thành phần ───────────────────────────────────────────

const COMPONENT_TILES: { type: LayoutItem['type']; icon: string; label: string }[] = [
  { type: 'text', icon: 'T', label: 'Chữ' },
  { type: 'image', icon: '▦', label: 'Ảnh' },
  { type: 'shape', icon: '◆', label: 'Shape' },
  { type: 'ribbon', icon: '⚑', label: 'Ribbon' },
  { type: 'loop', icon: '⟲', label: 'Khung lặp' },
];

function ComponentsPanel({ editor, onSpawnDown }: { editor: Editor; onSpawnDown: (k: SpawnKind) => (e: React.MouseEvent) => void }) {
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
              onMouseDown={onSpawnDown({ kind: 'itemType', type: t.type, label: def?.label ?? t.label })}
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

// ─── Panel: Mẫu (giữ tối giản — Layout Library đầy đủ hoãn GĐ5) ────

function TemplatesPanel() {
  return (
    <>
      <div style={{ padding: '15px 15px 10px', fontWeight: 700, fontSize: 13 }}>Mẫu</div>
      <div style={{ padding: '0 14px', fontSize: 11, color: '#9a9bab', lineHeight: 1.45 }}>
        Chưa khả dụng — Layout Library đầy đủ thuộc Giai đoạn 5 (xem docs/roadmap/plans/layout-designer/12-thu-vien-layout.md).
      </div>
    </>
  );
}

// ─── Panel: Bộ sưu tập (giữ tối giản — cụm dựng sẵn từ server, hoãn) ─

function CollectionsPanel() {
  return (
    <>
      <div style={{ padding: '15px 15px 10px', fontWeight: 700, fontSize: 13 }}>Bộ sưu tập</div>
      <div style={{ padding: '0 14px', fontSize: 11, color: '#9a9bab', lineHeight: 1.45 }}>Chưa khả dụng — cần đồng bộ cụm dựng sẵn từ server.</div>
    </>
  );
}

// ─── Panel: Biến — dùng LayoutContent.variables (variable_registry thật thuộc 2.5) ─

function VariablesPanel({ variant, onSpawnDown }: { variant: LayoutVariant; onSpawnDown: (k: SpawnKind) => (e: React.MouseEvent) => void }) {
  const usedKeys = collectUsedTokenKeys(variant);
  // Nguồn gợi ý tạm: chỉ token ĐÃ dùng trong layout hiện tại — variable_registry toàn cục
  // (lịch sử token mọi layout, autocomplete khi gõ @) thuộc sub-bước 2.5, chưa có ở đây.
  const keys = [...usedKeys];

  return (
    <>
      <div style={{ padding: '14px 15px 6px', fontWeight: 700, fontSize: 13 }}>Biến</div>
      <div style={{ padding: '0 14px 12px', fontSize: 11, color: '#9a9bab', lineHeight: 1.45 }}>
        Token đang dùng trong layout này. Gợi ý toàn cục (variable_registry) sẽ có ở bước sau.
      </div>
      {keys.length === 0 ? (
        <div style={{ padding: '0 14px', fontSize: 11, color: '#c9c9d3' }}>Chưa có token nào — gõ @ten_bien trong ô nội dung.</div>
      ) : (
        <div style={{ padding: '0 14px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {keys.map((key) => (
            <div
              key={key}
              onMouseDown={onSpawnDown({ kind: 'var', key, label: `@${key}` })}
              style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid #eceef2', borderRadius: 8, padding: '7px 9px', cursor: 'grab', background: '#fcfcfd' }}
            >
              <span style={{ background: '#fbeede', color: '#c07a1e', borderRadius: 5, padding: '2px 6px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 10.5 }}>@{key}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function collectUsedTokenKeys(variant: LayoutVariant): Set<string> {
  const keys = new Set<string>();
  const re = /@([a-zA-Z0-9_-]+)/g;
  const scan = (items: LayoutItem[]) => {
    for (const item of items) {
      if (item.type === 'text' || item.type === 'ribbon') {
        for (const m of item.content.matchAll(re)) keys.add(m[1]!);
      }
      if (item.type === 'image' && item.varKey) keys.add(item.varKey);
      if (item.type === 'loop') scan(item.itemTemplate);
    }
  };
  scan(variant.items);
  return keys;
}

// ─── Panel: Ảnh (upload — asset 3 tầng thật thuộc phạm vi riêng trong GĐ2) ─

function ImagePanel() {
  return (
    <>
      <div style={{ padding: '15px 15px 10px', fontWeight: 700, fontSize: 13 }}>Ảnh</div>
      <div style={{ padding: '0 14px', fontSize: 11, color: '#9a9bab', lineHeight: 1.45 }}>
        Tải ảnh — nối tầng lưu trữ thật (Electron file / data-service upload / WASM blob) ở phần asset ảnh 3 tầng.
      </div>
    </>
  );
}

// ─── Panel: Lớp ───────────────────────────────────────────────────

function LayersPanel({ editor, variant }: { editor: Editor; variant: LayoutVariant }) {
  const selection = useEditorState(editor, (s) => s.selection);
  const layers = [...variant.items].reverse();

  const iconOf = (t: LayoutItem['type']) => (t === 'text' ? 'T' : t === 'image' ? '▦' : t === 'ribbon' ? '⚑' : t === 'loop' ? '⟲' : '◆');
  const labelOf = (it: LayoutItem) => {
    if (it.type === 'image') return it.varKey ? `Ảnh · @${it.varKey}` : 'Ảnh';
    if (it.type === 'shape') return 'Shape';
    if (it.type === 'loop') return 'Khung lặp';
    return it.content || '—';
  };

  return (
    <>
      <div style={{ padding: '15px 15px 10px', fontWeight: 700, fontSize: 13 }}>Lớp</div>
      <div style={{ padding: '6px 14px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {layers.map((it) => {
          const on = selection.includes(it.id);
          return (
            <div
              key={it.id}
              onClick={() => editor.store.getState().setSelection([it.id])}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 9px',
                borderRadius: 8,
                cursor: 'pointer',
                background: on ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 10%, transparent)' : 'transparent',
                color: on ? 'var(--accent-color, #4b57e6)' : '#5c5d6e',
                border: `1px solid ${on ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 30%, transparent)' : 'transparent'}`,
              }}
            >
              <span style={{ width: 22, textAlign: 'center' }}>{iconOf(it.type)}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 11.5 }}>{labelOf(it)}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  editor.store.getState().dispatch(removeItemCommand(variant.aspect.id, it.id));
                }}
                aria-label={`Xoá ${labelOf(it)}`}
                style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'transparent', color: '#c9c9d3', cursor: 'pointer', padding: '0 2px' }}
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
