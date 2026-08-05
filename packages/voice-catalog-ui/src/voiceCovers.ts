const VOICE_COVER_COUNT = 61;

/**
 * Ảnh minh hoạ cho voice trong danh sách — thuần trang trí (vendor không cung cấp ảnh
 * riêng cho từng voice, gán ngẫu nhiên là được). Hash `id` thay vì random thật để cùng 1
 * voice luôn ra cùng 1 ảnh giữa các lần render/reload, không bị đổi ảnh liên tục gây rối mắt.
 *
 * Trả về path TƯƠNG ĐỐI (không có `/` hay `./` đầu) — host app (VoicePicker/VoicePickerPopover)
 * tự resolve qua `platform.assetUrl()`, vì path tuyệt đối bị Chromium resolve sai gốc khi
 * Electron loadFile() không phải từ dist/ gốc (cùng lý do apps/shell-electron/src/wallpapers.ts
 * dùng path tương đối thay vì `/wallpapers/...`).
 */
export function getVoiceCoverPath(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % VOICE_COVER_COUNT;
  return `voice-covers/cover-${String(index + 1).padStart(2, '0')}.webp`;
}
