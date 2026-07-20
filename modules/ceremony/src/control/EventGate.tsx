// EventGate — Giai đoạn 3 kế hoạch Event (docs/roadmap/plans/layout-designer/
// 10-quan-ly-dot-le-event.md, 13-ceremony-mo-rong.md §"Cập nhật luồng tổng"). Điểm vào ĐẦU TIÊN
// khi mount control/ — thay thế việc đi thẳng vào dashboard như trước đây. CRUD tối thiểu theo
// DoD Giai đoạn 3 (tên + ngày, chưa cần layout/data đầy đủ — đó là Giai đoạn 4a/4b/4c).

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Play, Plus } from 'lucide-react';
import type { AssetPort, EventPort, DataSourcePort, LayoutPort } from '@sky-app/service-contracts';
import type { DataSourceSummary, EventDocument, EventSummary } from '@sky-app/slide-shared';
import { extractTokenKeysFromContent } from '@sky-app/slide-shared';
import { useEventStore } from './eventStore.js';
import { usePlatform } from './PlatformContext.js';
import { Button } from './components/ui/Button.js';
import { Badge } from './components/ui/badge.js';
import { ConfirmModal } from './components/ui/ConfirmModal.js';
import { CreateEventWizard } from './CreateEventWizard.js';
import { showErrorToast, showSuccessToast } from './lib/toast.js';

const STATUS_BADGE: Record<EventDocument['status'], { key: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { key: 'eventGate.statusDraft', variant: 'outline' },
  scheduled: { key: 'eventGate.statusScheduled', variant: 'secondary' },
  active: { key: 'eventGate.statusActive', variant: 'default' },
  archived: { key: 'eventGate.statusArchived', variant: 'outline' },
};

/**
 * Đối chiếu token của mọi layoutRefs (đúng version ghim) vs fieldMap — 13-ceremony-mo-rong.md
 * §"Quyết định vận hành bổ sung", "Khi kích hoạt Event → cảnh báo mềm token chưa gán". CHỈ cảnh
 * báo, KHÔNG chặn (nguyên tắc "không tự động bảo vệ" xuyên suốt dự án). Token có 2 nguồn: token
 * `@var` trong TextItem/RibbonItem.content (qua extractTokenKeysFromContent) VÀ ImageItem.varKey
 * (token riêng cho ảnh, không nằm trong content).
 */
async function countMissingTokens(event: EventDocument, layoutPort: LayoutPort | undefined): Promise<number> {
  if (!layoutPort || event.layoutRefs.length === 0) return 0;
  let missing = 0;
  for (const ref of event.layoutRefs) {
    const version = await layoutPort.getVersion(ref.layoutId, ref.layoutVersion);
    if (!version) continue;
    for (const variant of version.content.variants) {
      for (const item of variant.items) {
        let tokenKeys: string[] = [];
        if (item.type === 'text' || item.type === 'ribbon') tokenKeys = extractTokenKeysFromContent(item.content);
        else if (item.type === 'image' && item.varKey) tokenKeys = [item.varKey];
        for (const key of tokenKeys) {
          if (!ref.fieldMap[key] || ref.fieldMap[key]?.kind === 'unmapped') missing += 1;
        }
      }
    }
  }
  return missing;
}

export function EventGate() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const { events, loading, refreshList, activateEvent } = useEventStore();
  const [showCreate, setShowCreate] = useState(false);
  const [dataSources, setDataSources] = useState<DataSourceSummary[]>([]);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  // Kích hoạt lại 1 Event 'archived' cần xác nhận trước — status archived có nghĩa "đã lưu trữ,
  // không còn dùng nữa" (bug thật phát hiện qua review, 2026-07-19: trước đó không có cản trở
  // nào, click nhầm 1 phát là kích hoạt lại ngay). KHÔNG chặn cứng ở tầng DB (đúng triết lý
  // "không tự động bảo vệ" xuyên suốt dự án) — chỉ hỏi lại 1 lớp ở UI.
  const [pendingArchivedActivate, setPendingArchivedActivate] = useState<EventSummary | null>(null);
  // Sửa Event (Giai đoạn 4c mở rộng, 2026-07-20) — mở CreateEventWizard ở chế độ edit qua
  // initialEvent. Cần fetch full EventDocument (list() chỉ trả EventSummary rút gọn).
  const [editingEvent, setEditingEvent] = useState<EventDocument | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);

  const eventPort = platform?.services.get<EventPort>('event');
  const dataSourcePort = platform?.services.get<DataSourcePort>('dataSource');
  const layoutPort = platform?.services.get<LayoutPort>('layout');
  const assetPort = platform?.services.get<AssetPort>('asset');

  useEffect(() => {
    if (eventPort) void refreshList(eventPort);
  }, [eventPort, refreshList]);

  useEffect(() => {
    if (dataSourcePort) void dataSourcePort.list().then(setDataSources);
  }, [dataSourcePort]);

  const handleActivateClick = (summary: EventSummary) => {
    if (summary.status === 'archived') {
      setPendingArchivedActivate(summary);
      return;
    }
    void handleActivate(summary);
  };

  const handleActivate = async (summary: EventSummary) => {
    if (!eventPort) return;
    setActivatingId(summary.id);
    try {
      const full = await eventPort.get(summary.id);
      if (full) {
        const missing = await countMissingTokens(full, layoutPort);
        if (missing > 0) showErrorToast(t('eventGate.missingTokensWarning', { count: missing }));
      }
      await activateEvent(eventPort, dataSourcePort, summary.id);
      showSuccessToast(t('eventGate.activateSuccess', { name: summary.name }));
      await refreshList(eventPort);
    } catch (err) {
      showErrorToast(t('eventGate.activateError', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setActivatingId(null);
    }
  };

  const handleEditClick = async (summary: EventSummary) => {
    if (!eventPort) return;
    setLoadingEditId(summary.id);
    try {
      const full = await eventPort.get(summary.id);
      if (full) setEditingEvent(full);
      else showErrorToast(t('eventGate.activateError', { message: 'not found' }));
    } catch (err) {
      showErrorToast(t('eventGate.activateError', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setLoadingEditId(null);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-background p-8">
      <div className="w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t('eventGate.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('eventGate.subtitle')}</p>
          </div>
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            {t('eventGate.createButton')}
          </Button>
        </div>

        {!loading && events.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t('eventGate.emptyState')}
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {events.map((ev) => {
            const badge = STATUS_BADGE[ev.status];
            return (
              <li
                key={ev.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground">{ev.name}</span>
                  <Badge variant={badge.variant}>{t(badge.key)}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary-outline"
                    size="sm"
                    icon={<Pencil size={13} />}
                    loading={loadingEditId === ev.id}
                    onClick={() => void handleEditClick(ev)}
                  >
                    {t('eventGate.editButton')}
                  </Button>
                  <Button
                    variant="secondary-outline"
                    size="sm"
                    icon={<Play size={13} />}
                    loading={activatingId === ev.id}
                    onClick={() => handleActivateClick(ev)}
                  >
                    {activatingId === ev.id ? t('eventGate.activatingButton') : t('eventGate.activateButton')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {eventPort && (
        <CreateEventWizard
          open={showCreate}
          onClose={() => setShowCreate(false)}
          eventPort={eventPort}
          dataSourcePort={dataSourcePort}
          layoutPort={layoutPort}
          assetPort={assetPort}
          dataSources={dataSources}
          onCreated={() => {
            void refreshList(eventPort);
            if (dataSourcePort) void dataSourcePort.list().then(setDataSources);
          }}
        />
      )}

      {/* Instance RIÊNG cho chế độ Sửa (khác instance tạo mới ở trên) — state nội bộ của
         CreateEventWizard chỉ useState(initialEvent?.x ?? ...) 1 LẦN lúc mount, React không tự
         re-init khi prop initialEvent đổi giữa 2 Event khác nhau nếu dùng chung 1 instance. Mount
         mới mỗi lần editingEvent đổi (key={editingEvent.id}) đảm bảo state luôn đúng. */}
      {eventPort && editingEvent && (
        <CreateEventWizard
          key={editingEvent.id}
          open={editingEvent != null}
          onClose={() => setEditingEvent(null)}
          eventPort={eventPort}
          dataSourcePort={dataSourcePort}
          layoutPort={layoutPort}
          assetPort={assetPort}
          dataSources={dataSources}
          initialEvent={editingEvent}
          onCreated={() => {
            setEditingEvent(null);
            void refreshList(eventPort);
          }}
        />
      )}

      <ConfirmModal
        open={pendingArchivedActivate != null}
        title={t('eventGate.archivedActivateConfirmTitle')}
        message={pendingArchivedActivate ? t('eventGate.archivedActivateConfirmMessage', { name: pendingArchivedActivate.name }) : ''}
        danger={false}
        confirmLabel={t('eventGate.activateButton')}
        onCancel={() => setPendingArchivedActivate(null)}
        onConfirm={() => {
          const target = pendingArchivedActivate;
          setPendingArchivedActivate(null);
          if (target) void handleActivate(target);
        }}
      />
    </div>
  );
}
