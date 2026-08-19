import { useCallback, useEffect, useState } from 'react';
import type { EffectPreset, EffectPresetPort } from '@sky-app/service-contracts';

/** Danh sách preset hiệu ứng — dùng chung cho panel hiệu ứng chính lẫn `EffectsSelect`/
 *  `GenerateBox`, tránh mỗi nơi tự fetch `effectPresetPort.list()` riêng. Trả kèm `refetch` —
 *  nơi có UI tạo/xoá preset cần gọi lại sau khi đổi, phía đọc-thuần bỏ qua giá trị đó. */
export function useEffectPresets(effectPresetPort?: EffectPresetPort): [EffectPreset[], () => void] {
  const [presets, setPresets] = useState<EffectPreset[]>([]);

  const refetch = useCallback(() => {
    if (!effectPresetPort) { setPresets([]); return; }
    effectPresetPort.list().then(setPresets).catch(() => setPresets([]));
  }, [effectPresetPort]);

  useEffect(refetch, [refetch]);

  return [presets, refetch];
}
