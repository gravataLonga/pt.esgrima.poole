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
import type { BoutDetail, BoutsResponse, MatchDetail, StandingsResponse } from './types';

export const queryKeys = {
  bouts: (pouleUuid: string): QueryKey => ['bouts', pouleUuid],
  standings: (pouleUuid: string): QueryKey => ['standings', pouleUuid],
  bout: (boutId: string): QueryKey => ['bout', boutId],
  match: (matchId: string): QueryKey => ['match', matchId],
};

const etags = new Map<string, string>();

/** Um resultado registado invalida as duas listas — partilham `ETag` do lado do servidor. */
export function invalidatePoule(client: QueryClient, uuid: string): void {
  etags.delete(JSON.stringify(queryKeys.bouts(uuid)));
  etags.delete(JSON.stringify(queryKeys.standings(uuid)));

  void client.invalidateQueries({ queryKey: queryKeys.bouts(uuid) });
  void client.invalidateQueries({ queryKey: queryKeys.standings(uuid) });
}

/**
 * O combate acabou de ser registado: relê-lo é o que leva a app ao fim.
 *
 * O contrato §7 diz que registar o resultado **é o fim da sessão** — o token é invalidado e o
 * pedido seguinte recebe `401 poule_complete`. Este *refetch* é esse pedido seguinte, e o `401`
 * que ele apanha é o caminho normal para o ecrã de resumo, não uma avaria a esconder.
 */
export function invalidateMatch(client: QueryClient, matchId: string): void {
  void client.invalidateQueries({ queryKey: queryKeys.match(matchId) });
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

/**
 * O combate — e, ao contrário do assalto de poule, **com** *polling*.
 *
 * Um assalto de poule tem a lista por baixo a revalidar por ele; um combate não tem lista nenhuma
 * (contrato §5: *"não há `ETag` do lado da eliminatória, porque não há lista"*). Este pedido é a
 * única coisa que traz notícias da pista, e há uma que o árbitro não pode perder: um combate
 * entregue com `ready: false` **destranca-se sozinho** quando a ronda anterior acaba. Sem isto ele
 * ficava a olhar para um ecrã trancado à espera de nada.
 *
 * A cadência é a do ecrã de assalto (contrato §5): 30 s com o cronómetro parado, **pausada** com
 * ele a correr — não se interrompe uma arbitragem para perguntar por dados que não mudam a meio.
 */
export function useMatchDetail(matchId: string | null): UseQueryResult<MatchDetail> {
  const applySummary = useSessionStore((s) => s.applySummary);
  const refetchInterval = usePollInterval();

  const query = useQuery({
    queryKey: queryKeys.match(matchId ?? ''),
    enabled: matchId !== null,
    refetchInterval,
    retry: retryPolicy,
    staleTime: POLL_INTERVAL_BOUT_MS,
    queryFn: () => api.getMatch(matchId as string),
  });

  // O combate **é** o *summary* desta sessão: o cabeçalho, o "Sair" e o resumo leem-no do store.
  const match = query.data;

  useEffect(() => {
    if (match) applySummary({ match });
  }, [match, applySummary]);

  return query;
}
