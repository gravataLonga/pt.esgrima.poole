import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing, type } from './theme';

type Tone = 'green' | 'dark' | 'gray' | 'success' | 'danger' | 'warning';

export interface BadgeProps {
  label: string;
  tone?: Tone;
}

/** Badges do design system §9. */
export function Badge({ label, tone = 'gray' }: BadgeProps) {
  return (
    <View style={[styles.base, containerStyles[tone]]}>
      <Text style={[styles.label, labelStyles[tone]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  label: {
    fontFamily: fonts.montserrat,
    fontSize: type.xs,
  },
});

const containerStyles = StyleSheet.create({
  green: { backgroundColor: colors.green, borderColor: colors.green },
  dark: { backgroundColor: colors.dark, borderColor: colors.dark },
  gray: { backgroundColor: colors.grayLight, borderColor: colors.grayDark },
  success: { backgroundColor: colors.lightSuccess, borderColor: colors.success },
  danger: { backgroundColor: colors.lightDanger, borderColor: colors.danger },
  warning: { backgroundColor: colors.lightWarning, borderColor: colors.warning },
});

// A 12 pt sobre os fundos claros de estado, as cores de sinalização não chegam a 4.5:1 — daí as
// variantes `*Text`. As bordas continuam a usar a cor original. Ver `contrast.test.ts`.
const labelStyles = StyleSheet.create({
  green: { color: colors.dark },
  dark: { color: colors.light },
  gray: { color: colors.dark },
  success: { color: colors.successText },
  danger: { color: colors.dangerText },
  warning: { color: colors.warningText },
});
