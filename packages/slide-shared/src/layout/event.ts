// EventDocument/DataSource — theo docs/roadmap/plans/layout-designer/10-quan-ly-dot-le-event.md,
// 13-ceremony-mo-rong.md, 21-layout-versioning.md §5. 1 Event = 1 đợt lễ cụ thể, sở hữu
// customVariables + layoutRefs (điều kiện chọn layout) + tham chiếu tới 1 DataSource (data người
// tham dự, optional lúc tạo — có thể gán sau).

import type { CanonicalGroup, CanonicalSubject } from './canonical.js';
import type { LayoutVariant } from './types.js';
import type { CustomVariable, VarRuleOp } from '../types.js';

export type { CustomVariable };

/**
 * 1 nguồn dữ liệu người tham dự — 2 chế độ (13-ceremony-mo-rong.md §"Trách nhiệm 4"):
 * `pooled` = dùng chung nhiều Event, không bị trừ; `consumable` = tiêu hao, loại trừ dần qua
 * bảng nối event_consumed_record (record đã "dùng" ở 1 Event không xuất hiện lại ở Event sau
 * cùng trỏ nguồn này).
 */
export interface DataSource {
  id: string;
  label: string;
  mode: 'pooled' | 'consumable';
  /** Cột dùng làm khoá tự nhiên khi re-import (file 22, hoãn GĐ4a) — id record ổn định theo
   * giá trị cột này, không đổi dù re-import lại file nguồn. */
  naturalKeyField: string;
  mappingProfileId?: string;
  records: Array<CanonicalSubject | CanonicalGroup>;
}

export interface DataSourceSummary {
  id: string;
  label: string;
  mode: DataSource['mode'];
  recordCount: number;
}

/** Nguồn giá trị cho 1 token trong EventLayoutRef.fieldMap (13-ceremony-mo-rong.md §"Trách nhiệm 6"). */
export type FieldMapSource =
  | { kind: 'raw'; sourceKey: string }
  | { kind: 'computed'; variableKey: string }
  | { kind: 'unmapped' };

/** 1 rule điều kiện — tái dùng ĐÚNG op set của CustomVariableRule (VarRuleOp), không định nghĩa
 * union trùng lặp (nguyên tắc "nguồn chân lý duy nhất" đã áp dụng xuyên suốt slide-shared). */
export interface SelectorRule {
  attr: string;
  op: VarRuleOp;
  val: string;
}

/** rules trong 1 group nối AND; nhiều group với nhau nối OR (06-luu-tru-va-giao-tiep.md). */
export interface SelectorRuleGroup {
  rules: SelectorRule[];
}

export interface LayoutSelector {
  groups: SelectorRuleGroup[];
  /** Bắt buộc dùng khi 1 Event có nhiều layoutRefs — số càng cao càng ưu tiên. */
  priority: number;
}

export interface EventLayoutRef {
  layoutId: string;
  /** GHIM version cụ thể lúc gán vào Event — KHÔNG tự lấy bản mới nhất (21-layout-versioning.md
   * §5), lễ đang chạy ổn định dù designer đang sửa layout đó. */
  layoutVersion: number;
  /** undefined = luôn match (dùng cho layout Mặc định/fallback). */
  selector?: LayoutSelector;
  overrides?: Record<string, Partial<Pick<LayoutVariant, 'background'>>>;
  fieldMap: Record<string, FieldMapSource>;
  /** 'award' (mặc định) = layout trao giải, chọn qua resolveLayout theo điều kiện/Mặc định.
   * 'idle' = màn hình chờ (2026-07-21) — CỐ ĐỊNH 1 layout duy nhất cho cả Event, KHÔNG có
   * selector, KHÔNG đi qua resolveLayout. Optional để tương thích ref cũ (trước khi có khái
   * niệm màn chờ) — luôn hiểu ngầm là 'award' khi thiếu. */
  role?: 'award' | 'idle';
}

export interface EventDocument {
  id: string;
  name: string;
  /** NHÃN theo dõi/lọc/tìm kiếm — KHÔNG mang nghĩa tự động. setActive() thủ công là cách DUY
   * NHẤT đổi Event đang chạy (10-quan-ly-dot-le-event.md §"Chuyển đổi Event"). */
  status: 'draft' | 'scheduled' | 'active' | 'archived';
  scheduledAt?: string;
  archivedAt?: string;
  customVariables: CustomVariable[];
  layoutRefs: EventLayoutRef[];
  /** OPTIONAL — Event có thể tồn tại ở status='draft' mà CHƯA có dataSourceId (10-quan-ly-dot-
   * le-event.md §Schema, "user tạo trước sự kiện... data có thể chưa được chốt"). */
  dataSourceId?: string;
  clonedFrom?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventSummary {
  id: string;
  name: string;
  status: EventDocument['status'];
  scheduledAt?: string;
  updatedAt: string;
}

/**
 * resolveLayout — 13-ceremony-mo-rong.md §"Trách nhiệm 5". Sort layoutRefs theo priority giảm
 * dần, trả layoutId đầu tiên có 1 group match toàn bộ rule (AND trong group, OR giữa groups).
 * Trả `null` nếu không match gì — fail-soft (KHÔNG throw), caller (ceremony runtime) tự quyết
 * định hiển thị màn nền trung tính + log cảnh báo (07-luong-hoat-dong.md §"Trường hợp biên").
 *
 * Nhận `record` dạng "phẳng" (Record<string, string|number|undefined>) thay vì trực tiếp
 * CanonicalSubject/CanonicalGroup — caller tự chuẩn bị qua resolveCanonicalField cho từng attr
 * cần dùng trong rule, tách hàm thuần này khỏi việc biết cấu trúc Canonical cụ thể.
 */
export function resolveLayout(recordAttrs: Record<string, string | undefined>, layoutRefs: EventLayoutRef[]): string | null {
  const candidates = [...layoutRefs].sort((a, b) => (b.selector?.priority ?? 0) - (a.selector?.priority ?? 0));
  for (const ref of candidates) {
    const groups = ref.selector?.groups;
    if (!groups || groups.length === 0) return ref.layoutId;
    const matched = groups.some((g) => matchesAllRules(recordAttrs, g.rules));
    if (matched) return ref.layoutId;
  }
  return null;
}

function matchesAllRules(recordAttrs: Record<string, string | undefined>, rules: SelectorRule[]): boolean {
  if (rules.length === 0) return true;
  return rules.every((rule) => matchesRule(recordAttrs[rule.attr], rule));
}

function matchesRule(value: string | undefined, rule: SelectorRule): boolean {
  if (value == null) return false;
  switch (rule.op) {
    case 'equals':
      return value === rule.val;
    case 'contains':
      return value.includes(rule.val);
    case 'in':
      return rule.val.split(',').map((v) => v.trim()).includes(value);
    case 'gt':
      return Number(value) > Number(rule.val);
    case 'lt':
      return Number(value) < Number(rule.val);
    case 'gte':
      return Number(value) >= Number(rule.val);
    case 'lte':
      return Number(value) <= Number(rule.val);
    default: {
      const _exhaustive: never = rule.op;
      return _exhaustive;
    }
  }
}

/**
 * Pseudo-record cho LayoutRenderer khi render MÀN CHỜ (2026-07-21) — không có "người tham dự"
 * nào, chỉ có chính EventDocument. `full_name = event.name` là FALLBACK hiển thị (nhãn quản lý
 * nội bộ, KHÔNG phải "tên sự kiện đẹp") — mọi token thật trên layout màn chờ PHẢI qua
 * `EventLayoutRef.fieldMap` (map raw:name hoặc computed qua CustomVariable), KHÔNG tự suy đoán
 * thêm field nào khác từ EventDocument (quyết định "không thêm field cứng", 2026-07-21).
 */
export function eventToIdleRecord(event: EventDocument): CanonicalSubject {
  return {
    id: event.id,
    full_name: event.name,
    subjectType: 'event',
    extra: {},
  };
}

/**
 * Trạng thái vận hành runtime của 1 CanonicalRecord trong lễ (giai đoạn "bỏ Student", 2026-07-22)
 * — TÁCH BIỆT khỏi CanonicalSubject/CanonicalGroup (record = dữ liệu TĨNH từ DataSource, không
 * mang state). Sống trong 1 map { [recordId]: RecordRuntimeState } ở ceremonyStore/session,
 * KHÔNG persist vào bảng data_source_record (bảng dữ liệu nguồn, bất biến trừ khi re-import).
 *
 * Kế thừa đúng nhóm field "trạng thái vận hành" của Student cũ, BỎ `ts_checkin` (dead field,
 * không ai từng ghi) và `staff_presenter` (chưa có UI nhập liệu thật, chỉ là placeholder
 * template) — xác nhận qua khảo sát 2026-07-22, có thể thêm lại sau nếu phát sinh nhu cầu thật.
 */
export interface RecordRuntimeState {
  status: 'registered' | 'checked_in' | 'called' | 'on_stage' | 'returned' | 'absent';
  tsCalled?: string;
  tsOnStage?: string;
  tsReturned?: string;
  srcOnStage?: 'auto' | 'manual';
}

export const DEFAULT_RUNTIME_STATE: RecordRuntimeState = { status: 'registered' };

/**
 * Tính giá trị của mọi CustomVariable cho 1 record — Hướng B (chốt 2026-07-22, xem PHỤ LỤC
 * "Bỏ schema Student"): nhận object PHẲNG (Record<string, string|undefined>) thay vì trực tiếp
 * CanonicalRecord/Student, tách "cách lấy giá trị từ 1 record" khỏi "cách so khớp điều kiện" —
 * cùng 1 hàm so khớp dùng được cho MỌI nguồn (CanonicalRecord qua flatten core+extra, Student cũ
 * trong quá trình chuyển đổi, hay bất kỳ nguồn nào khác), chỉ cần viết đúng hàm "record → object
 * phẳng" riêng cho từng nguồn (xem flattenRecord ở api-logger.ts làm ví dụ).
 *
 * Mỗi biến: duyệt rules theo thứ tự, rule đầu tiên khớp thắng; hết vòng lặp → default.
 * `rule.attr` là tên field TỰ DO — tra trực tiếp trong `recordAttrs`, fail-soft nếu thiếu.
 */
export function resolveCustomVariables(
  recordAttrs: Record<string, string | undefined>,
  vars: CustomVariable[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of vars) {
    if (!v.key) continue;
    let result = v.default ?? '';
    for (const rule of v.rules || []) {
      if (matchesRule(recordAttrs[rule.attr], rule)) {
        result = rule.result;
        break;
      }
    }
    out[v.key] = result;
  }
  return out;
}
