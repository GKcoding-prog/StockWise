import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@stockwise/shared';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/common.json';
import fr from './locales/fr/common.json';

const STORAGE_KEY = 'stockwise.locale';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (SUPPORTED_LOCALES as readonly string[]).includes(saved)) return saved as Locale;
  } catch {
    // storage unavailable (private mode, tests) — fall back to default
  }
  return DEFAULT_LOCALE;
}

void i18n.use(initReactI18next).init({
  resources: { fr: { common: fr }, en: { common: en } },
  lng: initialLocale(),
  fallbackLng: 'fr',
  defaultNS: 'common',
  interpolation: { escapeValue: false }, // React already escapes
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // ignore
  }
});

export default i18n;
