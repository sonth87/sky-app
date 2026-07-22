import { useState } from 'react';
import { Volume2, RefreshCw, CheckSquare, Square, MinusSquare, X, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PreGenStatus } from '../store';
import { playPcm } from '../../lib/audio';
import { useControlStore } from '../store';
import { useSlide } from '../lib/slide';

function removeDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const STATUS_LABEL_KEYS: Record<string, { labelKey: string; cls: string }> = {
  pending:    { labelKey: 'preGenPopover.status.pending',    cls: 'bg-muted text-foreground' },
  processing: { labelKey: 'preGenPopover.status.processing', cls: 'bg-info/15 text-info-foreground animate-pulse' },
  done:       { labelKey: 'preGenPopover.status.done',       cls: 'bg-success/15 text-success' },
  failed:     { labelKey: 'preGenPopover.status.failed',     cls: 'bg-destructive/15 text-destructive' },
};

// Nhãn tiếng Việt cho quality flags — dùng làm tooltip file khả nghi
const QUALITY_LABEL_KEYS: Record<string, string> = {
  noisy:         'preGenPopover.quality.noisy',
  low_energy:    'preGenPopover.quality.lowEnergy',
  no_pauses:     'preGenPopover.quality.noPauses',
  mostly_silent: 'preGenPopover.quality.mostlySilent',
  clipping:      'preGenPopover.quality.clipping',
  too_short:     'preGenPopover.quality.tooShort',
  too_long:      'preGenPopover.quality.tooLong',
};

interface Props {
  status: PreGenStatus;
}

export function PreGenPopover({ status }: Props) {
  const { t } = useTranslation();
  const slide = useSlide('pregen');
  const records = useControlStore((s) => s.records);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'done' | 'failed' | 'pending' | 'suspect'>('all');
  const [playingCode, setPlayingCode] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const quality = status.quality ?? {};

  const filtered = records.filter((s) => {
    const pgSt = status.records[s.id];
    if (filterStatus === 'suspect') {
      if (!quality[s.id]) return false;
    } else if (filterStatus !== 'all') {
      if (filterStatus === 'pending' && pgSt !== 'pending' && pgSt !== 'processing') return false;
      if (filterStatus !== 'pending' && pgSt !== filterStatus) return false;
    }
    if (search) {
      const q = removeDiacritics(search);
      return s.id.includes(q) || removeDiacritics(s.full_name).includes(q);
    }
    return true;
  });

  const selectableFiltered = filtered.filter((s) => {
    const pgSt = status.records[s.id];
    return pgSt === 'done' || pgSt === 'failed' || !pgSt;
  });
  const allChecked = selectableFiltered.length > 0 && selectableFiltered.every((s) => selected.has(s.id));
  const someChecked = selectableFiltered.some((s) => selected.has(s.id));

  function toggleAll() {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableFiltered.map((s) => s.id)));
    }
  }

  function toggleOne(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function handlePlay(studentCode: string) {
    if (playingCode === studentCode) return;
    if (!slide) return;
    setPlayingCode(studentCode);
    try {
      console.log('[PreGenPopover] play request studentCode=', studentCode);
      const res = await slide.pregenGetAudio(studentCode);
      console.log('[PreGenPopover] play response studentCode=', studentCode, 'ok=', res.ok, 'hasBuffer=', !!res.buffer, 'error=', res.error);
      if (res.ok && res.buffer) {
        console.log('[PreGenPopover] playPcm studentCode=', studentCode, 'pcmBytes=', res.buffer.slice(44).byteLength);
        await playPcm(res.buffer.slice(44), 48000);
      }
    } finally {
      setPlayingCode(null);
    }
  }

  async function handleRequeueSelected() {
    if (!slide) return;
    for (const code of selected) {
      await slide.pregenRequeue(code);
    }
    setSelected(new Set());
  }

  function describeFlags(flags: string[]): string {
    return flags.map((f) => (QUALITY_LABEL_KEYS[f] ? t(QUALITY_LABEL_KEYS[f]) : f)).join(', ');
  }

  return (
    <div className="flex w-[400px] flex-col gap-2 p-3 text-sm">
      {/* Header stats */}
      <div className="flex items-center gap-2">
        <span className="font-semibold text-foreground">
          {status.done}/{status.total}
        </span>
        {status.failed > 0 && (
          <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">
            {t('preGenPopover.failedCount', { count: status.failed })}
          </span>
        )}
        {status.suspect > 0 && (
          <button
            onClick={() => setFilterStatus('suspect')}
            title={t('preGenPopover.suspectTitle')}
            className="flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning-foreground hover:bg-warning/25"
          >
            <AlertTriangle size={11} />
            {t('preGenPopover.suspectCount', { count: status.suspect })}
          </button>
        )}
        <div className="ml-auto flex gap-1">
          {status.running && !status.paused && (
            <button
              className="rounded border border-border bg-card px-2 py-0.5 text-xs text-foreground hover:bg-muted"
              onClick={() => slide?.pregenPause()}
            >
              {t('preGenPopover.pause')}
            </button>
          )}
          {status.paused && (
            <button
              className="rounded border border-info/40 bg-info/10 px-2 py-0.5 text-xs text-info-foreground hover:bg-info/15"
              onClick={() => slide?.pregenResume()}
            >
              {t('preGenPopover.resume')}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <progress
        value={status.done}
        max={status.total}
        className="h-1.5 w-full rounded [&::-webkit-progress-bar]:rounded [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded [&::-webkit-progress-value]:bg-success"
      />

      {/* Bulk requeue */}
      {selected.size > 0 && (
        <button
          onClick={handleRequeueSelected}
          className="flex items-center justify-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
        >
          <RefreshCw size={12} />
          {t('preGenPopover.requeueSelected', { count: selected.size })}
        </button>
      )}

      {/* Search + filter */}
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('preGenPopover.searchPlaceholder')}
            className="w-full rounded border border-border bg-card px-2 py-1 pr-6 text-xs text-foreground placeholder-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
          className="rounded border border-border bg-card px-1 py-1 text-xs text-foreground focus:outline-none"
        >
          <option value="all">{t('preGenPopover.filter.all')}</option>
          <option value="done">{t('preGenPopover.filter.done')}</option>
          <option value="suspect">{t('preGenPopover.filter.suspect')}</option>
          <option value="failed">{t('preGenPopover.filter.failed')}</option>
          <option value="pending">{t('preGenPopover.filter.pending')}</option>
        </select>
      </div>

      {/* Student list */}
      <div className="max-h-72 overflow-y-auto rounded border border-border">
        {filtered.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">{t('preGenPopover.noResults')}</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-2xs font-medium text-muted-foreground uppercase tracking-wide">
                <th className="py-1.5 pl-2 pr-1 w-6">
                  <button onClick={toggleAll} className="flex items-center text-muted-foreground hover:text-foreground">
                    {allChecked
                      ? <CheckSquare size={13} className="text-primary" />
                      : someChecked
                        ? <MinusSquare size={13} className="text-primary" />
                        : <Square size={13} />
                    }
                  </button>
                </th>
                <th className="py-1.5 pr-1">{t('preGenPopover.table.student')}</th>
                <th className="py-1.5 px-1">{t('preGenPopover.table.status')}</th>
                <th className="py-1.5 pr-2 text-right">{t('preGenPopover.table.action')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const pgSt = status.records[s.id] ?? 'pending';
                const badge = STATUS_LABEL_KEYS[pgSt] ?? STATUS_LABEL_KEYS.pending;
                const isChecked = selected.has(s.id);
                const canSelect = pgSt === 'done' || pgSt === 'failed' || pgSt === 'pending';
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-border last:border-0 ${isChecked ? 'bg-primary/10' : 'hover:bg-muted'}`}
                  >
                    <td className="py-1.5 pl-2 pr-1">
                      {canSelect && (
                        <button onClick={() => toggleOne(s.id)} className="flex items-center text-muted-foreground hover:text-primary">
                          {isChecked ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                        </button>
                      )}
                    </td>
                    <td className="py-1.5 pr-1">
                      <div className="font-medium text-foreground leading-tight">{s.full_name}</div>
                      <div className="text-muted-foreground">{s.id}</div>
                    </td>
                    <td className="px-1">
                      <div className="flex items-center gap-1">
                        <span className={`rounded px-1.5 py-0.5 text-2xs font-medium ${badge.cls}`}>
                          {t(badge.labelKey)}
                        </span>
                        {quality[s.id] && (
                          <span
                            title={t('preGenPopover.suspectQualityTitle', { flags: describeFlags(quality[s.id]) })}
                            className="flex items-center rounded bg-warning/15 px-1 py-0.5 text-warning-foreground"
                          >
                            <AlertTriangle size={11} />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-1 pr-2">
                      <div className="flex items-center justify-end gap-1">
                        {pgSt === 'done' && (
                          <button
                            title={t('preGenPopover.playTitle')}
                            disabled={playingCode === s.id}
                            onClick={() => handlePlay(s.id)}
                            className="rounded p-1 text-success hover:bg-success/15 disabled:opacity-40"
                          >
                            <Volume2 size={13} />
                          </button>
                        )}
                        {(pgSt === 'failed' || pgSt === 'done') && (
                          <button
                            title={t('preGenPopover.requeueTitle')}
                            onClick={() => slide?.pregenRequeue(s.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted"
                          >
                            <RefreshCw size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
