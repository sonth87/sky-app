import { Check, Loader2, Mars, Pause, Play, Trash2, Venus } from 'lucide-react';
import type { VoiceListItem } from './types.js';

export type PreviewState = 'idle' | 'loading' | 'playing' | 'error';

export interface VoiceRowProps {
  item: VoiceListItem;
  isSelected: boolean;
  previewState: PreviewState;
  /** Ảnh minh hoạ nhỏ thay cho chữ cái đầu — đã resolve URL đầy đủ (xem getVoiceCoverPath +
   * platform.assetUrl ở host component, VoiceRow không biết gì về môi trường Web/Electron). */
  coverUrl: string;
  onSelect: () => void;
  onPreview: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
}

/**
 * Ảnh + nút play chồng lên nhau: bình thường chỉ hiện ảnh, hover cả dòng (class `group` ở
 * row cha) mới hiện overlay nút play. Đang phát (`playing`)/đang tải (`loading`) thì LUÔN
 * hiện overlay bất kể còn hover hay không, tới khi phát xong mới ẩn lại theo hover — khớp yêu
 * cầu "giữ hình play đến khi nào phát xong trừ khi vẫn hover".
 */
function CoverThumbnail({ coverUrl, isSystem, isBuiltin, state, onClick }: { coverUrl: string; isSystem: boolean; isBuiltin: boolean; state: PreviewState; onClick: (e: React.MouseEvent) => void }) {
  const isLoading = state === 'loading';
  const isPlaying = state === 'playing';
  const isError = state === 'error';
  const alwaysVisible = isLoading || isPlaying;
  return (
    <div className="relative h-10 w-10 flex-shrink-0">
      <button
        type="button"
        onClick={onClick}
        disabled={isLoading}
        title={isPlaying ? 'Dừng' : isError ? 'Lỗi — thử lại' : 'Nghe thử'}
        className="relative block h-full w-full overflow-hidden rounded-lg"
      >
        <img src={coverUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        <span
          className={
            alwaysVisible
              ? 'absolute inset-0 flex items-center justify-center rounded-lg overflow-hidden bg-white/55 backdrop-blur-sm text-white opacity-100 transition-opacity'
              : isError
                ? 'absolute inset-0 flex items-center justify-center rounded-lg overflow-hidden bg-destructive/60 backdrop-blur-sm text-white opacity-0 transition-opacity group-hover:opacity-100'
                : 'absolute inset-0 flex items-center justify-center rounded-lg overflow-hidden bg-white/55 backdrop-blur-sm text-white opacity-0 transition-opacity group-hover:opacity-100'
          }
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin drop-shadow" />
          ) : isPlaying ? (
            <Pause size={16} className="drop-shadow" />
          ) : (
            <Play size={16} className="drop-shadow" />
          )}
        </span>
      </button>
      {isSystem && (
        // Cam = catalog vendor (sky-app tự curate WAV mẫu), xanh = built-in của chính engine
        // (vd 20 giọng VieNeu 3.3.0, không cần ref audio) — 2 nguồn khác hẳn nhau dù cùng tab
        // "Hệ thống", cần phân biệt được bằng mắt ngay trên list.
        <span
          className={
            isBuiltin
              ? "absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 border border-background shadow-sm"
              : "absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 border border-background shadow-sm"
          }
          title={isBuiltin ? "Giọng built-in của engine" : "Giọng hệ thống"}
        >
          <Check size={9} className="text-white stroke-[3.5px]" />
        </span>
      )}
    </div>
  );
}

/**
 * 1 dòng voice trong danh sách VoicePicker. Chọn 1 dòng (click ngoài vùng nút preview)
 * là đủ để dùng giọng đó — không có bước "Clone"/"Import" riêng: nếu đây là voice từ
 * catalog vendor chưa từng dùng, server tự encode+persist ngầm lần synthesize đầu tiên.
 */
export function VoiceRow({ item, isSelected, previewState, coverUrl, onSelect, onPreview, onDelete }: VoiceRowProps) {
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
          ? 'group flex items-center gap-3 bg-primary/10 px-4 py-3 cursor-pointer transition-colors'
          : 'group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/70 transition-colors'
      }
    >
      <div className="w-4 flex-shrink-0 flex justify-center">
        {isSelected && <Check size={16} className="text-primary stroke-[3px]" />}
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        <CoverThumbnail coverUrl={coverUrl} isSystem={item.origin === 'system'} isBuiltin={!!item.builtin} state={previewState} onClick={onPreview} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-semibold truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
            {displayTitle}
          </span>
        </div>
        {item.description ? (
          <div className="mt-0.5 flex items-start gap-1">
            {item.gender && (
              <div className="flex flex-shrink-0 items-center pt-0.5">
                {item.gender.toLowerCase() === 'male' && <Mars size={14} className="text-blue-500" />}
                {item.gender.toLowerCase() === 'female' && <Venus size={14} className="text-pink-500" />}
              </div>
            )}
            <div className="text-xs text-muted-foreground line-clamp-2">
              {item.description}
            </div>
          </div>
        ) : detailText ? (
          <div className="mt-0.5 truncate text-3xs font-medium tracking-wider text-muted-foreground opacity-80 uppercase">
            {detailText}
          </div>
        ) : null}
      </div>

      {item.origin === 'custom' && onDelete && (
        <div className="flex flex-shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onDelete}
            title="Xóa giọng đọc"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
