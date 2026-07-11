// SYNC: keep identical to electron/lib/customVariables.ts (chỉ khác dòng import Student)
import type { Student, CustomVariable, VarRuleOp } from '@sky-app/slide-shared';

// Ánh xạ nhãn thuộc tính (tiếng Việt, dùng trong UI) sang field của Student.
// Trùng khớp với danh sách attr của bộ điều kiện phân giọng (getVoiceForStudent),
// bổ sung thêm 'GPA' để dùng các toán tử so sánh số.
export const ATTR_FIELD_MAP: Record<string, keyof Student> = {
  'Giới tính': 'gender',
  'Xếp loại': 'classification',
  'Ngành': 'major_name',
  'Khoa': 'faculty_name',
  'Lớp': 'class_code',
  'Khóa': 'course_code',
  'Họ tên': 'full_name',
  'GPA': 'gpa',
};

function matchRule(studentVal: string, op: VarRuleOp, ruleVal: string): boolean {
  const a = studentVal.trim().toLowerCase();
  const b = ruleVal.trim().toLowerCase();
  switch (op) {
    case 'equals':
      return a === b;
    case 'contains':
      return b !== '' && a.includes(b);
    case 'in':
      return ruleVal
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .includes(a);
    case 'gt':
    case 'lt':
    case 'gte':
    case 'lte': {
      const x = parseFloat(studentVal);
      const y = parseFloat(ruleVal);
      if (Number.isNaN(x) || Number.isNaN(y)) return false;
      if (op === 'gt') return x > y;
      if (op === 'lt') return x < y;
      if (op === 'gte') return x >= y;
      return x <= y;
    }
    default:
      return false;
  }
}

/**
 * Tính giá trị của tất cả biến điều kiện tùy chỉnh cho một sinh viên.
 * Mỗi biến: duyệt rules theo thứ tự, rule đầu tiên khớp thắng; hết vòng lặp → default.
 * Trả object { [key]: result } để renderTemplate tra cứu.
 */
export function resolveCustomVariables(
  student: Student,
  vars: CustomVariable[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of vars) {
    if (!v.key) continue;
    let result = v.default ?? '';
    for (const rule of v.rules || []) {
      const field = ATTR_FIELD_MAP[rule.attr];
      const studentVal = field != null ? String(student[field] ?? '') : '';
      if (matchRule(studentVal, rule.op, rule.val)) {
        result = rule.result;
        break;
      }
    }
    out[v.key] = result;
  }
  return out;
}
