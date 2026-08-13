import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings2, Palette } from 'lucide-react';
import { useStore as useDeviceLayoutStore } from '@sonth87/device-layout';
import type { AssetPort, EventPort, LayoutPort } from '@sky-app/service-contracts';
import { LayoutRenderer, applyFieldMap, eventToIdleRecord, type EventDocument, type LayoutContent } from '@sky-app/slide-shared';
import { useSocketRef } from '../SocketContext';
import { useControlStore } from '../store';
import { usePlatform } from '../PlatformContext';
import { RainbowBorder } from './RainbowBorder';
import { TooltipSimple as Tooltip } from './ui/TooltipSimple';

/** id đăng ký của module layout-designer (modules/layout-designer/src/index.ts) — tra trong
 * registry toàn cục của device-layout (`useStore().apps`, đổ đầy 1 lần lúc shell khởi động qua
 * registerApps() — xem apps/shell-electron|shell-web/src/main.tsx's `apps={[...]}`) để mở app đó
 * mà KHÔNG import thẳng module-layout-designer (vi phạm "không import chéo giữa app",
 * AGENTS.md §2.5) — device-layout's store là thư viện shell dùng chung, không phải 1 app khác. */
const LAYOUT_DESIGNER_APP_ID = 'layout-designer';

/** Đếm ngược idle-timer dựa theo wall-clock (startedAt + totalSeconds) — không lệch khi tab bị throttle. */
function useIdleCountdown() {
  const idleTimer = useControlStore((s) => s.idleTimer);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!idleTimer.active || !idleTimer.startedAt) {
      setRemaining(0);
      return;
    }
    const startedMs = new Date(idleTimer.startedAt).getTime();
    let rafId: number;
    const tick = () => {
      const elapsed = (Date.now() - startedMs) / 1000;
      setRemaining(Math.max(0, idleTimer.totalSeconds - elapsed));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [idleTimer.active, idleTimer.startedAt, idleTimer.totalSeconds]);

  return {
    active: idleTimer.active,
    remaining,
    progress: idleTimer.active && idleTimer.totalSeconds > 0
      ? (idleTimer.totalSeconds - remaining) / idleTimer.totalSeconds
      : 0,
  };
}

const THUMB_SIZE = { w: 200, h: 112 };

/** Preview màn hình chào mừng — PHẢI khớp CHÍNH XÁC những gì `BackdropApp.tsx` hiển thị lúc
 * không ai trên sân khấu (bug thật phát hiện qua QA thủ công, 2026-07-28: preview cũ là 1 ảnh
 * hardcode không liên quan tới cấu hình thật của CẢ hệ cũ lẫn hệ Event mới). Event active có
 * `idleLayoutRef` → render LayoutRenderer với record đã ghép field (TÁI DÙNG applyFieldMap/
 * eventToIdleRecord viết cho BackdropApp, cùng 1 công thức — không lệch nhau giữa preview và màn
 * chiếu thật). Không có (hoặc layout/version đã gán bị xoá) → KHÔNG còn fallback nào (2026-07-29,
 * xem docblock của `IdlePanel` bên dưới) — preview để trống, `hasIdleRef` cho component cha biết
 * để chọn đúng nút sửa lỗi.
 */
function useIdlePreview() {
  const platform = usePlatform();
  const eventPort = platform?.services.get<EventPort>('event');
  const layoutPort = platform?.services.get<LayoutPort>('layout');
  const assetPort = platform?.services.get<AssetPort>('asset');
  const socket = useSocketRef();

  const [activeEvent, setActiveEvent] = useState<EventDocument | null>(null);
  const [content, setContent] = useState<LayoutContent | null>(null);
  const [assetUrlCache, setAssetUrlCache] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!eventPort) return;
    let cancelled = false;
    const refresh = () => {
      void eventPort.getCurrentActive().then((doc) => {
        if (!cancelled) setActiveEvent(doc);
      });
    };
    refresh();
    const sock = socket.current;
    sock?.on('state:activeEventChanged', refresh);
    return () => {
      cancelled = true;
      sock?.off('state:activeEventChanged', refresh);
    };
  }, [eventPort, socket]);

  const idleRef = activeEvent?.layoutRefs.find((r) => r.role === 'idle');

  useEffect(() => {
    if (!idleRef || !layoutPort) {
      setContent(null);
      return;
    }
    let cancelled = false;
    void layoutPort.getVersion(idleRef.layoutId, idleRef.layoutVersion).then((version) => {
      if (!cancelled) setContent(version?.content ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [idleRef?.layoutId, idleRef?.layoutVersion, layoutPort]);

  useEffect(() => {
    if (!content || !assetPort) return;
    let cancelled = false;
    const paths = new Set<string>();
    for (const variant of content.variants) {
      if (variant.background?.kind === 'image' && variant.background.src) paths.add(variant.background.src);
    }
    void (async () => {
      const entries = await Promise.all([...paths].map(async (p) => [p, await assetPort.resolveAssetUrl(p)] as const));
      if (!cancelled) setAssetUrlCache(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [content, assetPort]);

  const record =
    idleRef && activeEvent ? applyFieldMap(eventToIdleRecord(activeEvent), idleRef.fieldMap, activeEvent.customVariables) : null;

  return {
    content,
    record,
    // Event đã gán 1 layout cho role 'idle' hay chưa — phân biệt với `content` null (có thể do
    // layout/version đã gán bị xoá, hoặc đang tải). Dùng để quyết định nút sửa lỗi nên mở đâu:
    // chưa gán (false) → mở cấu hình Event (chọn layout); đã gán nhưng lỗi (true, content null)
    // → mở Layout Designer (sửa chính layout đó).
    hasIdleRef: !!idleRef,
    resolveAsset: (relativePath: string) => assetUrlCache[relativePath] ?? relativePath,
  };
}

/** Nút chuyển Backdrop về màn hình chào mừng (cmd:clear) — hiện đếm ngược khi idle-timeout đang
 * chạy. Màn hình chờ CHỈ được phép hiển thị nội dung từ layout đã chọn trong layout-designer
 * (2026-07-29, phản hồi thật — trước đó có fallback ảnh tĩnh `ceremony.idle_image`/tên lễ hard-code
 * khi chưa cấu hình, giờ bỏ hẳn: chưa cấu hình → không có gì để xem trước, disable nút hiện màn
 * hình chờ). Nút sửa lỗi đi kèm KHÔNG luôn mở layout-designer — tách theo đúng nguyên nhân
 * (feedback thật, cùng ngày): chưa gán layout nào cho role 'idle' → mở thẳng cấu hình Event
 * (EventHubModal view 'layout', qua `eventHubLayoutModalOpen` ở store.ts) để CHỌN layout; đã gán
 * rồi nhưng `content` vẫn null (layout/version đã gán bị xoá) → mở Layout Designer để SỬA chính
 * layout đó. Xem cùng quyết định ở `BackdropApp.tsx` (màn hình chờ thật không fallback nữa, hiện
 * màn đen thay vì text/ảnh cứng). */
export function IdlePanel() {
  const { t } = useTranslation();
  const socket = useSocketRef();
  const idleCountdown = useIdleCountdown();
  const idlePreview = useIdlePreview();
  const layoutDesignerConfig = useDeviceLayoutStore((s) => s.apps[LAYOUT_DESIGNER_APP_ID]);

  const hasIdle = !!idlePreview.content && !!idlePreview.record;
  const needsConfig = !idlePreview.hasIdleRef;

  const handleFixClick = () => {
    if (needsConfig) useControlStore.getState().setEventHubLayoutModalOpen(true);
    else if (layoutDesignerConfig) useDeviceLayoutStore.getState().launchApp(layoutDesignerConfig);
  };

  return (
    <RainbowBorder active={idleCountdown.active} progress={idleCountdown.progress} className="bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          {t('idlePanel.welcomeScreen')}
        </span>
        {idleCountdown.active && (
          <Tooltip content={t('idlePanel.autoReturnTooltip')}>
            <span className="cursor-help font-mono text-xs font-semibold tabular-nums text-warning">
              {t('idlePanel.autoReturnIn', { seconds: Math.ceil(idleCountdown.remaining) })}
            </span>
          </Tooltip>
        )}
      </div>
      <div className="mb-3 flex h-32 items-center justify-center overflow-hidden rounded-md bg-muted">
        {hasIdle ? (
          <div style={{ width: THUMB_SIZE.w, height: THUMB_SIZE.h }} className="overflow-hidden rounded bg-black">
            <LayoutRenderer
              content={idlePreview.content!}
              screen={THUMB_SIZE}
              record={idlePreview.record!}
              resolveAsset={idlePreview.resolveAsset}
            />
          </div>
        ) : (
          <span className="px-3 text-center text-xs text-muted-foreground">{t('idlePanel.noPreview')}</span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => socket.current?.emit('cmd:clear')}
          disabled={!hasIdle}
          title={hasIdle ? undefined : (t('idlePanel.noPreview') as string)}
          className="flex-1 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ⌂ {t('idlePanel.showWelcomeScreen')}
        </button>
        {!hasIdle && (
          <Tooltip content={needsConfig ? t('idlePanel.goToLayoutConfigTooltip') : t('idlePanel.goToLayoutDesignerTooltip')}>
            <button
              type="button"
              onClick={handleFixClick}
              disabled={!needsConfig && !layoutDesignerConfig}
              className="flex-none rounded-md border border-border p-2 text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {needsConfig ? <Settings2 size={16} /> : <Palette size={16} />}
            </button>
          </Tooltip>
        )}
      </div>
    </RainbowBorder>
  );
}
