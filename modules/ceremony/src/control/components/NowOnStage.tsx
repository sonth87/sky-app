import { useTranslation } from 'react-i18next';
import { useControlStore } from '../store';
import { useSocketRef } from '../SocketContext';
import { resolveAsset } from '../../lib/assets';
import { useScrollContext } from '../ScrollContext';
import { RainbowBorder } from './RainbowBorder';

function useSiblings() {
  const students = useControlStore((s) => s.students);
  const onStage = useControlStore((s) => s.onStage);
  if (!onStage) return { prev: null, next: null };
  const idx = students.findIndex((s) => s.student_code === onStage.student_code);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? students[idx - 1] : null,
    next: idx < students.length - 1 ? students[idx + 1] : null,
  };
}

interface NowOnStageProps {
  /** Đã trôi qua bao nhiêu (0 → 1), mượt theo rAF — xem useAutoPlay's smoothProgress */
  progress: number;
}

export function NowOnStage({ progress }: NowOnStageProps) {
  const { t } = useTranslation();
  const onStage = useControlStore((s) => s.onStage);
  const autoPlay = useControlStore((s) => s.autoPlay);
  const socket = useSocketRef();
  const { prev, next } = useSiblings();
  const { scrollAllTo } = useScrollContext();

  const { isPlaying } = autoPlay;

  return (
    <RainbowBorder active={isPlaying} progress={progress} className="p-4">
      <span className="mb-3 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('nowOnStage.onStage')}
      </span>

      {onStage ? (
        <div
          className="flex cursor-pointer items-start gap-3 rounded-md p-1 -m-1 hover:bg-muted transition-colors"
          onClick={() => scrollAllTo(onStage.student_code)}
          title={t('nowOnStage.scrollToStudent')}
        >
          {onStage.image_relative_path ? (
            <img
              src={resolveAsset(onStage.image_relative_path)}
              alt={onStage.full_name}
              className="h-20 w-14 flex-shrink-0 rounded-md bg-muted object-cover shadow-sm"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
          ) : (
            <div className="h-20 w-14 flex-shrink-0 rounded-md bg-muted" />
          )}
          <div className="min-w-0 pt-0.5">
            <div className="text-base font-bold text-foreground leading-snug">{onStage.full_name}</div>
            <div className="font-mono text-xs font-medium text-muted-foreground mt-0.5">{onStage.student_code}</div>
            {onStage.major_name && (
              <div className="mt-1.5 text-sm text-foreground leading-tight">{onStage.major_name}</div>
            )}
            {onStage.class_code && (
              <div className="mt-0.5 text-xs text-muted-foreground">{onStage.class_code}</div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground italic">{t('nowOnStage.idleScreen')}</div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            if (!prev) return;
            socket.current?.emit('cmd:show', {
              student_code: prev.student_code,
              source: 'manual',
            });
            scrollAllTo(prev.student_code);
          }}
          disabled={!prev}
          className="flex flex-col items-start rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-left transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:opacity-50"
        >
          <span className="text-xxs font-semibold uppercase tracking-wide text-primary disabled:text-muted-foreground">
            ◀ {t('nowOnStage.prev')}
          </span>
          <span className="mt-1 w-full overflow-hidden">
            <span className="block animate-marquee whitespace-nowrap text-sm font-semibold text-primary">
              {prev ? prev.full_name : '—'}
            </span>
          </span>
        </button>
        <button
          onClick={() => {
            if (!next) return;
            socket.current?.emit('cmd:show', {
              student_code: next.student_code,
              source: 'manual',
            });
            scrollAllTo(next.student_code);
          }}
          disabled={!next}
          className="flex flex-col items-end rounded-lg border border-accent bg-accent px-3 py-2.5 text-right transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:opacity-50"
        >
          <span className="text-xxs font-semibold uppercase tracking-wide text-accent-foreground">
            {t('nowOnStage.next')} ▶
          </span>
          <span className="mt-1 w-full overflow-hidden">
            <span className="block animate-marquee whitespace-nowrap text-sm font-semibold text-accent-foreground">
              {next ? next.full_name : '—'}
            </span>
          </span>
        </button>
      </div>
    </RainbowBorder>
  );
}
