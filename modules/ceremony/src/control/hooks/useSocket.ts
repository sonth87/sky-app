import { useEffect, useRef } from 'react';
import { createSocket, type SlideSocket } from '../../lib/socket';
import { useControlStore } from '../store';
import { playErrorBeep, playScanBeep } from '../lib/sound';

/**
 * Kết nối Control tới Socket.IO server và đồng bộ store.
 * Trả về ref tới socket để các component emit lệnh.
 */
export function useSocket() {
  const socketRef = useRef<SlideSocket | null>(null);
  const wsPort = useControlStore((s) => s.wsPort);
  const {
    setConnected,
    setOnStage,
    setPending,
    setLastScan,
    setLastError,
    setMode,
    pushScan,
    setConfettiEnabled,
    setConfettiRepeat,
    setConfettiBurst,
    setConfettiAmount,
    setConfettiSpeed,
    setConfettiType,
    setConfettiRibbon,
    setConfettiColorStyle,
    setConfettiShape,
    setConfettiTicks,
    setRibbonConfig,
    setConfettiSizeConfig,
    setTtsEnabled,
    setTtsModel,
    setTtsSpeed,
    setTtsSentencePrefix,
    setTtsDelay,
    setTtsTemplate,
    setTtsPlayMode,
    setTtsConditions,
    setCustomVariables,
    setTtsVoicePool,
    setLayoutOverrides,
    setBackdropAspectRatio,
    setAwardLocationCode,
    setIdleTimer,
    patchRuntimeStateLocal,
    markUnplayed,
  } = useControlStore();

  useEffect(() => {
    const socket = createSocket(wsPort);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected to server on port', wsPort);
      setConnected(true);
      socket.emit('state:request');
    });
    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected from server');
      setConnected(false);
    });

    socket.on('state:full', ({ onStage, pending, session }) => {
      setOnStage(onStage);
      setPending(pending);
      setMode(session.mode);
      // Đồng bộ status trong danh sách local theo record đang on_stage/pending
      if (onStage) patchRuntimeStateLocal(onStage.record.id, onStage.runtimeState);
      if (pending) patchRuntimeStateLocal(pending.record.id, pending.runtimeState);
    });
    socket.on('state:onStage', ({ data }) => {
      setOnStage(data);
      if (data) patchRuntimeStateLocal(data.record.id, data.runtimeState);
    });
    socket.on('state:pending', ({ data }) => {
      setPending(data);
      if (data) patchRuntimeStateLocal(data.record.id, data.runtimeState);
    });
    socket.on('event:scanned', ({ data, ts }) => {
      console.log('[Socket] Received event:scanned:', data.record.id);
      setLastScan({ record: data.record, runtimeState: data.runtimeState, ts });
      // Nếu record đã có trong scanLog (quét lại): reset trạng thái "đã play" để UI hiển
      // thị record này có thể play lại (cả auto lẫn manual mode).
      const currentLog = useControlStore.getState().scanLog;
      const alreadyInLog = currentLog.some(
        (x) => x.record.id === data.record.id,
      );
      if (alreadyInLog) {
        markUnplayed(data.record.id);
      }
      pushScan({ record: data.record, runtimeState: data.runtimeState, ts });
      playScanBeep();
    });
    socket.on('event:mode', ({ mode }) => setMode(mode));
    socket.on('event:confetti', ({ enabled }) => setConfettiEnabled(enabled));
    socket.on('event:confettiRepeat', ({ repeat }) => setConfettiRepeat(repeat));
    socket.on('event:confettiBurst', ({ burst }) => setConfettiBurst(burst));
    socket.on('event:confettiAmount', ({ amount }) => setConfettiAmount(amount));
    socket.on('event:confettiSpeed', ({ speed }) => setConfettiSpeed(speed));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).on('event:confettiType', ({ confettiType }: { confettiType: string }) => setConfettiType(confettiType));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).on('event:confettiRibbon', ({ ribbon }: { ribbon: string }) => setConfettiRibbon(ribbon));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).on('event:confettiColorStyle', ({ colorStyle }: { colorStyle: string }) => setConfettiColorStyle(colorStyle));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).on('event:confettiShape', ({ shape }: { shape: string }) => setConfettiShape(shape));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).on('event:confettiTicks', ({ ticks }: { ticks: string }) => setConfettiTicks(ticks));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).on('event:ribbonConfig', ({ config }: { config: any }) => setRibbonConfig(config));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).on('event:confettiSizeConfig', ({ config }: { config: any }) => setConfettiSizeConfig(config));
    socket.on('event:tts', ({ enabled }) => setTtsEnabled(enabled));
    socket.on('event:ttsModel', ({ model }) => setTtsModel(model));
    socket.on('event:ttsSpeed', ({ speed }) => setTtsSpeed(speed));
    socket.on('event:ttsSentencePrefix', ({ prefix }) => setTtsSentencePrefix(prefix));
    socket.on('event:ttsTemplate', ({ template }) => setTtsTemplate(template));
    socket.on('event:ttsPlayMode', ({ playMode }) => setTtsPlayMode(playMode));
    socket.on('event:ttsConditions', ({ conditions }) => setTtsConditions(conditions));
    socket.on('event:customVariables', ({ variables }) => setCustomVariables(variables));
    socket.on('event:ttsVoicePool', ({ voicePool }) => setTtsVoicePool(voicePool));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).on('event:layoutOverrides', ({ overrides }: { overrides: Record<string, any> }) => setLayoutOverrides(overrides || {}));
    socket.on('event:backdropAspectRatio', ({ aspectRatio }) => setBackdropAspectRatio(aspectRatio));
    socket.on('event:awardLocation', ({ code }) => setAwardLocationCode(code));
    socket.on('event:idleTimer', (payload) => setIdleTimer(payload));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).on('event:ttsDelay', ({ delay }: { delay: number }) => setTtsDelay(delay));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on('event:error', (err) => {
      setLastError(err);
      playErrorBeep();
    });

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsPort]);

  return socketRef;
}
