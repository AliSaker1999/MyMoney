export type AppLanguage = 'en' | 'ar';

export function normalizeLanguage(languageCode: string | undefined): AppLanguage {
  return languageCode?.toLowerCase().split('-')[0] === 'ar' ? 'ar' : 'en';
}

export function isRightToLeft(language: AppLanguage): boolean {
  return language === 'ar';
}
