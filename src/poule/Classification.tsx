import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text, colors, fonts, radius, spacing, type } from '@/ui';

import { SHEET_METRICS, SheetEmpty, SheetPanel } from './SheetChrome';
import type { Standing } from './sheet';

export interface ClassificationProps {
  standings: Standing[];
  showClubs: boolean;
}

const { stat, headerHeight } = SHEET_METRICS;

/**
 * Tabela de classificação (`docs/poole-grelha-spec.md` §3), ordenada por lugar.
 *
 * `Done` e `Missing` ficam de fora: a spec já as esconde abaixo de 640px e nenhum telemóvel chega
 * lá. O que sobra — V, TS, TR, Ind — cabe sem scroll, que é o que torna esta tabela consultável
 * de relance entre assaltos.
 */
export function Classification({ standings, showClubs }: ClassificationProps) {
  const { t } = useTranslation();

  if (standings.length < 2) {
    return (
      <SheetPanel title={t('sheet.classificationTitle')}>
        <SheetEmpty message={t('sheet.notEnoughFencers')} />
      </SheetPanel>
    );
  }

  return (
    <SheetPanel title={t('sheet.classificationTitle')}>
      <View style={styles.frame}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerLabel, styles.placeColumn]}>#</Text>
          <Text style={[styles.headerLabel, styles.nameColumn]} numberOfLines={1}>
            {t('sheet.name')}
          </Text>
          {['V', 'TS', 'TR', 'Ind'].map((label) => (
            <Text key={label} style={[styles.headerLabel, styles.statColumn]}>
              {label}
            </Text>
          ))}
        </View>

        {standings.map((standing) => (
          <View key={standing.fencer.id} style={styles.row}>
            <Text style={[styles.place, styles.placeColumn]}>{standing.place}°</Text>

            <View style={styles.nameColumn}>
              <Text style={styles.name} numberOfLines={1}>
                {standing.fencer.name}
              </Text>
              {showClubs ? (
                <Text style={styles.club} numberOfLines={1}>
                  {standing.fencer.club ?? '—'}
                </Text>
              ) : null}
            </View>

            <Text style={[styles.value, styles.valueStrong, styles.statColumn]}>
              {standing.victories}
            </Text>
            <Text style={[styles.value, styles.statColumn]}>{standing.given}</Text>
            <Text style={[styles.value, styles.statColumn]}>{standing.received}</Text>
            <Text style={[styles.value, styles.statColumn]}>
              {standing.diff > 0 ? `+${standing.diff}` : standing.diff}
            </Text>
          </View>
        ))}
      </View>
    </SheetPanel>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 1,
    borderColor: colors.grayMedium,
    borderRadius: radius.r10,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: headerHeight,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.dark,
  },
  headerLabel: {
    fontFamily: fonts.montserrat,
    fontSize: type.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.light,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.grayMedium,
    backgroundColor: colors.light,
  },
  placeColumn: {
    width: 32,
    textAlign: 'left',
  },
  nameColumn: {
    flex: 1,
    // Sem isto o Yoga não deixa a coluna encolher abaixo da largura do nome e as colunas numéricas
    // saem do cartão.
    minWidth: 0,
    paddingRight: spacing.xs,
  },
  statColumn: {
    width: stat,
    textAlign: 'center',
  },
  place: {
    fontFamily: fonts.montserrat,
    fontSize: type.lg,
    color: colors.dark,
    fontVariant: ['tabular-nums'],
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
  value: {
    fontFamily: fonts.workSans,
    fontSize: type.sm,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  valueStrong: {
    fontFamily: fonts.montserrat,
    color: colors.dark,
  },
});
