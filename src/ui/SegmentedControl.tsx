import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, shadow, spacing, type } from './theme';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Lido pelo VoiceOver antes das opções — o grupo precisa de nome próprio. */
  accessibilityLabel: string;
}

/**
 * Segmented control ao estilo iOS: calha cinzenta, segmento ativo em pastilha branca elevada.
 * O design system não tem equivalente — é um padrão de plataforma, e trocar uma vista pela outra
 * com dois botões soltos leria como "duas ações" em vez de "dois modos".
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.track}>
      {segments.map((segment) => {
        const selected = segment.value === value;

        return (
          <Pressable
            key={segment.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(segment.value)}
            style={({ pressed }) => [
              styles.segment,
              selected ? styles.segmentSelected : null,
              pressed && !selected ? styles.segmentPressed : null,
            ]}
          >
            <Text style={[styles.label, selected ? styles.labelSelected : null]}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 3,
    gap: 3,
    borderRadius: radius.r10,
    backgroundColor: colors.grayLight,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.r6 + 2,
  },
  segmentSelected: {
    backgroundColor: colors.light,
    ...shadow.card,
  },
  segmentPressed: {
    backgroundColor: colors.grayMedium,
  },
  label: {
    fontFamily: fonts.workSansBold,
    fontSize: type.sm,
    color: colors.textMuted,
  },
  labelSelected: {
    fontFamily: fonts.montserrat,
    color: colors.dark,
  },
});
