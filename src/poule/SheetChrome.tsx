import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, colors, fonts, radius, spacing, type } from '@/ui';

/**
 * Métricas partilhadas pela classificação e pela matriz. Vivem juntas porque a diagonal da matriz
 * só fica alinhada enquanto a célula for quadrada — e porque as duas tabelas têm de ler-se como a
 * mesma família (`docs/poole-grelha-spec.md` §4, §7).
 */
export const SHEET_METRICS = {
  /** Célula de resultado: quadrada, 2.5rem da spec em pontos. */
  cell: 40,
  /** Coluna do número do atleta. */
  gutter: 24,
  /** Coluna do nome na matriz. Abaixo dos 10rem da spec — ver o comentário em `Grid.tsx`. */
  nameColumn: 120,
  /** Coluna numérica da classificação, que não precisa de ser quadrada. */
  stat: 38,
  headerHeight: 40,
  rowHeight: 40,
  /** Com clube, a linha do nome passa a ter duas linhas de texto. */
  rowHeightWithClub: 48,
} as const;

export interface SheetPanelProps {
  title: string;
  children: ReactNode;
}

/** Cartão de um bloco da folha: rótulo por cima, conteúdo dentro de uma moldura arredondada. */
export function SheetPanel({ title, children }: SheetPanelProps) {
  return (
    <View style={styles.panel}>
      <Text variant="label" color={colors.textMuted} style={styles.title}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * Estado vazio da spec §5: caixa tracejada com uma frase, nunca uma grelha sem linhas. Uma tabela
 * com cabeçalho e corpo vazio lê-se como "não carregou", não como "ainda não há dados".
 */
export function SheetEmpty({ message }: { message: string }) {
  return (
    <View style={styles.empty}>
      <Text variant="label" color={colors.textMuted} style={styles.emptyText}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.montserrat,
    fontSize: type.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  empty: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.grayDark,
    borderRadius: radius.r10,
  },
  emptyText: {
    textAlign: 'center',
  },
});
