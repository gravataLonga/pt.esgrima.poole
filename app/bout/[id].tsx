import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { postBoutEvents, startBout } from '@/api/endpoints';
import { invalidateCompetition, useBoutDetail } from '@/api/queries';
import { BoutScreen, boutTiming, type BoutAssignment } from '@/bout';
import type { LiveBoutEvent } from '@/api/types';
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
    };
  }, [detail.data, pouleUuid, t]);

  const onStart = useCallback(() => {
    if (!id) return;
    // *Fire-and-forget*: o cronómetro é local e não espera pelo servidor (contrato §7).
    void startBout(id).catch(() => undefined);
  }, [id]);

  const onEvents = useCallback(
    (events: LiveBoutEvent[]) => postBoutEvents(id as string, events),
    [id],
  );

  const onRecorded = useCallback(() => {
    if (pouleUuid) invalidateCompetition(client, pouleUuid);
  }, [client, pouleUuid]);

  return (
    <BoutScreen
      assignment={assignment}
      loading={detail.isLoading}
      error={detail.error}
      onRetry={() => void detail.refetch()}
      home="/poule"
      onStart={onStart}
      onEvents={id ? onEvents : undefined}
      onRecorded={onRecorded}
    />
  );
}
