import { useCallback, useEffect, useState } from 'react';
import type { EffectPreset, EffectPresetPort } from '@sky-app/service-contracts';

/** Danh sách preset hiệu ứng — dùng chung cho `EffectsPanel` (tab "Sinh giọng"),
 *  `FloatingGenerateBox` (Story) và hàng chọn nhanh mới trong `GenerateBar`, tránh mỗi nơi tự
 *  fetch `effectPresetPort.list()` riêng. Trả kèm `refetch` — `EffectsPanel` cần gọi lại sau
 *  khi tạo/xoá preset, phía đọc-thuần (FloatingGenerateBox/GenerateBar) bỏ qua giá trị đó. */
export function useEffectPresets(effectPresetPort?: EffectPresetPort): [EffectPreset[], () => void] {
  const [presets, setPresets] = useState<EffectPreset[]>([]);

  const refetch = useCallback(() => {
    if (!effectPresetPort) { setPresets([]); return; }
    effectPresetPort.list().then(setPresets).catch(() => setPresets([]));
  }, [effectPresetPort]);

  useEffect(refetch, [refetch]);

  return [presets, refetch];
}
