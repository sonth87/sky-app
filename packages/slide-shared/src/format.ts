/**
 * Tiện ích định dạng dùng chung.
 */

/** Định dạng ngày ISO "2002-03-15" -> "15/03/2002" */
export function formatDateVI(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Định dạng datetime ISO UTC -> "HH:mm:ss DD/MM" theo giờ địa phương */
export function formatTimeVI(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${hh}:${mi}:${ss} ${dd}/${mm}`;
}

/** Định dạng GPA -> 1 chữ số thập phân, ví dụ 9 -> "9.0" */
export function formatGpa(gpa: number | null | undefined): string {
  if (gpa == null) return '';
  return gpa.toFixed(2).replace('.', ',');
}

/** Tên hiển thị viết hoa toàn bộ (backdrop) */
export function displayName(fullName: string): string {
  return fullName.trim().toUpperCase();
}

/** Dự đoán giới tính tiếng Việt dựa trên họ tên */
export function detectGender(fullName: string | null | undefined): 'Nam' | 'Nữ' {
  if (!fullName) return 'Nam';
  const cleanName = fullName.trim().toUpperCase();
  
  // Kiểm tra từ đệm "THỊ" tiêu biểu của Nữ
  if (/\bTHỊ\b/.test(cleanName)) {
    return 'Nữ';
  }
  // Kiểm tra từ đệm "VĂN" tiêu biểu của Nam
  if (/\bVĂN\b/.test(cleanName)) {
    return 'Nam';
  }
  
  // Tách từ để lấy tên chính ở cuối
  const words = cleanName.split(/\s+/);
  if (words.length === 0) return 'Nam';
  const firstName = words[words.length - 1]!; // an toàn: words.length > 0 đã guard ở trên
  
  // Một số tên Nữ phổ biến thường không đi kèm "Thị"
  const femaleNames = new Set([
    'VY', 'NHI', 'TRANG', 'LINH', 'CHI', 'DIỆP', 'HÀ', 'HẰNG', 'HIỀN', 
    'LAN', 'MAI', 'MY', 'NGA', 'OANH', 'PHƯƠNG', 'QUỲNH', 'THẢO', 'THƯ', 'TÚ', 
    'VÂN', 'YẾN', 'NGỌC', 'THU', 'PHƯỢNG', 'HƯƠNG', 'LIÊN', 'BÍCH', 'TUYẾT', 
    'DUYÊN', 'TRINH', 'KIỀU', 'CÚC', 'HUỆ', 'ĐÀO', 'MƠ', 'MẬN', 'HOA',
    'HỒNG', 'HUYỀN', 'ANH', 'ÁNH', 'LIÊN', 'NGA', 'BÍCH'
  ]);
  
  if (femaleNames.has(firstName)) {
    return 'Nữ';
  }
  
  return 'Nam';
}
