import { useEffect, useRef, useCallback, useState } from 'react';
import { useControlStore } from '../store';
import { useSocketRef } from '../SocketContext';
import { useScrollContext } from '../ScrollContext';
import { useSlide } from '../lib/slide';

/**
 * Hook quản lý toàn bộ logic auto play:
 * - Đếm ngược delaySeconds khi đang play
 * - Chuyển sang SV tiếp theo (chưa play) khi hết giờ
 * - Persist state vào disk sau mỗi thay đổi để khôi phục sau restart
 * - Scroll bảng scanned đến row đang play
 *
 * countdown và progress được expose để AutoPlayBar hiển thị.
 */
export function useAutoPlay() {
  const slide = useSlide('autoplay-persistence');
  const socket = useSocketRef();
  const { scrollTo } = useScrollContext();
  const { autoPlay, setAutoPlay, scanLog, records, mode } = useControlStore();
  const { isPlaying, delaySeconds, currentCode } = autoPlay;

  const [countdown, setCountdown] = useState(delaySeconds);

  // Ref để timer luôn đọc giá trị mới nhất
  const stateRef = useRef(autoPlay);
  stateRef.current = autoPlay;
  const scanLogRef = useRef(scanLog);
  scanLogRef.current = scanLog;
  const recordsRef = useRef(records);
  recordsRef.current = records;

  // Chặn effect persist ghi đè file trước khi load từ đĩa xong (tránh reset delaySeconds
  // về giá trị mặc định của store nếu app bị tắt sớm ngay sau khi mount).
  const loadedRef = useRef(false);

  // Persist mỗi khi state thay đổi
  useEffect(() => {
    if (!loadedRef.current || !slide) return;
    const scannedCodes = scanLogRef.current.map((e) => e.record.id);
    slide.saveAutoPlay({
      scannedCodes,
      playedCodes: autoPlay.playedCodes,
      currentCode: autoPlay.currentCode,
      delaySeconds: autoPlay.delaySeconds,
    });
  }, [autoPlay.playedCodes, autoPlay.currentCode, autoPlay.delaySeconds, scanLog, slide]);

  // Load state từ đĩa khi mount
  useEffect(() => {
    if (!slide) {
      loadedRef.current = true;
      return;
    }
    slide.loadAutoPlay().then((saved) => {
      if (!saved) {
        loadedRef.current = true;
        return;
      }
      // Restore scanLog từ đĩa: tìm record từ recordsRef, quét lại theo thứ tự
      const byId = new Map(recordsRef.current.map((r) => [r.id, r]));
      (saved.scannedCodes ?? []).forEach((id: string) => {
        const record = byId.get(id);
        if (record) {
          useControlStore.getState().pushScan({
            record,
            runtimeState: useControlStore.getState().runtimeStates[id] ?? { status: 'registered' },
            ts: new Date().toISOString(),
          });
        }
      });
      setAutoPlay({
        playedCodes: saved.playedCodes ?? [],
        currentCode: saved.currentCode ?? null,
        delaySeconds: saved.delaySeconds ?? 15,
        isPlaying: false,
      });
      loadedRef.current = true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Danh sách id theo thứ tự hiển thị trong bảng scanned (cũ → mới) */
  const getScanQueue = useCallback((): string[] => {
    const byId = new Map(recordsRef.current.map((r) => [r.id, r]));
    const seen = new Set<string>();
    const result: string[] = [];
    for (let i = scanLogRef.current.length - 1; i >= 0; i--) {
      const id = scanLogRef.current[i].record.id;
      if (!seen.has(id) && byId.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }
    return result;
  }, []);

  /** Code tiếp theo chưa play */
  const getNextUnplayed = useCallback((played: string[], excluding: string | null): string | null => {
    const queue = getScanQueue();
    const done = new Set([...played, ...(excluding ? [excluding] : [])]);
    return queue.find((c) => !done.has(c)) ?? null;
  }, [getScanQueue]);

  const playCode = useCallback((code: string) => {
    socket.current?.emit('cmd:show', { id: code, source: 'auto' });
    setAutoPlay({ currentCode: code });
    setTimeout(() => scrollTo('scanned', code), 50);
  }, [socket, setAutoPlay, scrollTo]);

  const advanceNext = useCallback(() => {
    const { playedCodes: played, currentCode: cur } = stateRef.current;
    const newPlayed = cur ? [...played, cur] : played;
    const next = getNextUnplayed(newPlayed, null);
    if (next) {
      setAutoPlay({ playedCodes: newPlayed, currentCode: next });
      socket.current?.emit('cmd:show', { id: next, source: 'auto' });
      setTimeout(() => scrollTo('scanned', next), 50);
    } else {
      setAutoPlay({ playedCodes: newPlayed, currentCode: null, isPlaying: false });
    }
  }, [getNextUnplayed, setAutoPlay, socket, scrollTo]);

  const togglePlay = useCallback(() => {
    if (mode === 'auto') {
      setAutoPlay({ isPlaying: false });
      return;
    }
    const { isPlaying: playing, playedCodes: played, currentCode: cur } = stateRef.current;
    if (playing) {
      setAutoPlay({ isPlaying: false });
      return;
    }
    const resumeCode = cur ?? getNextUnplayed(played, null);
    if (!resumeCode) return;
    setAutoPlay({ isPlaying: true, currentCode: resumeCode });
    playCode(resumeCode);
  }, [getNextUnplayed, mode, playCode, setAutoPlay]);

  useEffect(() => {
    if (mode === 'auto' && stateRef.current.isPlaying) {
      setAutoPlay({ isPlaying: false });
    }
  }, [mode, setAutoPlay]);

  const replayCode = useCallback((code: string) => {
    const newPlayed = stateRef.current.playedCodes.filter((c) => c !== code);
    setAutoPlay({ playedCodes: newPlayed, isPlaying: true, currentCode: code });
    playCode(code);
  }, [playCode, setAutoPlay]);

  // Timer chính (đếm giây thật, quyết định khi nào advanceNext — giữ nguyên setInterval 1s)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!isPlaying || !currentCode || mode === 'auto') return;

    const total = delaySeconds;
    setCountdown(total);

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          advanceNext();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [isPlaying, currentCode, delaySeconds, mode, advanceNext]);

  // Progress mượt cho hiệu ứng viền (rAF theo wall-clock) — tách riêng khỏi countdown số nguyên
  // ở trên để không ảnh hưởng logic advanceNext, chỉ phục vụ vẽ UI mỗi khung hình.
  const [smoothProgress, setSmoothProgress] = useState(0);
  useEffect(() => {
    if (!isPlaying || !currentCode || mode === 'auto') {
      setSmoothProgress(0);
      return;
    }
    const startedMs = Date.now() - (delaySeconds - countdown) * 1000;
    let rafId: number;
    const tick = () => {
      const elapsed = (Date.now() - startedMs) / 1000;
      setSmoothProgress(Math.min(1, Math.max(0, elapsed / delaySeconds)));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // countdown cố ý không nằm trong deps: chỉ dùng để tính mốc bắt đầu khi effect chạy lại
    // (isPlaying/currentCode/delaySeconds/mode đổi), tránh restart rAF mỗi giây.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentCode, delaySeconds, mode]);

  const progress = isPlaying && currentCode ? (1 - smoothProgress) * 100 : 0;

  return { togglePlay, replayCode, countdown, progress, smoothProgress, getScanQueue };
}
