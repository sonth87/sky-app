import type { EffectPreset } from '@sky-app/service-contracts';

export interface EffectsSelectProps {
  presets: EffectPreset[];
  value: string;
  onChange: (presetId: string) => void;
  className?: string;
}

/** Dropdown chọn preset hiệu ứng — dùng chung cho mọi nơi cần áp hiệu ứng lúc sinh giọng, tránh
 *  mỗi nơi tự vẽ `<select>` riêng lệch nhau. */
export function EffectsSelect({ presets, value, onChange, className }: EffectsSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="Chọn hiệu ứng âm thanh áp dụng khi sinh giọng"
      className={className ?? 'w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs'}
    >
      <option value="">Không dùng hiệu ứng</option>
      {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}
