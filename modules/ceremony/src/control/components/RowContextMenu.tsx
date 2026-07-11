import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Volume2, RefreshCw, UserX, Play } from 'lucide-react';
import type { Student } from '@sky-app/slide-shared';
import type { PreGenStudentStatus } from '../store';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from './ui/dropdown-menu';

interface Props {
  student: Student;
  pgSt: PreGenStudentStatus | undefined;
  x: number;
  y: number;
  onClose: () => void;
  onViewDetail: () => void;
  onPlayAudio: () => void;
  onRegenAudio: () => void;
  onToggleAbsent: () => void;
  onPlay: () => void;
}

/** Menu chuột phải tại vị trí click — dùng Radix DropdownMenu với anchor ảo tại toạ độ (x, y). */
export function RowContextMenu({
  student, pgSt, x, y, onClose,
  onViewDetail, onPlayAudio, onRegenAudio, onToggleAbsent, onPlay,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) onClose();
  };

  const runAndClose = (fn: () => void) => {
    fn();
    handleOpenChange(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      {/* Radix DropdownMenu cần 1 Trigger thật để tính vị trí mở — dùng div ẩn đặt tại toạ độ chuột làm anchor ảo. */}
      <DropdownMenuTrigger asChild>
        <div style={{ position: 'fixed', left: x, top: y, width: 1, height: 1 }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-[200px]"
        align="start"
        side="bottom"
        avoidCollisions
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuLabel className="font-semibold">
          {student.full_name}
          <div className="text-2xs font-normal text-muted-foreground">{student.student_code}</div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => runAndClose(onViewDetail)}>
          <Info size={14} />
          {t('rowContextMenu.studentDetail')}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem disabled={pgSt !== 'done'} onSelect={() => runAndClose(onPlayAudio)}>
          <Volume2 size={14} />
          {t('rowContextMenu.playAudio')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!pgSt || pgSt === 'processing'} onSelect={() => runAndClose(onRegenAudio)}>
          <RefreshCw size={14} />
          {t('rowContextMenu.regenAudio')}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant={student.status !== 'absent' ? 'destructive' : 'default'}
          onSelect={() => runAndClose(onToggleAbsent)}
        >
          <UserX size={14} />
          {student.status === 'absent' ? t('rowContextMenu.markPresent') : t('rowContextMenu.markAbsent')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => runAndClose(onPlay)}>
          <Play size={14} />
          {t('rowContextMenu.goOnStage')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
