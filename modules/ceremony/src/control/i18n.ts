import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import vi from './locales/vi.json';
import en from './locales/en.json';
import { readPersistedState } from './storage-key';

function readPersistedLanguage(): 'vi' | 'en' {
  const state = readPersistedState();
  const lang = state?.language;
  return lang === 'en' ? 'en' : 'vi';
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
