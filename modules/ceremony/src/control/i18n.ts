import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import vi from './locales/vi.json';
import en from './locales/en.json';

const STORAGE_KEY = 'ceremony-control-storage';

function readPersistedLanguage(): 'vi' | 'en' {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 'vi';
    const parsed = JSON.parse(raw);
    const lang = parsed?.state?.language;
    return lang === 'en' ? 'en' : 'vi';
  } catch {
    return 'vi';
  }
}

i18next.use(initReactI18next).init({
  resources: {
    vi: { translation: vi },
    en: { translation: en },
  },
  lng: readPersistedLanguage(),
  fallbackLng: 'vi',
  interpolation: { escapeValue: false },
});

export default i18next;
