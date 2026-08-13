import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ttsEngineLocales } from './locales.js';

/**
 * Đảm bảo namespace của package này có mặt trong i18next singleton, BẤT KỂ thứ tự các
 * package/app khởi tạo i18n trước sau.
 *
 * Bối cảnh cần hàm này: có NHIỀU nơi độc lập cần chuỗi của package này —
 * `packages/device-shell` (luôn mount trước mọi app, cho icon trạng thái TTS trên menu
 * bar), `modules/tts-studio`, và `modules/ceremony`. i18next là singleton toàn cục dùng
 * chung 1 process renderer, nên không thể mỗi nơi tự `.init()` độc lập — gọi `.init()`
 * lần 2 sẽ NẠP ĐÈ resources của lần đầu, xoá mất namespace bên kia đã thêm.
 *
 * Giải pháp: nơi gọi ĐẦU TIÊN mới thật sự `.init()` (khởi tạo instance rỗng); mọi nơi
 * SAU đó — kể cả nơi gọi đầu tiên — chỉ `addResourceBundle()` để LỚP thêm resource của
 * mình vào instance đang chạy, không đụng tới resource nơi khác đã thêm. An toàn gọi
 * nhiều lần (deep merge, không ghi đè key đã có).
 */
export function ensureTtsEngineI18n(): void {
  if (!i18next.isInitialized) {
    // resources rỗng — mỗi package tự thêm phần của mình ngay dưới đây, không có nơi
    // nào "sở hữu" toàn bộ bản dịch của app.
    void i18next.use(initReactI18next).init({
      resources: {},
      lng: 'vi',
      fallbackLng: 'vi',
      interpolation: { escapeValue: false },
    });
  }
  for (const lng of Object.keys(ttsEngineLocales) as Array<keyof typeof ttsEngineLocales>) {
    i18next.addResourceBundle(lng, 'translation', ttsEngineLocales[lng], true, false);
  }
}
