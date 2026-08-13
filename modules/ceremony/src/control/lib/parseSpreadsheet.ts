// parseSpreadsheet — Giai đoạn 4a kế hoạch Event (wizard Bước 2: import file). Đọc CSV/XLSX qua
// cùng 1 API (SheetJS tự nhận diện định dạng theo nội dung, không cần rẽ nhánh theo đuôi file).
//
// Đặt ở modules/ceremony (KHÔNG đặt ở packages/slide-shared) — quyết định chốt 2026-07-19:
// apps/shell-electron/electron.vite.config.ts's externalizeDepsPlugin exclude ĐÚNG 1 package
// duy nhất là @sky-app/slide-shared (bundle inline vào Electron main process). Main process
// KHÔNG cần parse spreadsheet (việc của renderer/wizard UI) — đặt xlsx ở slide-shared sẽ kéo
// dependency thừa vào main process không cần thiết, lặp lại đúng bài học đã rút ra từ vụ
// bufferutil/RichTextContent (xem docs plan, phụ lục "Bug thật phát hiện SAU khi báo cáo xong").

import * as XLSX from 'xlsx';

export interface ParsedSpreadsheet {
  /** Tên cột thô từ file (dòng header đầu tiên). */
  columns: string[];
  rows: Array<Record<string, string>>;
}

/**
 * `raw: false` — ép SheetJS format số/ngày thành chuỗi hiển thị (khớp cách Excel hiện ra),
 * tránh lệch định dạng (VD ngày sinh thành số serial Excel) khi đưa qua applyMapping.
 * `codepage: 65001` — ÉP UTF-8 khi đọc CSV (bug thật phát hiện qua test: không set sẽ đọc CSV
 * thô theo codepage mặc định của SheetJS, làm hỏng ký tự tiếng Việt có dấu — "Nguyễn" thành
 * "Nguyá»n"). Không ảnh hưởng XLSX (đã tự khai encoding trong file, cờ này chỉ áp dụng khi
 * SheetJS phải TỰ ĐOÁN encoding, tức trường hợp CSV thô).
 */
export function parseSpreadsheet(buffer: ArrayBuffer): ParsedSpreadsheet {
  const workbook = XLSX.read(buffer, { type: 'array', codepage: 65001 });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { columns: [], rows: [] };
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false, defval: '' });
  const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
  return { columns, rows };
}
