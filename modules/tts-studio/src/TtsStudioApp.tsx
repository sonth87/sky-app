import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppContentProps } from '@sky-app/kernel';
import type { TtsPort, TtsEnginePort } from '@sky-app/service-contracts';
import { PortalContainerContext } from './PortalContainerContext';
import { TextareaRefContext } from './TextareaRefContext';
import { VoicePicker, previewPlayId } from './components/VoicePicker';
import { SpeedSlider } from './components/SpeedSlider';
import { EmotionInsert } from './components/EmotionInsert';
import { UsageGuide } from './components/UsageGuide';
import { TextInputPanel } from './components/TextInputPanel';
import { GenerateBar, QUICK_PLAY_ID } from './components/GenerateBar';
import { HistoryList } from './components/HistoryList';
import { VerticalResizeHandle } from './components/VerticalResizeHandle';
import { useTtsStudioStore } from './store';
import { getPlayingId, playPcmAudio, playUrlAudio, stopAudio } from './lib/audioPlayer';
import { pcmToWavBlob } from './lib/wav-encode';
import { getAllHistoryEntries, putHistoryEntry, type HistoryEntry } from './lib/history-db';
import { VoiceCloneModal } from '@sky-app/voice-catalog-ui';
import { EngineManager, DeviceSettingsModal } from '@sky-app/tts-engine-ui';
import { useMenuAction } from '@sonth87/device-layout';

const EDITOR_HEIGHT_KEY = 'tts-studio-editor-height';
const DEFAULT_EDITOR_HEIGHT = 320;
const MIN_EDITOR_HEIGHT = 160;
const MIN_HISTORY_HEIGHT = 140;

function readStoredEditorHeight(): number {
  try {
    const raw = localStorage.getItem(EDITOR_HEIGHT_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_EDITOR_HEIGHT;
  } catch {
    return DEFAULT_EDITOR_HEIGHT;
  }
}

export function TtsStudioApp({ appId, platform, isActive }: AppContentProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLDivElement>(null);
  const tts = platform.services.get<TtsPort>('tts');
  const enginePort = platform.services.get<TtsEnginePort>('tts-engine');
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [showEngineManager, setShowEngineManager] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);

  // Menu "Cài đặt" trên thanh menu (khai ở index.ts's menuBarMenus) dispatch action
  // string qua CustomEvent. Menu thuộc về cả cửa sổ nên phải bỏ qua khi app không
  // active, nếu không app nền cũng mở hộp thoại theo.
  useMenuAction(appId, (action) => {
    if (!isActive) return;
    if (action === 'settings:engine') setShowEngineManager(true);
    else if (action === 'settings:device') setShowDeviceSettings(true);
  });

  // Chiều cao khu vực Trình soạn thảo (px) — phần Danh sách bản ghi chiếm phần còn lại và tự
  // cuộn riêng (feedback: soạn thảo không nên cuộn, chỉ lịch sử cuộn). Lưu localStorage để nhớ
  // qua lần mở lại, không cần persist middleware của zustand cho 1 giá trị layout thuần UI.
  const [editorHeight, setEditorHeight] = useState(readStoredEditorHeight);
  const editorHeightRef = useRef(editorHeight);
  editorHeightRef.current = editorHeight;

  const getEditorHeight = useCallback(() => editorHeightRef.current, []);

  const handleEditorResize = useCallback((nextValue: number) => {
    const containerHeight = mainRef.current?.clientHeight ?? Infinity;
    const maxHeight = Math.max(MIN_EDITOR_HEIGHT, containerHeight - MIN_HISTORY_HEIGHT);
    setEditorHeight(Math.min(maxHeight, Math.max(MIN_EDITOR_HEIGHT, nextValue)));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(EDITOR_HEIGHT_KEY, String(editorHeight));
    } catch {
      /* localStorage không khả dụng — chỉ mất khả năng nhớ vị trí, không chặn resize trong phiên hiện tại */
    }
  }, [editorHeight]);

  const setVoices = useTtsStudioStore((s) => s.setVoices);
  const voices = useTtsStudioStore((s) => s.voices);
  const selectedVoiceId = useTtsStudioStore((s) => s.selectedVoiceId);
  const setSelectedVoiceId = useTtsStudioStore((s) => s.setSelectedVoiceId);
  const text = useTtsStudioStore((s) => s.text);
  const speed = useTtsStudioStore((s) => s.speed);
  const setIsGenerating = useTtsStudioStore((s) => s.setIsGenerating);
  const setHistory = useTtsStudioStore((s) => s.setHistory);
  const prependHistory = useTtsStudioStore((s) => s.prependHistory);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [genError, setGenError] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const lastResultRef = useRef<{ buffer: ArrayBuffer; sampleRate: number } | null>(null);
  const [canQuickPlay, setCanQuickPlay] = useState(false);

  const refreshVoices = useCallback(async () => {
    if (!tts) return [];
    try {
      const [voicesList, catalogList] = await Promise.all([
        tts.listVoices(),
        tts.listVoiceCatalog ? tts.listVoiceCatalog() : Promise.resolve([])
      ]);
      const importedCatalogIds = new Set(
        voicesList.map((v) => v.sourceCatalogId).filter((id): id is string => !!id)
      );

      const catalogMap = new Map((catalogList ?? []).map((c) => [c.id, c]));

      const registryItems = voicesList.map((v) => {
        const cat = v.sourceCatalogId ? catalogMap.get(v.sourceCatalogId) : undefined;
        return {
          id: v.id,
          name: v.name,
          gender: v.gender,
          language: v.language,
          accent: v.accent,
          category: v.category ?? cat?.category ?? [],
          tags: v.tags ?? cat?.tags ?? [],
          type: v.type,
          tagline: v.tagline ?? cat?.tagline,
          description: v.description ?? cat?.description,
          sourceCatalogId: v.sourceCatalogId,
          default: cat?.default,
        };
      });

      const catalogItems = (catalogList ?? [])
        .filter((e) => !importedCatalogIds.has(e.id))
        .map((e) => ({
          id: e.id,
          name: e.name,
          gender: e.gender,
          language: e.language,
          accent: e.accent,
          category: e.category ?? [],
          tags: e.tags ?? [],
          type: 'preset',
          tagline: e.tagline,
          description: e.description,
          sourceCatalogId: e.id,
          default: e.default,
        }));

      const combined = [...registryItems, ...catalogItems];
      setVoices(combined);
      return combined;
    } catch (err) {
      console.error('Failed to load voices', err);
      throw err;
    }
  }, [tts, setVoices]);

  // Backend TTS (apps/tts-service/server/main.py's lifespan) chỉ mở cổng lắng nghe HTTP SAU KHI
  // load xong engine ONNX + warm-up hết các giọng — có thể mất vài giây. Request listVoices() đầu
  // tiên (ngay lúc mount) dễ rơi đúng lúc server chưa kịp nhận connection, resolve lỗi hoặc mảng
  // rỗng tuỳ tầng network. RETRY với backoff thay vì gọi 1 lần rồi im lặng mãi mãi (bug thật: user
  // phải tự F5 mới thấy giọng, 2026-07-23) — không sửa thứ tự khởi tạo bên Python (rủi ro cao hơn,
  // ảnh hưởng cả /synthesize), chỉ làm UI tự chờ + báo trạng thái rõ ràng.
  //
  // Bug thật #2 (2026-08-04): tổng thời gian retry cũ chỉ ~4s (500ms×4 + 1000ms×2), nhưng log
  // thực tế "REF_DIR..." → "Ready." của tts-debug.log đo được ~9s cho lần khởi động BÌNH THƯỜNG
  // (chưa tính máy chậm hơn hoặc lần đầu chưa cache) — retry cạn trước khi server kịp lên, danh
  // sách giọng trống VĨNH VIỄN (voicesLoading=false, không tự thử lại nữa) dù server sau đó đã
  // hoàn toàn khoẻ mạnh (verify bằng curl trực tiếp /voices lúc debug — trả đủ dữ liệu). Nới tổng
  // thời gian retry lên ~28s (500ms×4 + 1000ms×6 + 2000ms×10), đủ dư cho cold-start thực tế.
  useEffect(() => {
    if (!tts) return;
    let cancelled = false;
    let attempt = 0;
    const MAX_ATTEMPTS = 20;

    const tryLoad = () => {
      refreshVoices()
        .then((combined) => {
          if (cancelled) return;
          if (combined.length === 0 && attempt < MAX_ATTEMPTS) {
            attempt += 1;
            setTimeout(tryLoad, attempt <= 4 ? 500 : attempt <= 10 ? 1000 : 2000);
            return;
          }
          if (combined.length > 0) {
            const currentSelected = useTtsStudioStore.getState().selectedVoiceId;
            const exists = combined.some((v) => v.id === currentSelected);
            if (!currentSelected || !exists) {
              const defaultVoice = combined.find((v) => v.default);
              setSelectedVoiceId((defaultVoice ?? combined[0])!.id);
            }
          }
          setVoicesLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          if (attempt < MAX_ATTEMPTS) {
            attempt += 1;
            setTimeout(tryLoad, attempt <= 4 ? 500 : attempt <= 10 ? 1000 : 2000);
            return;
          }
          setLoadError(err instanceof Error ? err.message : String(err));
          setVoicesLoading(false);
        });
    };
    tryLoad();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ load 1 lần lúc mount
  }, [tts, refreshVoices]);

  useEffect(() => {
    let cancelled = false;
    getAllHistoryEntries()
      .then((entries) => {
        if (cancelled) return;
        setHistory(
          entries.map((e) => ({
            id: e.id,
            text: e.text,
            voiceId: e.voiceId,
            voiceLabel: e.voiceLabel,
            speed: e.speed,
            createdAt: e.createdAt,
            durationMs: e.durationMs,
          })),
        );
      })
      .catch(() => {
        /* IndexedDB lỗi (vd private browsing chặn) — lịch sử trống, không chặn app */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ load 1 lần lúc mount
  }, []);

  const handlePreview = async (voiceId: string) => {
    if (!tts) return;
    const playId = previewPlayId(voiceId);
    if (getPlayingId() === playId) {
      // Đang nghe thử đúng giọng này — bấm lại = dừng (toggle Play/Stop).
      stopAudio();
      return;
    }
    setPreviewingId(voiceId);
    try {
      const url = await tts.getPreviewUrl(voiceId);
      // Tải xong URL — hết pha "loading", chuyển sang phát. playUrlAudio tự dừng bất kỳ
      // audio nào khác đang phát (nghe thử giọng kia, Phát nhanh, Nghe lại lịch sử…) trước
      // khi phát cái này, đảm bảo chỉ 1 audio phát cùng lúc trong toàn app.
      setPreviewingId(null);
      await playUrlAudio(playId, url);
    } catch {
      setPreviewingId(null);
    }
  };

  const handleGenerate = async () => {
    if (!tts || !selectedVoiceId || !text.trim()) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const trimmedText = text.trim();
      const result = await tts.synthesizeBuffer(trimmedText, { voiceId: selectedVoiceId, speed });
      lastResultRef.current = result;
      setCanQuickPlay(true);
      // Cùng id với nút "Phát nhanh" (GenerateBar) — auto-play sau khi tạo VÀ nút Phát
      // nhanh cùng điều khiển 1 audio, nút tự hiện đúng trạng thái Dừng ngay khi vừa tạo.
      await playPcmAudio(QUICK_PLAY_ID, result.buffer, result.sampleRate);

      const voiceLabel = voices.find((v) => v.id === selectedVoiceId)?.name ?? selectedVoiceId;
      const sampleCount = Math.floor(result.buffer.byteLength / 2);
      const durationMs = (sampleCount / result.sampleRate) * 1000;
      const entry: HistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: trimmedText,
        voiceId: selectedVoiceId,
        voiceLabel,
        speed,
        sampleRate: result.sampleRate,
        createdAt: Date.now(),
        audioBlob: pcmToWavBlob(result.buffer, result.sampleRate),
        durationMs,
      };
      await putHistoryEntry(entry);
      prependHistory({
        id: entry.id,
        text: entry.text,
        voiceId: entry.voiceId,
        voiceLabel: entry.voiceLabel,
        speed: entry.speed,
        createdAt: entry.createdAt,
        durationMs: entry.durationMs,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setGenError(msg.includes('503') ? 'TTS engine đang khởi động, thử lại sau vài giây.' : msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleQuickPlay = async () => {
    if (!lastResultRef.current) return;
    if (getPlayingId() === QUICK_PLAY_ID) {
      // Đang phát — bấm lại nút (giờ hiện icon Dừng) = dừng.
      stopAudio();
      return;
    }
    try {
      await playPcmAudio(QUICK_PLAY_ID, lastResultRef.current.buffer, lastResultRef.current.sampleRate);
    } catch {
      /* im lặng — không phải lỗi nghiêm trọng đủ để hiện banner */
    }
  };

  if (!tts) {
    return (
      <div ref={rootRef} className="tts-studio-root flex h-full items-center justify-center bg-background p-6">
        <p className="text-sm text-muted-foreground">
          Dịch vụ TTS không khả dụng trên môi trường này.
        </p>
      </div>
    );
  }

  return (
    // relative — BẮT BUỘC: đây là containing block cho VoiceCloneModal's `absolute inset-0`
    // (và cho Radix Select's portal qua PortalContainerContext bên dưới). Thiếu prop này thì
    // absolute lại rơi về containing block mặc định (viewport), y hệt bug vừa sửa.
    <div ref={rootRef} className="tts-studio-root relative flex h-full flex-col bg-background" data-env={platform.env}>
      <PortalContainerContext.Provider value={rootRef}>
        <TextareaRefContext.Provider value={textareaRef}>
        <div className="grid h-full grid-cols-[280px_1fr] overflow-hidden">
          <aside className="flex flex-col gap-4 overflow-y-auto border-r border-border p-3">
            <VoicePicker
              onPreview={handlePreview}
              previewingId={previewingId}
              loading={voicesLoading}
              onAddVoice={() => setShowCloneModal(true)}
              onDeleteVoice={async (voiceId) => {
                const voiceItem = voices.find((v) => v.id === voiceId);
                const label = voiceItem ? voiceItem.name : voiceId;
                if (!confirm(`Bạn có chắc chắn muốn xóa giọng đọc "${label}"?`)) return;

                const rawId = voiceId.replace(/^vieneu-/, '');
                if (!tts?.deleteVoice) return;
                const res = await tts.deleteVoice(rawId);
                if (res.ok) {
                  await refreshVoices();
                } else {
                  alert(res.error || 'Xóa giọng đọc thất bại');
                }
              }}
            />
            <EmotionInsert />
            <SpeedSlider />
            <UsageGuide />
            {loadError && (
              <p className="text-2xs text-destructive">Không tải được danh sách giọng: {loadError}</p>
            )}
          </aside>
          <main ref={mainRef} className="flex min-h-0 flex-col overflow-hidden p-3">
            <div className="flex flex-none flex-col overflow-hidden" style={{ height: editorHeight }}>
              <TextInputPanel />
            </div>
            <VerticalResizeHandle getStartValue={getEditorHeight} onResize={handleEditorResize} />
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-1">
              {genError && (
                <p className="text-2xs text-destructive" role="alert">{genError}</p>
              )}
              <GenerateBar
                onGenerate={handleGenerate}
                onQuickPlay={handleQuickPlay}
                canQuickPlay={canQuickPlay}
              />
              <HistoryList />
            </div>
          </main>
        </div>
        </TextareaRefContext.Provider>
      </PortalContainerContext.Provider>
      <VoiceCloneModal
        open={showCloneModal}
        onClose={() => setShowCloneModal(false)}
        ttsPort={tts}
        onRefresh={refreshVoices}
        clonedVoices={voices.filter((v) => v.type === 'cloned' && !v.sourceCatalogId)}
      />
      {enginePort && (
        <>
          <EngineManager
            open={showEngineManager}
            onClose={() => { setShowEngineManager(false); void refreshVoices(); }}
            port={enginePort}
            canInstall={platform.capabilities.has('tts-local')}
            portalContainer={rootRef.current}
          />
          <DeviceSettingsModal
            open={showDeviceSettings}
            onClose={() => setShowDeviceSettings(false)}
            port={enginePort}
            canInstall={platform.capabilities.has('tts-local')}
            portalContainer={rootRef.current}
          />
        </>
      )}
    </div>
  );
}
