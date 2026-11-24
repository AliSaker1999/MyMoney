import type { ComponentProps } from 'react';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { normalizeLanguage } from '@/i18n/language';

export function LocalizedText({ style, ...props }: ComponentProps<typeof Text>) {
  const { i18n } = useTranslation();
  const language = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);

  return (
    <Text
      {...props}
      style={[
        {
          writingDirection: language === 'ar' ? 'rtl' : 'ltr',
        },
        style,
      ]}
    />
  );
}
