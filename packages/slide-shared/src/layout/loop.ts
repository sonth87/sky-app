// Logic thuần cho LoopItem (trao giải tập thể) — theo docs/roadmap/plans/layout-designer/
// 11-canonical-da-loai-va-loop.md §"Chiến lược overflow". Tách khỏi React để unit test độc lập.

import type { LoopItem } from './types.js';
import type { CanonicalSubject } from './canonical.js';

/**
 * Ngưỡng dừng shrink (11 §"Câu hỏi mở còn lại" — đề xuất mặc định, GIÁ TRỊ TẠM). Dưới ngưỡng
 * này, dù `overflow='shrink'` vẫn tự chuyển sang cắt bớt (như 'truncate') để chữ còn đọc được.
 */
export const DEFAULT_MIN_ITEM_SCALE = 0.3;

export interface LoopCell {
  member: CanonicalSubject;
  /** Vị trí góc trên-trái của ô, tính bằng px trên canvas chuẩn (TRƯỚC khi nhân scale variant). */
  x: number;
  y: number;
  /** Hệ số co áp dụng THÊM vào scale chung của variant (11: "itemScale ... NHÂN THÊM"). */
  itemScale: number;
}

export interface LoopLayoutResult {
  cells: LoopCell[];
  /** true nếu 'truncate' hoặc 'shrink' rơi xuống dưới minItemScale và tự chuyển sang cắt bớt. */
  overflowed: boolean;
  /** Số người bị cắt bớt, chỉ > 0 khi overflowed. */
  overflowCount: number;
}

function computeGrid(count: number, direction: LoopItem['direction'], columns: number | undefined) {
  if (direction === 'row') return { cols: count, rows: 1 };
  if (direction === 'column') return { cols: 1, rows: count };
  // grid: dùng columns nếu có, ngược lại xấp xỉ hình vuông
  const cols = columns && columns > 0 ? columns : Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  return { cols, rows };
}

function placeCells(
  members: CanonicalSubject[],
  loopBox: { w: number; h: number },
  itemBox: { w: number; h: number },
  direction: LoopItem['direction'],
  columns: number | undefined,
  gap: number,
): { cells: LoopCell[]; itemScale: number } {
  const count = members.length;
  const { cols, rows } = computeGrid(count, direction, columns);
  const cellW = (loopBox.w - gap * (cols - 1)) / cols;
  const cellH = (loopBox.h - gap * (rows - 1)) / rows;
  // Không phóng to quá kích thước gốc (11: "min(..., 1)"), chỉ co nhỏ khi cần.
  const itemScale = Math.min(cellW / itemBox.w, cellH / itemBox.h, 1);

  const cells: LoopCell[] = members.map((member, i) => {
    const col = direction === 'column' ? 0 : i % cols;
    const row = direction === 'column' ? i : Math.floor(i / cols);
    return {
      member,
      x: col * (cellW + gap),
      y: row * (cellH + gap),
      itemScale,
    };
  });

  return { cells, itemScale };
}

/**
 * Tính vị trí + scale của từng ô trong 1 LoopItem, theo overflow đã chọn ('shrink'|'truncate').
 * Fail-soft: `members` rỗng/undefined → trả `cells: []` (LoopItem tự ẩn, không lỗi — 11 §render).
 */
export function computeLoopLayout(
  item: LoopItem,
  members: CanonicalSubject[] | undefined,
  minItemScale: number = DEFAULT_MIN_ITEM_SCALE,
): LoopLayoutResult {
  if (!members || members.length === 0) {
    return { cells: [], overflowed: false, overflowCount: 0 };
  }

  const ordered = [...members].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const loopBox = { w: item.box.w, h: item.box.h };
  const gap = item.gap ?? 0;

  if (item.overflow === 'truncate') {
    const maxItems = item.maxItems ?? ordered.length;
    if (ordered.length <= maxItems) {
      const { cells } = placeCells(ordered, loopBox, item.itemBox, item.direction, item.columns, gap);
      return { cells, overflowed: false, overflowCount: 0 };
    }
    const visible = ordered.slice(0, maxItems);
    const overflowCount = ordered.length - maxItems;
    const { cells } = placeCells(visible, loopBox, item.itemBox, item.direction, item.columns, gap);
    return { cells, overflowed: true, overflowCount };
  }

  // overflow === 'shrink'
  const { cells, itemScale } = placeCells(ordered, loopBox, item.itemBox, item.direction, item.columns, gap);
  if (itemScale >= minItemScale) {
    return { cells, overflowed: false, overflowCount: 0 };
  }

  // Dưới ngưỡng minItemScale → tự chuyển sang cắt bớt (11 "Câu hỏi mở còn lại").
  // itemScale KHÔNG đơn điệu theo count (computeGrid dùng ceil(sqrt(count)), cols/rows có thể
  // nhảy bậc) — duyệt toàn bộ để tìm maxItems LỚN NHẤT thoả ngưỡng, không dừng ở lần đầu đạt.
  let bestMaxItems = 1;
  for (let n = 1; n <= ordered.length; n++) {
    const attempt = placeCells(ordered.slice(0, n), loopBox, item.itemBox, item.direction, item.columns, gap);
    if (attempt.itemScale >= minItemScale) bestMaxItems = n;
  }
  const visible = ordered.slice(0, bestMaxItems);
  const { cells: truncatedCells } = placeCells(visible, loopBox, item.itemBox, item.direction, item.columns, gap);
  return { cells: truncatedCells, overflowed: true, overflowCount: ordered.length - bestMaxItems };
}

/** Text hiển thị ở ô "+N người khác" khi overflow — dùng cho `overflowMoreText` (token @count_more). */
export function renderOverflowMoreText(template: string | undefined, overflowCount: number): string {
  const text = template ?? '+@count_more';
  return text.replace('@count_more', String(overflowCount));
}
