// parseSpreadsheet — Giai đoạn 4a kế hoạch Event.

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSpreadsheet } from './parseSpreadsheet.js';

function csvToBuffer(csv: string): ArrayBuffer {
  return new TextEncoder().encode(csv).buffer as ArrayBuffer;
}

function xlsxToBuffer(rows: Array<Record<string, string>>): ArrayBuffer {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('parseSpreadsheet — CSV', () => {
  it('parse đúng cột + dòng từ CSV đơn giản', () => {
    const csv = 'ho_ten,masv,gpa\nNguyễn Văn A,SV001,3.8\nTrần Thị B,SV002,3.5';
    const result = parseSpreadsheet(csvToBuffer(csv));
    expect(result.columns).toEqual(['ho_ten', 'masv', 'gpa']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ ho_ten: 'Nguyễn Văn A', masv: 'SV001', gpa: '3.8' });
  });

  it('file rỗng (chỉ header, không có dòng dữ liệu) → rows rỗng nhưng columns rỗng (không có dòng nào để suy ra cột)', () => {
    const result = parseSpreadsheet(csvToBuffer('ho_ten,masv'));
    expect(result.rows).toEqual([]);
  });
});

describe('parseSpreadsheet — XLSX', () => {
  it('parse đúng cột + dòng từ file XLSX thật (tạo qua SheetJS)', () => {
    const buffer = xlsxToBuffer([
      { ho_ten: 'Nguyễn Văn A', masv: 'SV001' },
      { ho_ten: 'Trần Thị B', masv: 'SV002' },
    ]);
    const result = parseSpreadsheet(buffer);
    expect(result.columns).toEqual(['ho_ten', 'masv']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toEqual({ ho_ten: 'Trần Thị B', masv: 'SV002' });
  });
});

describe('parseSpreadsheet — trường hợp biên', () => {
  it('sheet đầu tiên rỗng (không có dòng nào) → trả columns/rows rỗng, không throw', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    expect(() => parseSpreadsheet(buffer)).not.toThrow();
    const result = parseSpreadsheet(buffer);
    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
  });
});
