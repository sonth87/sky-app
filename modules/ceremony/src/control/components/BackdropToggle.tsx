import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSlide } from '../lib/slide';

function useBackdropState() {
  const slide = useSlide('backdrop-display');
  const [open, setOpen] = useState<boolean>(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!slide) return;
    slide.isBackdropOpen().then((isOpen) => {
      setOpen(isOpen);
      if (isOpen) {
        slide.isBackdropFullscreen().then(setFullscreen);
      } else {
        setFullscreen(false);
      }
    });

    const off = slide.onBackdropState((payload) => {
      setOpen(payload.open);
      setFullscreen(payload.fullscreen);
    });
    return off;
  }, [slide]);

  async function toggle() {
    if (!slide) return;
    setBusy(true);
    try {
      const { open: nextOpen } = await slide.toggleBackdrop();
      setOpen(nextOpen);
      if (nextOpen) {
        const isFS = await slide.isBackdropFullscreen();
        setFullscreen(isFS);
      } else {
        setFullscreen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleFullscreen() {
    if (!slide) return;
    const next = !fullscreen;
    await slide.setBackdropFullscreen(next);
    setFullscreen(next);
  }

  return { open, fullscreen, busy, toggle, toggleFullscreen };
}

/** Nút compact dùng trong header */
export function BackdropToggleCompact() {
  const { t } = useTranslation();
  const { open, fullscreen, busy, toggle, toggleFullscreen } = useBackdropState();
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggle}
        disabled={busy}
        title={open ? t('backdropToggle.turnOff') : t('backdropToggle.turnOn')}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
          open ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-success text-success-foreground hover:bg-success/90'
        }`}
      >
        <span>{open ? '⏻' : '▶'}</span>
        <span>{busy ? t('backdropToggle.processing') : open ? t('backdropToggle.turnOffShort') : t('backdropToggle.turnOnShort')}</span>
      </button>

      {open && (
        <button
          onClick={toggleFullscreen}
          title={fullscreen ? t('backdropToggle.exitFullscreen') : t('backdropToggle.fullscreen')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
            fullscreen ? 'bg-warning text-warning-foreground hover:bg-warning/90' : 'bg-foreground text-background hover:bg-foreground/90'
          }`}
        >
          <span>{fullscreen ? '⤡' : '⤢'}</span>
          <span>{fullscreen ? t('backdropToggle.exitFullscreen') : t('backdropToggle.fullscreen')}</span>
        </button>
      )}
    </div>
  );
}

/** Panel đầy đủ (dự phòng) */
export function BackdropToggle() {
  const { t } = useTranslation();
  const { open, fullscreen, busy, toggle, toggleFullscreen } = useBackdropState();
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-muted-foreground">{t('backdropToggle.displayScreen')}</span>
        <span className={`text-xs ${open ? 'text-success' : 'text-muted-foreground'}`}>
          {open ? t('backdropToggle.on') : t('backdropToggle.off')}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <button
          onClick={toggle}
          disabled={busy}
          className={`w-full rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50 ${
            open ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-success text-success-foreground hover:bg-success/90'
          }`}
        >
          {busy ? t('backdropToggle.processing') : open ? `⏻ ${t('backdropToggle.turnOff')}` : `▶ ${t('backdropToggle.turnOn')}`}
        </button>

        {open && (
          <button
            onClick={toggleFullscreen}
            className={`w-full rounded-md px-3 py-2 text-sm font-medium ${
              fullscreen ? 'bg-warning text-warning-foreground hover:bg-warning/90' : 'bg-foreground text-background hover:bg-foreground/90'
            }`}
          >
            {fullscreen ? `⤡ ${t('backdropToggle.exitFullscreen')}` : `⤢ ${t('backdropToggle.fullscreen')}`}
          </button>
        )}
      </div>
    </div>
  );
}
