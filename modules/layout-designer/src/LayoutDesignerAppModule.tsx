import { useEffect, useRef, useState, useCallback } from 'react';
import type { AppContentProps } from '@sky-app/kernel';
import type { LayoutPort } from '@sky-app/service-contracts';
import type { LayoutContent, LayoutDocument } from '@sky-app/slide-shared';
import { LayoutDesignerApp } from './components/LayoutDesignerApp.js';

export interface LayoutDesignerAppModuleProps extends AppContentProps {
  layoutId?: string;
  layoutPort?: LayoutPort;
  variableRegistryPort?: any;
}

type ModuleState =
  | { status: 'loading' }
  | { status: 'no-port' }
  | { status: 'error'; message: string }
  | { status: 'ready'; content: LayoutContent };

const DEBOUNCE_MS = 600;

export function LayoutDesignerAppModule({
  layoutId = 'demo-layout',
  platform,
  layoutPort: propLayoutPort,
  variableRegistryPort: propVariableRegistryPort,
}: LayoutDesignerAppModuleProps) {
  const layoutPort = propLayoutPort ?? (platform as any)?.layout ?? (platform as any)?.services?.get('layout');
  const variableRegistryPort = propVariableRegistryPort ?? (platform as any)?.variableRegistry ?? (platform as any)?.services?.get('variable_registry') ?? (typeof (layoutPort as any)?.listTopVariables === 'function' ? layoutPort : undefined);

  const [state, setState] = useState<ModuleState>({ status: 'loading' });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [reloadKey, setReloadKey] = useState<number>(0);
  const [globalSuggestions, setGlobalSuggestions] = useState<string[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);

  const pendingDocRef = useRef<LayoutContent | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef<boolean>(false);

  const loadVersions = useCallback(async () => {
    if (!layoutPort || !layoutId) return;
    try {
      const list = await layoutPort.listVersions(layoutId);
      setVersions(list);
    } catch {
      setVersions([]);
    }
  }, [layoutPort, layoutId]);

  useEffect(() => {
    if (state.status === 'ready') {
      void loadVersions();
    }
  }, [loadVersions, reloadKey, state.status]);



  useEffect(() => {
    let active = true;

    if (!layoutPort) {
      setState({ status: 'no-port' });
      return;
    }

    if (!layoutId) {
      setState({
        status: 'error',
        message: 'Thiếu layoutId trong tham số mở app.',
      });
      return;
    }

    setState({ status: 'loading' });

    const fetchPromise = typeof layoutPort.getDraft === 'function'
      ? layoutPort.getDraft(layoutId).then((draft: any) => draft.content)
      : layoutPort.getDocument(layoutId).then(async (doc: any) => {
          if (doc) return doc.currentDraft;
          const emptyContent: LayoutContent = {
            variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [] }],
          };
          await (layoutPort.createDocument as any)?.(layoutId, 'Layout demo', emptyContent);
          return emptyContent;
        });

    fetchPromise
      .then((content: any) => {
        if (!active) return;
        setState({ status: 'ready', content });
      })
      .catch((err: unknown) => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : String(err);
        setState({ status: 'error', message: msg });
      });

    return () => {
      active = false;
    };
  }, [layoutPort, layoutId, reloadKey]);

  const flushSave = useCallback(async () => {
    if (!layoutPort || !layoutId || !pendingDocRef.current || isSavingRef.current) return;

    const docToSave = pendingDocRef.current;
    pendingDocRef.current = null;
    isSavingRef.current = true;
    setSaveStatus('saving');

    try {
      await layoutPort.saveDraft(layoutId, docToSave);
      setSaveStatus('saved');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[LayoutDesignerAppModule] Save draft failed:', err);
      setSaveStatus('error');
    } finally {
      isSavingRef.current = false;
      if (pendingDocRef.current) {
        void flushSave();
      }
    }
  }, [layoutPort, layoutId]);

  const handleDocChange = useCallback(
    (newContent: LayoutContent) => {
      pendingDocRef.current = newContent;
      setSaveStatus('saving');

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        void flushSave();
      }, DEBOUNCE_MS);
    },
    [flushSave]
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const loadTopVariables = useCallback(() => {
    if (!variableRegistryPort || typeof variableRegistryPort.listTopVariables !== 'function') {
      setGlobalSuggestions([]);
      return;
    }
    variableRegistryPort
      .listTopVariables(20)
      .then((res: any) => {
        const items = Array.isArray(res) ? res : (res?.items ?? []);
        setGlobalSuggestions(items.map((i: any) => i.key));
      })
      .catch(() => {
        setGlobalSuggestions([]);
      });
  }, [variableRegistryPort]);

  useEffect(() => {
    loadTopVariables();
  }, [loadTopVariables]);

  const handleTokenInserted = useCallback(
    (key: string) => {
      if (!variableRegistryPort || typeof variableRegistryPort.recordTokenUsage !== 'function') return;
      void variableRegistryPort.recordTokenUsage(key).then(() => {
        loadTopVariables();
      }).catch(() => {});
    },
    [variableRegistryPort, loadTopVariables]
  );

  const handleRestoreVersion = useCallback(
    async (versionId: string | number) => {
      if (!layoutPort || !layoutId) return;
      await layoutPort.restoreVersion(layoutId, versionId);
      const doc = await layoutPort.getDocument(layoutId);
      if (doc) {
        setState({ status: 'ready', content: doc.currentDraft });
      }
      setReloadKey((k) => k + 1);
    },
    [layoutPort, layoutId]
  );

  const handlePublish = useCallback(
    async (note?: string) => {
      if (!layoutPort || !layoutId) return;
      setIsPublishing(true);
      try {
        await layoutPort.publish(layoutId, note);
        await loadVersions();
      } finally {
        setIsPublishing(false);
      }
    },
    [layoutPort, layoutId, loadVersions]
  );

  if (state.status === 'loading') {
    return (
      <div className="h-full flex items-center justify-center text-[#9a9bab]">Đang tải layout…</div>
    );
  }

  if (state.status === 'no-port') {
    return (
      <div className="h-full flex items-center justify-center text-[#9a9bab] text-center p-[30px]">
        Môi trường hiện tại chưa đăng ký LayoutPort — không thể lưu layout.
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[#e05656] text-center p-[30px] gap-2">
        <div className="font-bold text-sm">Không tải được layout</div>
        <div className="text-[11.5px] text-[#9a9bab] max-w-[420px] font-mono">{state.message}</div>
      </div>
    );
  }

  const saveStatusLabel =
    saveStatus === 'saving'
      ? 'Đang lưu…'
      : saveStatus === 'saved'
        ? 'Đã lưu nháp'
        : saveStatus === 'error'
          ? 'Lỗi lưu nháp!'
          : undefined;

  const latestPublishedVersion = versions.length > 0 ? Math.max(...versions.map((v) => v.version)) : null;

  return (
    <LayoutDesignerApp
      key={reloadKey}
      content={state.content}
      onDocChange={handleDocChange}
      saveStatusLabel={saveStatusLabel}
      globalSuggestions={globalSuggestions}
      onTokenInserted={handleTokenInserted}
      layoutId={layoutId}
      layoutPort={layoutPort}
      onRestoreVersion={handleRestoreVersion}
      versioning={{
        latestPublishedVersion,
        versions,
        onPublish: handlePublish,
        onRestore: handleRestoreVersion,
        isPublishing,
      }}
    />
  );
}
