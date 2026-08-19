import { useCallback, useEffect, useState } from 'react';
import type { TtsEnginePort, TtsEngines } from '@sky-app/service-contracts';

/**
 * Danh sách engine + engine đang chạy + capabilities SỐNG của engine đó — dùng chung cho
 * `EmotionInsert`/`EngineParamsPanel` (app tự lo phần disable-theo-VieNeu), `ModelSelect`/
 * `GenerateBox`. Trả kèm `refetch` — cần gọi lại sau khi tự đổi engine (`switchEngine`) để
 * không giữ `current`/`current_capabilities` cũ.
 *
 * Nguồn ĐÚNG cho capabilities SỐNG là `TtsEnginePort.listEngines()` — `current_capabilities`
 * trong đó CHÍNH LÀ dict `_engine.capabilities()` phía Python (khác `ttsPort.getEngineCapabilities()`,
 * method chưa được cài đặt thật ở bất kỳ adapter nào).
 */
export function useTtsEngines(enginePort?: TtsEnginePort): [TtsEngines | null, () => void] {
  const [engines, setEngines] = useState<TtsEngines | null>(null);

  const refetch = useCallback(() => {
    if (!enginePort) { setEngines(null); return; }
    enginePort.listEngines().then(setEngines).catch(() => setEngines(null));
  }, [enginePort]);

  useEffect(refetch, [refetch]);

  return [engines, refetch];
}
