import { useCallback, useEffect, useState } from 'react';
import type { TtsEnginePort, TtsEngines } from '@sky-app/service-contracts';

/**
 * Danh sách engine + engine đang chạy + capabilities SỐNG của engine đó — dùng chung cho
 * `EmotionInsert` (ẩn/disable theo VieNeu), `EngineParamsPanel` (sampling/ngôn ngữ),
 * `FloatingGenerateBox`/`ModelSelect` (Story). Trả kèm `refetch` — cần gọi lại sau khi tự đổi
 * engine (`switchEngine`) để không giữ `current`/`current_capabilities` cũ.
 *
 * Bug thật 2026-08-18: trước đây các nơi trên gọi `ttsPort.getEngineCapabilities()` — method
 * này CHƯA BAO GIỜ ĐƯỢC CÀI ĐẶT THẬT ở adapter nào (Electron lẫn Web), `preload.ts` bỏ dở với
 * dòng TODO. Nguồn ĐÚNG, đã hoạt động thật (dùng cho màn "Quản lý engine") là
 * `TtsEnginePort.listEngines()` — `current_capabilities` trong đó CHÍNH LÀ dict
 * `_engine.capabilities()` phía Python.
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
