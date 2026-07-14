import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DisplayInfo } from '@sky-app/slide-shared';
import type { BackdropAspectRatio } from '@sky-app/slide-shared';
import { useControlStore } from '../store';
import { useSocketRef } from '../SocketContext';
import { useSlide } from '../lib/slide';

const ASPECT_RATIOS: BackdropAspectRatio[] = ['16:9', '25:9'];

/** Chọn màn hình + bật/tắt fullscreen + tỷ lệ khung hình cho cửa sổ Backdrop */
export function DisplayPicker() {
  const { t } = useTranslation();
  const slide = useSlide('backdrop-display');
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const backdropAspectRatio = useControlStore((s) => s.backdropAspectRatio);
  const socket = useSocketRef();

  useEffect(() => {
    if (!slide) return;
    slide.listDisplays().then(setDisplays);

    // Kiểm tra trạng thái fullscreen ban đầu
    slide.isBackdropOpen().then((open) => {
      if (open) {
        slide.isBackdropFullscreen().then(setFullscreen);
      } else {
        setFullscreen(false);
      }
    });

    const off = slide.onBackdropState((payload) => {
      setFullscreen(payload.fullscreen);
    });
    return off;
  }, [slide]);

  async function handleMove(d: DisplayInfo) {
    if (!slide) return;
    await slide.moveBackdrop(d.id, false);
    setFullscreen(false);
  }

  async function toggleFullscreen() {
    if (!slide) return;
    const next = !fullscreen;
    await slide.setBackdropFullscreen(next);
    setFullscreen(next);
  }

  function handleAspectRatioChange(next: BackdropAspectRatio) {
    socket.current?.emit('cmd:setBackdropAspectRatio', { aspectRatio: next });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t('displayPicker.backdropScreen')}</div>

      <div className="mb-3">
        <div className="mb-1 text-xs text-muted-foreground">{t('displayPicker.aspectRatio')}</div>
        <div className="flex gap-2">
          {ASPECT_RATIOS.map((ar) => (
            <button
              key={ar}
              onClick={() => handleAspectRatioChange(ar)}
              className={`rounded border px-3 py-1.5 text-xs font-medium ${
                backdropAspectRatio === ar
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {ar}
            </button>
          ))}
        </div>
      </div>

      {displays.length > 1 && (
        <div className="mb-2">
          <div className="mb-1 text-xs text-muted-foreground">{t('displayPicker.moveToDisplay')}</div>
          <div className="flex flex-wrap gap-2">
            {displays.map((d) => (
              <button
                key={d.id}
                onClick={() => handleMove(d)}
                className="rounded border border-border px-3 py-1.5 text-xs hover:bg-muted"
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={toggleFullscreen}
        className={`w-full rounded-md px-3 py-1.5 text-xs font-medium ${
          fullscreen ? 'bg-warning text-warning-foreground hover:bg-warning/90' : 'bg-foreground text-background hover:bg-foreground/90'
        }`}
      >
        {fullscreen ? `⤡ ${t('displayPicker.exitFullscreen')}` : `⤢ ${t('displayPicker.fullscreen')}`}
      </button>
    </div>
  );
}
