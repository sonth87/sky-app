export interface SystemStats {
  appRamMb: number;
  totalRamMb: number;
  usedRamMb: number;
  cpuUserMs: number;
  cpuSystemMs: number;
}

export type PopoverKey = 'env' | 'ws' | 'tts' | 'qr' | 'fps' | 'pregen' | null;
