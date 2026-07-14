import type { AppContentProps } from '@sky-app/kernel';
import { ControlApp } from './control/ControlApp.js';

/**
 * AppModule.render entry — bridges kernel's AppContentProps to ControlApp.
 * `platform` gives ControlApp access to ports (TtsPort/DataPort) registered
 * per-environment — see docs/guides/ports-and-adapters.md's migration
 * strategy. Methods without a port (~100, Electron-only) still go through
 * window.slide directly, guarded via control/lib/slide.ts's useSlide().
 */
export function CeremonyApp({ appId, platform, isActive }: AppContentProps) {
  return <ControlApp appId={appId} platform={platform} isActive={isActive} />;
}
