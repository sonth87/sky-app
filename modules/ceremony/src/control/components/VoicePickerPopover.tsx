import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import type { TtsPort } from '@sky-app/service-contracts';
import { VoicePickerCombobox, type PreviewState, type VoiceListItem } from '@sky-app/voice-catalog-ui';
import { useControlStore } from '../store';
import { stopPcm } from '../../lib/audio';
import { usePlatform } from '../PlatformContext';
import { useSlide } from '../lib/slide';
import { cn } from '../lib/cn';
import { useVoiceCatalog } from './voiceCatalog';

export { useVoiceCatalog };

const PREVIEW_TEXT = 'Xin chúc mừng tân kỹ sư Nguyễn Văn An.';

interface Props {
  value: string;
  onChange: (id: string) => void;
  compact?: boolean;
  onAddVoice?: () => void;
}

export function VoicePickerPopover({ value, onChange, compact, onAddVoice }: Props) {
  const { t } = useTranslation();
  const platform = usePlatform();
  const slide = useSlide('tts-preview-url');
  const [previewStates, setPreviewStates] = useState<Record<string, PreviewState>>({});
  const stopFnRef = useRef<(() => void) | null>(null);

  // Model "có sẵn" khi TTS engine đã ready — engine chỉ ready sau khi load xong model
  const pythonStatus = useControlStore((s) => s.pythonStatus);
  const modelDownloaded = pythonStatus === 'ready';

  const catalog = useVoiceCatalog();

  const handleDeleteVoice = useCallback(async (id: string) => {
    const rawId = id.replace(/^vieneu-/, '');
    const voiceItem = catalog.find((v) => v.id === id);
    const label = voiceItem ? voiceItem.name : rawId;
    if (!confirm(t('voiceClone.confirms.deleteVoice', { label }))) return;

    const tts = platform?.services.get<TtsPort>('tts');
    if (!tts?.deleteVoice) return;

    try {
      const res = await tts.deleteVoice(rawId);
      if (res.ok) {
        useControlStore.getState().refreshVoiceCatalog();
      } else {
        alert(res.error || 'Xóa giọng đọc thất bại');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [platform, catalog, t]);

  const stopCurrent = useCallback(() => {
    stopFnRef.current?.();
    stopFnRef.current = null;
    stopPcm();
    setPreviewStates({});
  }, []);

  const handlePreview = useCallback(async (item: VoiceListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const ps = previewStates[item.id] ?? 'idle';
    if (ps === 'playing') { stopCurrent(); return; }
    stopCurrent();
    setPreviewStates((p) => ({ ...p, [item.id]: 'loading' }));

    // Catalog entry chưa từng dùng: nghe file mẫu gốc (chưa có trong registry để
    // live-synthesize) — chọn nó ở handleSelect mới kích hoạt encode ngầm.
    if (item.source === 'catalog' && item.catalogLang) {
      try {
        const url = await platform?.services.get<TtsPort>('tts')?.getCatalogAudioUrl?.(item.catalogLang, item.id);
        if (!url) throw new Error('no catalog audio url');
        const audio = new Audio(url);
        audio.onended = () => setPreviewStates((p) => ({ ...p, [item.id]: 'idle' }));
        audio.onerror = () => setPreviewStates((p) => ({ ...p, [item.id]: 'error' }));
        await audio.play();
        setPreviewStates((p) => ({ ...p, [item.id]: 'playing' }));
        stopFnRef.current = () => { audio.pause(); audio.currentTime = 0; };
      } catch {
        setPreviewStates((p) => ({ ...p, [item.id]: 'error' }));
      }
      return;
    }

    const speakerId = item.id.replace(/^vieneu-/, '');

    if (modelDownloaded) {
      // Model đã tải: dùng TTS engine tổng hợp realtime qua TtsPort (tự phát
      // audio — chạy được cả Electron lẫn Web, xem docs/guides/ports-and-adapters.md).
      const tts = platform?.services.get<TtsPort>('tts');
      try {
        if (!tts) throw new Error('TtsPort không khả dụng');
        setPreviewStates((p) => ({ ...p, [item.id]: 'playing' }));
        await tts.speak(PREVIEW_TEXT, { voiceId: item.id, speed: 1.0 });
        setPreviewStates((p) => ({ ...p, [item.id]: 'idle' }));
        stopFnRef.current = null;
      } catch {
        setPreviewStates((p) => ({ ...p, [item.id]: 'error' }));
      }
    } else {
      // Model chưa tải: phát WAV mẫu bundled qua /preview endpoint — chỉ
      // Electron có window.slide.getTtsPreviewUrl, không có tương đương port.
      try {
        const url = await slide?.getTtsPreviewUrl?.(speakerId);
        if (!url) throw new Error('no preview url');
        const audio = new Audio(url);
        audio.onended = () => setPreviewStates((p) => ({ ...p, [item.id]: 'idle' }));
        audio.onerror = () => setPreviewStates((p) => ({ ...p, [item.id]: 'error' }));
        await audio.play();
        setPreviewStates((p) => ({ ...p, [item.id]: 'playing' }));
        stopFnRef.current = () => { audio.pause(); audio.currentTime = 0; };
      } catch {
        setPreviewStates((p) => ({ ...p, [item.id]: 'error' }));
      }
    }
  }, [previewStates, stopCurrent, modelDownloaded, platform, slide]);

  const handleChange = useCallback((id: string) => {
    stopCurrent();
    onChange(id);
    // Nếu id vừa chọn là 1 catalog voice chưa từng dùng, /synthesize lần tới sẽ tự
    // encode ngầm (main.py's _ensure_voice_ready) — không cần gọi gì thêm ở đây.
  }, [onChange, stopCurrent]);

  const handleDownload = () => {
    window.open('https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo', '_blank');
  };

  return (
    <div className="flex flex-col gap-1.5">
      {!modelDownloaded && (
        <div className="flex items-start gap-2.5 rounded border border-warning/30 bg-warning/10 px-3 py-2.5">
          <svg className="h-4 w-4 flex-shrink-0 mt-0.5 text-warning" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L1 21h22L12 2zm0 3.5L20.5 19h-17L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-warning-foreground">{t('voicePickerPopover.modelNotDownloaded')}</p>
            <p className="mt-0.5 text-xxs text-warning-foreground">{t('voicePickerPopover.modelNotDownloadedHint')}</p>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            className="flex flex-shrink-0 items-center gap-1 rounded bg-warning/25 px-2 py-1 text-xxs font-semibold text-warning-foreground hover:bg-warning/35 transition-colors"
          >
            <Download size={12} />
            {t('voicePickerPopover.downloadModel')}
          </button>
        </div>
      )}

      <VoicePickerCombobox
        items={catalog}
        value={value}
        onChange={handleChange}
        previewStates={previewStates}
        onPreview={handlePreview}
        loading={catalog.length === 0}
        loadingLabel={t('voicePickerPopover.loadingVoiceList')}
        placeholder={t('voicePickerPopover.loadingVoice')}
        compact={compact}
        canSelect={modelDownloaded}
        tabLabels={{ system: t('voicePickerPopover.tabSystem'), custom: t('voicePickerPopover.tabCustom') }}
        onAddVoice={onAddVoice}
        onDeleteVoice={handleDeleteVoice}
      />

      <p className={cn('text-2xs text-muted-foreground', compact && 'hidden')}>
        {modelDownloaded ? t('voicePickerPopover.footerHintReady') : t('voicePickerPopover.footerHintNoModel')}
      </p>
    </div>
  );
}
