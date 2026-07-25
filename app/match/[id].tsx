import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { postMatchEvents, startMatch } from '@/api/endpoints';
import { invalidateCompetition, useMatchDetail } from '@/api/queries';
import { BoutScreen, boutTiming, type BoutAssignment } from '@/bout';
import type { LiveBoutEvent } from '@/api/types';
import { competitionUuid, useSessionStore } from '@/session/store';

/**
 * Combate do quadro de eliminatórias — o mesmo ecrã de assalto, com os presets do quadro (15
 * toques, 3 períodos, descanso entre eles), todos vindos da API.
 *
 * "Nada na condução do assalto muda por ser eliminatória" (spec §6): o que muda é o URL do
 * resultado e o cabeçalho, e é só isso que esta rota decide.
 */
export default function MatchRoute() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useQueryClient();

  const uuid = useSessionStore(competitionUuid);
  const detail = useMatchDetail(id ?? null);

  const assignment = useMemo<BoutAssignment | undefined>(() => {
    if (!detail.data || !uuid) return undefined;
    const match = detail.data;

    return {
      kind: 'match',
      id: match.id,
      // A app **não nomeia rondas** (contrato §7): "quartos-de-final" depende do tamanho do
      // quadro e do regulamento da prova, e o servidor ainda não o manda. Ronda e posição são o
      // que dá para dizer com verdade.
      title: t('bracket.matchTitle', { round: match.round, position: match.position }),
      fencerA: match.fencer_a,
      fencerB: match.fencer_b,
      target: match.target,
      timing: boutTiming(match),
      scoreA: match.score_a,
      scoreB: match.score_b,
      locked: match.locked || !match.ready,
      competitionUuid: uuid,
    };
  }, [detail.data, uuid, t]);

  const onStart = useCallback(() => {
    if (!id) return;
    void startMatch(id).catch(() => undefined);
  }, [id]);

  const onEvents = useCallback(
    (events: LiveBoutEvent[]) => postMatchEvents(id as string, events),
    [id],
  );

  const onRecorded = useCallback(() => {
    if (uuid) invalidateCompetition(client, uuid);
  }, [client, uuid]);

  return (
    <BoutScreen
      assignment={assignment}
      loading={detail.isLoading}
      error={detail.error}
      onRetry={() => void detail.refetch()}
      home="/bracket"
      onStart={onStart}
      onEvents={id ? onEvents : undefined}
      onRecorded={onRecorded}
    />
  );
}
