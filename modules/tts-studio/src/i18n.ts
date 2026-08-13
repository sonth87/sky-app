import { ensureTtsEngineI18n } from '@sky-app/tts-engine-ui';

/**
 * i18n riêng của TTS Studio.
 *
 * Vì sao cần: UI quản lý engine (@sky-app/tts-engine-ui) dùng react-i18next — nó vốn
 * được tách ra từ Ceremony, nơi i18n đã có sẵn. Để dùng chung đúng nghĩa thay vì fork
 * một bản không-i18n, TTS Studio khởi tạo instance của riêng mình nếu chưa ai làm.
 *
 * PHẠM VI: hiện chỉ chứa chuỗi của UI engine. Phần chữ còn lại trong app vẫn đang
 * hardcode tiếng Việt — CỐ TÌNH chưa động tới để không phình diff; muốn đa ngôn ngữ
 * toàn app thì làm thành một việc riêng.
 *
 * `ensureTtsEngineI18n()` an toàn gọi từ nhiều nơi (device-shell, Ceremony cũng gọi
 * hàm này) bất kể ai chạy trước — xem doc comment trong package đó.
 */
ensureTtsEngineI18n();
