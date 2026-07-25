import { useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { postMatchEvents, startMatch } from '@/api/endpoints';
import { invalidateMatch, useMatchDetail } from '@/api/queries';
import type { LiveBoutEvent, MatchDetail } from '@/api/types';
import { BoutScreen, boutTiming, type BoutAssignment, type RecordedScore } from '@/bout';
import { LeaveButton, QueueBanner, SessionBar } from '@/session';
import { useSessionStore } from '@/session/store';
import { Screen, Text, colors, fonts, radius, spacing, type } from '@/ui';

/**
 * Combate de eliminatória — e, desde o contrato `2.0.0`, **a sessão inteira**.
 *
 * Até à `1.5.0` isto era uma rota-folha: chegava-se aqui a partir do quadro, que carregava o
 * cabeçalho, a barra de sessão e o "Sair". O quadro desapareceu — cada combate tem código próprio e
 * uma sessão alcança um só —, e o que esta rota passou a ter de carregar é tudo isso.
 *
 * O que **não** muda é conduzir o assalto: o contrato §7 é literal ao dizer que se arbitra "no
 * mesmo ecrã de assalto que se usa na poule".
 */
export default function MatchRoute() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useQueryClient();

  const phase = useSessionStore((s) => s.phase);
  const applySummary = useSessionStore((s) => s.applySummary);
  const finish = useSessionStore((s) => s.finish);

  const detail = useMatchDetail(id ?? null);
  const match = detail.data;

  const assignment = useMemo<BoutAssignment | undefined>(() => {
    if (!match) return undefined;

    return {
      kind: 'match',
      id: match.id,
      // A app **não nomeia rondas** (contrato §7): "quartos-de-final" depende do tamanho do
      // quadro e do regulamento da prova, e o servidor ainda não o manda. Ronda e posição são o
      // que dá para dizer com verdade.
      title: t('match.title', { round: match.round, position: match.position }),
      fencerA: match.fencer_a,
      fencerB: match.fencer_b,
      target: match.target,
      timing: boutTiming(match),
      scoreA: match.score_a,
      scoreB: match.score_b,
      locked: match.locked,
      // A fila é por pista, e a pista de um combate é o próprio combate (spec §8).
      competitionUuid: match.id,
    };
  }, [match, t]);

  const onStart = useCallback(() => {
    if (!id) return;
    void startMatch(id).catch(() => undefined);
  }, [id]);

  const onEvents = useCallback(
    (events: LiveBoutEvent[]) => postMatchEvents(id as string, events),
    [id],
  );

  const onRecorded = useCallback(() => {
    if (id) invalidateMatch(client, id);
  }, [client, id]);

  /**
   * Registado o resultado, **não há mais nada nesta pista** (contrato §7): o servidor invalida o
   * token e o pedido seguinte traz `401 poule_complete`. A app não espera por ele para dizer o que
   * já sabe — escreve o resultado no *store* e leva o árbitro ao resumo, que é onde a sessão acaba.
   *
   * O resultado tem de vir por aqui e não da releitura: quando ele fica em fila, releitura nenhuma
   * o traz, e o resumo mostraria um combate por pontuar sobre um resultado que o árbitro deu.
   */
  const onFinished = useCallback(
    (result: RecordedScore) => {
      if (match) {
        applySummary({
          match: { ...match, status: 'done', score_a: result.a, score_b: result.b },
        });
      }

      finish();
      router.replace('/complete');
    },
    [match, applySummary, finish],
  );

  if (phase === 'disconnected') return <Redirect href="/connect" />;
  if (phase === 'complete') return <Redirect href="/complete" />;

  const chrome = (
    <>
      <SessionBar offline={detail.isError} />
      <QueueBanner />
    </>
  );

  // O combate ainda espera o vencedor da ronda anterior. Não é erro, e não é "já arbitrado":
  // é uma pista com código entregue antes de se saber quem lá joga (contrato §7, `ready`).
  if (match && !match.ready) return <AwaitingOpponent match={match} chrome={chrome} />;

  return (
    <BoutScreen
      assignment={assignment}
      loading={detail.isLoading}
      error={detail.error}
      onRetry={() => void detail.refetch()}
      eyebrow={match?.competition_name}
      chrome={
        <>
          {chrome}
          {/* Encostado à direita e compacto: o cronómetro é o que se lê a dois metros, e um botão
              de largura inteira por cima dele rouba-lhe altura a cada assalto para servir uma
              ação que se usa uma vez. */}
          <View style={styles.leaveRow}>
            <LeaveButton />
          </View>
        </>
      }
      onStart={onStart}
      onEvents={id ? onEvents : undefined}
      onRecorded={onRecorded}
      onFinished={onFinished}
    />
  );
}

interface AwaitingOpponentProps {
  match: MatchDetail;
  chrome: React.ReactNode;
}

/**
 * A pista está atribuída e o combate ainda não tem os dois atletas.
 *
 * Este ecrã existe porque o quadro deixou de existir: era a lista que mostrava um combate por
 * preencher e não o deixava abrir. Agora é o único ecrã da sessão, e tem de dizer três coisas — em
 * que prova estamos, que combate é, e que a espera acaba sozinha. **Não** se monta o motor do
 * assalto aqui: sem atletas não há nada para cronometrar, e o servidor recusaria o resultado com
 * `409 match_not_ready`.
 *
 * O que o destranca é o *polling* de 30 s do `useMatchDetail` — não há nada para o árbitro tocar.
 */
function AwaitingOpponent({ match, chrome }: AwaitingOpponentProps) {
  const { t } = useTranslation();

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerTitles}>
          <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
            {match.competition_name}
          </Text>
          <Text variant="title">
            {t('match.title', { round: match.round, position: match.position })}
          </Text>
        </View>

        <LeaveButton />
      </View>

      {chrome}

      <View style={styles.centered}>
        <View style={styles.slots}>
          <Slot fencer={match.fencer_a} />
          <Text variant="caption" color={colors.textMuted} style={styles.versus}>
            {t('match.versus')}
          </Text>
          <Slot fencer={match.fencer_b} />
        </View>

        <Text variant="title" style={styles.waitingTitle}>
          {t('match.waiting.title')}
        </Text>
        <Text color={colors.textMuted} style={styles.waitingBody}>
          {t('match.waiting.body')}
        </Text>
      </View>
    </Screen>
  );
}

function Slot({ fencer }: { fencer: MatchDetail['fencer_a'] }) {
  const { t } = useTranslation();

  return (
    <View style={[styles.slot, fencer ? null : styles.slotEmpty]}>
      <Text
        variant="label"
        color={fencer ? colors.dark : colors.textMuted}
        numberOfLines={1}
        style={styles.slotName}
      >
        {fencer?.name ?? t('match.awaiting')}
      </Text>
      {fencer?.club ? (
        <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
          {fencer.club}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  leaveRow: {
    alignItems: 'flex-end',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  headerTitles: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  slots: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  slot: {
    minHeight: 64,
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: radius.r10,
    borderWidth: 1,
    borderColor: colors.grayMedium,
    backgroundColor: colors.light,
  },
  /** Tracejado, como o lugar por preencher de um quadro — não como um campo desativado. */
  slotEmpty: {
    borderStyle: 'dashed',
    backgroundColor: colors.grayLight,
  },
  slotName: {
    fontFamily: fonts.workSansBold,
    fontSize: type.lg,
  },
  versus: {
    textAlign: 'center',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  waitingTitle: {
    textAlign: 'center',
  },
  waitingBody: {
    textAlign: 'center',
    maxWidth: 320,
  },
});
