import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { z } from 'zod';
import zodEn from 'zod/v4/locales/en.js';
import zodFr from 'zod/v4/locales/fr.js';
import enAuth from '@/locales/en/auth.json';
import enCommon from '@/locales/en/common.json';
import enDashboard from '@/locales/en/dashboard.json';
import enErrors from '@/locales/en/errors.json';
import enInventory from '@/locales/en/inventory.json';
import enProducts from '@/locales/en/products.json';
import enPurchases from '@/locales/en/purchases.json';
import enSettings from '@/locales/en/settings.json';
import enSuppliers from '@/locales/en/suppliers.json';
import enValidation from '@/locales/en/validation.json';
import frAuth from '@/locales/fr/auth.json';
import frCommon from '@/locales/fr/common.json';
import frDashboard from '@/locales/fr/dashboard.json';
import frErrors from '@/locales/fr/errors.json';
import frInventory from '@/locales/fr/inventory.json';
import frProducts from '@/locales/fr/products.json';
import frPurchases from '@/locales/fr/purchases.json';
import frSettings from '@/locales/fr/settings.json';
import frSuppliers from '@/locales/fr/suppliers.json';
import frValidation from '@/locales/fr/validation.json';

export const resources = {
  fr: {
    common: frCommon,
    errors: frErrors,
    validation: frValidation,
    auth: frAuth,
    dashboard: frDashboard,
    products: frProducts,
    purchases: frPurchases,
    inventory: frInventory,
    suppliers: frSuppliers,
    settings: frSettings,
  },
  en: {
    common: enCommon,
    errors: enErrors,
    validation: enValidation,
    auth: enAuth,
    dashboard: enDashboard,
    products: enProducts,
    purchases: enPurchases,
    inventory: enInventory,
    suppliers: enSuppliers,
    settings: enSettings,
  },
} as const;

const STORAGE_KEY = 'sw.lang';

function storedLanguage(): 'fr' | 'en' | undefined {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'fr' || v === 'en' ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Zod's built-in messages follow the UI language too. */
function configureZod(lng: string) {
  // Import only the two locales: z.locales would bundle all ~40 languages.
  z.config(lng === 'en' ? zodEn() : zodFr());
}

void i18n.use(initReactI18next).init({
  resources,
  lng: storedLanguage() ?? 'fr', // French is the default for Burundi (docs/06 §4)
  fallbackLng: 'fr',
  ns: Object.keys(resources.fr),
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});
configureZod(i18n.language);
i18n.on('languageChanged', (lng) => {
  configureZod(lng);
  document.documentElement.lang = lng;
});

/** Explicit choice from the language toggle; remembered on this device. */
export function chooseLanguage(lng: 'fr' | 'en'): void {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // private mode: the choice just won't persist
  }
  void i18n.changeLanguage(lng);
}

/** Language from the user's or business's preference, unless chosen on this device. */
export function applyPreferredLanguage(preferred: string | null | undefined): void {
  if (storedLanguage()) return;
  if (preferred === 'fr' || preferred === 'en') void i18n.changeLanguage(preferred);
}

export default i18n;
