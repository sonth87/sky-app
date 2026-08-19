import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Pause, Play, Repeat, Volume2, VolumeX, X } from 'lucide-react';
import { pcmToWavBlob } from './wav-encode.js';

export type AudioPlayerSource =
  | { kind: 'pcm'; buffer: ArrayBuffer; sampleRate: number }
  | { kind: 'url'; url: string };

export interface AudioPlayerBarProps {
  source: AudioPlayerSource;
  id: string;
  label?: string;
  onClose: () => void;
  /** Mặc định `true` — tự phát ngay khi mount (bấm nút là nghe luôn, không cần bấm thêm lần 2). */
  autoPlay?: boolean;
  /** Điều phối "chỉ 1 nguồn phát tại 1 thời điểm" với các audio khác trong app nhúng component
   *  này (vd nghe thử giọng, phát lại lịch sử) — app tự truyền vào bộ điều phối của mình. Không
   *  truyền = mỗi `AudioPlayerBar` tự phát độc lập, không phối hợp dừng-lẫn-nhau với audio khác
   *  trong app (chấp nhận được khi dùng độc lập/lần đầu tích hợp). */
  registerPlaying?: (id: string, stop: () => void) => void;
  /** App gọi khi nguồn NGOÀI giành quyền phát (qua `registerPlaying`) — dọn `isPlaying` mà
   *  KHÔNG gọi lại `stop()` của chính nó (đã tự dừng rồi). */
  clearIfCurrent?: (id: string) => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const noop = () => {};

/**
 * Thanh phát audio "xịn" — waveform tương tác (kéo để tua), play/pause, loop, volume — dùng
 * WaveSurfer.js làm CHÍNH cho cả hiển thị lẫn phát. Dùng chung cho mọi nơi cần phát lại 1 đoạn
 * audio đã sinh (PCM thô hoặc URL) kèm waveform, không phụ thuộc bất kỳ store/module cụ thể nào
 * — điều phối "chỉ 1 nguồn phát" với audio khác trong app (nếu có) đi qua
 * `registerPlaying`/`clearIfCurrent`, do app nhúng tự truyền vào.
 */
export function AudioPlayerBar({ source, id, label, onClose, autoPlay = true, registerPlaying, clearIfCurrent }: AudioPlayerBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loop, setLoop] = useState(false);
  const [volume, setVolume] = useState(1);

  const register = registerPlaying ?? noop;
  const clear = clearIfCurrent ?? noop;

  useEffect(() => {
    if (!containerRef.current) return;

    let audioUrl: string;
    if (source.kind === 'pcm') {
      const blob = pcmToWavBlob(source.buffer, source.sampleRate);
      audioUrl = URL.createObjectURL(blob);
      objectUrlRef.current = audioUrl;
    } else {
      audioUrl = source.url;
      objectUrlRef.current = null;
    }

    // Đọc thẳng biến CSS `--primary` — đã LÀ 1 giá trị oklch(...) hoàn chỉnh, không bọc hàm màu
    // nào thêm (app nhúng chịu trách nhiệm khai báo biến này trong theme của mình).
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#888';
    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      url: audioUrl,
      waveColor: primary,
      progressColor: primary,
      cursorColor: primary,
      height: 40,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
    });
    wavesurferRef.current = wavesurfer;

    wavesurfer.on('ready', () => {
      setDuration(wavesurfer.getDuration());
      if (autoPlay) {
        register(id, () => wavesurfer.pause());
        void wavesurfer.play();
      }
    });
    wavesurfer.on('audioprocess', () => setCurrentTime(wavesurfer.getCurrentTime()));
    wavesurfer.on('seeking', () => setCurrentTime(wavesurfer.getCurrentTime()));
    wavesurfer.on('play', () => setIsPlaying(true));
    wavesurfer.on('pause', () => setIsPlaying(false));
    wavesurfer.on('finish', () => {
      setIsPlaying(false);
      clear(id);
    });

    return () => {
      wavesurfer.destroy();
      wavesurferRef.current = null;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      clear(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ dựng lại player khi `source`/`id` đổi thật, không phải mỗi lần autoPlay/onClose/register/clear đổi identity
  }, [source, id]);

  useEffect(() => {
    const media = wavesurferRef.current?.getMediaElement();
    if (media) media.loop = loop;
  }, [loop]);

  useEffect(() => {
    wavesurferRef.current?.setVolume(volume);
  }, [volume]);

  const handlePlayPause = () => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    if (ws.isPlaying()) {
      ws.pause();
    } else {
      register(id, () => ws.pause());
      void ws.play();
    }
  };

  const handleClose = () => {
    wavesurferRef.current?.pause();
    clear(id);
    onClose();
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2 shadow-sm">
      <button
        type="button"
        onClick={handlePlayPause}
        title={isPlaying ? 'Tạm dừng' : 'Phát'}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90"
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
      </button>

      {label && <span className="hidden shrink-0 max-w-30 truncate text-2xs text-muted-foreground md:block">{label}</span>}

      <div ref={containerRef} className="min-w-0 flex-1" />

      <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <button
        type="button"
        onClick={() => setLoop((v) => !v)}
        title={loop ? 'Tắt lặp lại' : 'Lặp lại'}
        className={loop ? 'shrink-0 rounded p-1 text-primary' : 'shrink-0 rounded p-1 text-muted-foreground hover:text-foreground'}
      >
        <Repeat size={14} />
      </button>

      <button
        type="button"
        onClick={() => setVolume((v) => (v > 0 ? 0 : 1))}
        title={volume > 0 ? 'Tắt tiếng' : 'Bật tiếng'}
        className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
      >
        {volume > 0 ? <Volume2 size={14} /> : <VolumeX size={14} />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        className="hidden w-16 shrink-0 sm:block"
        title="Âm lượng"
      />

      <button
        type="button"
        onClick={handleClose}
        title="Đóng"
        className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
      >
        <X size={14} />
      </button>
    </div>
  );
}
