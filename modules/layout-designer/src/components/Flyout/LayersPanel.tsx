import { useState } from 'react';
import { ChevronDown, ChevronRight, Pin, PinOff, X } from 'lucide-react';
import type { LayoutItem, LayoutVariant, RichTextContent, TiptapJSONDoc } from '@sky-app/slide-shared';
import { patchItemCommand, removeItemCommand } from '@sky-app/layout-editor-core';
import type { Editor } from '@sky-app/layout-editor-core';
import { useEditorState } from '../../hooks/useEditor.js';

export function iconOf(t: LayoutItem['type']) {
  return t === 'text' ? 'T' : t === 'image' ? '▦' : t === 'ribbon' ? '⚑' : t === 'loop' ? '⟲' : '◆';
}

/** Text thô nối từ mọi text node trong content.json — dùng cho nhãn Layers panel (chỉ cần
 * preview ngắn, KHÔNG cần giữ định dạng bold/italic như content.html dùng cho canvas/backdrop,
 * Bước 12). */
export function plainTextOf(content: string | RichTextContent): string {
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  const walk = (node: TiptapJSONDoc) => {
    if (typeof node.text === 'string') parts.push(node.text);
    if (node.content) for (const child of node.content) walk(child);
  };
  walk(content.json);
  return parts.join('');
}

export function labelOf(it: LayoutItem): string {
  // name tuỳ chỉnh (Bước 2, PropertyPanel's PanelHeader) ưu tiên hơn nhãn tự sinh theo type.
  if (it.name) return it.name;
  if (it.type === 'image') return it.varKey ? `Ảnh · @${it.varKey}` : 'Ảnh';
  if (it.type === 'shape') return 'Shape';
  if (it.type === 'loop') return 'Khung lặp';
  return plainTextOf(it.content) || '—';
}

export interface LayerNode {
  item: LayoutItem;
  /** Path đầy đủ (loopId.loopId....itemId) — dùng làm React key, tránh key collision vì id
   * trong itemTemplate KHÔNG cách biệt namespace với id top-level (Bước 6, rủi ro đã ghi trong
   * plan). CŨNG dùng để phân biệt "item lồng" (path.length>1) — chỉ item TOP-LEVEL (path.length
   * === 1) mới setSelection được ở bước này (đợi Bước 9 mới chọn được node lồng). */
  path: string[];
  depth: number;
  children: LayerNode[];
}

export function buildLayerTree(items: LayoutItem[], parentPath: string[] = []): LayerNode[] {
  // Đảo ngược thứ tự hiển thị (item vẽ sau/z cao hơn hiện ở TRÊN cùng danh sách, quy ước layer
  // panel thông thường) — CHỈ đảo ở cấp hiện tại, giữ nguyên thứ tự bên trong itemTemplate.
  return [...items].reverse().map((item) => {
    const path = [...parentPath, item.id];
    const children = item.type === 'loop' ? buildLayerTree(item.itemTemplate, path) : [];
    return { item, path, depth: parentPath.length, children };
  });
}

export function flattenVisible(nodes: LayerNode[], expanded: Set<string>): LayerNode[] {
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

export function LayersPanel({ editor, variant }: { editor: Editor; variant: LayoutVariant }) {
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
