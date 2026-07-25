import { Text as RNText, StyleSheet, type TextProps } from 'react-native';

import { colors, fonts, type } from './theme';

type Variant = 'display' | 'title' | 'subtitle' | 'body' | 'label' | 'caption';

export interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
}

/**
 * Montserrat para títulos e CTAs, Work Sans para corpo e etiquetas — regra do design system §2.
 */
export function Text({ variant = 'body', color, style, ...rest }: AppTextProps) {
  return <RNText {...rest} style={[styles[variant], color ? { color } : null, style]} />;
}

const styles = StyleSheet.create({
  display: {
    fontFamily: fonts.montserrat,
    fontSize: type.display,
    color: colors.dark,
  },
  title: {
    fontFamily: fonts.montserrat,
    fontSize: type.xxl,
    color: colors.dark,
  },
  subtitle: {
    fontFamily: fonts.montserrat,
    fontSize: type.subtitle,
    color: colors.green,
  },
  body: {
    fontFamily: fonts.workSans,
    fontSize: type.base,
    color: colors.dark,
  },
  label: {
    fontFamily: fonts.workSans,
    fontSize: type.sm,
    color: colors.dark,
  },
  caption: {
    fontFamily: fonts.workSans,
    fontSize: type.xs,
    // `grayDark` é *disabled text* e dava 1.77:1 sobre fundo claro. Sobre fundo escuro passa-se
    // `color={colors.textMutedOnDark}` à mão. Ver `contrast.test.ts`.
    color: colors.textMuted,
  },
});
