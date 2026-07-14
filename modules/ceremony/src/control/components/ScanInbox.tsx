import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useControlStore } from '../store';
import { useSocketRef } from '../SocketContext';
import { resolveAsset } from '../../lib/assets';
import { formatGpa } from '@sky-app/slide-shared';

export function ScanInbox() {
  const { t } = useTranslation();
  const pending = useControlStore((s) => s.pending);
  const lastScan = useControlStore((s) => s.lastScan);
  const socket = useSocketRef();

  const isAbsent = pending?.absent || pending?.status === 'absent';

  if (!pending) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {t('scanInbox.noStudentScanned')}
      </div>
    );
  }

  return (
    <motion.div
      key={lastScan?.ts ?? pending.student_code}
      initial={{ boxShadow: '0 0 0 0 rgba(251,191,36,0)' }}
      animate={{
        boxShadow: [
          '0 0 0 0 rgba(251,191,36,0.9)',
          '0 0 0 8px rgba(251,191,36,0)',
        ],
      }}
      transition={{ duration: 0.6, repeat: 1 }}
      className={`rounded-lg border-2 p-4 ${
        isAbsent ? 'border-destructive/60 bg-destructive/10' : 'border-warning/40 bg-warning/10'
      }`}
    >
      <div
        className={`mb-2 text-xs font-semibold uppercase ${
          isAbsent ? 'text-destructive' : 'text-warning-foreground'
        }`}
      >
        {isAbsent ? `⚠ ${t('scanInbox.studentMarkedAbsent')}` : t('scanInbox.justScanned')}
      </div>
      {isAbsent && pending.absent_reason && (
        <div className="mb-2 text-xs text-destructive">{t('scanInbox.reason', { reason: pending.absent_reason })}</div>
      )}
      <div className="flex gap-4">
        {pending.image_relative_path ? (
          <img
            src={resolveAsset(pending.image_relative_path)}
            alt={pending.full_name}
            className="h-28 w-20 rounded bg-muted object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
        ) : (
          <div className="flex h-28 w-20 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
            {t('scanInbox.noPhoto')}
          </div>
        )}
        <div className="flex-1">
          <div className="text-lg font-bold">{pending.full_name}</div>
          <div className="font-mono text-xs text-muted-foreground">{pending.student_code}</div>
          <div className="mt-1 text-sm text-foreground">
            {pending.major_name} · {pending.faculty_name}
          </div>
          <div className="text-sm text-foreground">
            {pending.classification} · GPA {formatGpa(pending.gpa)}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => socket.current?.emit('cmd:show', { student_code: pending.student_code, source: 'manual' })}
          className={`rounded-md px-4 py-2 text-sm font-semibold ${
            isAbsent
              ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              : 'bg-success text-success-foreground hover:bg-success/90'
          }`}
        >
          {isAbsent ? `▶ ${t('scanInbox.showAnyway')}` : `▶ ${t('scanInbox.play')}`}
        </button>
        <button
          onClick={() => socket.current?.emit('cmd:clear')}
          className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          {t('scanInbox.skip')}
        </button>
      </div>
    </motion.div>
  );
}
