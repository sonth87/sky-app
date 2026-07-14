import type { AppModule } from '@sky-app/kernel';
import { TtsStudioApp } from './TtsStudioApp.js';

export const ttsStudioModule: AppModule = {
  id: 'tts-studio',
  name: 'TTS Studio',
  icon: 'lucide:AudioLines',
  category: 'tools',
  window: {
    defaultSize: { width: 1000, height: 680 },
    minSize: { width: 720, height: 480 },
  },

  requiredCapabilities: ['tts'],
  requiredServices: ['tts'],
  entitlement: undefined, // miễn phí — nghe/tạo giọng qua tts-service chung, không gate license

  render: TtsStudioApp,
};

export { TtsStudioApp } from './TtsStudioApp.js';
