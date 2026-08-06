import { FRAME_PRESETS } from '../../presets/framePresets.js';
import type { SpawnKind } from './useSpawnDrag.js';

export interface FramesPanelProps {
  onSpawnDown: (spawnKind: SpawnKind) => (e: React.MouseEvent) => void;
}

export function FramesPanel({ onSpawnDown }: FramesPanelProps) {
  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <div>
        <h3 className="font-semibold text-[11px] tracking-[.04em] uppercase text-[#9a9bab] mb-3">Hình dạng khung</h3>
        <div className="grid grid-cols-2 gap-3">
          {FRAME_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onMouseDown={onSpawnDown({
                kind: 'itemType',
                type: 'image',
                label: preset.label,
                overrides: {
                  clipPath: preset.clipPath,
                  box: { x: 0, y: 0, w: preset.suggestedBox.w, h: preset.suggestedBox.h, z: 0 },
                },
              })}
              title={preset.label}
              className="flex flex-col items-center justify-center p-3 rounded-lg bg-[#fcfcfd] border border-[#e6e6ee] hover:bg-[#f4f5f9] cursor-grab transition-colors text-[11px] font-semibold text-[#5c5d6e] min-h-[80px]"
            >
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  background: 'linear-gradient(135deg, #4b57e6, #7c3aed)',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  clipPath: preset.clipPath,
                }}
              />
              <span className="text-center text-[10px]">{preset.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
