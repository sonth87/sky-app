import type { EffectPresetPort, EffectPreset, EffectConfig } from '@sky-app/service-contracts';
import '../bridge-types.js';

/**
 * Electron EffectPresetPort — routes to main process (apps/shell-electron/electron/ipc.ts's
 * kernel:effectPreset:* channels). Preset hiệu ứng hậu kỳ audio TTS lưu trong app-db
 * qua IPC.
 */
export function createElectronEffectPresetPort(): EffectPresetPort {
  return {
    async list() {
      return (await window.sky.invoke('kernel:effectPreset:list')) as EffectPreset[];
    },
    async create(name, effectsChain, description) {
      return (await window.sky.invoke(
        'kernel:effectPreset:create', name, effectsChain, description,
      )) as EffectPreset;
    },
    async update(id, patch) {
      return (await window.sky.invoke('kernel:effectPreset:update', id, patch)) as EffectPreset | null;
    },
    async delete(id) {
      return (await window.sky.invoke('kernel:effectPreset:delete', id)) as boolean;
    },
  };
}

export type { EffectConfig };
