import 'intl-pluralrules';

import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { normalizeLanguage } from '@/i18n/language';
import { resources } from '@/i18n/resources';

export { resources } from '@/i18n/resources';

const i18n = createInstance();
const deviceLanguage = normalizeLanguage(getLocales()[0]?.languageCode ?? undefined);

void i18n.use(initReactI18next).init({
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false },
  lng: deviceLanguage,
  resources,
  supportedLngs: ['en', 'ar'],
});

export default i18n;
