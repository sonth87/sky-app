import { type RefObject } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getStatusLabel, flattenCanonicalRecord, type CanonicalRecord, type RecordRuntimeState } from '@sky-app/slide-shared';
import { resolveAsset } from '../../../lib/assets';
import { CopyButton } from './CopyButton';

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  registered: { bg: 'bg-info/10', text: 'text-info-foreground', dot: 'bg-info' },
  checked_in: { bg: 'bg-primary/10', text: 'text-primary', dot: 'bg-primary' },
  called: { bg: 'bg-warning/10', text: 'text-warning-foreground', dot: 'bg-warning' },
  on_stage: { bg: 'bg-success/10 animate-pulse', text: 'text-success', dot: 'bg-success' },
  returned: { bg: 'bg-muted', text: 'text-foreground', dot: 'bg-muted-foreground' },
  absent: { bg: 'bg-destructive/10', text: 'text-destructive', dot: 'bg-destructive' },
};

interface StudentDetailPopoverProps {
  popoverRef: RefObject<HTMLDivElement | null>;
  student: CanonicalRecord;
  status: RecordRuntimeState['status'];
  displayOrderFallback: number;
  pos: { x: number; y: number };
  mode: 'card' | 'table';
  onToggleMode: () => void;
  onClose: () => void;
}

export function StudentDetailPopover({
  popoverRef,
  student: record,
  status,
  displayOrderFallback,
  pos,
  mode,
  onToggleMode,
  onClose,
}: StudentDetailPopoverProps) {
  const { t } = useTranslation();
  const popoverWidth = 440;
  const popoverHeight = 380;
  const flat = flattenCanonicalRecord(record);

  const left =
    pos.x + popoverWidth > window.innerWidth
      ? Math.max(16, window.innerWidth - popoverWidth - 16)
      : Math.max(16, pos.x);

  const top =
    pos.y + popoverHeight > window.innerHeight
      ? Math.max(16, window.innerHeight - popoverHeight - 16)
      : Math.max(16, pos.y);

  const statusColor = STATUS_COLORS[status] || {
    bg: 'bg-muted',
    text: 'text-foreground',
    dot: 'bg-muted-foreground',
  };

  const dob = record.dateOfBirth
    ? new Date(record.dateOfBirth).toLocaleDateString('vi-VN')
    : '—';

  const majorName = flat.major_name;
  const facultyName = flat.faculty_name;
  const classCode = flat.class_code;
  const courseCode = flat.course_code;
  const classification = flat.classification;
  const gpa = flat.gpa;
  const achievementTitle = flat.achievement_title;
  const awardContent = flat.award_content;

  return (
    <div
      ref={popoverRef}
      className="fixed z-[201] w-[440px] rounded-xl border border-border bg-card p-4 shadow-2xl transition-all animate-fade-in"
      style={{ left: `${left}px`, top: `${top}px` }}
    >
      {/* Nút đóng */}
      <button
        onClick={onClose}
        className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <X size={16} />
      </button>

      {/* Nút chuyển chế độ hiển thị */}
      <button
        onClick={onToggleMode}
        className="absolute right-9 top-3 rounded px-2 py-0.5 text-2xs font-semibold text-info hover:bg-info/10 border border-info/30 transition-colors"
      >
        {mode === 'card' ? t('studentDetailPopover.tableView') : t('studentDetailPopover.cardView')}
      </button>

      {mode === 'card' ? (
        <>
          {/* Thông tin chính */}
          <div className="flex gap-4">
            {record.image_relative_path ? (
              <img
                src={resolveAsset(record.image_relative_path)}
                alt={record.full_name}
                className="h-28 w-20 flex-shrink-0 rounded-lg border border-border bg-muted object-cover shadow-sm"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="h-28 w-20 flex-shrink-0 flex flex-col items-center justify-center rounded-lg border border-border bg-muted text-2xs text-muted-foreground font-medium">
                {t('studentDetailPopover.noPhoto')}
              </div>
            )}

            <div className="flex-1 min-w-0 pt-1">
              <div className="text-xs font-bold text-info uppercase tracking-wide">
                {t('studentDetailPopover.orderNumber')}: {record.displayOrder || displayOrderFallback}
              </div>
              <div className="text-lg font-bold text-foreground leading-tight mt-0.5 flex items-center group">
                <span>{record.full_name}</span>
                <CopyButton text={record.full_name} label={t('studentDetailPopover.fieldLabels.fullName')} />
              </div>
              <div className="font-mono text-xs font-semibold text-muted-foreground mt-1 flex items-center group">
                <span>{t('studentDetailPopover.studentCodePrefix')}: {record.identifierCode ?? record.id}</span>
                <CopyButton text={record.identifierCode ?? record.id} label={t('studentDetailPopover.fieldLabels.studentCode')} />
              </div>

              {/* Badge trạng thái */}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold mt-2.5 ${statusColor.bg} ${statusColor.text}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusColor.dot}`} />
                {getStatusLabel(status)}
              </span>
            </div>
          </div>

          {/* Chi tiết */}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border pt-3 text-xs text-foreground">
            <div className="group">
              <span className="block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('studentDetailPopover.fieldLabels.classCode')}
              </span>
              <div className="flex items-center">
                <span className="font-semibold text-foreground font-medium">
                  {classCode || '—'}
                  {courseCode ? ` (${courseCode})` : ''}
                </span>
                {(classCode || courseCode) && (
                  <CopyButton
                    text={`${classCode || ''}${courseCode ? ` (${courseCode})` : ''}`}
                    label={t('studentDetailPopover.fieldLabels.classCode')}
                  />
                )}
              </div>
            </div>

            <div className="group">
              <span className="block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('studentDetailPopover.fieldLabels.classificationGpa')}
              </span>
              <div className="flex items-center">
                <span className="font-semibold text-foreground font-medium">
                  {classification || '—'} / {gpa || '—'}
                </span>
                {(classification || gpa) && (
                  <CopyButton
                    text={`${classification || ''} / ${gpa || ''}`}
                    label={t('studentDetailPopover.fieldLabels.classificationGpa')}
                  />
                )}
              </div>
            </div>

            <div className="group">
              <span className="block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('studentDetailPopover.fieldLabels.majorName')}
              </span>
              <div className="flex items-center">
                <span className="font-semibold text-foreground font-medium">
                  {majorName || '—'}
                </span>
                {majorName && <CopyButton text={majorName} label={t('studentDetailPopover.fieldLabels.majorName')} />}
              </div>
            </div>

            <div className="group">
              <span className="block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('studentDetailPopover.fieldLabels.facultyName')}
              </span>
              <div className="flex items-center">
                <span className="font-semibold text-foreground font-medium">
                  {facultyName || '—'}
                </span>
                {facultyName && <CopyButton text={facultyName} label={t('studentDetailPopover.fieldLabels.facultyName')} />}
              </div>
            </div>

            <div className="group">
              <span className="block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('studentDetailPopover.fieldLabels.dateOfBirth')}
              </span>
              <div className="flex items-center">
                <span className="font-semibold text-foreground font-medium">{dob}</span>
                {record.dateOfBirth && <CopyButton text={dob} label={t('studentDetailPopover.fieldLabels.dateOfBirth')} />}
              </div>
            </div>

            <div className="group">
              <span className="block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('studentDetailPopover.fieldLabels.phoneNumber')}
              </span>
              <div className="flex items-center">
                <span className="font-semibold text-foreground font-medium font-mono">
                  {record.phone || '—'}
                </span>
                {record.phone && (
                  <CopyButton text={record.phone} label={t('studentDetailPopover.fieldLabels.phoneNumber')} />
                )}
              </div>
            </div>

            {achievementTitle && achievementTitle !== 'Khong' && (
              <div className="col-span-2 group">
                <span className="block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('studentDetailPopover.fieldLabels.achievementTitle')}
                </span>
                <div className="flex items-center">
                  <span className="font-semibold text-foreground font-medium">
                    {achievementTitle}
                  </span>
                  <CopyButton text={achievementTitle} label={t('studentDetailPopover.fieldLabels.achievementTitle')} />
                </div>
              </div>
            )}

            {awardContent && awardContent !== 'Khong' && (
              <div className="col-span-2 group">
                <span className="block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('studentDetailPopover.fieldLabels.awardContent')}
                </span>
                <div className="flex items-center mt-0.5">
                  <span className="font-semibold text-primary bg-primary/50 px-2 py-1 rounded border border-primary/50 block flex-1 font-medium">
                    {awardContent}
                  </span>
                  <CopyButton text={awardContent} label={t('studentDetailPopover.fieldLabels.awardContent')} />
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Tiêu đề cho view bảng */}
          <div className="border-b border-border pb-2 mb-3 pr-20">
            <span className="text-base font-bold text-foreground leading-tight block truncate">
              {record.full_name}
            </span>
          </div>

          {/* Bảng dữ liệu key-value */}
          <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border bg-muted">
            <table className="w-full text-xxs border-collapse" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="bg-muted text-left text-muted-foreground font-semibold sticky top-0 z-10">
                  <th className="py-1.5 px-3 border-b border-border" style={{ width: '38%' }}>{t('studentDetailPopover.tableHeaders.key')}</th>
                  <th className="py-1.5 px-3 border-b border-border" style={{ width: '62%' }}>{t('studentDetailPopover.tableHeaders.value')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(flat).map(([key, val]) => {
                  let displayVal = '';
                  if (val === null || val === undefined) {
                    displayVal = 'null';
                  } else if (typeof val === 'string' && val.length > 100) {
                    if (key.includes('base64') || val.startsWith('data:image')) {
                      displayVal = t('studentDetailPopover.base64ImageData', { size: Math.round(val.length / 1024) });
                    } else {
                      displayVal = val.slice(0, 100) + '...';
                    }
                  } else {
                    displayVal = String(val);
                  }

                  const copyVal = String(val);

                  return (
                    <tr key={key} className="hover:bg-card border-b border-border transition-colors">
                      <td className="py-1.5 px-3 font-mono font-medium text-muted-foreground select-all whitespace-nowrap group">
                        <div className="flex items-center justify-between">
                          <span>{key}</span>
                          <CopyButton text={key} label={t('studentDetailPopover.fieldOf', { key })} />
                        </div>
                      </td>
                      <td className="py-1.5 px-3 font-mono text-foreground break-all select-all group">
                        <div className="flex items-center justify-between">
                          <span>{displayVal}</span>
                          <CopyButton text={copyVal} label={t('studentDetailPopover.valueOf', { key })} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
