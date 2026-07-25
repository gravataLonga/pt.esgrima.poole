import { StyleSheet, View } from 'react-native';

import { colors } from './theme';

export interface ProgressBarProps {
  /** 0..1. Valores fora do intervalo são cortados. */
  value: number;
  color?: string;
  trackColor?: string;
  height?: number;
}

/**
 * Barra de progresso do cronómetro e do avanço da poule. Decorativa: em ambos os sítios o valor
 * exato está escrito ao lado em texto, por isso não leva papel de acessibilidade próprio.
 */
export function ProgressBar({
  value,
  color = colors.green,
  trackColor = colors.grayMedium,
  height = 6,
}: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, value));

  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor }]}>
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
});
