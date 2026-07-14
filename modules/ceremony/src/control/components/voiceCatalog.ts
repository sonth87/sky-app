import { useState, useEffect, useMemo } from 'react';
import { useControlStore } from '../store';

export interface VoiceInfo {
  id: string;
  label: string;
  gender: 'female' | 'male';
  region: 'Bắc' | 'Nam';
  style: string;
  modelUrl: string;
}

const HF_MODEL_URL = 'https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo';

// Style lưu dạng key nội bộ ('gentle' | 'clear' | 'builtin'), dịch khi hiển thị qua translateStyle().
const FALLBACK_VOICE_CATALOG: VoiceInfo[] = [
  { id: 'vieneu-NF', label: 'Lan Anh', gender: 'female', region: 'Bắc', style: 'gentle', modelUrl: HF_MODEL_URL },
  { id: 'vieneu-NF2', label: 'Ngọc Huyền', gender: 'female', region: 'Bắc', style: 'gentle', modelUrl: HF_MODEL_URL },
  { id: 'vieneu-SF', label: 'Mai Linh', gender: 'female', region: 'Nam', style: 'gentle', modelUrl: HF_MODEL_URL },
  { id: 'vieneu-NM1', label: 'Minh Quân', gender: 'male', region: 'Bắc', style: 'clear', modelUrl: HF_MODEL_URL },
  { id: 'vieneu-SM', label: 'Gia Huy', gender: 'male', region: 'Nam', style: 'clear', modelUrl: HF_MODEL_URL },
  { id: 'vieneu-ADAM', label: 'Adam', gender: 'male', region: 'Bắc', style: 'clear', modelUrl: HF_MODEL_URL },
];

function serverVoiceToInfo(v: { id: string; label: string; gender: string; region: string; type: string }): VoiceInfo {
  return {
    id: `vieneu-${v.id}`,
    label: v.label,
    gender: v.gender === 'male' ? 'male' : 'female',
    region: v.region === 'Nam' ? 'Nam' : 'Bắc',
    style: v.type === 'preset' ? 'builtin' : v.gender === 'female' ? 'gentle' : 'clear',
    modelUrl: HF_MODEL_URL,
  };
}

/** Dịch style key nội bộ ('gentle'|'clear'|'builtin') sang text hiển thị theo ngôn ngữ hiện tại. */
export function translateStyle(t: (key: string) => string, style: string): string {
  const known = ['gentle', 'clear', 'builtin'];
  return known.includes(style) ? t(`voicePickerPopover.styles.${style}`) : style;
}

export function useVoiceCatalog(): VoiceInfo[] {
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const pythonStatus = useControlStore((s) => s.pythonStatus);
  const nonce = useControlStore((s) => s.voiceCatalogNonce);

  useEffect(() => {
    if (pythonStatus !== 'ready') return;
    window.slide?.listVoices?.().then((list) => {
      // Luôn set (kể cả rỗng) để phản ánh việc xoá giọng.
      setVoices((list ?? []).map(serverVoiceToInfo));
    }).catch(() => {});
  }, [pythonStatus, nonce]);

  return useMemo(() => {
    const byId = new Map(FALLBACK_VOICE_CATALOG.map((voice) => [voice.id, voice]));
    for (const voice of voices) {
      byId.set(voice.id, voice);
    }
    return Array.from(byId.values());
  }, [voices]);
}
