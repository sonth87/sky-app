import { GRID_PRESETS } from '../../presets/gridPresets.js';
import type { SpawnKind } from './useSpawnDrag.js';

export interface GridPresetsPanelProps {
  onSpawnDown: (spawnKind: SpawnKind) => (e: React.MouseEvent) => void;
}

export function GridPresetsPanel({ onSpawnDown }: GridPresetsPanelProps) {
  return (
    <div className="p-4 space-y-4 overflow-y-auto flex flex-col flex-1">
      <div className="shrink-0">
        <h3 className="font-semibold text-[11px] tracking-[.04em] uppercase text-[#9a9bab] mb-3">Mẫu lưới</h3>
        <div className="grid grid-cols-2 gap-3">
          {GRID_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onMouseDown={onSpawnDown({
                kind: 'preset',
                items: preset.items,
                label: preset.label,
              })}
              title={preset.label}
              className="flex flex-col items-center justify-center p-2 rounded-lg bg-[#fcfcfd] border border-[#e6e6ee] hover:bg-[#f4f5f9] cursor-grab transition-colors text-[11px] font-semibold text-[#5c5d6e] min-h-[90px]"
            >
              {/* Mini preview: render a simplified grid representation */}
              <div className="mb-2 w-full px-1">
                <svg
                  viewBox="0 0 100 100"
                  className="w-full h-16 border border-[#d4d4dd] rounded"
                  style={{ background: '#f9f9fc' }}
                >
                  {/* Render each item as a colored rectangle */}
                  {preset.items.map((item, idx) => {
                    const scale = 100 / 400; // Assume 400x400 is max canvas size
                    const x = (item.box.x ?? 0) * scale;
                    const y = (item.box.y ?? 0) * scale;
                    const w = (item.box.w ?? 100) * scale;
                    const h = (item.box.h ?? 100) * scale;
                    const colors = ['#e8ecf9', '#d4daef', '#c0cfe5', '#acb8db', '#98a1d1'];
                    return (
                      <rect
                        key={idx}
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        fill={colors[idx % colors.length]}
                        stroke="#9a9bab"
                        strokeWidth="0.5"
                      />
                    );
                  })}
                </svg>
              </div>
              <span className="text-center text-[10px]">{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pb-2 shrink-0">
        <h3 className="font-semibold text-[11px] tracking-[.04em] uppercase text-[#9a9bab] mb-3">Lưới động</h3>
        <div className="text-[11px] text-[#9a9bab] text-center py-6 px-2 bg-[#fcfcfd] rounded-lg border border-dashed border-[#cfd0da]">
          Dùng Khung lặp để tạo lưới tự động
        </div>
      </div>
    </div>
  );
}
