import { useCallback, useEffect, useRef } from 'react';
import type { StoryItem, StoryPort } from '@sky-app/service-contracts';
import { useStoryPlaybackStore } from './storyPlaybackStore';

interface ActiveSource {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

function effectiveDurationMs(item: StoryItem): number {
  return Math.max(0, item.durationMs - item.trimStartMs - item.trimEndMs);
}

function totalDurationMs(items: StoryItem[]): number {
  return items.reduce((max, i) => Math.max(max, i.startTimeMs + effectiveDurationMs(i)), 0);
}

/**
 * Phát nhiều track ĐỒNG BỘ bằng Web Audio API — port ý tưởng từ voicebox's
 * `useStoryPlayback.ts` (AudioContext làm đồng hồ chủ, mỗi item 1 AudioBufferSourceNode +
 * GainNode riêng cho volume), rút gọn cho đúng nhu cầu sky-app (không cần track-mute/solo).
 *
 * Vì sao KHÔNG dùng `<audio>` nhiều thẻ: `<audio>` không đồng bộ được tới độ chính xác sample
 * cần cho nhiều clip chồng lấn track — lệch vài chục ms giữa các track lộ rõ khi nghe. Web
 * Audio's `AudioBufferSourceNode.start(when)` lên lịch theo `AudioContext.currentTime` (đồng
 * hồ phần cứng), sai số cỡ sample.
 */
export function useStoryPlayback(storyId: string, items: StoryItem[], storyPort: StoryPort) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const activeSourcesRef = useRef<ActiveSource[]>([]);
  // Cache theo `${itemId}:${audioFile}` — audioFile đổi sau regenerate/set-version, cache cũ
  // phải tự động miss thay vì phát nhầm bản cũ.
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const rafRef = useRef<number | null>(null);
  // Mốc để tính currentTimeMs khi đang phát: currentTimeMs = playStartMs + (audioContext.currentTime - playStartContextTime) * 1000.
  const playStartMsRef = useRef(0);
  const playStartContextTimeRef = useRef(0);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.connect(ctx.destination);
      audioContextRef.current = ctx;
      masterGainRef.current = master;
    }
    return audioContextRef.current;
  }, []);

  const decodeItem = useCallback(async (item: StoryItem): Promise<AudioBuffer> => {
    const key = `${item.id}:${item.audioFile}`;
    const cached = bufferCacheRef.current.get(key);
    if (cached) return cached;

    const ctx = getAudioContext();
    const url = await storyPort.itemAudioUrl(storyId, item.id);
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    bufferCacheRef.current.set(key, buffer);
    return buffer;
  }, [getAudioContext, storyId, storyPort]);

  // Nạp trước mọi buffer khi danh sách item đổi — play() ít độ trễ hơn hẳn nếu phải decode
  // giữa lúc bấm Play.
  useEffect(() => {
    items.forEach((item) => { void decodeItem(item).catch(() => { /* thử lại lúc play() nếu cần */ }); });
  }, [items, decodeItem]);

  const stopAllSources = useCallback(() => {
    for (const { source } of activeSourcesRef.current) {
      try { source.stop(); } catch { /* đã tự dừng (phát hết) — stop() lại sẽ throw, bỏ qua */ }
    }
    activeSourcesRef.current = [];
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const elapsedMs = (ctx.currentTime - playStartContextTimeRef.current) * 1000;
    const nowMs = playStartMsRef.current + elapsedMs;
    const total = totalDurationMs(items);

    if (nowMs >= total) {
      useStoryPlaybackStore.getState().setCurrentTimeMs(total);
      stopAllSources();
      useStoryPlaybackStore.getState().setPlaying(false);
      return;
    }
    useStoryPlaybackStore.getState().setCurrentTimeMs(nowMs);
    rafRef.current = requestAnimationFrame(tick);
  }, [items, stopAllSources]);

  const play = useCallback(async (fromMs?: number) => {
    stopAllSources();
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();

    const startMs = fromMs ?? useStoryPlaybackStore.getState().currentTimeMs;
    const buffers = await Promise.all(items.map((item) => decodeItem(item).catch(() => null)));

    const contextStart = ctx.currentTime + 0.05; // đệm nhỏ tránh lịch phát ngay quá khứ do decode mất thời gian
    items.forEach((item, i) => {
      const buffer = buffers[i];
      if (!buffer) return; // item lỗi audio — bỏ qua, không chặn cả lượt phát
      const effDur = effectiveDurationMs(item);
      const itemEndMs = item.startTimeMs + effDur;
      if (itemEndMs <= startMs) return; // đã trôi qua so với vị trí phát — không lên lịch

      const trimStartSec = item.trimStartMs / 1000;
      const startsInFutureMs = Math.max(0, item.startTimeMs - startMs);
      const offsetIntoItemMs = Math.max(0, startMs - item.startTimeMs);
      const remainingSec = (effDur - offsetIntoItemMs) / 1000;
      if (remainingSec <= 0) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = item.volume;
      source.connect(gain);
      gain.connect(masterGainRef.current!);
      source.start(contextStart + startsInFutureMs / 1000, trimStartSec + offsetIntoItemMs / 1000, remainingSec);
      activeSourcesRef.current.push({ source, gain });
    });

    playStartMsRef.current = startMs;
    playStartContextTimeRef.current = contextStart;
    useStoryPlaybackStore.getState().setCurrentTimeMs(startMs);
    useStoryPlaybackStore.getState().setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [items, decodeItem, getAudioContext, stopAllSources, tick]);

  const pause = useCallback(() => {
    stopAllSources();
    useStoryPlaybackStore.getState().setPlaying(false);
  }, [stopAllSources]);

  const stop = useCallback(() => {
    stopAllSources();
    useStoryPlaybackStore.getState().setPlaying(false);
    useStoryPlaybackStore.getState().setCurrentTimeMs(0);
  }, [stopAllSources]);

  const seek = useCallback((ms: number) => {
    const clamped = Math.max(0, Math.min(ms, totalDurationMs(items)));
    if (useStoryPlaybackStore.getState().isPlaying) {
      void play(clamped);
    } else {
      useStoryPlaybackStore.getState().setCurrentTimeMs(clamped);
    }
  }, [items, play]);

  // Dừng hẳn + đóng AudioContext khi component unmount (đổi Story/rời tab) — không để nguồn
  // âm thanh treo lại phát sau khi UI đã tháo.
  useEffect(() => {
    return () => {
      stopAllSources();
      audioContextRef.current?.close().catch(() => { /* đã đóng hoặc chưa từng mở */ });
      audioContextRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup CHỈ chạy lúc unmount thật, không phải mỗi lần stopAllSources đổi identity
  }, []);

  return { play, pause, stop, seek, totalDurationMs: totalDurationMs(items) };
}
