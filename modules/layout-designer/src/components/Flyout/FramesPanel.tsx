import { useMemo } from 'react';
import { FRAME_PRESETS } from '../../presets/framePresets.js';
import type { SpawnKind } from './useSpawnDrag.js';
import { cn } from '@sky-app/ui';

export interface FramesPanelProps {
  /** Bắt đầu kéo — dùng CHUNG 1 instance useSpawnDrag từ Flyout.tsx (đã có getArtEl/getRootEl
   * THẬT qua props). Bugfix 2026-08-10: bản cũ tự gọi useSpawnDrag với getArtEl/getRootEl tra qua
   * `document.querySelector('[data-art]'/'[data-layout-designer-root]')` — 2 attribute này KHÔNG
   * TỒN TẠI ở bất kỳ đâu trong DOM thật (cùng bug đã sửa ở GraphicsPanel.tsx), khiến kéo thả hiện
   * ghost nhưng thả ra KHÔNG BAO GIỜ tạo item. */
  onSpawnDown: (k: SpawnKind) => (e: React.MouseEvent) => void;
}

export function FramesPanel({ onSpawnDown }: FramesPanelProps) {
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
      <div className="px-[15px] pt-[15px] pb-[10px] font-bold text-[13px]">Khung</div>
      <div className="flex-1 overflow-y-auto">
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
