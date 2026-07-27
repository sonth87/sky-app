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
    <div className="border-t border-[#f0f0f5] p-[13px_15px]">
      <div className="font-semibold text-[11px] tracking-[.04em] uppercase text-[#9a9bab] mb-[10px]">{title}</div>
      {children}
    </div>
  );
}

export function RotationControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Section title="Xoay">
      <div className="flex items-center gap-[10px]">
        <input type="range" min={0} max={360} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1" />
        <span className="text-[11px] w-[34px] text-right">{value}°</span>
      </div>
    </Section>
  );
}

export function OpacityControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Section title="Độ mờ">
      <div className="flex items-center gap-[10px]">
        <input type="range" min={10} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1" />
        <span className="text-[11px] w-[34px] text-right">{value}</span>
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
