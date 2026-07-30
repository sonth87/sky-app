// EventGate — Giai đoạn 3 kế hoạch Event (docs/roadmap/plans/layout-designer/
// 10-quan-ly-dot-le-event.md, 13-ceremony-mo-rong.md §"Cập nhật luồng tổng"). Điểm vào ĐẦU TIÊN
// khi mount control/ — thay thế việc đi thẳng vào dashboard như trước đây. CRUD tối thiểu theo
// DoD Giai đoạn 3 (tên + ngày, chưa cần layout/data đầy đủ — đó là Giai đoạn 4a/4b/4c).

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Play, Plus, Upload, LayoutTemplate } from 'lucide-react';
import type { AssetPort, EventPort, DataSourcePort, LayoutPort } from '@sky-app/service-contracts';
import type { DataSourceSummary, EventDocument, EventSummary } from '@sky-app/slide-shared';
import { extractTokenKeysFromContent } from '@sky-app/slide-shared';
import { useEventStore } from './eventStore.js';
import { SAMPLE_EVENT_ID } from './lib/sampleCanonicalData.js';
import { usePlatform } from './PlatformContext.js';
import { Button } from './components/ui/Button.js';
import { Badge } from './components/ui/badge.js';
import { ConfirmModal } from './components/ui/ConfirmModal.js';
import { EventHubModal } from './EventHubModal.js';
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
  const { events, loading, refreshList, activateEvent, sampleDataEnabled } = useEventStore();
  const [showCreate, setShowCreate] = useState(false);
  const [dataSources, setDataSources] = useState<DataSourceSummary[]>([]);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  // Kích hoạt lại 1 Event 'archived' cần xác nhận trước — status archived có nghĩa "đã lưu trữ,
  // không còn dùng nữa" (bug thật phát hiện qua review, 2026-07-19: trước đó không có cản trở
  // nào, click nhầm 1 phát là kích hoạt lại ngay). KHÔNG chặn cứng ở tầng DB (đúng triết lý
  // "không tự động bảo vệ" xuyên suốt dự án) — chỉ hỏi lại 1 lớp ở UI.
  const [pendingArchivedActivate, setPendingArchivedActivate] = useState<EventSummary | null>(null);
  // Sửa Event (Giai đoạn 4c mở rộng, 2026-07-20) — mở EventHubModal ở chế độ edit qua
  // initialEvent. Cần fetch full EventDocument (list() chỉ trả EventSummary rút gọn).
  // `view` (2026-07-23) — bấm trực tiếp vào pill "dữ liệu"/"layout" của 1 dòng phải nhảy THẲNG
  // vào panel tương ứng thay vì luôn dừng ở màn Hub trung gian (feedback thật: "ấn nút sửa tại
  // sao lại ra 2 mục import"). Nút "Sửa" chính vẫn mở Hub menu (initialView undefined).
  const [editingEvent, setEditingEvent] = useState<{ event: EventDocument; view?: 'import' | 'layout' } | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  // Trạng thái data/layout mỗi dòng Event (PHỤ LỤC "Event Hub", 2026-07-22) — EventSummary rút
  // gọn không có dataSourceId/layoutRefs, cần fetch full EventDocument riêng cho từng dòng (danh
  // sách Event nhỏ, N+1 chấp nhận được ở quy mô này — đơn giản hơn mở rộng schema EventSummary).
  const [rowDetails, setRowDetails] = useState<Record<string, EventDocument>>({});
  // Số record của mỗi DataSource + màu của layout đầu tiên trong layoutRefs — cache theo id để
  // không query lặp lại khi nhiều Event dùng chung 1 DataSource/layout.
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});
  const [layoutColors, setLayoutColors] = useState<Record<string, { name: string; color?: string }>>({});

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

  useEffect(() => {
    if (!eventPort || events.length === 0) return;
    let cancelled = false;
    void (async () => {
      const fulls = await Promise.all(events.map((ev) => eventPort.get(ev.id)));
      if (cancelled) return;
      const byId: Record<string, EventDocument> = {};
      fulls.forEach((full, i) => { if (full) byId[events[i]!.id] = full; });
      setRowDetails(byId);

      const dataSourceIds = new Set(Object.values(byId).map((e) => e.dataSourceId).filter((x): x is string => x != null));
      if (dataSourcePort) {
        const counts = await Promise.all([...dataSourceIds].map(async (id) => [id, (await dataSourcePort.getRecords(id)).length] as const));
        if (!cancelled) setRecordCounts(Object.fromEntries(counts));
      }

      const layoutIds = new Set(Object.values(byId).flatMap((e) => e.layoutRefs.map((r) => r.layoutId)));
      if (layoutPort) {
        const docs = await Promise.all([...layoutIds].map((id) => layoutPort.getDocument(id)));
        if (!cancelled) {
          const colorById: Record<string, { name: string; color?: string }> = {};
          docs.forEach((doc, i) => { if (doc) colorById[[...layoutIds][i]!] = { name: doc.name, color: doc.color }; });
          setLayoutColors(colorById);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventPort, dataSourcePort, layoutPort, events]);

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

  // Dữ liệu mẫu (menu Develop > "Dùng dữ liệu mẫu", 2026-07-30) — tắt thì ẨN hẳn dòng này khỏi
  // danh sách, KHÔNG xoá khỏi DB (xem eventStore.ts's sampleDataEnabled). Event mẫu vẫn nằm trong
  // `events` (query DB thật, không lọc ở port) — lọc ở đây là NƠI DUY NHẤT quyết định hiện/ẩn.
  const visibleEvents = events.filter((ev) => ev.id !== SAMPLE_EVENT_ID || sampleDataEnabled);

  const handleEditClick = async (summary: EventSummary) => {
    if (!eventPort) return;
    setLoadingEditId(summary.id);
    try {
      const full = await eventPort.get(summary.id);
      if (full) setEditingEvent({ event: full });
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

        {!loading && visibleEvents.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t('eventGate.emptyState')}
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {visibleEvents.map((ev) => {
            const isSample = ev.id === SAMPLE_EVENT_ID;
            const badge = STATUS_BADGE[ev.status];
            const full = rowDetails[ev.id];
            const recordCount = full?.dataSourceId ? recordCounts[full.dataSourceId] : undefined;
            const firstLayoutId = full?.layoutRefs[0]?.layoutId;
            const layoutInfo = firstLayoutId ? layoutColors[firstLayoutId] : undefined;
            return (
              <li
                key={ev.id}
                className="relative flex items-center justify-between gap-3 overflow-hidden rounded-lg border border-border bg-card px-4 py-3"
                // Màu event (2026-07-29, thay chấm tròn) — vạch viền trái + gradient nhạt dần
                // sang trong suốt thay vì chấm tròn cạnh tên. `transparent` (không phải trắng
                // cứng) để tự khớp nền card ở cả light/dark theme — gradient chỉ ĐÈ LÊN
                // background-color của bg-card (2 sub-property riêng), không thay thế nó.
                style={
                  full?.color
                    ? {
                        borderLeftWidth: 4,
                        borderLeftColor: full.color,
                        backgroundImage: `linear-gradient(to right, ${full.color}26, transparent 70%)`,
                      }
                    : undefined
                }
                title={full?.color ? (t('eventHub.colorLabel') as string) : undefined}
              >
                {/* Watermark "DEMO" — chỉ dòng Event mẫu, nhắc đây là data xem thử (2026-07-30,
                   phản hồi thật). pointer-events-none để không chặn click vào nút/pill phía trên;
                   overflow-hidden ở <li> cắt gọn phần chữ tràn ra ngoài bo góc card. */}
                {isSample && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-3 right-2 select-none text-5xl font-black uppercase leading-none text-foreground/10"
                  >
                    Demo
                  </span>
                )}
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="truncate text-sm font-medium text-foreground">{ev.name}</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Không hiện tag trạng thái (VD "Đang hoạt động") cho Event mẫu — đây chỉ là
                       xem thử, status thật trong DB (draft/active/...) không có ý nghĩa vận hành
                       gì với người dùng ở đây (2026-07-30, phản hồi thật). */}
                    {!isSample && <Badge variant={badge.variant}>{t(badge.key)}</Badge>}
                    {full && (
                      <button
                        type="button"
                        onClick={() => setEditingEvent({ event: full, view: 'import' })}
                        className={
                          recordCount != null
                            ? 'flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground'
                            : 'flex items-center gap-1 rounded-md border border-dashed border-primary/40 px-2 py-0.5 text-xs text-primary hover:border-primary hover:bg-primary/5'
                        }
                      >
                        <Upload size={11} />
                        {recordCount != null ? t('eventGate.recordCountBadge', { count: recordCount }) : t('eventGate.noDataBadge')}
                      </button>
                    )}
                    {full && (
                      <button
                        type="button"
                        onClick={() => setEditingEvent({ event: full, view: 'layout' })}
                        title={layoutInfo?.name}
                        className={
                          layoutInfo
                            ? 'flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground'
                            : 'flex items-center gap-1.5 rounded-md border border-dashed border-primary/40 px-2 py-0.5 text-xs text-primary hover:border-primary hover:bg-primary/5'
                        }
                      >
                        {layoutInfo ? (
                          <>
                            <span
                              className="h-2.5 w-2.5 flex-none rounded-full"
                              style={{ backgroundColor: layoutInfo.color ?? '#9a9bab' }}
                            />
                            <LayoutTemplate size={11} />
                          </>
                        ) : (
                          <>
                            <LayoutTemplate size={11} />
                            {t('eventGate.noLayoutBadge')}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-none items-center gap-2">
                  {/* Không cho sửa Event mẫu — đây chỉ để xem thử, không phải Event thật cần cấu
                     hình (2026-07-30, phản hồi thật). */}
                  {!isSample && (
                    <Button
                      variant="secondary-outline"
                      size="sm"
                      icon={<Pencil size={13} />}
                      loading={loadingEditId === ev.id}
                      onClick={() => void handleEditClick(ev)}
                    >
                      {t('eventGate.editButton')}
                    </Button>
                  )}
                  <Button
                    variant="secondary-outline"
                    size="sm"
                    icon={<Play size={13} />}
                    loading={activatingId === ev.id}
                    onClick={() => handleActivateClick(ev)}
                  >
                    {isSample
                      ? t('eventGate.viewButton')
                      : activatingId === ev.id
                        ? t('eventGate.activatingButton')
                        : t('eventGate.activateButton')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {eventPort && (
        <EventHubModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          eventPort={eventPort}
          dataSourcePort={dataSourcePort}
          layoutPort={layoutPort}
          assetPort={assetPort}
          onChanged={() => {
            void refreshList(eventPort);
            if (dataSourcePort) void dataSourcePort.list().then(setDataSources);
          }}
        />
      )}

      {/* Instance RIÊNG cho chế độ Sửa (khác instance tạo mới ở trên) — state nội bộ của
         EventHubModal chỉ useState(initialEvent?.x ?? ...) 1 LẦN lúc mount, React không tự
         re-init khi prop initialEvent đổi giữa 2 Event khác nhau nếu dùng chung 1 instance. Mount
         mới mỗi lần editingEvent đổi (key={editingEvent.event.id}) đảm bảo state luôn đúng. */}
      {eventPort && editingEvent && (
        <EventHubModal
          key={editingEvent.event.id}
          open={editingEvent != null}
          onClose={() => setEditingEvent(null)}
          eventPort={eventPort}
          dataSourcePort={dataSourcePort}
          layoutPort={layoutPort}
          assetPort={assetPort}
          initialEvent={editingEvent.event}
          initialView={editingEvent.view}
          onChanged={() => {
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
