import type { PreGenStudentStatus } from '../../store';

export interface RowColorContext {
  selected: boolean;
  autoplayOrOnStage: boolean;
  pregenStatus: PreGenStudentStatus | undefined;
  hasPlayed: boolean;
}

/**
 * Màu nền theo độ ưu tiên: selected > autoplay/on-stage > pregen status > hasPlayed > mặc định.
 * `bold`: cột Hành động in đậm khi autoplay/on-stage để nổi bật lúc đang đọc tên — cột dữ liệu không có.
 */
export function getRowColorClass(ctx: RowColorContext, { bold = false }: { bold?: boolean } = {}): string {
  const { selected, autoplayOrOnStage, pregenStatus, hasPlayed } = ctx;

  if (selected) return 'bg-blue-100';
  if (autoplayOrOnStage) return bold ? 'bg-orange-200 font-bold' : 'bg-orange-200';
  if (pregenStatus === 'processing') return 'bg-blue-50';
  if (pregenStatus === 'done') return 'bg-green-50';
  if (pregenStatus === 'failed') return 'bg-red-50';
  if (hasPlayed) return 'bg-muted opacity-50';
  return 'hover:bg-muted';
}
