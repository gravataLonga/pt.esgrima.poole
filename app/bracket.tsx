import { Redirect, router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useBracket } from '@/api/queries';
import type { EliminationMatch } from '@/api/types';
import { FinishButton, LeaveButton, QueueBanner, SessionBar } from '@/session';
import { competitionUuid, useSessionStore } from '@/session/store';
import {
  Badge,
  Banner,
  Button,
  ProgressBar,
  Screen,
  Text,
  colors,
  fonts,
  radius,
  spacing,
  touch,
  type,
} from '@/ui';

/**
 * Ecrã 5 — Quadro de eliminatórias (spec §6).
 *
 * Chega-se aqui por duas vias: `scope: "tournament"` no *connect*, ou a poule fechar com quadro
 * gerado. A app **lê** o quadro e regista resultados nele; gerar, semear e decidir quem sobe é da
 * plataforma web — o vencedor sobe de ronda do lado do servidor, na transação do resultado, e a
 * app descobre-o no *poll* seguinte.
 */
export default function BracketScreen() {
  const { t } = useTranslation();
  const phase = useSessionStore((s) => s.phase);
  const scope = useSessionStore((s) => s.scope);
  const poule = useSessionStore((s) => s.poule);
  const tournament = useSessionStore((s) => s.tournament);
  const uuid = useSessionStore(competitionUuid);
  const markBracketAnnounced = useSessionStore((s) => s.markBracketAnnounced);

  // Chegar aqui é o que a transição automática existia para fazer. Daqui para a frente, a lista
  // de assaltos volta a ser alcançável a partir do botão lá em baixo.
  useEffect(markBracketAnnounced, [markBracketAnnounced]);

  const bracket = useBracket(scope, uuid);
  const matches = useMemo(() => bracket.data?.matches ?? [], [bracket.data]);

  // Ronda a ronda: a lista já vem ordenada por `round` e depois `position`, e agrupá-la é só
  // desenhar o que o servidor mandou.
  const rounds = useMemo(() => groupByRound(matches), [matches]);

  // O progresso do quadro vem no *summary* da competição — no `TournamentSummary` quando o âmbito
  // é o torneio, e no `PouleSummary.elimination` quando é a poule.
  const done = tournament?.matches_done ?? poule?.elimination?.matches_done ?? 0;
  const total = tournament?.matches_total ?? poule?.elimination?.matches_total ?? 0;

  if (phase === 'disconnected') return <Redirect href="/connect" />;
  if (phase === 'complete') return <Redirect href="/complete" />;

  const locked = bracket.data?.locked ?? false;
  const name = bracket.data?.name ?? tournament?.name ?? poule?.name ?? '';

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitles}>
            <Text variant="label" color={colors.textMuted} style={styles.eyebrow}>
              {t('bracket.eyebrow')}
            </Text>
            <Text variant="title">{name}</Text>
          </View>

          <LeaveButton />
        </View>

        <View style={styles.progress}>
          <ProgressBar value={total ? done / total : 0} />
          <Text variant="caption" color={colors.dark}>
            {t('bracket.progress', { done, total })}
          </Text>
        </View>
      </View>

      <SessionBar offline={bracket.isError} />
      <QueueBanner />

      {locked ? <Banner tone="warning" message={t('bracket.locked')} /> : null}

      {/* Com uma poule ligada, a lista de assaltos e o quadro coexistem e alternam-se (spec §6). */}
      {scope === 'poule' ? (
        <View style={styles.backLink}>
          <Button
            label={t('bracket.backToPoule')}
            variant="secondary"
            size="compact"
            onPress={() => router.push('/poule')}
          />
        </View>
      ) : null}

      {bracket.isLoading ? (
        <View style={styles.centered}>
          <Text color={colors.textMuted}>{t('bracket.loading')}</Text>
        </View>
      ) : bracket.isError && matches.length === 0 ? (
        <View style={styles.centered}>
          <Text variant="title">{t('poule.error.title')}</Text>
          <Text color={colors.textMuted} style={styles.centeredText}>
            {t('poule.error.body')}
          </Text>
          <Button label={t('common.retry')} onPress={() => void bracket.refetch()} />
        </View>
      ) : (
        <SectionList
          sections={rounds}
          keyExtractor={(match) => match.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={bracket.isFetching && !bracket.isLoading}
              onRefresh={() => void bracket.refetch()}
              tintColor={colors.dark}
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text color={colors.textMuted} style={styles.centeredText}>
                {/* Quadro por gerar não é erro (contrato §7): é uma poule que ainda não acabou. */}
                {t('bracket.empty')}
              </Text>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <Text variant="label" color={colors.textMuted} style={styles.roundTitle}>
              {t('bracket.round', { round: section.round })}
            </Text>
          )}
          renderItem={({ item }) => <MatchRow match={item} disabled={locked} />}
        />
      )}

      <FinishButton />
    </Screen>
  );
}

interface Round {
  round: number;
  data: EliminationMatch[];
}

function groupByRound(matches: EliminationMatch[]): Round[] {
  const rounds: Round[] = [];

  for (const match of matches) {
    const last = rounds.at(-1);
    if (last && last.round === match.round) last.data.push(match);
    else rounds.push({ round: match.round, data: [match] });
  }

  return rounds;
}

interface MatchRowProps {
  match: EliminationMatch;
  disabled: boolean;
}

/**
 * Um combate. Os que ainda esperam pelo vencedor da ronda anterior **aparecem mas não abrem**
 * (contrato §7, `ready`): mostrá-los por preencher em vez de os esconder é o que deixa o árbitro
 * ver o caminho até à final.
 */
function MatchRow({ match, disabled }: MatchRowProps) {
  const { t } = useTranslation();

  const openable = match.ready && !disabled;
  const scored = match.score_a !== null && match.score_b !== null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !openable }}
      disabled={!openable}
      onPress={() => router.push({ pathname: '/match/[id]', params: { id: match.id } })}
      style={({ pressed }) => [
        styles.row,
        !match.ready ? styles.rowWaiting : null,
        match.status === 'done' ? styles.rowDone : null,
        match.status === 'in_progress' ? styles.rowActive : null,
        pressed ? styles.rowPressed : null,
      ]}
    >
      <View style={styles.positionChip}>
        <Text variant="caption" color={colors.light} style={styles.position}>
          {match.position}
        </Text>
      </View>

      <View style={styles.names}>
        <SideRow
          name={match.fencer_a?.name ?? t('bracket.awaiting')}
          club={match.fencer_a?.club ?? null}
          placeholder={match.fencer_a === null}
          leading={scored && (match.score_a ?? 0) > (match.score_b ?? 0)}
        />
        <SideRow
          name={match.fencer_b?.name ?? t('bracket.awaiting')}
          club={match.fencer_b?.club ?? null}
          placeholder={match.fencer_b === null}
          leading={scored && (match.score_b ?? 0) > (match.score_a ?? 0)}
        />
      </View>

      <View style={styles.trailing}>
        {scored ? (
          <Text style={styles.result}>
            {match.score_a}–{match.score_b}
          </Text>
        ) : match.ready ? (
          <Badge
            label={t(`bracket.state.${match.status === 'in_progress' ? 'in_progress' : 'ready'}`)}
            tone={match.status === 'in_progress' ? 'green' : 'gray'}
          />
        ) : (
          <Badge label={t('bracket.state.waiting')} tone="gray" />
        )}
      </View>
    </Pressable>
  );
}

interface SideRowProps {
  name: string;
  club: string | null;
  placeholder: boolean;
  leading: boolean;
}

function SideRow({ name, club, placeholder, leading }: SideRowProps) {
  return (
    <View style={styles.sideRow}>
      <Text
        variant="label"
        color={placeholder ? colors.textMuted : colors.dark}
        numberOfLines={1}
        style={[styles.sideName, leading ? styles.sideNameLeading : null]}
      >
        {name}
      </Text>
      {club ? (
        <Text variant="caption" color={colors.textMuted} numberOfLines={1} style={styles.sideClub}>
          {club}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headerTitles: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  eyebrow: {
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  progress: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  backLink: {
    marginTop: spacing.sm,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  centeredText: {
    textAlign: 'center',
    maxWidth: 300,
  },
  list: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  roundTitle: {
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  row: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.sm + 4,
    borderRadius: radius.r10,
    borderWidth: 1,
    borderColor: colors.grayMedium,
    backgroundColor: colors.light,
  },
  /** Por preencher: visível, mas claramente ainda não jogável. */
  rowWaiting: {
    opacity: 0.6,
    borderStyle: 'dashed',
  },
  rowDone: {
    opacity: 0.75,
    backgroundColor: colors.grayLight,
    borderColor: colors.grayLight,
  },
  rowActive: {
    borderColor: colors.green,
    borderWidth: 2,
  },
  rowPressed: {
    backgroundColor: colors.grayMedium,
  },
  positionChip: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.dark,
  },
  position: {
    fontFamily: fonts.montserrat,
    fontVariant: ['tabular-nums'],
  },
  names: {
    flex: 1,
    gap: 2,
  },
  sideRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs + 2,
  },
  sideName: {
    flexShrink: 1,
  },
  sideNameLeading: {
    fontFamily: fonts.workSansBold,
  },
  sideClub: {
    flexShrink: 1,
  },
  trailing: {
    alignItems: 'flex-end',
  },
  result: {
    fontFamily: fonts.montserrat,
    fontSize: type.xl,
    color: colors.dark,
    fontVariant: ['tabular-nums'],
  },
});
