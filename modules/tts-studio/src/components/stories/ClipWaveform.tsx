import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';

export interface ClipWaveformProps {
  audioUrl: string;
  width: number;
  trimStartMs: number;
  trimEndMs: number;
  durationMs: number;
}

/**
 * Dạng sóng cho 1 clip trên editor — port từ voicebox's `ClipWaveform` nội bộ
 * (`StoryTrackEditor.tsx`), đổi cách đọc màu theme: sky-app's biến CSS (`--primary`) đã LÀ 1
 * giá trị `oklch(...)` hoàn chỉnh (xem styles.css), KHÔNG phải bộ 3 số HSL trần như voicebox
 * cần bọc `hsl(${value})` — đọc thẳng, không bọc gì thêm.
 *
 * Dùng `<audio muted>` làm nguồn cho WaveSurfer thay vì để nó tự phát — component này CHỈ vẽ
 * hình, phát thật do `useStoryPlayback`'s AudioContext lo (2 nguồn phát cùng lúc sẽ vang đúp).
 */
export function ClipWaveform({ audioUrl, width, trimStartMs, trimEndMs, durationMs }: ClipWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  const effectiveDurationMs = Math.max(1, durationMs - trimStartMs - trimEndMs);
  const fullWidth = (width / effectiveDurationMs) * durationMs;
  const offsetX = (trimStartMs / durationMs) * fullWidth;

  useEffect(() => {
    if (!containerRef.current || fullWidth < 4) return;

    const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();

    const mediaElement = document.createElement('audio');
    mediaElement.muted = true;
    mediaElement.preload = 'metadata';

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      media: mediaElement,
      waveColor: primary || '#888',
      progressColor: primary || '#888',
      cursorWidth: 0,
      barWidth: 1,
      barRadius: 1,
      barGap: 1,
      height: 28,
      normalize: true,
      interact: false,
    });
    wavesurferRef.current = wavesurfer;
    wavesurfer.load(audioUrl).catch(() => { /* lỗi tải không chặn UI — chỉ không có waveform */ });

    return () => {
      wavesurfer.destroy();
      wavesurferRef.current = null;
    };
  }, [audioUrl, fullWidth]);

  return (
    <div className="h-full w-full overflow-hidden opacity-60">
      <div
        ref={containerRef}
        style={{ width: `${fullWidth}px`, transform: `translateX(-${offsetX}px)` }}
        className="h-full"
      />
    </div>
  );
}
