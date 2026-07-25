import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing, type } from './theme';

type Tone = 'info' | 'success' | 'warning' | 'danger';

export interface BannerProps {
  message: string;
  tone?: Tone;
  /**
   * Metade do respiro vertical. Para o ecrã de assalto em landscape, onde há 390 pt de altura para
   * cronómetro, controlos e dois resultados — e um banner à altura cheia empurrava o botão de
   * submeter para fora do ecrã.
   */
  compact?: boolean;
}

/** Alertas do design system §8. Usado nos banners permanentes de `READ_ONLY` e offline. */
export function Banner({ message, tone = 'info', compact = false }: BannerProps) {
  return (
    <View style={[styles.base, compact ? styles.compact : null, containerStyles[tone]]}>
      <Text style={[styles.message, compact ? styles.messageCompact : null, textStyles[tone]]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    padding: spacing.md,
    borderRadius: radius.r4,
    borderWidth: 1,
  },
  compact: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
  },
  message: {
    fontFamily: fonts.workSansBold,
    fontSize: type.sm,
  },
  messageCompact: {
    fontSize: type.xs,
    lineHeight: type.base,
  },
});

const containerStyles = StyleSheet.create({
  info: { backgroundColor: colors.grayLight, borderColor: colors.grayDark },
  success: { backgroundColor: colors.lightSuccess, borderColor: colors.success },
  warning: { backgroundColor: colors.lightWarning, borderColor: colors.warning },
  danger: { backgroundColor: colors.lightDanger, borderColor: colors.danger },
});

// Mesma razão do `Badge`: a 14 pt as cores de sinalização não passam AA sobre o próprio fundo.
const textStyles = StyleSheet.create({
  info: { color: colors.dark },
  success: { color: colors.successText },
  warning: { color: colors.warningText },
  danger: { color: colors.dangerText },
});
