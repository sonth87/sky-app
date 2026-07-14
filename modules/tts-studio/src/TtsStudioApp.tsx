import { useEffect, useRef, useState } from 'react';
import type { AppContentProps } from '@sky-app/kernel';
import type { TtsPort } from '@sky-app/service-contracts';
import { PortalContainerContext } from './PortalContainerContext';
import { VoicePicker } from './components/VoicePicker';
import { SpeedSlider } from './components/SpeedSlider';
import { UsageGuide } from './components/UsageGuide';
import { TextInputPanel } from './components/TextInputPanel';
import { GenerateBar } from './components/GenerateBar';
import { HistoryList } from './components/HistoryList';
import { useTtsStudioStore } from './store';
import { playPcm } from './lib/playPcm';
import { pcmToWavBlob } from './lib/wav-encode';
import { getAllHistoryEntries, putHistoryEntry, type HistoryEntry } from './lib/history-db';

export function TtsStudioApp({ platform }: AppContentProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tts = platform.services.get<TtsPort>('tts');

  const setVoices = useTtsStudioStore((s) => s.setVoices);
  const voices = useTtsStudioStore((s) => s.voices);
  const selectedVoiceId = useTtsStudioStore((s) => s.selectedVoiceId);
  const setSelectedVoiceId = useTtsStudioStore((s) => s.setSelectedVoiceId);
  const text = useTtsStudioStore((s) => s.text);
  const speed = useTtsStudioStore((s) => s.speed);
  const setIsGenerating = useTtsStudioStore((s) => s.setIsGenerating);
  const setHistory = useTtsStudioStore((s) => s.setHistory);
  const prependHistory = useTtsStudioStore((s) => s.prependHistory);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const lastResultRef = useRef<{ buffer: ArrayBuffer; sampleRate: number } | null>(null);
  const [canQuickPlay, setCanQuickPlay] = useState(false);

  useEffect(() => {
    if (!tts) return;
    let cancelled = false;
    tts
      .listVoices()
      .then((list) => {
        if (cancelled) return;
        setVoices(list.map((v) => ({ id: v.id, name: v.name, gender: v.gender })));
        if (list.length > 0 && !selectedVoiceId) setSelectedVoiceId(list[0]!.id);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ load 1 lần lúc mount
  }, [tts]);

  useEffect(() => {
    let cancelled = false;
    getAllHistoryEntries()
      .then((entries) => {
        if (cancelled) return;
        setHistory(
          entries.map((e) => ({
            id: e.id,
            text: e.text,
            voiceId: e.voiceId,
            voiceLabel: e.voiceLabel,
            speed: e.speed,
            createdAt: e.createdAt,
            durationMs: e.durationMs,
          })),
        );
      })
      .catch(() => {
        /* IndexedDB lỗi (vd private browsing chặn) — lịch sử trống, không chặn app */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ load 1 lần lúc mount
  }, []);

  const handlePreview = async (voiceId: string) => {
    if (!tts) return;
    setPreviewingId(voiceId);
    try {
      const url = await tts.getPreviewUrl(voiceId);
      const audio = new Audio(url);
      audio.onended = () => setPreviewingId(null);
      audio.onerror = () => setPreviewingId(null);
      await audio.play();
    } catch {
      setPreviewingId(null);
    }
  };

  const handleGenerate = async () => {
    if (!tts || !selectedVoiceId || !text.trim()) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const trimmedText = text.trim();
      const result = await tts.synthesizeBuffer(trimmedText, { voiceId: selectedVoiceId, speed });
      lastResultRef.current = result;
      setCanQuickPlay(true);
      await playPcm(result.buffer, result.sampleRate);

      const voiceLabel = voices.find((v) => v.id === selectedVoiceId)?.name ?? selectedVoiceId;
      const sampleCount = Math.floor(result.buffer.byteLength / 2);
      const durationMs = (sampleCount / result.sampleRate) * 1000;
      const entry: HistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: trimmedText,
        voiceId: selectedVoiceId,
        voiceLabel,
        speed,
        sampleRate: result.sampleRate,
        createdAt: Date.now(),
        audioBlob: pcmToWavBlob(result.buffer, result.sampleRate),
        durationMs,
      };
      await putHistoryEntry(entry);
      prependHistory({
        id: entry.id,
        text: entry.text,
        voiceId: entry.voiceId,
        voiceLabel: entry.voiceLabel,
        speed: entry.speed,
        createdAt: entry.createdAt,
        durationMs: entry.durationMs,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setGenError(msg.includes('503') ? 'TTS engine đang khởi động, thử lại sau vài giây.' : msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleQuickPlay = async () => {
    if (!lastResultRef.current) return;
    try {
      await playPcm(lastResultRef.current.buffer, lastResultRef.current.sampleRate);
    } catch {
      /* im lặng — không phải lỗi nghiêm trọng đủ để hiện banner */
    }
  };

  if (!tts) {
    return (
      <div ref={rootRef} className="tts-studio-root flex h-full items-center justify-center bg-background p-6">
        <p className="text-sm text-muted-foreground">
          Dịch vụ TTS không khả dụng trên môi trường này.
        </p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="tts-studio-root flex h-full flex-col bg-background" data-env={platform.env}>
      <PortalContainerContext.Provider value={rootRef}>
        <div className="grid h-full grid-cols-[280px_1fr] overflow-hidden">
          <aside className="flex flex-col gap-4 overflow-y-auto border-r border-border p-3">
            <VoicePicker onPreview={handlePreview} previewingId={previewingId} />
            <SpeedSlider />
            <UsageGuide />
            {loadError && (
              <p className="text-2xs text-destructive">Không tải được danh sách giọng: {loadError}</p>
            )}
          </aside>
          <main className="flex flex-col gap-3 overflow-y-auto p-3">
            <TextInputPanel />
            {genError && (
              <p className="text-2xs text-destructive" role="alert">{genError}</p>
            )}
            <GenerateBar
              onGenerate={handleGenerate}
              onQuickPlay={handleQuickPlay}
              canQuickPlay={canQuickPlay}
            />
            <HistoryList />
          </main>
        </div>
      </PortalContainerContext.Provider>
    </div>
  );
}
