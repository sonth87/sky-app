import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Download } from 'lucide-react';
import type { TtsPort } from '@sky-app/service-contracts';
import { useControlStore } from '../store';
import { stopPcm } from '../../lib/audio';
import { usePlatform } from '../PlatformContext';
import { useSlide } from '../lib/slide';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { VoicePickerRow } from './VoicePickerRow';
import { cn } from '../lib/cn';
import { type VoiceInfo, translateStyle, useVoiceCatalog } from './voiceCatalog';

export type { VoiceInfo };
export { translateStyle, useVoiceCatalog };

/** @deprecated dùng useVoiceCatalog() thay thế */
export const VOICE_CATALOG: VoiceInfo[] = [];

const PREVIEW_TEXT = 'Xin chúc mừng tân kỹ sư Nguyễn Văn An.';

type PreviewState = 'idle' | 'loading' | 'playing' | 'error';

interface Props {
  value: string;
  onChange: (id: string) => void;
  compact?: boolean;
}

export function VoicePickerPopover({ value, onChange, compact }: Props) {
  const { t } = useTranslation();
  const platform = usePlatform();
  const slide = useSlide('tts-preview-url');
  const [open, setOpen] = useState(false);
  const [previewStates, setPreviewStates] = useState<Record<string, PreviewState>>({});
  const stopFnRef = useRef<(() => void) | null>(null);

  // Model "có sẵn" khi TTS engine đã ready — engine chỉ ready sau khi load xong model
  const pythonStatus = useControlStore((s) => s.pythonStatus);
  const modelDownloaded = pythonStatus === 'ready';

  const catalog = useVoiceCatalog();
  const selected = catalog.find((v) => v.id === value) ?? catalog[0];

  const stopCurrent = useCallback(() => {
    stopFnRef.current?.();
    stopFnRef.current = null;
    stopPcm();
    setPreviewStates({});
  }, []);

  const handlePreview = useCallback(async (voice: VoiceInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    const ps = previewStates[voice.id] ?? 'idle';
    if (ps === 'playing') { stopCurrent(); return; }
    stopCurrent();
    setPreviewStates((p) => ({ ...p, [voice.id]: 'loading' }));

    const speakerId = voice.id.replace(/^vieneu-/, '');

    if (modelDownloaded) {
      // Model đã tải: dùng TTS engine tổng hợp realtime qua TtsPort (tự phát
      // audio — chạy được cả Electron lẫn Web, xem docs/guides/ports-and-adapters.md).
      const tts = platform?.services.get<TtsPort>('tts');
      try {
        if (!tts) throw new Error('TtsPort không khả dụng');
        setPreviewStates((p) => ({ ...p, [voice.id]: 'playing' }));
        await tts.speak(PREVIEW_TEXT, { voiceId: voice.id, speed: 1.0 });
        setPreviewStates((p) => ({ ...p, [voice.id]: 'idle' }));
        stopFnRef.current = null;
      } catch {
        setPreviewStates((p) => ({ ...p, [voice.id]: 'error' }));
      }
    } else {
      // Model chưa tải: phát WAV mẫu bundled qua /preview endpoint — chỉ
      // Electron có window.slide.getTtsPreviewUrl, không có tương đương port.
      try {
        const url = await slide?.getTtsPreviewUrl?.(speakerId);
        if (!url) throw new Error('no preview url');
        const audio = new Audio(url);
        audio.onended = () => setPreviewStates((p) => ({ ...p, [voice.id]: 'idle' }));
        audio.onerror = () => setPreviewStates((p) => ({ ...p, [voice.id]: 'error' }));
        await audio.play();
        setPreviewStates((p) => ({ ...p, [voice.id]: 'playing' }));
        stopFnRef.current = () => { audio.pause(); audio.currentTime = 0; };
      } catch {
        setPreviewStates((p) => ({ ...p, [voice.id]: 'error' }));
      }
    }
  }, [previewStates, stopCurrent, modelDownloaded, platform, slide]);

  const handleSelect = (voice: VoiceInfo) => {
    if (!modelDownloaded) return; // Không cho chọn khi chưa tải
    stopCurrent();
    onChange(voice.id);
    setOpen(false);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open('https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo', '_blank');
  };

  if (!selected) {
    return (
      <div className={cn(
        'w-full flex items-center rounded border border-border bg-muted text-muted-foreground text-sm',
        compact ? 'px-2 py-1.5' : 'px-3 py-2'
      )}>
        {t('voicePickerPopover.loadingVoice')}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-full flex items-center justify-between rounded border bg-card transition-colors focus:outline-none',
            compact ? 'px-2 py-1.5 text-sm' : 'px-3 py-2 text-sm',
            open ? 'border-primary/60 ring-1 ring-primary/30' : 'border-border hover:border-primary/60'
          )}
        >
          <span className="flex items-center gap-1.5 text-foreground min-w-0">
            <span className={cn('inline-block w-1.5 h-1.5 rounded-full flex-shrink-0', selected.gender === 'female' ? 'bg-pink-400' : 'bg-blue-400')} />
            <span className="font-medium truncate">{selected.label}</span>
            <span className="text-muted-foreground flex-shrink-0">·</span>
            <span className="text-muted-foreground text-xs flex-shrink-0">{translateStyle(t, selected.style)}</span>
          </span>
          <ChevronDown size={16} className={cn('text-muted-foreground flex-shrink-0 transition-transform', open && 'rotate-180')} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-0 overflow-hidden">
        {/* Banner cảnh báo nếu model chưa tải */}
        {!modelDownloaded && (
          <div className="flex items-start gap-2.5 px-3 py-2.5 bg-warning/10 border-b border-warning/30">
            <svg className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L1 21h22L12 2zm0 3.5L20.5 19h-17L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-warning-foreground">{t('voicePickerPopover.modelNotDownloaded')}</p>
              <p className="text-xxs text-warning-foreground mt-0.5">{t('voicePickerPopover.modelNotDownloadedHint')}</p>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              className="flex-shrink-0 flex items-center gap-1 rounded px-2 py-1 text-xxs font-semibold bg-warning/25 text-warning-foreground hover:bg-warning/35 transition-colors"
            >
              <Download size={12} />
              {t('voicePickerPopover.downloadModel')}
            </button>
          </div>
        )}

        {/* Danh sách giọng */}
        <div className="divide-y divide-border max-h-[360px] overflow-y-auto">
          {catalog.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">{t('voicePickerPopover.loadingVoiceList')}</div>
          )}
          {catalog.map((voice) => (
            <VoicePickerRow
              key={voice.id}
              voice={voice}
              isSelected={voice.id === value}
              canSelect={modelDownloaded}
              previewState={previewStates[voice.id] ?? 'idle'}
              isPreviewOnly={!modelDownloaded}
              onSelect={() => handleSelect(voice)}
              onPreview={(e) => handlePreview(voice, e)}
            />
          ))}
        </div>

        {/* Footer hint */}
        <div className="border-t border-border px-3 py-1.5 bg-muted">
          {!modelDownloaded ? (
            <p className="text-2xs text-muted-foreground">{t('voicePickerPopover.footerHintNoModel')}</p>
          ) : (
            <p className="text-2xs text-muted-foreground">{t('voicePickerPopover.footerHintReady')}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
