import { AR_PLURALS } from '../../src/spike/fixtures';

describe('Intl.PluralRules polyfill and i18next bootstrap', () => {
  it('loads Arabic rules before i18next and keeps English translations available', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Intl, 'PluralRules');
    if (!originalDescriptor?.configurable) {
      throw new Error('Intl.PluralRules cannot be temporarily removed in this runtime');
    }

    Object.defineProperty(Intl, 'PluralRules', {
      configurable: true,
      value: undefined,
      writable: true,
    });

    try {
      jest.doMock('expo-localization', () => ({
        getLocales: () => [{ languageCode: 'en' }],
      }));
      jest.isolateModules(() => {
        const { default: i18n } = require('../../src/i18n') as typeof import('../../src/i18n');
        expect(typeof Intl.PluralRules).toBe('function');
        expect(Intl.PluralRules.supportedLocalesOf(['ar', 'en'])).toHaveLength(2);
        expect(AR_PLURALS.map(([count]) => new Intl.PluralRules('ar').select(count))).toEqual(
          AR_PLURALS.map(([, category]) => category),
        );
        expect(i18n.t('app.title')).toBe('My Money');
        expect(i18n.t('app.subtitle')).toBe('Manage your money clearly, privately, and offline.');
      });
    } finally {
      Object.defineProperty(Intl, 'PluralRules', originalDescriptor);
    }
  });
});
