import { useMemo } from 'react';
import type { LayoutItem } from '@sky-app/slide-shared';
import { ICON_PRESETS } from '@sky-app/slide-shared';
import type { Editor, ItemTypeDefinition } from '@sky-app/layout-editor-core';
import type { SpawnKind } from './useSpawnDrag.js';
import { FRAME_PRESETS } from '../../presets/framePresets.js';
import { getItemTypeIcon } from '../../itemTypeIcons.js';
import { cn } from '@sky-app/ui';

export interface GraphicsPanelProps {
  editor: Editor;
  /** Bắt đầu kéo — dùng CHUNG 1 instance useSpawnDrag từ Flyout.tsx (đã có getArtEl/getRootEl
   * THẬT qua props, xem LayoutDesignerApp.tsx's artElRef/rootElRef) — KHÔNG tự tạo useSpawnDrag
   * riêng trong panel này. Bugfix 2026-08-10: bản cũ tự gọi useSpawnDrag với getArtEl/getRootEl
   * tra qua `document.querySelector('[data-art]'/'[data-layout-designer-root]')` — 2 attribute
   * này KHÔNG TỒN TẠI ở bất kỳ đâu trong DOM thật, nên querySelector luôn trả null, khiến
   * useSpawnDrag's onUp bail-out sớm (`if (!artEl) return`) — kéo thả hiện ghost nhưng thả ra
   * KHÔNG BAO GIỜ tạo item (bug "kéo component ra canvas không có tác dụng gì"). */
  onSpawnDown: (k: SpawnKind) => (e: React.MouseEvent) => void;
}

interface ShapePreset {
  shape: 'rect' | 'round' | 'circle' | 'triangle' | 'diamond' | 'line';
  label: string;
}

const SHAPE_PRESETS: ShapePreset[] = [
  { shape: 'rect', label: 'Vuông' },
  { shape: 'circle', label: 'Tròn' },
  { shape: 'triangle', label: 'Tam giác' },
  { shape: 'diamond', label: 'Kim cương' },
  { shape: 'round', label: 'Vuông tròn' },
  { shape: 'line', label: 'Đường kẻ' },
];

const BASIC_COMPONENT_TILES: { type: LayoutItem['type']; label: string }[] = [
  { type: 'text', label: 'Chữ' },
  { type: 'image', label: 'Ảnh' },
  { type: 'ribbon', label: 'Ribbon' },
  { type: 'loop', label: 'Khung lặp' },
];

export function GraphicsPanel({ editor, onSpawnDown }: GraphicsPanelProps) {
  const basicComponentKinds: SpawnKind[] = useMemo(
    () =>
      BASIC_COMPONENT_TILES.map((t) => {
        const def: ItemTypeDefinition | undefined = editor.itemTypes.get(t.type);
        return {
          kind: 'itemType' as const,
          type: t.type as any,
          label: def?.label ?? t.label,
        };
      }),
    [editor],
  );

  const shapeSpawnKinds: SpawnKind[] = useMemo(
    () =>
      SHAPE_PRESETS.map((preset) => ({
        kind: 'itemType' as const,
        type: 'shape' as const,
        label: preset.label,
        overrides: {
          shape: preset.shape,
          ...(preset.shape === 'line' && { w: 100, h: 2 }),
        } as any,
      })),
    [],
  );

  const iconSpawnKinds: SpawnKind[] = useMemo(
    () =>
      ICON_PRESETS.map((preset: any) => ({
        kind: 'itemType' as const,
        type: 'image' as const,
        label: preset.label,
        overrides: {
          src: preset.url,
          fit: 'contain' as const,
          shape: 'rect' as const,
        } as any,
      })),
    [],
  );

  const frameSpawnKinds: SpawnKind[] = useMemo(
    () =>
      FRAME_PRESETS.map((preset) => ({
        kind: 'itemType' as const,
        type: 'image' as const,
        label: preset.label,
        overrides: {
          clipPath: preset.clipPath,
          box: { x: 0, y: 0, w: preset.suggestedBox.w, h: preset.suggestedBox.h },
          fit: 'cover' as const,
          shape: 'rect' as const,
        } as any,
      })),
    [],
  );

  return (
    <>
      <div className="px-[15px] pt-[15px] pb-[10px] font-bold text-[13px]">Đồ họa</div>
      <div className="flex-1 overflow-y-auto">
      {/* Basic components section */}
      <div className="px-[15px] pb-3">
        <div className="text-[11px] font-semibold uppercase text-[#9a9bab] px-0 pt-2 pb-1.5">Thành phần cơ bản</div>
        <div className="p-[8px_0] grid grid-cols-2 gap-[9px]">
          {BASIC_COMPONENT_TILES.map((tile, idx) => {
            const kind = basicComponentKinds[idx]!;
            const Icon = getItemTypeIcon(tile.type);
            return (
              <button
                key={tile.type}
                onMouseDown={onSpawnDown(kind)}
                className={cn(
                  'h-[60px] border border-[#e6e6ee] rounded-[11px] flex flex-col items-center justify-center gap-[5px]',
                  'font-semibold text-[11px] text-[#5c5d6e] cursor-grab bg-[#fcfcfd] hover:bg-neutral-50',
                )}
              >
                <Icon size={18} />
                {tile.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Shapes section */}
      <div className="px-[15px] pb-3">
        <div className="text-[11px] font-semibold uppercase text-[#9a9bab] px-0 pt-2 pb-1.5">Hình khối</div>
        <div className="grid grid-cols-3 gap-2">
          {shapeSpawnKinds.map((kind, idx) => (
            <button
              key={idx}
              title={kind.label}
              onMouseDown={onSpawnDown(kind)}
              className={cn(
                'w-full h-[60px] rounded-lg border-2 cursor-move transition-all',
                'border-[#e6e6ee] bg-white hover:border-[#4b57e6] hover:bg-[#f9faff]',
              )}
            >
              <ShapeThumbnail shape={kind.kind === 'itemType' ? ((kind as any).overrides?.shape || 'rect') : 'rect'} />
            </button>
          ))}
        </div>
      </div>

      {/* Icons section */}
      <div className="px-[15px] pb-3">
        <div className="text-[11px] font-semibold uppercase text-[#9a9bab] px-0 pt-2 pb-1.5">Icon / SVG</div>
        <div className="grid grid-cols-4 gap-2">
          {iconSpawnKinds.map((kind, idx) => (
            <button
              key={idx}
              onMouseDown={onSpawnDown(kind)}
              className={cn(
                'w-full h-[48px] rounded-lg border-2 cursor-move transition-all',
                'border-[#e6e6ee] bg-white hover:border-[#4b57e6] hover:bg-[#f9faff]',
              )}
            >
              {kind.kind === 'itemType' && (
                <img
                  src={((kind as any).overrides?.src as string) || ''}
                  alt={kind.label}
                  className="w-full h-full p-1 object-contain"
                  style={{ filter: 'invert(0.3)' }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Frames section */}
      <div className="px-[15px] pb-3">
        <div className="text-[11px] font-semibold uppercase text-[#9a9bab] px-0 pt-2 pb-1.5">Khung hình dạng</div>
        <div className="grid grid-cols-3 gap-2">
          {frameSpawnKinds.map((kind, idx) => {
            const preset = FRAME_PRESETS[idx];
            return (
              <button
                key={idx}
                onMouseDown={onSpawnDown(kind)}
                className={cn(
                  'w-full h-[70px] rounded-lg border-2 cursor-move transition-all',
                  'border-[#e6e6ee] bg-white hover:border-[#4b57e6] hover:bg-[#f9faff]',
                  'flex flex-col items-center justify-center overflow-hidden',
                )}
              >
                <div
                  className="w-12 h-12 bg-gradient-to-br from-[#e6e6ee] to-[#d5d5e0]"
                  style={{
                    clipPath: preset!.clipPath,
                  }}
                />
                <span className="text-[9px] text-[#5c5d6e] font-medium mt-1 truncate px-0.5">{preset!.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      </div>
    </>
  );
}

function ShapeThumbnail({ shape }: { shape: string }) {
  if (shape === 'rect') {
    return <div className="w-full h-full bg-[#4b57e6] rounded-[4px]" />;
  }
  if (shape === 'circle') {
    return <div className="w-full h-full bg-[#4b57e6] rounded-full" />;
  }
  if (shape === 'round') {
    return <div className="w-full h-full bg-[#4b57e6] rounded-[12px]" />;
  }
  if (shape === 'triangle') {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, transparent 48%, #4b57e6 49%, #4b57e6 51%, transparent 52%)',
        }}
      />
    );
  }
  if (shape === 'diamond') {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          background: '#4b57e6',
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        }}
      />
    );
  }
  if (shape === 'line') {
    return <div className="w-full h-full flex items-center"><div className="w-3/4 h-0.5 bg-[#4b57e6]" /></div>;
  }
  return null;
}
