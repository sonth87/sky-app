import type { AppModule } from '@sky-app/kernel';
import { AudioLines } from 'lucide-react';
import { SpeechToTextApp } from './SpeechToTextApp.js';

export const speechToTextModule: AppModule = {
  id: 'speech-to-text',
  name: 'Speech to Text',
  icon: AudioLines, // khác 'Speech' (tts-studio) — phân biệt trực quan trong dock
  iconColor: ['#2563eb', '#7c3aed'],
  category: 'tools',
  window: {
    defaultSize: { width: 720, height: 560 },
    minSize: { width: 480, height: 400 },
  },

  requiredCapabilities: ['stt'],
  requiredServices: ['stt'],
  entitlement: undefined, // free, no license gate

  render: SpeechToTextApp,
};

export { SpeechToTextApp } from './SpeechToTextApp.js';
