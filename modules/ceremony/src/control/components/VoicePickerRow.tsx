import { useTranslation } from 'react-i18next';
import { Check, ExternalLink, Loader2, Pause, Play } from 'lucide-react';
import type { VoiceInfo } from './voiceCatalog';
import { translateStyle } from './voiceCatalog';
import { cn } from '../lib/cn';

type PreviewState = 'idle' | 'loading' | 'playing' | 'error';

function GenderDot({ gender }: { gender: 'female' | 'male' }) {
  return (
    <span className={cn('inline-block w-1.5 h-1.5 rounded-full flex-shrink-0', gender === 'female' ? 'bg-pink-400' : 'bg-blue-400')} />
  );
}

function Tag({ children, color }: { children: React.ReactNode; color: 'pink' | 'blue' | 'muted' }) {
  const cls = {
    pink: 'bg-pink-50 text-pink-600',
    blue: 'bg-info/10 text-info',
    muted: 'bg-muted text-muted-foreground',
  }[color];
  return <span className={cn('text-2xs px-1.5 py-0.5 rounded font-medium', cls)}>{children}</span>;
}

function PreviewBtn({ state, isPreview, onClick }: { state: PreviewState; isPreview: boolean; onClick: (e: React.MouseEvent) => void }) {
  const { t } = useTranslation();
  const isLoading = state === 'loading';
  const isPlaying = state === 'playing';
  const isError = state === 'error';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      title={isPlaying ? t('voicePickerPopover.stop') : isError ? t('voicePickerPopover.errorRetry') : isPreview ? t('voicePickerPopover.listenSample') : t('voicePickerPopover.tryRealtime')}
      className={cn(
        'flex items-center gap-1 rounded px-1.5 py-1 text-xxs font-medium transition-colors',
        isPlaying ? 'bg-primary/10 text-primary hover:bg-primary/20'
          : isLoading ? 'bg-muted text-muted-foreground cursor-wait'
          : isError ? 'bg-destructive/10 text-destructive hover:bg-destructive/15'
          : isPreview ? 'bg-warning/15 text-warning-foreground hover:bg-warning/25'
          : 'bg-muted text-foreground hover:bg-muted'
      )}
    >
      {isLoading ? <Loader2 size={12} className="animate-spin" /> : isPlaying ? <Pause size={12} /> : <Play size={12} />}
      {isError ? t('voicePickerPopover.error') : isPlaying ? t('voicePickerPopover.stop') : isPreview ? t('voicePickerPopover.sample') : t('voicePickerPopover.try')}
    </button>
  );
}

interface VoicePickerRowProps {
  voice: VoiceInfo;
  isSelected: boolean;
  canSelect: boolean;
  previewState: PreviewState;
  isPreviewOnly: boolean;
  onSelect: () => void;
  onPreview: (e: React.MouseEvent) => void;
}

/** Một dòng giọng đọc trong danh sách VoicePickerPopover — tách riêng để giảm kích thước god-component. */
export function VoicePickerRow({ voice, isSelected, canSelect, previewState, isPreviewOnly, onSelect, onPreview }: VoicePickerRowProps) {
  const { t } = useTranslation();
  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2.5 transition-colors',
        canSelect ? 'cursor-pointer' : 'cursor-default',
        isSelected ? 'bg-primary/10' : canSelect ? 'hover:bg-muted' : ''
      )}
    >
      <div className="w-3.5 flex-shrink-0">
        {isSelected && <Check size={14} className="text-primary" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <GenderDot gender={voice.gender} />
          <span className={cn('text-sm font-medium', isSelected ? 'text-primary' : !canSelect ? 'text-muted-foreground' : 'text-foreground')}>
            {voice.label}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-0.5 pl-0.5">
          <Tag color={voice.gender === 'female' ? 'pink' : 'blue'}>{translateStyle(t, voice.style)}</Tag>
          <Tag color="muted">{voice.region}</Tag>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <PreviewBtn state={previewState} isPreview={isPreviewOnly} onClick={onPreview} />
        <a
          href={voice.modelUrl}
          target="_blank"
          rel="noreferrer"
          title={t('voicePickerPopover.hfModelPage')}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
