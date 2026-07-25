/**
 * Estado de servidor — polling com `If-None-Match`, contrato §5.
 *
 * Não há *push*: a plataforma não tem *broadcasting* e o contrato não a exige. A lista em foco
 * revalida de 10 em 10 s, e um `304` custa um cabeçalho e não mexe na UI — é isso que torna esta
 * cadência barata, do lado do servidor e do lado da bateria.
 *
 * O `ETag` vive aqui e não na cache do React Query porque não é dado: é metadado de validação, e
 * guardá-lo com os dados obrigava a embrulhar todas as respostas.
 */

import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect } from 'react';

import { useSessionStore } from '@/session/store';

import type { ApiResponse } from './client';
import * as api from './endpoints';
import { isGone, isUnauthorized } from './errors';
import { POLL_INTERVAL_BOUT_MS, usePollInterval } from './polling';
import type {
  BoutDetail,
  BoutsResponse,
  EliminationMatch,
  EliminationMatchDetail,
  PouleEliminationResponse,
  PouleSummary,
  SessionScope,
  StandingsResponse,
  TournamentEliminationResponse,
  TournamentSummary,
} from './types';

export const queryKeys = {
  bouts: (pouleUuid: string): QueryKey => ['bouts', pouleUuid],
  standings: (pouleUuid: string): QueryKey => ['standings', pouleUuid],
  bracket: (uuid: string): QueryKey => ['bracket', uuid],
  bout: (boutId: string): QueryKey => ['bout', boutId],
  match: (matchId: string): QueryKey => ['match', matchId],
};

const etags = new Map<string, string>();

/** Um resultado registado invalida as duas listas — partilham `ETag` do lado do servidor. */
export function invalidateCompetition(client: QueryClient, uuid: string): void {
  etags.delete(JSON.stringify(queryKeys.bouts(uuid)));
  etags.delete(JSON.stringify(queryKeys.standings(uuid)));
  etags.delete(JSON.stringify(queryKeys.bracket(uuid)));

  void client.invalidateQueries({ queryKey: queryKeys.bouts(uuid) });
  void client.invalidateQueries({ queryKey: queryKeys.standings(uuid) });
  void client.invalidateQueries({ queryKey: queryKeys.bracket(uuid) });
}

/**
 * Faz o pedido condicional e devolve o que a UI deve mostrar. Num `304` devolve **a instância
 * anterior**, e não uma cópia: é a igualdade referencial que impede a lista de repintar de 10 em
 * 10 segundos com exatamente os mesmos dados.
 */
async function conditional<T>(
  client: QueryClient,
  key: QueryKey,
  fetcher: (etag?: string) => Promise<ApiResponse<T>>,
): Promise<T> {
  const cacheKey = JSON.stringify(key);
  const previous = client.getQueryData<T>(key);
  const etag = previous ? etags.get(cacheKey) : undefined;

  const response = await fetcher(etag);

  if (response.notModified) {
    if (previous) return previous;
    // `304` sem nada em cache não devia acontecer — só se a cache tiver sido limpa entre o pedido
    // e a resposta. Pedir outra vez, sem condição, custa um pedido e evita um ecrã vazio.
    const full = await fetcher();
    if (full.etag) etags.set(cacheKey, full.etag);
    return full.data as T;
  }

  if (response.etag) etags.set(cacheKey, response.etag);
  else etags.delete(cacheKey);

  return response.data as T;
}

/**
 * Repetir um erro que não vai mudar de resposta só atrasa o ecrã de erro. O cliente HTTP já repete
 * o que é repetível (contrato §4) — aqui só se evita que o React Query volte a insistir por cima.
 */
const retryPolicy = (_count: number, error: Error): boolean =>
  !isUnauthorized(error) && !isGone(error);

export function useBouts(pouleUuid: string | null): UseQueryResult<BoutsResponse> {
  const client = useQueryClient();
  const applySummary = useSessionStore((s) => s.applySummary);
  const refetchInterval = usePollInterval();

  const query = useQuery({
    queryKey: queryKeys.bouts(pouleUuid ?? ''),
    enabled: pouleUuid !== null,
    refetchInterval,
    retry: retryPolicy,
    queryFn: () =>
      conditional(client, queryKeys.bouts(pouleUuid as string), (etag) =>
        api.getBouts(pouleUuid as string, etag),
      ),
  });

  // O *summary* vem com a lista, e é ele que faz a app mudar de fase sozinha quando a poule
  // fecha e o quadro abre (spec §6). Um `304` devolve a instância anterior, por isso isto não
  // dispara de dez em dez segundos.
  const poule = query.data?.poule;

  useEffect(() => {
    if (poule) applySummary({ poule });
  }, [poule, applySummary]);

  return query;
}

export function useStandings(
  pouleUuid: string | null,
  enabled = true,
): UseQueryResult<StandingsResponse> {
  const client = useQueryClient();
  const refetchInterval = usePollInterval();

  return useQuery({
    queryKey: queryKeys.standings(pouleUuid ?? ''),
    enabled: pouleUuid !== null && enabled,
    refetchInterval,
    retry: retryPolicy,
    queryFn: () =>
      conditional(client, queryKeys.standings(pouleUuid as string), (etag) =>
        api.getStandings(pouleUuid as string, etag),
      ),
  });
}

/**
 * O quadro, seja ele da poule ou do torneio. Os dois endpoints devolvem a mesma lista com um
 * *summary* diferente ao lado, e o ecrã do quadro não tem razão para distinguir os dois.
 */
export interface BracketData {
  matches: EliminationMatch[];
  /** Nome da competição, para o cabeçalho do quadro. */
  name: string;
  locked: boolean;
  poule?: PouleSummary;
  tournament?: TournamentSummary;
}

export function useBracket(
  scope: SessionScope | null,
  uuid: string | null,
): UseQueryResult<BracketData> {
  const client = useQueryClient();
  const applySummary = useSessionStore((s) => s.applySummary);
  const refetchInterval = usePollInterval();

  const query = useQuery({
    queryKey: queryKeys.bracket(uuid ?? ''),
    enabled: scope !== null && uuid !== null,
    refetchInterval,
    retry: retryPolicy,
    queryFn: async (): Promise<BracketData> => {
      const key = queryKeys.bracket(uuid as string);

      if (scope === 'tournament') {
        const data = await conditional<TournamentEliminationResponse>(client, key, (etag) =>
          api.getTournamentElimination(uuid as string, etag),
        );
        return {
          matches: data.matches,
          name: data.tournament.name,
          locked: data.tournament.locked,
          tournament: data.tournament,
        };
      }

      const data = await conditional<PouleEliminationResponse>(client, key, (etag) =>
        api.getPouleElimination(uuid as string, etag),
      );
      return {
        matches: data.matches,
        name: data.poule.name,
        locked: data.poule.locked,
        poule: data.poule,
      };
    },
  });

  const data = query.data;

  useEffect(() => {
    if (!data) return;
    applySummary({ poule: data.poule, tournament: data.tournament });
  }, [data, applySummary]);

  return query;
}

/**
 * Detalhe do assalto — é daqui que vêm os presets do cronómetro. **Sem polling:** o ecrã de
 * assalto não pode piscar por baixo de quem está a arbitrar, e o que interessa neste ecrã (alvo,
 * tempos) não muda a meio.
 */
export function useBoutDetail(boutId: string | null): UseQueryResult<BoutDetail> {
  return useQuery({
    queryKey: queryKeys.bout(boutId ?? ''),
    enabled: boutId !== null,
    retry: retryPolicy,
    staleTime: POLL_INTERVAL_BOUT_MS,
    queryFn: () => api.getBout(boutId as string),
  });
}

export function useMatchDetail(matchId: string | null): UseQueryResult<EliminationMatchDetail> {
  return useQuery({
    queryKey: queryKeys.match(matchId ?? ''),
    enabled: matchId !== null,
    retry: retryPolicy,
    staleTime: POLL_INTERVAL_BOUT_MS,
    queryFn: () => api.getMatch(matchId as string),
  });
}
