import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { LocalizedText } from '@/i18n/LocalizedText';
import { resources } from '@/i18n/resources';

describe('LocalizedText direction', () => {
  it.each([
    ['en', 'ltr'],
    ['ar', 'rtl'],
  ] as const)('sets %s text direction to %s', async (language, direction) => {
    const instance = createInstance();
    await instance.init({
      initAsync: false,
      lng: language,
      resources,
      fallbackLng: 'en',
    });

    const screen = await render(
      <I18nextProvider i18n={instance}>
        <LocalizedText testID="localized-label" variant="bodyMedium">
          Direction check
        </LocalizedText>
      </I18nextProvider>,
    );

    expect(
      StyleSheet.flatten(screen.getByTestId('localized-label').props.style),
    ).toMatchObject({ writingDirection: direction });
  });
});
