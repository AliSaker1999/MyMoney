import i18n from '@/i18n';
import { setAppLanguage } from '@/i18n/direction';

jest.mock('expo', () => ({ reloadAppAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));

describe('setAppLanguage', () => {
  it('does not emit languageChanged when the language is already active', async () => {
    await i18n.changeLanguage('en');
    const listener = jest.fn();
    i18n.on('languageChanged', listener);
    try {
      // Re-applying the saved language on startup must be a no-op. Emitting here gave every
      // useTranslation() consumer a new `t` and looped the security gate's settings load forever.
      await setAppLanguage('en');
      await setAppLanguage('en');
      expect(listener).not.toHaveBeenCalled();
    } finally {
      i18n.off('languageChanged', listener);
    }
  });
});
