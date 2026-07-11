import type { AppContentProps } from '@sky-app/kernel';
import { ControlApp } from './control/ControlApp.js';

/**
 * AppModule.render entry — bridges kernel's AppContentProps to ControlApp.
 * ControlApp itself doesn't touch PlatformContext yet (it still calls
 * window.slide directly — see docs/guides/ports-and-adapters.md's migration
 * strategy), only isActive is wired through for now.
 */
export function CeremonyApp({ isActive }: AppContentProps) {
  return <ControlApp isActive={isActive} />;
}
