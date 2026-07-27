import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius, shadow, spacing } from '@/ui';

import { ScoreHalf, ScoreTray, type ScoreColumnProps } from './ScoreColumn';

export interface ScoreBoardProps {
  /**
   * Os dois atletas em portrait; um só em landscape, onde o cronómetro fica entre eles. Cada um traz
   * o seu `align` — é o ecrã que sabe de que lado da pista está quem, e deitado o painel só vê um.
   */
  sides: ScoreColumnProps[];
  /** Landscape: sem margens verticais, e o painel ladeia o cronómetro em vez de o suceder. */
  compact?: boolean;
}

/**
 * O marcador: **um painel preto para os dois atletas**, com um fio a dividi-lo ao meio.
 *
 * Eram dois cartões brancos, cada um com a sua janela preta lá dentro — e ao lado do mostrador do
 * cronómetro, que é um painel a sério, liam-se como duas caixas por acabar. O ecrã passa a ter dois
 * aparelhos irmãos: o tempo em cima, o resultado em baixo, mesmo preto, mesmo raio, mesma borda.
 *
 * Os cartões e o `−` ocupam o **andar de baixo** do painel, separados do resultado por um fio e não
 * por um corte: cortada, a faixa passava a ser outra peça pousada por baixo — que é a leitura errada,
 * porque aqueles controlos são daquele resultado. O que os impede de parecer cartões enfiados dentro
 * do resultado é a casa: cada uma tem o seu preto e o seu canto, e o canto do painel é o canto da
 * casa que lá está.
 *
 * Os separadores verticais recolhem nas pontas de propósito: a toda a altura partiam o painel em
 * dois, que é exatamente o que este desenho deixou de querer dizer.
 *
 * Deitado não há painel único — o cronómetro fica **entre** as duas colunas, e um painel não se
 * parte ao meio para o deixar passar. Aí cada coluna leva o seu, com a mesma linguagem e sem fios.
 */
export function ScoreBoard({ sides, compact = false }: ScoreBoardProps) {
  return (
    <View style={[styles.board, compact ? styles.boardCompact : null]}>
      <View style={[styles.floor, styles.scoreFloor]}>
        {sides.map((side, index) => (
          <Fragment key={index}>
            {index > 0 ? <View style={[styles.divider, styles.dividerInset]} /> : null}
            <View style={styles.slot}>
              <ScoreHalf {...side} compact={compact} />
            </View>
          </Fragment>
        ))}
      </View>

      <View style={[styles.floor, styles.trayFloor]}>
        {sides.map((side, index) => (
          <Fragment key={index}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.slot}>
              <ScoreTray {...side} compact={compact} />
            </View>
          </Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * **Sem borda**, ao contrário do mostrador do cronómetro. Ali a borda tem trabalho — muda de cor
   * com a fase e pulsa enquanto o tempo corre. Aqui só tinha uma consequência: com `overflow:
   * hidden`, as casas são recortadas pela face **interior** dela, e sobrava sempre um anel escuro à
   * volta do cartão aceso. O cartão vai de aresta a aresta ou não vai — e um painel preto sobre
   * fundo quase branco não precisa de contorno nenhum para se definir.
   */
  board: {
    flex: 1,
    marginVertical: spacing.md,
    borderRadius: radius.r16,
    backgroundColor: colors.black,
    ...shadow.card,
    // É isto que dá o canto do painel à casa que lá está: o cartão aceso acaba na curva, e não num
    // quadrado por cima dela.
    overflow: 'hidden',
  },
  boardCompact: {
    marginVertical: 0,
  },
  floor: {
    flexDirection: 'row',
  },
  /** O andar de cima leva o que sobra da altura; o de baixo tem a altura das casas e mais nada. */
  scoreFloor: {
    flex: 1,
  },
  trayFloor: {
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopColor: colors.darkBorder,
  },
  slot: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
  },
  divider: {
    width: 1,
    backgroundColor: colors.darkBorder,
  },
  dividerInset: {
    marginVertical: spacing.md,
  },
});
