import { useMemo } from 'react';
import type { LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import type { Editor } from '@sky-app/layout-editor-core';
import { FRAME_PRESETS } from '../../presets/framePresets.js';
import { useSpawnDrag, type SpawnKind } from './useSpawnDrag.js';
import { cn } from '@sky-app/ui';

export interface FramesPanelProps {
  editor: Editor;
  variant: LayoutVariant;
  loopItemId?: string;
}

export function FramesPanel({ editor, variant, loopItemId }: FramesPanelProps) {
  const getArtEl = () => document.querySelector('[data-art]') as HTMLDivElement | null;
  const getRootEl = () => document.querySelector('[data-layout-designer-root]') as HTMLDivElement | null;
  const { ghost, onDown } = useSpawnDrag(editor, variant, getArtEl, getRootEl, loopItemId);

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
      <div className="px-[15px] pt-[15px] pb-[10px] font-bold text-[13px]">Frames</div>
      <div className="px-[15px] pb-3">
        <div className="text-[11px] font-semibold uppercase text-[#9a9bab] px-0 pt-2 pb-1.5">Khung hình dạng</div>
        <div className="grid grid-cols-3 gap-2">
          {frameSpawnKinds.map((kind, idx) => {
            const preset = FRAME_PRESETS[idx];
            return (
              <button
                key={idx}
                onMouseDown={onDown(kind)}
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

      {/* Ghost during drag */}
      {ghost && (
        <div
          className="fixed pointer-events-none text-[11px] font-semibold text-[#5c5d6e] bg-white px-2 py-1 rounded border border-[#e6e6ee] shadow-md z-50"
          style={{
            left: `${ghost.x + 10}px`,
            top: `${ghost.y + 10}px`,
          }}
        >
          {ghost.label}
        </div>
      )}
    </>
  );
}
