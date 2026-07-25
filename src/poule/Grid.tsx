import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { Standing } from '@/api/types';
import { Text, colors, fonts, radius, type } from '@/ui';

import { SHEET_METRICS, SheetEmpty, SheetPanel } from './SheetChrome';
import type { PouleSheet, SheetCell } from './sheet';

export interface GridProps {
  sheet: PouleSheet;
  /**
   * Classificação **servida** por `GET /poules/{uuid}/standings` (contrato §7). As colunas de
   * estatística da direita são a mesma tabela, encostada à matriz; o cliente não as recalcula.
   * Vazia enquanto a classificação não chegar — a matriz não espera por ela.
   */
  standings: Standing[];
  /** Clube só aparece quando a poule pertence a um torneio (spec §9 da grelha). */
  showClubs: boolean;
}

const { cell, gutter, nameColumn, headerHeight, rowHeight, rowHeightWithClub } = SHEET_METRICS;

/**
 * A matriz clássica da folha de poule: linha = quem marcou, coluna = contra quem.
 *
 * Duas divergências deliberadas de `docs/poole-grelha-spec.md`, que descreve um ecrã de desktop:
 *
 * - **A coluna de nomes fica fixa** e só a matriz faz scroll horizontal. Numa poule de 6 a grelha
 *   tem mais do dobro da largura de um telemóvel; deixando o nome deslizar para fora, o número da
 *   linha desaparece com ele e deixa de se saber de quem é a linha que se está a ler.
 * - **Coluna de nome a 120 pt** em vez dos 10rem da spec, para sobrar largura de scroll útil.
 *
 * O que a spec fixa como estrutural mantém-se: célula quadrada de 40 pt (é o que alinha a
 * diagonal), diagonal preenchida a escuro, assalto por disputar em branco — nunca `0` — e o
 * separador verde de 2 pt a abrir o bloco de estatísticas.
 */
export function Grid({ sheet, standings, showClubs }: GridProps) {
  const { t } = useTranslation();
  const { fencers, cells } = sheet;

  if (fencers.length < 2) {
    return (
      <SheetPanel title={t('sheet.gridTitle')}>
        <SheetEmpty message={t('sheet.notEnoughFencers')} />
      </SheetPanel>
    );
  }

  const height = showClubs ? rowHeightWithClub : rowHeight;
  const placeOf = new Map(standings.map((standing) => [standing.fencer.id, standing]));

  return (
    <SheetPanel title={t('sheet.gridTitle')}>
      <View style={styles.frame}>
        <View style={styles.split}>
          {/* Coluna fixa: número e nome. */}
          <View>
            <View style={[styles.headerCell, styles.frozenHeader]}>
              <Text style={styles.headerLabel} numberOfLines={1}>
                {t('sheet.player')}
              </Text>
            </View>

            {fencers.map((fencer) => (
              <View key={fencer.id} style={[styles.frozenRow, { height }]}>
                <View style={styles.gutter}>
                  <Text style={styles.gutterNumber}>{fencer.number}</Text>
                </View>
                <View style={styles.nameCell}>
                  <Text style={styles.name} numberOfLines={1}>
                    {fencer.name}
                  </Text>
                  {showClubs ? (
                    <Text style={styles.club} numberOfLines={1}>
                      {fencer.club ?? '—'}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={[styles.headerCell, styles.headerRow]}>
                {fencers.map((fencer) => (
                  <View key={fencer.id} style={[styles.square, styles.headerSquare]}>
                    <Text style={styles.headerNumber}>{fencer.number}</Text>
                  </View>
                ))}
                {STAT_COLUMNS.map((column) => (
                  <View
                    key={column}
                    style={[
                      styles.square,
                      styles.headerSquare,
                      column === 'V' ? styles.statsEdge : null,
                    ]}
                  >
                    <Text style={[styles.headerLabel, column === 'V' ? styles.headerV : null]}>
                      {column}
                    </Text>
                  </View>
                ))}
              </View>

              {fencers.map((fencer, row) => {
                const standing = placeOf.get(fencer.id);

                return (
                  <View key={fencer.id} style={[styles.bodyRow, { height }]}>
                    {fencers.map((opponent, column) => (
                      <ResultCell
                        key={opponent.id}
                        cell={cells[row]![column]!}
                        rowFencer={fencer.name}
                        columnFencer={opponent.name}
                      />
                    ))}

                    <Stat value={standing?.victories} emphasis edge />
                    <Stat value={standing?.given} />
                    <Stat value={standing?.received} />
                    <Stat value={standing?.diff} signed />
                    <Stat value={standing?.place} emphasis />
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </SheetPanel>
  );
}

const STAT_COLUMNS = ['V', 'TS', 'TR', 'Ind', 'Pl.'] as const;

interface ResultCellProps {
  cell: SheetCell;
  rowFencer: string;
  columnFencer: string;
}

function ResultCell({ cell, rowFencer, columnFencer }: ResultCellProps) {
  const { t } = useTranslation();

  if (cell.kind === 'self') {
    return <View style={[styles.square, styles.diagonal]} />;
  }

  if (cell.kind === 'empty') {
    // Sem rótulo de acessibilidade: uma poule de 6 tem 15 células vazias e anunciá-las todas
    // enterrava os resultados que interessam.
    return <View style={styles.square} />;
  }

  return (
    <View
      accessible
      accessibilityLabel={t('sheet.cellLabel', {
        row: rowFencer,
        column: columnFencer,
        given: cell.given,
        received: cell.received,
      })}
      style={styles.square}
    >
      <Text style={styles.given}>{cell.given}</Text>
    </View>
  );
}

interface StatProps {
  value: number | undefined;
  /** V e Pl. são as duas colunas que o árbitro lê em voz alta. */
  emphasis?: boolean;
  /** Indicador: mostra sempre o sinal. */
  signed?: boolean;
  /** Abre o bloco de estatísticas com o separador verde. */
  edge?: boolean;
}

function Stat({ value, emphasis, signed, edge }: StatProps) {
  const text = value === undefined ? '' : signed && value > 0 ? `+${value}` : value.toString();

  return (
    <View style={[styles.square, edge ? styles.statsEdge : null]}>
      <Text style={[styles.stat, emphasis ? styles.statEmphasis : null]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 1,
    borderColor: colors.grayMedium,
    borderRadius: radius.r10,
    overflow: 'hidden',
  },
  split: {
    flexDirection: 'row',
  },
  headerCell: {
    height: headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark,
  },
  frozenHeader: {
    width: gutter + nameColumn,
    paddingLeft: gutter,
  },
  headerRow: {
    // Hairline a separar a coluna fixa da matriz — sem isto, ao deslizar, os números da primeira
    // coluna encostam ao nome e leem-se como parte dele.
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.darkBorder,
  },
  headerSquare: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.darkBorder,
  },
  headerLabel: {
    fontFamily: fonts.montserrat,
    fontSize: type.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.light,
  },
  headerV: {
    color: colors.green,
  },
  headerNumber: {
    fontFamily: fonts.montserrat,
    fontSize: type.sm,
    color: colors.light,
    fontVariant: ['tabular-nums'],
  },
  frozenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.grayMedium,
    backgroundColor: colors.light,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.grayMedium,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.grayMedium,
    backgroundColor: colors.light,
  },
  gutter: {
    width: gutter,
    alignItems: 'center',
  },
  gutterNumber: {
    fontFamily: fonts.montserrat,
    fontSize: type.sm,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  nameCell: {
    width: nameColumn,
    paddingRight: 6,
  },
  name: {
    fontFamily: fonts.workSansBold,
    fontSize: type.sm,
    color: colors.dark,
  },
  club: {
    fontFamily: fonts.workSans,
    fontSize: type.xs,
    color: colors.textMuted,
  },
  square: {
    width: cell,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.grayMedium,
  },
  diagonal: {
    backgroundColor: colors.dark,
  },
  statsEdge: {
    borderLeftWidth: 2,
    borderLeftColor: colors.green,
  },
  given: {
    fontFamily: fonts.montserrat,
    fontSize: type.sm,
    color: colors.dark,
    fontVariant: ['tabular-nums'],
  },
  stat: {
    fontFamily: fonts.workSans,
    fontSize: type.sm,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  statEmphasis: {
    fontFamily: fonts.montserrat,
    color: colors.dark,
  },
});
