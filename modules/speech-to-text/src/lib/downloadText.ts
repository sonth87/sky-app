/** Tải 1 chuỗi text xuống dạng file .txt — cùng kỹ thuật Blob + anchor mà
 * modules/tts-studio's HistoryList.tsx dùng để tải WAV, chỉ đổi mime type. */
export function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
