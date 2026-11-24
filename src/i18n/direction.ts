import { reloadAppAsync } from 'expo';
import { I18nManager } from 'react-native';

import i18n from '@/i18n';
import type { AppLanguage } from '@/i18n/language';
import { isRightToLeft } from '@/i18n/language';

export async function setAppLanguage(language: AppLanguage): Promise<void> {
  // changeLanguage emits 'languageChanged' even for the current language, which gives every
  // useTranslation() consumer a new `t`. Skipping the no-op call keeps `t` stable.
  if (i18n.resolvedLanguage !== language) await i18n.changeLanguage(language);

  const shouldBeRtl = isRightToLeft(language);
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== shouldBeRtl) {
    I18nManager.forceRTL(shouldBeRtl);
    await reloadAppAsync('my-money: language direction change');
  }
}
