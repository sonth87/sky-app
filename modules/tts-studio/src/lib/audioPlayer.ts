import { useSyncExternalStore } from 'react';

/**
 * Điều phối phát audio DÙNG CHUNG cho toàn app TTS Studio — thay `playPcm.ts` cũ (chỉ tự
 * dừng phát PCM trước đó, không biết gì tới audio phát bằng cơ chế khác).
 *
 * Vấn đề đã sửa: 3 nơi phát audio độc lập (nghe thử giọng qua `new Audio(url)`, Phát nhanh
 * và Nghe lại lịch sử qua Web Audio API `AudioBufferSourceNode`) không biết tới nhau — bấm
 * nghe thử giọng B trong khi giọng A còn đang phát khiến CẢ HAI cùng phát chồng tiếng, không
 * cách nào dừng. Module này là điểm phát audio DUY NHẤT, mọi nơi phát phải đi qua đây.
 *
 * `id` để phân biệt "đang phát CÁI GÌ" — component tự so `id` của mình với `getPlayingId()`/
 * `useIsPlaying(id)` để biết có nên hiện nút Dừng thay nút Play hay không. Bấm lại đúng `id`
 * đang phát = dừng (toggle), khớp hành vi nút Play/Stop người dùng mong đợi.
 */

type Source = AudioBufferSourceNode | HTMLAudioElement;

let audioCtx: AudioContext | null = null;
let currentSource: Source | null = null;
let currentId: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function isHtmlAudio(s: Source): s is HTMLAudioElement {
  return typeof HTMLAudioElement !== 'undefined' && s instanceof HTMLAudioElement;
}

/** Dừng audio đang phát, bất kể phát bằng cơ chế nào (PCM tổng hợp hay URL nghe thử). */
export function stopAudio(): void {
  if (currentSource) {
    if (isHtmlAudio(currentSource)) {
      currentSource.pause();
      currentSource.currentTime = 0;
    } else {
      try {
        currentSource.stop();
      } catch {
        /* đã dừng sẵn */
      }
    }
  }
  currentSource = null;
  currentId = null;
  notify();
}

export function getPlayingId(): string | null {
  return currentId;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Đang phát đúng `id` này không — dùng để component tự đổi icon Play ⇄ Dừng. */
export function useIsPlaying(id: string): boolean {
  return useSyncExternalStore(subscribe, () => currentId === id);
}

/** `id` đang phát (hoặc `null`) — dùng khi 1 component cần biết trạng thái của NHIỀU item
 * cùng lúc (vd danh sách giọng để nghe thử) thay vì gọi useIsPlaying lặp lại cho từng item. */
export function useAudioPlayingId(): string | null {
  return useSyncExternalStore(subscribe, getPlayingId);
}

/**
 * Phát PCM Int16 thô (wire format của /synthesize). Bấm lại đúng `id` đang phát → dừng
 * (không phát lại từ đầu) — khớp hành vi toggle Play/Stop.
 */
export async function playPcmAudio(id: string, buffer: ArrayBuffer, sampleRate: number): Promise<void> {
  if (currentId === id) {
    stopAudio();
    return;
  }
  stopAudio();

  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') await ctx.resume();

  const sampleCount = Math.floor(buffer.byteLength / 2);
  if (sampleCount <= 0) throw new Error('Empty PCM buffer');
  const int16 = new Int16Array(buffer, 0, sampleCount);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) float32[i] = int16[i]! / 32768;

  const audioBuffer = ctx.createBuffer(1, sampleCount, sampleRate);
  audioBuffer.copyToChannel(float32, 0);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  currentSource = source;
  currentId = id;
  notify();
  source.onended = () => {
    if (currentSource === source) {
      currentSource = null;
      currentId = null;
      notify();
    }
  };
  source.start(0);
}

/** Phát audio từ URL (nghe thử giọng) — cùng cơ chế dừng-lẫn-nhau/toggle với playPcmAudio. */
export async function playUrlAudio(id: string, url: string): Promise<void> {
  if (currentId === id) {
    stopAudio();
    return;
  }
  stopAudio();

  const audio = new Audio(url);
  currentSource = audio;
  currentId = id;
  notify();
  const clearIfCurrent = () => {
    if (currentSource === audio) {
      currentSource = null;
      currentId = null;
      notify();
    }
  };
  audio.onended = clearIfCurrent;
  audio.onerror = clearIfCurrent;
  await audio.play();
}
