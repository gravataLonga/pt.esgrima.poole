import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, spacing } from './theme';

export interface ScreenProps {
  children: ReactNode;
  /** `dark` para o ecrã de ligar (fundo escuro do design system §11). */
  tone?: 'light' | 'dark';
  edges?: readonly Edge[];
  padded?: boolean;
}

export function Screen({
  children,
  tone = 'light',
  edges = ['top', 'bottom'],
  padded = true,
}: ScreenProps) {
  return (
    <SafeAreaView style={[styles.safe, tone === 'dark' ? styles.dark : styles.light]} edges={edges}>
      {/* O estilo da barra de estado depende do fundo do ecrã, por isso vive aqui e não no
          layout de raiz — fixá-lo lá dava relógio branco sobre fundo claro. */}
      <StatusBar style={tone === 'dark' ? 'light' : 'dark'} />
      <View style={[styles.content, padded ? styles.padded : null]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  light: {
    backgroundColor: colors.light,
  },
  dark: {
    backgroundColor: colors.dark,
  },
  content: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
