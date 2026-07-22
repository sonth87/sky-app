import { useLayoutEffect, useRef, useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BackdropView, canonicalToStudent, type BackdropTemplateMap } from '@sky-app/slide-shared';
import { useControlStore } from '../store';
import { useSocketRef } from '../SocketContext';
import { resolveAsset } from '../../lib/assets';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

const BASE_H = 720;

export function PreviewPanel() {
  const { t } = useTranslation();
  const ceremony = useControlStore((s) => s.ceremony);
  const records = useControlStore((s) => s.records);
  const selectedId = useControlStore((s) => s.selectedId);
  const onStage = useControlStore((s) => s.onStage);
  const backdropAspectRatio = useControlStore((s) => s.backdropAspectRatio);
  const socket = useSocketRef();

  const wrapRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);
  const [modalScale, setModalScale] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [layouts, setLayouts] = useState<BackdropTemplateMap | null>(null);

  const BASE_W = Math.round(BASE_H * (backdropAspectRatio === '25:9' ? 25 / 9 : 16 / 9));
  const cssAspectRatio = backdropAspectRatio === '25:9' ? '25 / 9' : '16 / 9';

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / BASE_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [BASE_W]);

  useEffect(() => {
    if (!ceremony?.backdrops_config) return;
    fetch(resolveAsset(ceremony.backdrops_config))
      .then((r) => r.json())
      .then((data: BackdropTemplateMap) => {
        setLayouts(data);
      })
      .catch(() => {
        setLayouts(null);
      });
  }, [ceremony?.backdrops_config]);

  useEffect(() => {
    if (!showModal) return;
    const el = modalRef.current;
    if (!el) return;
    const update = () => setModalScale(el.clientWidth / BASE_W);
    const timer = requestAnimationFrame(update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(timer);
      ro.disconnect();
    };
  }, [showModal, BASE_W]);

  // Enter cũng đóng (hành vi đặc thù của preview — ESC được Modal primitive xử lý).
  useEffect(() => {
    if (!showModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') setShowModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  const selectedRecord = selectedId
    ? records.find((r) => r.id === selectedId) ?? null
    : null;
  // Adapter TẠM cho BackdropView (hệ template cũ) — xem PHỤ LỤC "giữ BackdropView tạm" trong plan.
  const selected = useMemo(() => (selectedRecord ? canonicalToStudent(selectedRecord, 0) : null), [selectedRecord]);
  const isOnStage = !!selectedRecord && onStage?.record.id === selectedRecord.id;

  if (!ceremony) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('previewPanel.preview')}
        </span>
        {selected && (
          <span className="font-mono text-xs text-muted-foreground">{selectedRecord?.identifierCode ?? selectedRecord?.id}</span>
        )}
      </div>

      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-md border border-border bg-black cursor-pointer hover:opacity-90 transition-opacity"
        style={{ aspectRatio: cssAspectRatio }}
        onClick={() => selected && setShowModal(true)}
      >
        {selected ? (
          <div
            style={{
              width: BASE_W,
              height: BASE_H,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <BackdropView
              student={selected}
              ceremony={ceremony}
              layouts={layouts}
              aspectRatio={backdropAspectRatio}
              resolveAsset={resolveAsset}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-muted-foreground">
            {t('previewPanel.clickRowLine1')}
            <br />
            {t('previewPanel.clickRowLine2')}
          </div>
        )}
      </div>

      {selected && (
        <Modal
          open={showModal}
          onClose={() => setShowModal(false)}
          size={{ width: '60%' }}
          backdrop="blur"
          unstyled
        >
          <div
            ref={modalRef}
            className="relative w-full max-w-6xl rounded-lg overflow-hidden bg-black shadow-2xl"
            style={{ aspectRatio: cssAspectRatio }}
          >
            <div
              style={{
                width: BASE_W,
                height: BASE_H,
                transform: `scale(${modalScale})`,
                transformOrigin: 'top left',
              }}
            >
              <BackdropView
                student={selected}
                ceremony={ceremony}
                layouts={layouts}
                aspectRatio={backdropAspectRatio}
                resolveAsset={resolveAsset}
              />
            </div>
            <Button
              variant="danger"
              pill
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4"
            >
              ✕ {t('common.close')}
            </Button>
          </div>
        </Modal>
      )}

      {selected && (
        <button
          onClick={() => selectedRecord && socket.current?.emit('cmd:show', { id: selectedRecord.id, source: 'manual' })}
          disabled={isOnStage}
          className="mt-2 w-full rounded-md bg-success px-3 py-2 text-sm font-medium text-success-foreground hover:bg-success/90 disabled:cursor-not-allowed disabled:bg-muted-foreground"
        >
          {isOnStage ? t('previewPanel.currentlyShowing') : `▶ ${t('previewPanel.showOnScreen')}`}
        </button>
      )}
    </div>
  );
}
