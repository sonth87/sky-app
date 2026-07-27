import { Check, Loader2, Pause, Play, Trash2 } from 'lucide-react';
import type { VoiceListItem } from './types.js';

export type PreviewState = 'idle' | 'loading' | 'playing' | 'error';

export interface VoiceRowProps {
  item: VoiceListItem;
  isSelected: boolean;
  previewState: PreviewState;
  onSelect: () => void;
  onPreview: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
}

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'from-rose-400 to-pink-500',
    'from-indigo-400 to-purple-500',
    'from-cyan-400 to-blue-500',
    'from-emerald-400 to-teal-500',
    'from-amber-400 to-orange-500',
    'from-red-400 to-orange-500',
  ];
  return colors[Math.abs(hash) % colors.length];
}

function PreviewButton({ state, onClick }: { state: PreviewState; onClick: (e: React.MouseEvent) => void }) {
  const isLoading = state === 'loading';
  const isPlaying = state === 'playing';
  const isError = state === 'error';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      title={isPlaying ? 'Dừng' : isError ? 'Lỗi — thử lại' : 'Nghe thử'}
      className={
        isPlaying
          ? 'flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors'
          : isLoading
            ? 'flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground cursor-wait'
            : isError
              ? 'flex h-7 w-7 items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive/15 transition-colors'
              : 'flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors'
      }
    >
      {isLoading ? <Loader2 size={13} className="animate-spin" /> : isPlaying ? <Pause size={13} /> : <Play size={13} />}
    </button>
  );
}

/**
 * 1 dòng voice trong danh sách VoicePicker. Chọn 1 dòng (click ngoài vùng nút preview)
 * là đủ để dùng giọng đó — không có bước "Clone"/"Import" riêng: nếu đây là voice từ
 * catalog vendor chưa từng dùng, server tự encode+persist ngầm lần synthesize đầu tiên.
 */
export function VoiceRow({ item, isSelected, previewState, onSelect, onPreview, onDelete }: VoiceRowProps) {
  const avatarBg = getAvatarColor(item.name);
  const firstChar = item.name.trim().charAt(0).toUpperCase();

  // Tạo tiêu đề gộp: Name - Tagline nếu có tagline
  const displayTitle = item.tagline ? `${item.name} - ${item.tagline}` : item.name;
  // Detail text là category hoặc tags
  const detailText = item.category.length > 0 
    ? item.category.map(c => c.toUpperCase()).join(' · ') 
    : item.tags.length > 0 
      ? item.tags.join(' · ') 
      : undefined;

  return (
    <div
      onClick={onSelect}
      className={
        isSelected
          ? 'flex items-center gap-3 bg-primary/10 px-4 py-3 cursor-pointer transition-colors'
          : 'flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/70 transition-colors'
      }
    >
      <div className="w-4 flex-shrink-0 flex justify-center">
        {isSelected && <Check size={16} className="text-primary stroke-[3px]" />}
      </div>

      {/* Avatar tròn với gradient và verified badge */}
      <div className="relative h-9 w-9 flex-shrink-0">
        <div className={`flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br ${avatarBg} text-white font-bold text-sm shadow-inner`}>
          {firstChar}
        </div>
        {item.origin === 'system' && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 border border-background shadow-sm" title="Giọng hệ thống">
            <Check size={9} className="text-white stroke-[3.5px]" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-semibold truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
            {displayTitle}
          </span>
        </div>
        {item.description ? (
          <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {item.description}
          </div>
        ) : detailText ? (
          <div className="mt-0.5 truncate text-3xs font-medium tracking-wider text-muted-foreground opacity-80 uppercase">
            {detailText}
          </div>
        ) : null}
      </div>

      <div className="flex flex-shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <PreviewButton state={previewState} onClick={onPreview} />
        {item.origin === 'custom' && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Xóa giọng đọc"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
