import type { LayoutVariant } from '@sky-app/slide-shared';
import { collectUsedTokenKeys } from './helpers.js';
import type { SpawnKind } from './useSpawnDrag.js';

export interface VariablesPanelProps {
  variant: LayoutVariant;
  onSpawnDown: (k: SpawnKind) => (e: React.MouseEvent) => void;
}

export function VariablesPanel({ variant, onSpawnDown }: VariablesPanelProps) {
  const usedKeys = collectUsedTokenKeys(variant);
  const keys = [...usedKeys];

  return (
    <>
      <div className="px-[15px] pt-[14px] pb-[6px] font-bold text-[13px]">Biến</div>
      <div className="px-[14px] pb-[12px] text-[11px] text-[#9a9bab] leading-[1.45]">
        Token đang dùng trong layout này. Gợi ý toàn cục (variable_registry) sẽ có ở bước sau.
      </div>
      {keys.length === 0 ? (
        <div className="px-[14px] text-[11px] text-[#c9c9d3]">Chưa có token nào — gõ @ten_bien trong ô nội dung.</div>
      ) : (
        <div className="px-[14px] pb-[14px] overflow-y-auto flex flex-col gap-[5px]">
          {keys.map((key) => (
            <div
              key={key}
              onMouseDown={onSpawnDown({ kind: 'var', key, label: `@${key}` })}
              className="flex items-center gap-[7px] border border-[#eceef2] rounded-lg p-[7px_9px] cursor-grab bg-[#fcfcfd]"
            >
              <span className="bg-[#fbeede] text-[#c07a1e] rounded px-[6px] py-[2px] font-mono font-bold text-[10.5px]">@{key}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
