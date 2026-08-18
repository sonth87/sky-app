import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Mic, MoreHorizontal, Play, RotateCcw, Trash2 } from 'lucide-react';
import type { StoryItem } from '@sky-app/service-contracts';
import { DropdownMenu } from '../DropdownMenu';

export interface StoryItemCardProps {
  item: StoryItem;
  isCurrentlyPlaying: boolean;
  regenerating: boolean;
  onPlayFromHere: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
}

function formatStartTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Card kiểu "chat" cho list dọc sortable — port cấu trúc từ voicebox's `StoryChatItem.tsx`,
 * bỏ phần avatar ảnh đại diện giọng (sky-app không có ảnh giọng đọc) — thay bằng icon `Mic`
 * tĩnh. Bản kéo-thả (`useSortable`) tách riêng ở dưới, đúng khuôn voicebox's
 * `SortableStoryChatItem`.
 */
export function StoryItemCard({
  item, isCurrentlyPlaying, regenerating, onPlayFromHere, onRegenerate, onDelete,
}: StoryItemCardProps) {
  return (
    <div
      className={
        isCurrentlyPlaying
          ? 'flex items-center gap-2.5 rounded-lg border border-primary bg-primary/10 p-2.5'
          : 'flex items-center gap-2.5 rounded-lg border border-transparent p-2.5 hover:bg-muted/50'
      }
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Mic size={14} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-1.5">
          <span className="truncate text-2xs font-medium text-foreground">{item.voiceLabel || 'Giọng đọc'}</span>
          <span className="ml-auto shrink-0 text-2xs tabular-nums text-muted-foreground">{formatStartTime(item.startTimeMs)}</span>
        </div>
        <p className="truncate text-2xs text-muted-foreground">{item.sourceText || '(không có văn bản)'}</p>
      </div>

      <DropdownMenu
        triggerLabel={`Tuỳ chọn đoạn "${item.sourceText ?? ''}"`}
        triggerClassName="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        trigger={<MoreHorizontal size={14} />}
        items={[
          { label: 'Phát từ đây', icon: <Play size={12} />, onClick: onPlayFromHere },
          ...(item.canRegenerate
            ? [{ label: regenerating ? 'Đang sinh lại...' : 'Sinh lại', icon: <RotateCcw size={12} />, onClick: onRegenerate }]
            : []),
          { label: 'Xoá khỏi Story', icon: <Trash2 size={12} />, destructive: true, onClick: onDelete },
        ]}
      />
    </div>
  );
}

export interface SortableStoryItemCardProps extends StoryItemCardProps {
  id: string;
}

export function SortableStoryItemCard({ id, ...props }: SortableStoryItemCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1">
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
        aria-label="Kéo để sắp xếp lại"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <div className="min-w-0 flex-1">
        <StoryItemCard {...props} />
      </div>
    </div>
  );
}
