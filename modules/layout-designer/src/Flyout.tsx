// Flyout — panel nội dung theo group Rail đang active, theo prototype "Backdrop Editor 2a -
// keo tha.dc.html" §FLYOUT. Spawn item mới: kéo tile ra khỏi flyout → ghost theo con trỏ →
// thả trong vùng canvas → addItemCommand tại đúng vị trí thả (quy đổi qua screenPointToCanvas).

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Pin, PinOff, X } from 'lucide-react';
import type { LayoutItem, LayoutVariant, RichTextContent, TiptapJSONDoc } from '@sky-app/slide-shared';
import { extractTokenKeysFromContent } from '@sky-app/slide-shared';
import type { AssetMeta } from '@sky-app/service-contracts';
import { addItemCommand, patchItemCommand, removeItemCommand } from '@sky-app/layout-editor-core';
import type { Editor, ItemTypeDefinition } from '@sky-app/layout-editor-core';
import { useEditorState } from './useEditor.js';
import { useResolvedAssetUrl } from './useResolvedAssetUrl.js';
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
  /** Có giá trị khi đang ở chế độ sửa mẫu LoopItem (Bước 10 kế hoạch resize/rotate, 2026-07-18) —
   * spawn item MỚI vào itemTemplate của LoopItem này thay vì variant.items top-level.
   * `editingRefW/H` = kích thước "ô" (itemBox.w/h) dùng để quy đổi toạ độ thả thay cho
   * variant.refW/refH khi đang edit-mode (artEl hiển thị theo kích thước ô, không phải variant). */
  editingLoopId?: string;
  editingRefW?: number;
  editingRefH?: number;
  /** Media Library (Bước 11 kế hoạch resize/rotate, 2026-07-18) — bỏ trống = panel "Ảnh" hiện
   * thông báo chưa khả dụng (hành vi cũ, VD preview độc lập không có AssetPort). */
  listAssets?: () => Promise<AssetMeta[]>;
  resolveAssetUrl?: (path: string) => Promise<string>;
}

export function Flyout({ editor, variant, group, getArtEl, getRootEl, editingLoopId, editingRefW, editingRefH, listAssets, resolveAssetUrl }: FlyoutProps) {
  const spawn = useSpawnDrag(editor, variant, getArtEl, getRootEl, editingLoopId, editingRefW, editingRefH);

  return (
    <div style={{ width: 242, flex: 'none', borderRight: '1px solid #e6e6ee', background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {group === 'comp' && <ComponentsPanel editor={editor} onSpawnDown={spawn.onDown} />}
      {group === 'tpl' && <TemplatesPanel />}
      {group === 'coll' && <CollectionsPanel />}
      {group === 'var' && <VariablesPanel variant={variant} onSpawnDown={spawn.onDown} />}
      {group === 'img' && (
        <ImagePanel
          editor={editor}
          variant={variant}
          loopItemId={editingLoopId}
          listAssets={listAssets}
          resolveAssetUrl={resolveAssetUrl}
        />
      )}
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

/** Hook quản lý kéo-thả spawn: mousedown trên tile palette → theo dõi con trỏ → thả vào canvas.
 * `editingLoopId`/`editingRefW`/`editingRefH` (Bước 10) — khi có, spawn vào itemTemplate của
 * LoopItem đó, quy đổi toạ độ thả theo kích thước "ô" thay vì variant.refW/refH. */
function useSpawnDrag(
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
  const scan = (items: LayoutItem[]) => {
    for (const item of items) {
      // extractTokenKeysFromContent (slide-shared/tokens.ts) — nguồn chân lý DUY NHẤT cho regex
      // @var, xử lý CẢ content string LẪN Tiptap JSON (Bước 12 kế hoạch resize/rotate,
      // 2026-07-18). KHÔNG tự viết lại regex ở đây (từng có, đã bỏ — tránh lệch quy định file 09).
      if (item.type === 'text' || item.type === 'ribbon') {
        for (const key of extractTokenKeysFromContent(item.content)) keys.add(key);
      }
      if (item.type === 'image' && item.varKey) keys.add(item.varKey);
      if (item.type === 'loop') scan(item.itemTemplate);
    }
  };
  scan(variant.items);
  return keys;
}

// ─── Panel: Ảnh (upload — asset 3 tầng thật thuộc phạm vi riêng trong GĐ2) ─

/**
 * Media Library (Bước 11 kế hoạch resize/rotate, 2026-07-18) — lưới thumbnail ảnh đã lưu qua
 * AssetPort.listAssets(). Click 1 ảnh → gán vào ImageItem.src của item đang chọn NẾU đó là
 * ImageItem (patchItemCommand); ngược lại (không chọn gì / chọn item khác loại) → spawn 1
 * ImageItem MỚI tại giữa canvas với src đó (tái dùng item-type registry's createDefault, cùng
 * cách ComponentsPanel spawn item mới, chỉ khác src gán sẵn thay vì rỗng).
 */
function ImagePanel({
  editor,
  variant,
  loopItemId,
  listAssets,
  resolveAssetUrl,
}: {
  editor: Editor;
  variant: LayoutVariant;
  loopItemId?: string;
  listAssets?: () => Promise<AssetMeta[]>;
  resolveAssetUrl?: (path: string) => Promise<string>;
}) {
  const selection = useEditorState(editor, (s) => s.selection);
  const [assets, setAssets] = useState<AssetMeta[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!listAssets) return;
    let cancelled = false;
    listAssets()
      .then((list) => {
        if (!cancelled) setAssets(list);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [listAssets]);

  if (!listAssets) {
    return (
      <>
        <div style={{ padding: '15px 15px 10px', fontWeight: 700, fontSize: 13 }}>Ảnh</div>
        <div style={{ padding: '0 14px', fontSize: 11, color: '#9a9bab', lineHeight: 1.45 }}>
          Tải ảnh — nối tầng lưu trữ thật (Electron file / data-service upload / WASM blob) ở phần asset ảnh 3 tầng.
        </div>
      </>
    );
  }

  const handlePick = (asset: AssetMeta) => {
    const items = editingItemsOf(variant, loopItemId);
    const selected = items.find((i) => i.id === selection[0]);
    if (selected && selected.type === 'image') {
      editor.store.getState().dispatch(patchItemCommand(variant.aspect.id, selected.id, selected, { src: asset.relativePath }, loopItemId));
      return;
    }
    const newItem: LayoutItem = {
      id: nextSpawnId('img'),
      type: 'image',
      box: { x: 100, y: 100, w: 200, h: 200 },
      src: asset.relativePath,
    };
    editor.store.getState().dispatch(addItemCommand(variant.aspect.id, newItem, loopItemId));
  };

  return (
    <>
      <div style={{ padding: '15px 15px 10px', fontWeight: 700, fontSize: 13 }}>Ảnh</div>
      <div style={{ padding: '0 14px 8px', fontSize: 11, color: '#9a9bab', lineHeight: 1.45 }}>Nhấp để gán vào ảnh đang chọn, hoặc thêm ảnh mới.</div>
      {loadError && <div style={{ padding: '0 14px', fontSize: 11, color: '#c0521e' }}>Không tải được danh sách ảnh.</div>}
      {assets && assets.length === 0 && !loadError && (
        <div style={{ padding: '0 14px', fontSize: 11, color: '#9a9bab' }}>Chưa có ảnh nào — dùng nút &quot;Đổi ảnh&quot; ở panel thuộc tính để tải lên.</div>
      )}
      <div style={{ padding: '4px 14px 14px', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(assets ?? []).map((asset) => (
          <AssetThumbnail key={asset.relativePath} asset={asset} resolveAssetUrl={resolveAssetUrl} onClick={() => handlePick(asset)} />
        ))}
      </div>
    </>
  );
}

function editingItemsOf(variant: LayoutVariant, loopItemId?: string): LayoutItem[] {
  if (!loopItemId) return variant.items;
  const loop = variant.items.find((i) => i.id === loopItemId);
  return loop && loop.type === 'loop' ? loop.itemTemplate : [];
}

function AssetThumbnail({ asset, resolveAssetUrl, onClick }: { asset: AssetMeta; resolveAssetUrl?: (path: string) => Promise<string>; onClick: () => void }) {
  const url = useResolvedAssetUrl(asset.relativePath, resolveAssetUrl);
  return (
    <button
      onClick={onClick}
      title={asset.name}
      style={{
        aspectRatio: '1',
        border: '1px solid #e6e6ee',
        borderRadius: 8,
        padding: 0,
        overflow: 'hidden',
        cursor: 'pointer',
        background: url ? `center/cover url(${url})` : 'repeating-linear-gradient(45deg,#c9c9d6 0 8px,#e4e4ee 8px 16px)',
      }}
    />
  );
}

// ─── Panel: Lớp ───────────────────────────────────────────────────

function iconOf(t: LayoutItem['type']) {
  return t === 'text' ? 'T' : t === 'image' ? '▦' : t === 'ribbon' ? '⚑' : t === 'loop' ? '⟲' : '◆';
}

/** Text thô nối từ mọi text node trong content.json — dùng cho nhãn Layers panel (chỉ cần
 * preview ngắn, KHÔNG cần giữ định dạng bold/italic như content.html dùng cho canvas/backdrop,
 * Bước 12). */
function plainTextOf(content: string | RichTextContent): string {
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  const walk = (node: TiptapJSONDoc) => {
    if (typeof node.text === 'string') parts.push(node.text);
    if (node.content) for (const child of node.content) walk(child);
  };
  walk(content.json);
  return parts.join('');
}

function labelOf(it: LayoutItem): string {
  // name tuỳ chỉnh (Bước 2, PropertyPanel's PanelHeader) ưu tiên hơn nhãn tự sinh theo type.
  if (it.name) return it.name;
  if (it.type === 'image') return it.varKey ? `Ảnh · @${it.varKey}` : 'Ảnh';
  if (it.type === 'shape') return 'Shape';
  if (it.type === 'loop') return 'Khung lặp';
  return plainTextOf(it.content) || '—';
}

interface LayerNode {
  item: LayoutItem;
  /** Path đầy đủ (loopId.loopId....itemId) — dùng làm React key, tránh key collision vì id
   * trong itemTemplate KHÔNG cách biệt namespace với id top-level (Bước 6, rủi ro đã ghi trong
   * plan). CŨNG dùng để phân biệt "item lồng" (path.length>1) — chỉ item TOP-LEVEL (path.length
   * === 1) mới setSelection được ở bước này (đợi Bước 9 mới chọn được node lồng). */
  path: string[];
  depth: number;
  children: LayerNode[];
}

function buildLayerTree(items: LayoutItem[], parentPath: string[] = []): LayerNode[] {
  // Đảo ngược thứ tự hiển thị (item vẽ sau/z cao hơn hiện ở TRÊN cùng danh sách, quy ước layer
  // panel thông thường) — CHỈ đảo ở cấp hiện tại, giữ nguyên thứ tự bên trong itemTemplate.
  return [...items].reverse().map((item) => {
    const path = [...parentPath, item.id];
    const children = item.type === 'loop' ? buildLayerTree(item.itemTemplate, path) : [];
    return { item, path, depth: parentPath.length, children };
  });
}

function flattenVisible(nodes: LayerNode[], expanded: Set<string>): LayerNode[] {
  const result: LayerNode[] = [];
  for (const node of nodes) {
    result.push(node);
    const key = node.path.join('.');
    if (node.children.length > 0 && expanded.has(key)) {
      result.push(...flattenVisible(node.children, expanded));
    }
  }
  return result;
}

function LayersPanel({ editor, variant }: { editor: Editor; variant: LayoutVariant }) {
  const selection = useEditorState(editor, (s) => s.selection);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tree = buildLayerTree(variant.items);
  const visible = flattenVisible(tree, expanded);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <>
      <div style={{ padding: '15px 15px 10px', fontWeight: 700, fontSize: 13 }}>Lớp</div>
      <div style={{ padding: '6px 14px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {visible.map((node) => {
          const { item: it, path, depth } = node;
          const key = path.join('.');
          const isTopLevel = path.length === 1;
          const on = isTopLevel && selection.includes(it.id);
          const isExpanded = expanded.has(key);
          return (
            <div
              key={key}
              onClick={() => {
                if (isTopLevel) editor.store.getState().setSelection([it.id]);
                // Node lồng trong itemTemplate: KHÔNG setSelection (id không tồn tại trong
                // variant.items → PropertyPanel/Canvas sẽ âm thầm không tìm thấy gì, bug im lặng
                // đã ghi trong plan) — đợi Bước 9 (cầu nối dữ liệu loopItemId) mới chọn được.
              }}
              title={isTopLevel ? undefined : 'Nhấp đúp vào khung lặp trên canvas để sửa mẫu'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 9px',
                paddingLeft: 9 + depth * 18,
                borderRadius: 8,
                cursor: isTopLevel ? 'pointer' : 'default',
                opacity: isTopLevel ? 1 : 0.55,
                background: on ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 10%, transparent)' : 'transparent',
                color: on ? 'var(--accent-color, #4b57e6)' : '#5c5d6e',
                border: `1px solid ${on ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 30%, transparent)' : 'transparent'}`,
              }}
            >
              {node.children.length > 0 ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(key);
                  }}
                  aria-label={isExpanded ? `Thu gọn ${labelOf(it)}` : `Mở rộng ${labelOf(it)}`}
                  style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'transparent', color: '#9a9bab', cursor: 'pointer', padding: 0, width: 14 }}
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
              ) : (
                <span style={{ width: 14 }} />
              )}
              <span style={{ width: 22, textAlign: 'center' }}>{iconOf(it.type)}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 11.5 }}>{labelOf(it)}</span>
              {isTopLevel && (
                <>
                  {/* locked (Bước 2) — toggle nhanh ngay trong Layers, cùng ý nghĩa với nút Pin/
                     PinOff ở PropertyPanel's PanelHeader (khoá DI CHUYỂN, khác syncLocked). CHỈ
                     top-level (item lồng chưa có cầu nối patchItem, đợi Bước 9). */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      editor.store.getState().dispatch(patchItemCommand(variant.aspect.id, it.id, it, { locked: !it.locked }));
                    }}
                    aria-label={it.locked ? `Mở khoá ${labelOf(it)}` : `Khoá ${labelOf(it)}`}
                    style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'transparent', color: it.locked ? 'var(--accent-color, #4b57e6)' : '#c9c9d3', cursor: 'pointer', padding: '0 2px' }}
                  >
                    {it.locked ? <PinOff size={13} /> : <Pin size={13} />}
                  </button>
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
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
