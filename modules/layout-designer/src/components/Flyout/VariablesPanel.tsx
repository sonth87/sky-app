import type { LayoutVariant } from '@sky-app/slide-shared';
import { collectUsedTokenKeys } from './helpers.js';
import type { SpawnKind } from './useSpawnDrag.js';

export interface VariablesPanelProps {
  variant: LayoutVariant;
  onSpawnDown: (k: SpawnKind) => (e: React.MouseEvent) => void;
}

export function VariablesPanel({ variant, onSpawnDown }: VariablesPanelProps) {
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
