import { useState } from 'react';
import { ChevronDown, ChevronRight, Pin, PinOff, X } from 'lucide-react';
import type { LayoutItem, LayoutVariant, RichTextContent, TiptapJSONDoc } from '@sky-app/slide-shared';
import { patchItemCommand, removeItemCommand } from '@sky-app/layout-editor-core';
import type { Editor } from '@sky-app/layout-editor-core';
import { useEditorState } from '../../hooks/useEditor.js';
import { getItemTypeIcon } from '../../itemTypeIcons.js';
import { cn } from '@sky-app/ui';

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
  if (it.name) return it.name;
  if (it.type === 'image') return it.varKey ? `Ảnh · @${it.varKey}` : 'Ảnh';
  if (it.type === 'shape') return 'Shape';
  if (it.type === 'loop') return 'Khung lặp';
  if (it.type === 'gallery') return `Bộ ảnh · ${it.images.length} ảnh`;
  return plainTextOf(it.content) || '—';
}

export interface LayerNode {
  item: LayoutItem;
  path: string[];
  depth: number;
  children: LayerNode[];
}

export function buildLayerTree(items: LayoutItem[], parentPath: string[] = []): LayerNode[] {
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
      <div className="px-[15px] pt-[15px] pb-[10px] font-bold text-[13px]">Lớp</div>
      <div className="p-[6px_14px_14px] overflow-y-auto flex-1 flex flex-col gap-[5px]">
        {visible.map((node) => {
          const { item: it, path, depth } = node;
          const key = path.join('.');
          const isTopLevel = path.length === 1;
          const on = isTopLevel && selection.includes(it.id);
          const isExpanded = expanded.has(key);
          const TypeIcon = getItemTypeIcon(it.type);
          return (
            <div
              key={key}
              onClick={() => {
                if (isTopLevel) editor.store.getState().setSelection([it.id]);
              }}
              title={isTopLevel ? undefined : 'Nhấp đúp vào khung lặp trên canvas để sửa mẫu'}
              className={cn(
                'shrink-0 flex items-center gap-2 py-[7px] px-[9px] rounded-lg border',
                isTopLevel ? 'cursor-pointer opacity-100' : 'cursor-default opacity-55',
                on
                  ? 'bg-[#4b57e6]/10 text-[#4b57e6] border-[#4b57e6]/30'
                  : 'bg-transparent text-[#5c5d6e] border-transparent hover:bg-neutral-50'
              )}
              style={{
                paddingLeft: 9 + depth * 18,
              }}
            >
              {node.children.length > 0 ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(key);
                  }}
                  aria-label={isExpanded ? `Thu gọn ${labelOf(it)}` : `Mở rộng ${labelOf(it)}`}
                  className="flex items-center border-none bg-transparent text-[#9a9bab] cursor-pointer p-0 w-3.5"
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
              ) : (
                <span className="w-3.5" />
              )}
              <span className="w-[22px] flex items-center justify-center text-[#9a9bab]"><TypeIcon size={13} /></span>
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-[11.5px]">{labelOf(it)}</span>
              {isTopLevel && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      editor.store.getState().dispatch(patchItemCommand(variant.aspect.id, it.id, it, { locked: !it.locked }));
                    }}
                    aria-label={it.locked ? `Mở khoá ${labelOf(it)}` : `Khoá ${labelOf(it)}`}
                    className={cn(
                      'flex items-center border-none bg-transparent cursor-pointer px-0.5',
                      it.locked ? 'text-[#4b57e6]' : 'text-[#c9c9d3] hover:text-[#9a9bab]'
                    )}
                  >
                    {it.locked ? <PinOff size={13} /> : <Pin size={13} />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      editor.store.getState().dispatch(removeItemCommand(variant.aspect.id, it.id));
                    }}
                    aria-label={`Xoá ${labelOf(it)}`}
                    className="flex items-center border-none bg-transparent text-[#c9c9d3] hover:text-red-500 cursor-pointer px-0.5"
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
