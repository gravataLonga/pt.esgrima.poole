import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { postBoutEvents, startBout } from '@/api/endpoints';
import { invalidatePoule, useBoutDetail } from '@/api/queries';
import { BoutScreen, boutTiming, type BoutAssignment } from '@/bout';
import type { LiveBoutEvent } from '@/api/types';
import { useRefereeingStore, useStartedBoutId } from '@/poule';
import { useSessionStore } from '@/session/store';

/**
 * Ecrã 3 — Assalto de poule (spec §6).
 *
 * A rota só resolve *qual* assalto é e para onde vai o resultado; conduzi-lo é do `BoutScreen`,
 * partilhado com o combate de quadro.
 */
export default function BoutRoute() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useQueryClient();

  const pouleUuid = useSessionStore((s) => s.poule?.uuid ?? null);
  const detail = useBoutDetail(id ?? null);

  const startedId = useStartedBoutId(pouleUuid);
  const markStarted = useRefereeingStore((s) => s.markStarted);

  const assignment = useMemo<BoutAssignment | undefined>(() => {
    if (!detail.data || !pouleUuid) return undefined;
    const bout = detail.data;

    return {
      kind: 'bout',
      id: bout.id,
      title: t('bout.title', { sequence: bout.sequence }),
      fencerA: bout.fencer_a,
      fencerB: bout.fencer_b,
      target: bout.target,
      timing: boutTiming(bout),
      scoreA: bout.score_a,
      scoreB: bout.score_b,
      locked: bout.poule_locked,
      competitionUuid: pouleUuid,
      // A decorrer, mas não por este telemóvel: a poule está a ser arbitrada noutra pista com o
      // mesmo código (contrato `2.2.0`). É aviso, nunca proibição — quem submeter primeiro leva o
      // assalto, e o segundo apanha o `409` que já está tratado desde a `1.0.0`.
      //
      // **Sem memória não se avisa**, que é a mesma assunção do cartão da lista (`status.ts`): um
      // dispositivo que nunca arbitrou nesta poule não sabe se o que está em pista é dele, e a
      // hipótese que acerta com um árbitro só — o normal — é que seja.
      startedElsewhere:
        bout.status === 'in_progress' && startedId !== null && bout.id !== startedId,
    };
  }, [detail.data, pouleUuid, startedId, t]);

  const onStart = useCallback(() => {
    if (!id) return;
    // "Este assalto é meu", no mesmo instante em que se diz ao servidor — é o único sítio onde a
    // app o declara, e é o que faz o cartão do topo da lista seguir este telemóvel e não o do lado.
    if (pouleUuid) markStarted(pouleUuid, id);
    // *Fire-and-forget*: o cronómetro é local e não espera pelo servidor (contrato §7).
    void startBout(id).catch(() => undefined);
  }, [id, pouleUuid, markStarted]);

  const onEvents = useCallback(
    (events: LiveBoutEvent[]) => postBoutEvents(id as string, events),
    [id],
  );

  const onRecorded = useCallback(() => {
    if (pouleUuid) invalidatePoule(client, pouleUuid);
  }, [client, pouleUuid]);

  return (
    <BoutScreen
      assignment={assignment}
      loading={detail.isLoading}
      error={detail.error}
      onRetry={() => void detail.refetch()}
      back={() => router.replace('/poule')}
      onStart={onStart}
      onEvents={id ? onEvents : undefined}
      onRecorded={onRecorded}
    />
  );
}
