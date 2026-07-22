// EventHubModal — PHỤ LỤC "Event Hub" (2026-07-22), THAY THẾ CreateEventWizard.tsx's kiến trúc
// 4-bước tuyến tính. Mô hình mới:
//   Giai đoạn A (Event chưa tồn tại) — modal TỐI GIẢN chỉ tên+ngày, bấm "Tạo" → gọi
//   eventPort.create() NGAY (data/layout rỗng hợp lệ), rồi CHUYỂN NỘI BỘ sang Giai đoạn B (không
//   đóng modal, không mount lại component).
//   Giai đoạn B (Event đã tồn tại, có id thật) — Hub: hiện tên+ngày Event + 2 nút lớn "Import dữ
//   liệu"/"Chọn layout", mỗi nút mở đúng panel chức năng NGAY TRONG modal (đổi nội dung tại chỗ,
//   có nút "← Quay lại" về Hub). Đóng modal bất kỳ lúc nào — Event đã lưu, không mất gì (khác
//   hành vi "Huỷ" cũ mất toàn bộ vì chưa create()).
//
// Chế độ SỬA (initialEvent truyền vào, từ nút "Sửa" ở EventGate.tsx) — mở THẲNG vào Giai đoạn B.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, LayoutTemplate, Check } from 'lucide-react';
import type { AssetPort, DataSourcePort, EventPort, LayoutPort } from '@sky-app/service-contracts';
import type { EventDocument } from '@sky-app/slide-shared';
import { Modal } from './components/ui/Modal.js';
import { Button } from './components/ui/Button.js';
import { ImportDataPanel } from './ImportDataPanel.js';
import { LayoutConfigPanel } from './LayoutConfigPanel.js';
import { showErrorToast, showSuccessToast } from './lib/toast.js';

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

interface EventHubModalProps {
  open: boolean;
  onClose: () => void;
  eventPort: EventPort;
  dataSourcePort: DataSourcePort | undefined;
  layoutPort: LayoutPort | undefined;
  assetPort: AssetPort | undefined;
  onChanged: () => void;
  /** Có giá trị → mở THẲNG vào Giai đoạn B (chế độ Sửa), bỏ qua Giai đoạn A tạo mới. */
  initialEvent?: EventDocument;
}

type HubView = 'menu' | 'import' | 'layout';

export function EventHubModal({ open, onClose, eventPort, dataSourcePort, layoutPort, assetPort, onChanged, initialEvent }: EventHubModalProps) {
  const { t } = useTranslation();
  const [event, setEvent] = useState<EventDocument | null>(initialEvent ?? null);
  const [name, setName] = useState(initialEvent?.name ?? '');
  const [scheduledAt, setScheduledAt] = useState(initialEvent?.scheduledAt ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<HubView>('menu');

  const resetAll = () => {
    setEvent(initialEvent ?? null);
    setName(initialEvent?.name ?? '');
    setScheduledAt(initialEvent?.scheduledAt ?? '');
    setView('menu');
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const doc: EventDocument = {
        id: newId('event'),
        name: name.trim(),
        status: 'draft',
        scheduledAt: scheduledAt || undefined,
        dataSourceId: undefined,
        customVariables: [],
        layoutRefs: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await eventPort.create(doc);
      showSuccessToast(t('eventGate.createSuccess', { name: doc.name }));
      setEvent(doc);
      onChanged();
    } catch (err) {
      showErrorToast(t('eventGate.createError', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleImported = async (dataSourceId: string) => {
    if (!event) return;
    const updated: EventDocument = { ...event, dataSourceId, updatedAt: new Date().toISOString() };
    try {
      await eventPort.save(updated);
      setEvent(updated);
      onChanged();
      setView('menu');
    } catch (err) {
      showErrorToast(t('eventGate.activateError', { message: err instanceof Error ? err.message : String(err) }));
    }
  };

  const handleLayoutSaved = (updated: EventDocument) => {
    setEvent(updated);
    onChanged();
    setView('menu');
  };

  // Giai đoạn A — Event chưa tồn tại.
  if (!event) {
    const canCreate = name.trim() !== '';
    return (
      <Modal open={open} onClose={handleClose} title={t('eventHub.createTitle')} size="md" closeOnBackdrop={false}>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('createEventWizard.nameLabel')}</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('createEventWizard.namePlaceholder') as string}
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('createEventWizard.scheduledAtLabel')}</span>
            <input
              type="date"
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">{t('createEventWizard.scheduledAtHint')}</span>
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" disabled={!canCreate} loading={submitting} onClick={() => void handleCreate()}>
              {t('eventHub.createButton')}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // Giai đoạn B — Hub. Panel Import/Layout đổi TITLE của modal + nội dung, KHÔNG mở modal lồng.
  if (view === 'import' && dataSourcePort) {
    return (
      <Modal open={open} onClose={handleClose} title={t('eventHub.importTitle', { name: event.name })} size="xl" closeOnBackdrop={false}>
        <ImportDataPanel
          eventId={event.id}
          dataSourcePort={dataSourcePort}
          onImported={(dsId) => void handleImported(dsId)}
          onBack={() => setView('menu')}
        />
      </Modal>
    );
  }

  if (view === 'layout' && layoutPort) {
    return (
      <Modal open={open} onClose={handleClose} title={t('eventHub.layoutTitle', { name: event.name })} size="xl" closeOnBackdrop={false}>
        <LayoutConfigPanel
          event={event}
          eventPort={eventPort}
          layoutPort={layoutPort}
          assetPort={assetPort}
          dataSourcePort={dataSourcePort}
          onSaved={handleLayoutSaved}
          onBack={() => setView('menu')}
        />
      </Modal>
    );
  }

  const hasData = event.dataSourceId != null;
  const hasLayout = event.layoutRefs.length > 0;

  return (
    <Modal open={open} onClose={handleClose} title={event.name} size="md" closeOnBackdrop={false}>
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {event.scheduledAt ? t('eventHub.scheduledAtSummary', { date: event.scheduledAt }) : t('eventHub.noScheduledAt')}
        </div>

        <button
          type="button"
          onClick={() => setView('import')}
          disabled={!dataSourcePort}
          className="flex items-center gap-3 rounded-lg border border-border p-4 text-left hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Database size={22} className="flex-none text-muted-foreground" />
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">{t('eventHub.importCardTitle')}</div>
            <div className="text-xs text-muted-foreground">
              {hasData ? t('eventHub.importCardHasData') : t('eventHub.importCardNoData')}
            </div>
          </div>
          {hasData && <Check size={16} className="flex-none text-success" />}
        </button>

        <button
          type="button"
          onClick={() => setView('layout')}
          disabled={!layoutPort}
          className="flex items-center gap-3 rounded-lg border border-border p-4 text-left hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LayoutTemplate size={22} className="flex-none text-muted-foreground" />
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">{t('eventHub.layoutCardTitle')}</div>
            <div className="text-xs text-muted-foreground">
              {hasLayout ? t('eventHub.layoutCardHasLayout', { count: event.layoutRefs.length }) : t('eventHub.layoutCardNoLayout')}
            </div>
          </div>
          {hasLayout && <Check size={16} className="flex-none text-success" />}
        </button>

        <div className="mt-2 flex justify-end">
          <Button variant="secondary" onClick={handleClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
