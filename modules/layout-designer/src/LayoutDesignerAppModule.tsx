// Entry cho kernel AppModule — bridge AppContentProps sang LayoutDesignerApp, nối LayoutPort
// thật (docs/roadmap/plans/layout-designer/21-layout-versioning.md). Debounce-save draft khi
// user sửa (Save ≠ Publish — file 21 §2); Publish/khôi phục version nối vào VersioningPanel.
//
// PHẠM VI TẠM: chỉ 1 layout demo cố định (DEMO_LAYOUT_ID) — chưa có UI chọn/tạo NHIỀU layout
// (thuộc Layout Library, hoãn Giai đoạn 5 theo plan GĐ2 "KHÔNG làm GĐ2: Layout Library").

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppContentProps } from '@sky-app/kernel';
import type { LayoutContent, LayoutVersion } from '@sky-app/slide-shared';
import type { AssetPort, LayoutPort } from '@sky-app/service-contracts';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';

const DEMO_LAYOUT_ID = 'demo-layout';
const DEMO_LAYOUT_NAME = 'Layout demo';
const SAVE_DEBOUNCE_MS = 800;

function emptyLayoutContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '16:9', w: 16, h: 9 },
        refW: 1920,
        refH: 1080,
        background: { kind: 'color', color: '#201748' },
        items: [],
      },
    ],
  };
}

type LoadState =
  | { status: 'loading' }
  | { status: 'no-port' }
  | { status: 'error'; message: string }
  | { status: 'ready'; content: LayoutContent };

export function LayoutDesignerAppModule({ platform }: AppContentProps) {
  const layoutPort = platform?.services.get<LayoutPort>('layout');
  const assetPort = platform?.services.get<AssetPort>('asset');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [saveStatusLabel, setSaveStatusLabel] = useState<string>('');
  const [versions, setVersions] = useState<LayoutVersion[]>([]);
  const [latestPublishedVersion, setLatestPublishedVersion] = useState<number | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  // variable_registry (file 09 §2.6) — gợi ý toàn cục, tải 1 lần lúc mount + refresh sau mỗi
  // lần user chèn token mới (recordTokenUsage đổi usage_count/thứ tự gợi ý).
  const [globalSuggestions, setGlobalSuggestions] = useState<string[]>([]);
  // Đổi key → remount LayoutDesignerApp (editor khởi tạo lại từ content mới) — cần thiết sau
  // restoreVersion, vì useCreateEditor chỉ init 1 lần lúc mount, không tự đồng bộ lại theo
  // content prop đổi (xem LayoutDesignerApp.tsx's versioning.onRestore doc).
  const [reloadKey, setReloadKey] = useState(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadVersions = useCallback(async (port: LayoutPort) => {
    const list = await port.listVersions(DEMO_LAYOUT_ID);
    setVersions(list);
    setLatestPublishedVersion(list.length > 0 ? list[list.length - 1]!.version : null);
  }, []);

  const loadGlobalSuggestions = useCallback(async (port: LayoutPort) => {
    const top = await port.listTopVariables();
    setGlobalSuggestions(top.map((v) => v.key));
  }, []);

  useEffect(() => {
    if (!layoutPort) {
      setState({ status: 'no-port' });
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const doc = await layoutPort.getDocument(DEMO_LAYOUT_ID);
        if (cancelled) return;
        if (doc) {
          setState({ status: 'ready', content: doc.currentDraft });
          setVersions(doc.publishedVersions);
          setLatestPublishedVersion(doc.publishedVersions.length > 0 ? doc.publishedVersions[doc.publishedVersions.length - 1]!.version : null);
        } else {
          const initial = emptyLayoutContent();
          await layoutPort.createDocument(DEMO_LAYOUT_ID, DEMO_LAYOUT_NAME, initial);
          if (cancelled) return;
          setState({ status: 'ready', content: initial });
        }
        await loadGlobalSuggestions(layoutPort);
      } catch (err) {
        // Không để UI kẹt im lặng ở "Đang tải layout…" khi LayoutPort lỗi (VD better-sqlite3
        // ABI mismatch sau khi rebuild cho Node rồi quên rebuild lại cho Electron — đã gặp thật,
        // xem package.json's db:rebuild:electron) — hiện rõ lỗi để dễ chẩn đoán.
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    })();

    return () => {
      cancelled = true;
    };
    // layoutPort ổn định trong 1 phiên platform (không đổi tham chiếu giữa các render bình
    // thường) — chỉ tải lại nếu chính port đổi (VD platform re-init) hoặc reloadKey (restore).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutPort, reloadKey]);

  function handleDocChange(doc: LayoutContent) {
    if (!layoutPort) return;
    setSaveStatusLabel('Đang lưu…');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      layoutPort
        .saveDraft(DEMO_LAYOUT_ID, doc)
        .then(() => setSaveStatusLabel('Đã lưu'))
        .catch(() => setSaveStatusLabel('Lưu lỗi'));
    }, SAVE_DEBOUNCE_MS);
  }

  function handlePublish(note?: string) {
    if (!layoutPort) return;
    setIsPublishing(true);
    layoutPort
      .publish(DEMO_LAYOUT_ID, note)
      .then(() => loadVersions(layoutPort))
      .finally(() => setIsPublishing(false));
  }

  function handleRestore(version: number) {
    if (!layoutPort) return;
    // saveTimerRef có thể đang chờ lưu draft cũ — huỷ để không GHI ĐÈ lại draft VỪA restore
    // xong (restore đã set draft = content của version cũ; save debounce cũ vẫn còn treo sẽ
    // ghi đè bằng nội dung TRƯỚC restore nếu không huỷ).
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    layoutPort
      .restoreVersion(DEMO_LAYOUT_ID, version)
      .then(() => layoutPort.getDocument(DEMO_LAYOUT_ID))
      .then((doc) => {
        if (!doc) return;
        // Set content MỚI và tăng reloadKey TRONG CÙNG 1 lượt cập nhật — nếu tách thành 2 bước
        // (tăng reloadKey trước, load content trong effect sau), LayoutDesignerApp remount NGAY
        // với content CŨ (state chưa kịp cập nhật), rồi content mới tới sau không còn tác dụng
        // vì useCreateEditor chỉ đọc content lúc mount. Phải atomic: key mới PHẢI đi kèm content mới.
        setState({ status: 'ready', content: doc.currentDraft });
        setReloadKey((k) => k + 1);
      });
  }

  function handleTokenInserted(key: string) {
    if (!layoutPort) return;
    layoutPort
      .recordTokenUsage(key)
      .then(() => loadGlobalSuggestions(layoutPort))
      .catch(() => {
        // Ghi nhận gợi ý thất bại không nên chặn thao tác thiết kế — fail-soft, bỏ qua.
      });
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9bab' }}>Đang tải layout…</div>
    );
  }

  if (state.status === 'no-port') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9bab', textAlign: 'center', padding: 30 }}>
        Môi trường hiện tại chưa đăng ký LayoutPort — không thể lưu layout.
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#e05656', textAlign: 'center', padding: 30, gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Không tải được layout</div>
        <div style={{ fontSize: 11.5, color: '#9a9bab', maxWidth: 420, fontFamily: "'JetBrains Mono', monospace" }}>{state.message}</div>
      </div>
    );
  }

  return (
    <LayoutDesignerApp
      key={reloadKey}
      content={state.content}
      onDocChange={handleDocChange}
      saveStatusLabel={saveStatusLabel}
      versioning={{
        latestPublishedVersion,
        versions,
        onPublish: handlePublish,
        onRestore: handleRestore,
        isPublishing,
      }}
      globalSuggestions={globalSuggestions}
      onTokenInserted={handleTokenInserted}
      pickAndSaveImage={assetPort ? () => assetPort.pickAndSaveImage() : undefined}
      resolveAssetUrl={assetPort ? (path: string) => assetPort.resolveAssetUrl(path) : undefined}
      listAssets={assetPort ? () => assetPort.listAssets() : undefined}
    />
  );
}
