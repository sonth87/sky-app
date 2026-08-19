/** `StudioVoice.language` là tên tiếng Anh ("Vietnamese"/"English", xem
 *  `languageFromSourceLang` ở service-contracts/src/tts.ts) — dịch sang tiếng Việt cho UI. Tên
 *  lạ (chưa có trong bảng) hiện nguyên văn thay vì đoán bừa. */
const VI_LABELS: Record<string, string> = {
  Vietnamese: 'Tiếng Việt',
  English: 'Tiếng Anh',
};

export function toVietnameseLanguageLabel(language: string | null | undefined): string | undefined {
  if (!language) return undefined;
  return VI_LABELS[language] ?? language;
}
