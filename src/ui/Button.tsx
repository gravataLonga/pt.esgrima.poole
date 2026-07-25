import { Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';

import { colors, fonts, radius, spacing, touch, type } from './theme';

/**
 * O design system §5 tem **duas** variantes secundárias, uma por tipo de fundo: `secondary`
 * (borda e texto escuros, para fundo claro) e `secondaryOnDark` (verdes, para fundo escuro).
 * Usar a errada torna o botão invisível.
 */
type Variant = 'primary' | 'secondary' | 'secondaryOnDark' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: Variant;
  /**
   * `compact` baixa dos 48 pt para os 44 pt das HIG. Para ecrãs com muitos controlos empilhados —
   * o de assalto tem cinco — onde botões à altura cheia somam mais peso do que importância.
   */
  size?: 'regular' | 'compact';
  /** Texto explicativo por baixo — usado para dizer *porque* é que o botão está desativado. */
  hint?: string;
}

/**
 * Botões do design system §5. Em RN não há `hover`: o estado equivalente é `pressed`,
 * mapeado para a cor de hover da web (`medium-green` / ghost verde).
 */
export function Button({
  label,
  variant = 'primary',
  size = 'regular',
  hint,
  disabled,
  ...rest
}: ButtonProps) {
  const compact = size === 'compact';

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        style={({ pressed }) => [
          styles.base,
          compact ? styles.compact : null,
          styles[variant],
          pressed && !disabled ? pressedStyles[variant] : null,
          disabled ? styles.disabled : null,
        ]}
        {...rest}
      >
        <Text style={[styles.label, compact ? styles.labelCompact : null, labelStyles[variant]]}>
          {label}
        </Text>
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.min,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.r4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  compact: {
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
  },
  primary: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderColor: colors.dark,
  },
  secondaryOnDark: {
    backgroundColor: 'transparent',
    borderColor: colors.green,
  },
  danger: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontFamily: fonts.montserrat,
    fontSize: type.base,
  },
  labelCompact: {
    fontSize: type.sm + 1,
  },
  hint: {
    fontFamily: fonts.workSans,
    fontSize: type.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});

const pressedStyles = StyleSheet.create({
  primary: { backgroundColor: colors.mediumGreen, borderColor: colors.mediumGreen },
  secondary: { backgroundColor: colors.grayLight },
  secondaryOnDark: { backgroundColor: colors.green4 },
  danger: { backgroundColor: colors.danger, opacity: 0.85 },
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.dark },
  secondary: { color: colors.dark },
  secondaryOnDark: { color: colors.green },
  danger: { color: colors.light },
});
