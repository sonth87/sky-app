import { useEffect, useState } from 'react';
import type { SttEngineInfo, SttEnginePort } from '@sky-app/service-contracts';

export interface EnginePickerProps {
  port?: SttEnginePort;
  disabled?: boolean;
}

/**
 * Chọn engine STT — component NHỎ, RIÊNG (không tái dùng
 * packages/tts-engine-ui/src/EngineManager.tsx's EngineManagerContent, xem
 * docs/dev/history/2026-08-15-stt-app-rieng-va-lich-su.md's quyết định #2: component đó
 * hard-type `TtsEnginePort`, đòi `port.getHealth()` mà `SttEnginePort` cố ý không có).
 *
 * CHỈ list + switch — KHÔNG có UI cài đặt/preflight/disk-usage: cài engine STT vẫn qua
 * đúng màn Quản lý engine hiện có (Cấu hình > Models/Engine), đã tự gom nhóm "Nhận dạng
 * giọng nói" nhờ groundwork category có sẵn từ GĐ 1.
 */
export function EnginePicker({ port, disabled }: EnginePickerProps) {
  const [engines, setEngines] = useState<SttEngineInfo[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!port) return;
    let alive = true;
    setLoading(true);
    port
      .listEngines()
      .then((res) => {
        if (!alive) return;
        setEngines(res?.engines ?? []);
        setCurrent(res?.current ?? null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [port]);

  if (!port) return null;

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id || !port.switchEngine) return;
    setSwitching(true);
    try {
      const res = await port.switchEngine(id);
      if (res?.ok) setCurrent(id);
    } finally {
      setSwitching(false);
    }
  };

  if (!loading && engines.length === 0) {
    return (
      <p className="text-xs italic text-muted-foreground">
        Chưa có engine nhận dạng giọng nói nào — cài qua Cấu hình &gt; Models/Engine.
      </p>
    );
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-foreground">Engine</span>
      <select
        value={current ?? ''}
        onChange={handleChange}
        disabled={disabled || switching || loading}
        className="text-sm px-2.5 py-2 rounded-lg border border-border bg-card focus:border-primary outline-none transition-all disabled:opacity-50"
      >
        <option value="" disabled>
          -- Chọn engine --
        </option>
        {engines.map((e) => (
          <option key={e.id} value={e.id} disabled={e.install_status !== 'installed'}>
            {e.label}
            {e.install_status !== 'installed' ? ' (chưa cài)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
