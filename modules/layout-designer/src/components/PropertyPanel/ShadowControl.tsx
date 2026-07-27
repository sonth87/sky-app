import type { TextShadow } from '@sky-app/slide-shared';
import { pickerBtnStyle, Section } from './CommonControls.js';

export interface ShadowControlProps {
  value: TextShadow | boolean | undefined;
  onChange: (v: TextShadow | undefined) => void;
}

export function ShadowControl({ value, onChange }: ShadowControlProps) {
  const enabled = Boolean(value);
  const obj = typeof value === 'object' ? value : {};
  return (
    <Section title="Đổ bóng">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: enabled ? 10 : 0 }}>
        <button
          onClick={() => onChange(enabled ? undefined : { color: 'rgba(0,0,0,0.35)', blur: 4, offsetX: 0, offsetY: 2 })}
          style={pickerBtnStyle(enabled, { flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11 })}
        >
          {enabled ? 'Đang bật' : 'Bật đổ bóng'}
        </button>
      </div>
      {enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input type="color" value={obj.color ?? '#000000'} onChange={(e) => onChange({ ...obj, color: e.target.value })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ fontSize: 10.5, color: '#9a9bab', flex: 1 }}>
              Lệch X
              <input type="number" value={obj.offsetX ?? 0} onChange={(e) => onChange({ ...obj, offsetX: Number(e.target.value) })} style={{ width: '100%', border: '1px solid #e6e6ee', borderRadius: 6, padding: '4px 6px', fontSize: 11 }} />
            </label>
            <label style={{ fontSize: 10.5, color: '#9a9bab', flex: 1 }}>
              Lệch Y
              <input type="number" value={obj.offsetY ?? 2} onChange={(e) => onChange({ ...obj, offsetY: Number(e.target.value) })} style={{ width: '100%', border: '1px solid #e6e6ee', borderRadius: 6, padding: '4px 6px', fontSize: 11 }} />
            </label>
            <label style={{ fontSize: 10.5, color: '#9a9bab', flex: 1 }}>
              Độ mờ nhoè
              <input type="number" min={0} value={obj.blur ?? 4} onChange={(e) => onChange({ ...obj, blur: Number(e.target.value) })} style={{ width: '100%', border: '1px solid #e6e6ee', borderRadius: 6, padding: '4px 6px', fontSize: 11 }} />
            </label>
          </div>
        </div>
      )}
    </Section>
  );
}
