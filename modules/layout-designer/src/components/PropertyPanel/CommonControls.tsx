import { type ReactNode } from 'react';

export function pickerBtnStyle(active: boolean, extra?: React.CSSProperties): React.CSSProperties {
  return {
    border: `1px solid ${active ? 'var(--accent-color, #4b57e6)' : '#e6e6ee'}`,
    background: active ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 10%, transparent)' : '#fcfcfd',
    cursor: 'pointer',
    ...extra,
  };
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid #f0f0f5', padding: '13px 15px' }}>
      <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9a9bab', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

/** Xoay item quanh tâm (Box.rotation, độ, mặc định 0) — LUÔN hiện cho mọi loại item, giống
 * OpacityControl (BaseItem field chung). Kéo drag-handle trên Canvas (Bước 4 kế hoạch) dùng
 * rotateItemCommand riêng (coalescable); input số ở đây dùng patchItemCommand thường (mỗi lần gõ
 * = 1 undo, hợp lý vì đây là thao tác rời rạc, không phải kéo chuột liên tục). */
export function RotationControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Section title="Xoay">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="range" min={0} max={360} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
        <span style={{ fontSize: 11, width: 34, textAlign: 'right' }}>{value}°</span>
      </div>
    </Section>
  );
}

export function OpacityControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Section title="Độ mờ">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="range" min={10} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
        <span style={{ fontSize: 11, width: 34, textAlign: 'right' }}>{value}</span>
      </div>
    </Section>
  );
}

export const labelStyle: React.CSSProperties = { display: 'block', fontSize: 10.5, color: '#9a9bab', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' };

export function numberInputStyle(width: number | undefined): React.CSSProperties {
  return {
    width,
    border: '1px solid #e6e6ee',
    borderRadius: 6,
    padding: '6px 7px',
    fontSize: 11.5,
  };
}
