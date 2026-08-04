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
import { Database, LayoutTemplate, Check, Pencil, Download, Trash2 } from 'lucide-react';
import type { AssetPort, DataSourcePort, EventPort, LayoutPort } from '@sky-app/service-contracts';
import type { EventDocument } from '@sky-app/slide-shared';
import { Modal } from './components/ui/Modal.js';
import { Button } from './components/ui/Button.js';
import { ImportDataPanel } from './ImportDataPanel.js';
import { LayoutConfigPanel } from './LayoutConfigPanel.js';
import { ColorfulSwatchButton } from '@sky-app/ui';
import { usePortalContainer } from './PortalContainerContext.js';
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
  /** Nhảy thẳng vào panel Import/Layout/Info thay vì dừng ở Hub menu — bấm pill "dữ liệu"/
   * "layout" hoặc nút "Sửa" chính ngay trên dòng Event ở EventGate.tsx (2026-07-23 + 2026-08-03,
   * feedback: bấm Sửa không nên phải đi qua màn trung gian khi ý định đã rõ). Bỏ trống → Hub
   * menu (VD khi mở modal để TẠO Event mới, chưa có ý định cụ thể nào). */
  initialView?: 'import' | 'layout' | 'info';
}

type HubView = 'menu' | 'import' | 'layout' | 'info' | 'export-confirm' | 'delete-confirm';

export function EventHubModal({ open, onClose, eventPort, dataSourcePort, layoutPort, assetPort, onChanged, initialEvent, initialView }: EventHubModalProps) {
  const { t } = useTranslation();
  const portalContainer = usePortalContainer();
  const [event, setEvent] = useState<EventDocument | null>(initialEvent ?? null);
  const [name, setName] = useState(initialEvent?.name ?? '');
  const [scheduledAt, setScheduledAt] = useState(initialEvent?.scheduledAt ?? '');
  const [color, setColor] = useState(initialEvent?.color);
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<HubView>(initialView ?? 'menu');
  const [exportIncludeData, setExportIncludeData] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  const resetAll = () => {
    setEvent(initialEvent ?? null);
    setName(initialEvent?.name ?? '');
    setScheduledAt(initialEvent?.scheduledAt ?? '');
    setColor(initialEvent?.color);
    setDeleteConfirmInput('');
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

  const openInfoEdit = () => {
    if (!event) return;
    setName(event.name);
    setScheduledAt(event.scheduledAt ?? '');
    setColor(event.color);
    setView('info');
  };

  const handleSaveInfo = async () => {
    if (!event || !name.trim()) return;
    setSubmitting(true);
    try {
      const updated: EventDocument = { ...event, name: name.trim(), scheduledAt: scheduledAt || undefined, color, updatedAt: new Date().toISOString() };
      await eventPort.save(updated);
      setEvent(updated);
      onChanged();
      setView('menu');
    } catch (err) {
      showErrorToast(t('eventGate.activateError', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = async () => {
    if (!event || typeof eventPort.exportBundle !== 'function') return;
    setExporting(true);
    try {
      const result = await eventPort.exportBundle(event.id, { includeData: exportIncludeData });
      if (result === null) {
        // Người dùng huỷ dialog chọn nơi lưu — không phải lỗi, không thông báo gì.
      } else if (result.ok) {
        showSuccessToast(t('eventHub.exportSuccess', { filePath: result.filePath }));
        setView('menu');
      } else {
        showErrorToast(t('eventHub.exportError', { message: result.message }));
      }
    } catch (err) {
      showErrorToast(t('eventHub.exportError', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!event || deleteConfirmInput !== event.name) return;
    setDeleting(true);
    try {
      await eventPort.delete(event.id);
      showSuccessToast(t('eventHub.deleteSuccess', { name: event.name }));
      onChanged();
      handleClose();
    } catch (err) {
      showErrorToast(t('eventHub.deleteError', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setDeleting(false);
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

  if (view === 'export-confirm') {
    return (
      <Modal open={open} onClose={handleClose} title={t('eventHub.exportConfirmTitle')} size="md" closeOnBackdrop={false}>
        <div className="flex flex-col gap-4">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={exportIncludeData}
              onChange={(e) => setExportIncludeData(e.target.checked)}
            />
            <span>{t('eventHub.exportIncludeDataLabel')}</span>
          </label>
          {exportIncludeData && (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
              {t('eventHub.exportPiiWarning')}
            </div>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setView('menu')}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={exporting} onClick={() => void handleExport()}>
              {t('eventHub.exportConfirmButton')}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (view === 'delete-confirm') {
    const canDelete = deleteConfirmInput === event.name;
    return (
      <Modal open={open} onClose={handleClose} title={t('eventHub.deleteConfirmTitle')} size="md" closeOnBackdrop={false}>
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t('eventHub.deleteConfirmWarning')}
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('eventHub.deleteConfirmInputLabel', { name: event.name })}</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder={event.name}
              autoFocus
            />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setDeleteConfirmInput(''); setView('info'); }}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" disabled={!canDelete} loading={deleting} onClick={() => void handleDelete()}>
              {t('eventHub.deleteConfirmButton')}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (view === 'info') {
    const canSave = name.trim() !== '';
    return (
      <Modal open={open} onClose={handleClose} title={t('eventHub.editInfoTitle')} size="md" closeOnBackdrop={false}>
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
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{t('eventHub.colorLabel')}</span>
            <ColorfulSwatchButton
              color={color}
              onChange={setColor}
              title={t('eventHub.colorPickerTooltip') as string}
              clearLabel={t('eventHub.colorPickerClear') as string}
              container={portalContainer}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Button variant="danger-ghost" icon={<Trash2 size={14} />} onClick={() => { setDeleteConfirmInput(''); setView('delete-confirm'); }}>
              {t('eventHub.deleteButton')}
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setView('menu')}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" disabled={!canSave} loading={submitting} onClick={() => void handleSaveInfo()}>
                {t('eventHub.saveInfoButton')}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  const hasData = event.dataSourceId != null;
  const hasLayout = event.layoutRefs.length > 0;

  return (
    <Modal open={open} onClose={handleClose} title={event.name} size="md" closeOnBackdrop={false}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <span className="flex-1">
            {event.scheduledAt ? t('eventHub.scheduledAtSummary', { date: event.scheduledAt }) : t('eventHub.noScheduledAt')}
          </span>
          <button
            type="button"
            onClick={openInfoEdit}
            title={t('eventHub.editInfoTooltip') as string}
            className="flex-none rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil size={13} />
          </button>
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

        <button
          type="button"
          onClick={() => setView('export-confirm')}
          disabled={typeof eventPort.exportBundle !== 'function'}
          className="flex items-center gap-3 rounded-lg border border-border p-4 text-left hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={22} className="flex-none text-muted-foreground" />
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">{t('eventHub.exportCardTitle')}</div>
            <div className="text-xs text-muted-foreground">{t('eventHub.exportCardSubtitle')}</div>
          </div>
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
