import i18next from 'i18next';
import { ensureTtsEngineI18n } from '@sky-app/tts-engine-ui';
import vi from './locales/vi.json';
import en from './locales/en.json';
import { readPersistedState } from './storage-key';

function readPersistedLanguage(): 'vi' | 'en' {
  const state = readPersistedState();
  const lang = state?.language;
  return lang === 'en' ? 'en' : 'vi';
}

// Đảm bảo i18next instance tồn tại + có sẵn chuỗi dùng chung (engineManager/deviceConfig/
// ttsStatus) — bất kể device-shell hay TTS Studio đã init trước hay chưa (apps mount
// theo nhu cầu, thứ tự không cố định). Xem doc trong @sky-app/tts-engine-ui's
// i18n-bootstrap.ts để hiểu vì sao KHÔNG được tự gọi `.init()` ở đây nữa — sẽ xoá mất
// resource nơi khác đã lỡ thêm trước.
ensureTtsEngineI18n();

// Thêm chuỗi RIÊNG của Ceremony vào CÙNG instance. overwrite=true vì vi.json/en.json là
// nguồn sự thật duy nhất cho các key này — an toàn ghi đè nếu module này được load lại
// (HMR lúc dev).
i18next.addResourceBundle('vi', 'translation', vi, true, true);
i18next.addResourceBundle('en', 'translation', en, true, true);

// Ngôn ngữ Ceremony đã lưu trước đó được áp dụng NGAY khi Ceremony mount, ghi đè lựa chọn
// mặc định mà device-shell/TTS Studio có thể đã set trước khi biết gì về Ceremony.
const persistedLang = readPersistedLanguage();
if (i18next.language !== persistedLang) {
  void i18next.changeLanguage(persistedLang);
}

export default i18next;
