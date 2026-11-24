import type { ComponentProps } from 'react';
import type { TextStyle } from 'react-native';

import { LocalizedText } from '@/i18n/LocalizedText';
import { type, useTokens, type ColorTokens, type TypeVariant } from '@/ui/theme';

export type TextTone =
  | 'default'
  | 'secondary'
  | 'muted'
  | 'primary'
  | 'positive'
  | 'negative'
  | 'warning'
  | 'hero'
  | 'heroMuted'
  | 'onPrimary';

const toneColor = (tokens: ColorTokens, tone: TextTone): string => {
  switch (tone) {
    case 'secondary': return tokens.textSecondary;
    case 'muted': return tokens.textMuted;
    case 'primary': return tokens.primary;
    case 'positive': return tokens.positive;
    case 'negative': return tokens.negative;
    case 'warning': return tokens.warning;
    case 'hero': return tokens.heroText;
    case 'heroMuted': return tokens.heroTextMuted;
    case 'onPrimary': return tokens.onPrimary;
    default: return tokens.text;
  }
};

type Props = Omit<ComponentProps<typeof LocalizedText>, 'variant'> & {
  variant?: TypeVariant;
  tone?: TextTone;
  /** Tabular figures so columns of amounts line up. */
  numeric?: boolean;
  align?: TextStyle['textAlign'];
  uppercase?: boolean;
};

export function AppText({
  variant = 'body',
  tone = 'default',
  numeric = false,
  align,
  uppercase = false,
  style,
  ...props
}: Props) {
  const tokens = useTokens();
  return (
    <LocalizedText
      {...props}
      style={[
        type[variant],
        { color: toneColor(tokens, tone) },
        numeric ? { fontVariant: ['tabular-nums'] } : null,
        align ? { textAlign: align } : null,
        uppercase ? { textTransform: 'uppercase' } : null,
        style,
      ]}
    />
  );
}
