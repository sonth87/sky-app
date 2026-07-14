import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useControlStore } from '../store';
import { StudentList } from './StudentList';
import { ConfettiToggle } from './ConfettiToggle';
import { ConfettiModal } from './ConfettiModal';
import { TtsToggle } from './TtsToggle';
import { OptionsToggle } from './OptionsToggle';
import { AutoPlayBar } from './AutoPlayBar';

/**
 * Hai bảng SV song song: trái = tất cả SV download về, phải = SV đã quét QR.
 * Divider ở giữa kéo được để đổi tỉ lệ rộng. Switch để ẩn/hiện bảng "Tất cả".
 */
interface StudentPanelsProps {
  onCardScan: (raw: string) => void;
  togglePlay: () => void;
  replayCode: (code: string) => void;
  countdown: number;
  progress: number;
}

export function StudentPanels({
  onCardScan,
  togglePlay,
  replayCode,
  countdown,
  progress,
}: StudentPanelsProps) {
  const { t } = useTranslation();
  const scanLog = useControlStore((s) => s.scanLog);
  const showAll = useControlStore((s) => s.showAllStudents);
  // % chiều rộng dành cho bảng "Tất cả" (phần còn lại cho bảng "Đã quét")
  const [leftPct, setLeftPct] = useState(55);
  const [focusedView, setFocusedView] = useState<'all' | 'scanned'>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const onMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(80, Math.max(20, pct)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
  }, []);

  return (
    <div className="flex h-full min-w-0 flex-col gap-2">
      <ConfettiModal />
      {/* Thanh điều khiển kiểu Excel: mỗi nhóm là button mở popover */}
      <div className="flex flex-shrink-0 items-center gap-1">
        <ConfettiToggle />
        <TtsToggle />
        <OptionsToggle />
        <div className="mx-2 h-5 w-px bg-muted" />
        <span className="text-xs text-muted-foreground">{t('studentPanels.scannedCount', { count: scanLog.length })}</span>
      </div>

      {/* Khu vực 2 bảng */}
      <div ref={containerRef} className="flex min-h-0 flex-1 gap-2">
        {showAll ? (
          <>
            <div className="min-w-0" style={{ width: `${leftPct}%` }}>
              <StudentList
                view="all"
                title={t('studentPanels.allStudents')}
                onCardScan={onCardScan}
                isFocused={focusedView === 'all'}
                onFocusChange={(focused) => focused && setFocusedView('all')}
              />
            </div>

            {/* Divider kéo được */}
            <div
              onMouseDown={startDrag}
              className="group flex w-2 flex-shrink-0 cursor-col-resize items-center justify-center"
            >
              <div className="h-12 w-1 rounded-full bg-muted group-hover:bg-muted-foreground" />
            </div>

            <div className="min-w-0 flex-1">
              <StudentList
                view="scanned"
                title={t('studentPanels.scannedQr')}
                onCardScan={onCardScan}
                isFocused={focusedView === 'scanned'}
                onFocusChange={(focused) => focused && setFocusedView('scanned')}
                onReplay={replayCode}
                headerSlot={<AutoPlayBar countdown={countdown} progress={progress} togglePlay={togglePlay} />}
              />
            </div>
          </>
        ) : (
          // Tắt bảng Tất cả → bảng Đã quét chiếm toàn bộ
          <div className="min-w-0 flex-1">
            <StudentList
              view="scanned"
              title={t('studentPanels.scannedQr')}
              onCardScan={onCardScan}
              isFocused={focusedView === 'scanned'}
              onFocusChange={(focused) => focused && setFocusedView('scanned')}
              onReplay={replayCode}
              headerSlot={<AutoPlayBar countdown={countdown} progress={progress} togglePlay={togglePlay} />}
            />
          </div>
        )}
      </div>
    </div>
  );
}
