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

/** `{ stop }` — handle chung chung cho nguồn phát KHÔNG phải Web Audio/`<audio>` thô (vd
 *  `AudioPlayerBar`'s WaveSurfer instance) — xem `playExternal()`. */
interface StoppableHandle {
  stop: () => void;
}

type Source = AudioBufferSourceNode | HTMLAudioElement | StoppableHandle;

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

function isAudioBufferSource(s: Source): s is AudioBufferSourceNode {
  return typeof AudioBufferSourceNode !== 'undefined' && s instanceof AudioBufferSourceNode;
}

/** Dừng audio đang phát, bất kể phát bằng cơ chế nào (PCM tổng hợp, URL nghe thử, hay nguồn
 *  ngoài đăng ký qua `playExternal` — vd `AudioPlayerBar`'s WaveSurfer). */
export function stopAudio(): void {
  if (currentSource) {
    if (isHtmlAudio(currentSource)) {
      currentSource.pause();
      currentSource.currentTime = 0;
    } else if (isAudioBufferSource(currentSource)) {
      try {
        currentSource.stop();
      } catch {
        /* đã dừng sẵn */
      }
    } else {
      currentSource.stop();
    }
  }
  currentSource = null;
  currentId = null;
  notify();
}

/**
 * Đăng ký 1 nguồn phát KHÔNG dùng `AudioBufferSourceNode`/`HTMLAudioElement` trực tiếp (vd
 * `AudioPlayerBar`'s WaveSurfer, tự quản việc phát/tua/volume bên trong nó) làm nguồn "đang
 * phát" hiện tại — giữ đúng bất biến "chỉ 1 nguồn phát tại 1 thời điểm" của module này: gọi
 * hàm này tự dừng bất kỳ audio nào khác đang phát qua `playPcmAudio`/`playUrlAudio`/
 * `playExternal` trước đó, và ngược lại các hàm đó cũng tự dừng nguồn đăng ký ở đây.
 * `stopFn` được gọi khi có nguồn khác giành quyền phát, hoặc khi `stopAudio()` được gọi thẳng.
 */
export function playExternal(id: string, stopFn: () => void): void {
  if (currentId === id) return; // đã là nguồn đang phát — không tự dừng chính mình
  stopAudio();
  currentSource = { stop: stopFn };
  currentId = id;
  notify();
}

/** `AudioPlayerBar` gọi khi nguồn NGOÀI tự kết thúc (phát hết, không loop) — dọn state mà
 *  KHÔNG gọi lại `stop()` của chính nó (đã tự dừng rồi, gọi lại thừa/vô hại nhưng không cần). */
export function clearExternalIfCurrent(id: string): void {
  if (currentId === id) {
    currentSource = null;
    currentId = null;
    notify();
  }
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
  audio.onerror = () => {
    // Trước đây nuốt lỗi hoàn toàn — bấm nghe thử giọng thiếu file preview (404) trông như
    // không có tác dụng gì, không cách nào biết vì sao (bug thật 2026-08-04, xem
    // apps/tts-service/server/generate_previews.py's fix cùng đợt). Log ra console để còn
    // debug được nếu tái diễn (vd thêm giọng preset mới quên chạy generate_previews.py).
    console.error(`[audioPlayer] Không phát được audio (url=${url}):`, audio.error);
    clearIfCurrent();
  };
  await audio.play();
}
