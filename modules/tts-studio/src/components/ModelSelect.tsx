import type { TtsEngineInfo } from '@sky-app/service-contracts';

export interface ModelSelectProps {
  engines: TtsEngineInfo[];
  value: string;
  onChange: (engineId: string) => void;
  className?: string;
}

/**
 * Dropdown chọn MODEL/ENGINE — CHỈ chọn, KHÔNG đổi engine thật ngay (đổi engine là thao tác
 * nặng/toàn cục, restart cả tiến trình Python — xem `TtsEnginePort.switchEngine`'s docstring).
 * Nơi gọi (`FloatingGenerateBox.tsx`) tự quyết định lúc nào thật sự gọi `switchEngine` (lúc
 * bấm Sinh, không phải lúc đổi dropdown).
 *
 * Engine chưa tải (`install_status !== 'installed'`) vẫn hiện trong danh sách nhưng
 * `disabled` — ghi rõ NGAY TRONG label (không chỉ `title`) vì `<option>` không tin cậy hiện
 * tooltip khi hover ở mọi trình duyệt/hệ điều hành.
 */
export function ModelSelect({ engines, value, onChange, className }: ModelSelectProps) {
  // `category` vắng mặt (server cũ) coi như 'tts' — đúng quy ước ghi ở TtsEngineInfo's docstring.
  const ttsEngines = engines.filter((e) => !e.category || e.category === 'tts');

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="Chọn model — chỉ đổi thật khi bấm Sinh, không đổi ngay lúc chọn ở đây"
      className={className ?? 'rounded-lg border border-border bg-card px-1.5 py-1 text-xs'}
    >
      {ttsEngines.map((e) => (
        <option key={e.id} value={e.id} disabled={e.install_status !== 'installed'}>
          {e.label}{e.install_status !== 'installed' ? ' (chưa tải — vào Cài đặt để tải)' : ''}
        </option>
      ))}
    </select>
  );
}
