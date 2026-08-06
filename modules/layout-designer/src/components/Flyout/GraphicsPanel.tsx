import { Square, Circle, Triangle, Diamond, Frame, Minus, Type, Image as ImageIcon, Flag, Repeat } from 'lucide-react';
import type { SpawnKind } from './useSpawnDrag.js';

interface GraphicsTile {
  label: string;
  icon: React.ComponentType<{ size: number }>;
  spawnKind: SpawnKind;
}

const BASIC_COMPONENT_TILES: GraphicsTile[] = [
  {
    label: 'Văn bản',
    icon: Type,
    spawnKind: { kind: 'itemType', type: 'text', label: 'Văn bản' },
  },
  {
    label: 'Ảnh',
    icon: ImageIcon,
    spawnKind: { kind: 'itemType', type: 'image', label: 'Ảnh' },
  },
  {
    label: 'Ruy băng',
    icon: Flag,
    spawnKind: { kind: 'itemType', type: 'ribbon', label: 'Ruy băng' },
  },
  {
    label: 'Khung lặp',
    icon: Repeat,
    spawnKind: { kind: 'itemType', type: 'loop', label: 'Khung lặp' },
  },
];

const GRAPHICS_TILES: GraphicsTile[] = [
  {
    label: 'Vuông',
    icon: Square,
    spawnKind: { kind: 'itemType', type: 'shape', label: 'Vuông', overrides: { shape: 'rect' } },
  },
  {
    label: 'Tròn',
    icon: Circle,
    spawnKind: { kind: 'itemType', type: 'shape', label: 'Tròn', overrides: { shape: 'circle' } },
  },
  {
    label: 'Tam giác',
    icon: Triangle,
    spawnKind: { kind: 'itemType', type: 'shape', label: 'Tam giác', overrides: { shape: 'triangle' } },
  },
  {
    label: 'Kim cương',
    icon: Diamond,
    spawnKind: { kind: 'itemType', type: 'shape', label: 'Kim cương', overrides: { shape: 'diamond' } },
  },
  {
    label: 'Khung viền',
    icon: Frame,
    spawnKind: { kind: 'itemType', type: 'shape', label: 'Khung viền', overrides: { shape: 'frame', strokeW: 2, stroke: '#000000' } },
  },
  {
    label: 'Đường kẻ',
    icon: Minus,
    spawnKind: { kind: 'itemType', type: 'shape', label: 'Đường kẻ', overrides: { shape: 'line' } },
  },
];

export interface GraphicsPanelProps {
  onSpawnDown: (spawnKind: SpawnKind) => (e: React.MouseEvent) => void;
}

export function GraphicsPanel({ onSpawnDown }: GraphicsPanelProps) {
  return (
    <div className="space-y-4 overflow-y-auto flex flex-col flex-1">
      <div className="p-4 pb-0">
        <h3 className="font-semibold text-[11px] tracking-[.04em] uppercase text-[#9a9bab] mb-3">Thành phần cơ bản</h3>
        <div className="grid grid-cols-2 gap-2">
          {BASIC_COMPONENT_TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <button
                key={tile.label}
                onMouseDown={onSpawnDown(tile.spawnKind)}
                title={tile.label}
                className="flex flex-col items-center justify-center p-3 h-[60px] rounded-lg bg-[#fcfcfd] border border-[#e6e6ee] hover:bg-[#f4f5f9] cursor-grab transition-colors text-[11px] font-semibold text-[#5c5d6e]"
              >
                <div className="mb-1">
                  <Icon size={18} />
                </div>
                <span className="text-[10px]">{tile.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 px-4">
        <h3 className="font-semibold text-[11px] tracking-[.04em] uppercase text-[#9a9bab] mb-3">Hình khối</h3>
        <div className="grid grid-cols-3 gap-2">
          {GRAPHICS_TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <button
                key={tile.label}
                onMouseDown={onSpawnDown(tile.spawnKind)}
                title={tile.label}
                className="flex flex-col items-center justify-center p-2 rounded-lg bg-[#fcfcfd] border border-[#e6e6ee] hover:bg-[#f4f5f9] cursor-grab transition-colors"
              >
                <div className="mb-1 text-[#5c5d6e]">
                  <Icon size={22} />
                </div>
                <span className="text-[9px] text-[#5c5d6e] text-center">{tile.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 pt-0">
        <h3 className="font-semibold text-[11px] tracking-[.04em] uppercase text-[#9a9bab] mb-3">Icon / SVG</h3>
        <div className="text-[11px] text-[#9a9bab] text-center py-6 px-2 bg-[#fcfcfd] rounded-lg border border-dashed border-[#cfd0da]">
          Icon library coming soon
        </div>
      </div>
    </div>
  );
}
