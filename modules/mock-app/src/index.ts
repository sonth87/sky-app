import type { AppModule, PlatformContext } from '@sky-app/kernel';
import { MockApp } from './MockApp.js';

let activated = false;

export const mockAppModule: AppModule = {
  id: 'mock-app',
  name: 'Mock App',
  icon: 'lucide:FlaskConical',
  category: 'dev',
  window: {
    defaultSize: { width: 480, height: 320 },
    minSize: { width: 320, height: 240 },
  },

  requiredCapabilities: ['network'],
  requiredServices: [],
  entitlement: undefined, // miễn phí — dùng để verify contract, không gate license

  render: MockApp,

  async activate(_ctx: PlatformContext) {
    activated = true;
  },
  async deactivate() {
    activated = false;
  },
};

/** Chỉ dùng trong test để kiểm activate/deactivate đã chạy */
export function isMockAppActivated(): boolean {
  return activated;
}

export { MockApp } from './MockApp.js';
