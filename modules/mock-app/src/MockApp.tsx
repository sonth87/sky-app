import { createElement } from 'react';
import type { AppContentProps } from '@sky-app/kernel';
import type { TtsPort } from '@sky-app/service-contracts';

/**
 * Mock app — chứng minh contract AppModule/PlatformContext dùng được thật:
 * chỉ chạm môi trường qua `platform.services`/`platform.capabilities`,
 * KHÔNG bao giờ gọi window.x / ipcRenderer / fetch trực tiếp.
 */
export function MockApp({ appId, platform, isActive }: AppContentProps) {
  const tts = platform.services.get<TtsPort>('tts');
  const hasSecondaryDisplay = platform.capabilities.has('secondary-display');

  return createElement(
    'div',
    { 'data-app-id': appId, 'data-env': platform.env },
    createElement('span', { 'data-testid': 'tts-available' }, tts ? 'tts:ready' : 'tts:unavailable'),
    createElement(
      'span',
      { 'data-testid': 'secondary-display' },
      hasSecondaryDisplay ? 'secondary-display:yes' : 'secondary-display:no',
    ),
    createElement('span', { 'data-testid': 'is-active' }, isActive ? 'is-active:yes' : 'is-active:no'),
  );
}
