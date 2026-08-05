/**
 * Uma função por endpoint do contrato §7. Cada uma delega no cliente único de `client.ts`.
 *
 * As listas devolvem o `ApiResponse` inteiro, e não só o corpo: quem chama precisa do `ETag` e de
 * saber se veio `304` (contrato §5). O resto devolve o corpo já tipado.
 */

import { request, type ApiResponse } from './client';
import type {
  BoutDetail,
  BoutScoreResponse,
  BoutsResponse,
  ConnectRequest,
  ConnectResponse,
  LiveBoutEvent,
  LiveEventsResponse,
  MatchDetail,
  MatchScoreResponse,
  ScoreRequest,
  SessionResponse,
  StandingsResponse,
  StartResponse,
} from './types';

/** O corpo de um `GET` simples nunca é `null` — só as listas condicionais e o `204` o podem ser. */
function body<T>(response: ApiResponse<T>): T {
  if (response.data === null) {
    throw new Error(`api: resposta ${response.status} sem corpo`);
  }
  return response.data;
}

// ─── Sessão ─────────────────────────────────────────────────────────────────

/**
 * Troca um PIN por um token. **Sem retry** (contrato §4): repetir sozinho um PIN errado gasta o
 * limite de 5/min do árbitro. Quem repete é o utilizador, com o PIN que quiser.
 */
export async function connect(payload: ConnectRequest): Promise<ConnectResponse> {
  return body(
    await request<ConnectResponse>('/connect', {
      method: 'POST',
      body: payload,
      anonymous: true,
      retries: 1,
    }),
  );
}

export async function getSession(): Promise<SessionResponse> {
  return body(await request<SessionResponse>('/session'));
}

/** Falhar não impede o cliente de apagar o token localmente (contrato §7). */
export async function deleteSession(): Promise<void> {
  await request<never>('/session', { method: 'DELETE', retries: 1 });
}

// ─── Poule ──────────────────────────────────────────────────────────────────

export function getBouts(pouleUuid: string, etag?: string): Promise<ApiResponse<BoutsResponse>> {
  return request<BoutsResponse>(`/poules/${pouleUuid}/bouts`, { etag });
}

export function getStandings(
  pouleUuid: string,
  etag?: string,
): Promise<ApiResponse<StandingsResponse>> {
  return request<StandingsResponse>(`/poules/${pouleUuid}/standings`, { etag });
}

export async function getBout(boutId: string): Promise<BoutDetail> {
  return body(await request<BoutDetail>(`/bouts/${boutId}`));
}

/**
 * *Fire-and-forget*: alimenta o "joga agora" da web e mais nada. Falhar **não bloqueia** a
 * arbitragem e não entra na fila — o cronómetro é local (contrato §7).
 */
export async function startBout(boutId: string): Promise<StartResponse> {
  return body(await request<StartResponse>(`/bouts/${boutId}/start`, { method: 'POST' }));
}

/**
 * O árbitro saiu do assalto **sem resultado** (contrato `2.3.0`): volta a `pending`, os eventos em
 * direto desta tentativa são apagados e fica no registo do organizador uma linha `abandoned`.
 *
 * É a outra metade do `start`, e sem ela o `start` é uma porta de sentido único: abrir a linha
 * errada da folha deixava um assalto a decorrer para sempre, na página pública e na app de todos os
 * outros árbitros da mesma folha.
 *
 * **Só liberta o dispositivo que chamou o `start`** — quem sabe disso é o servidor, e é o que
 * impede um árbitro de tirar o assalto ao da pista ao lado. *Fire-and-forget* como o `start`: uma
 * tentativa, sem fila, e falhar não trava quem quer é sair. Contra um servidor anterior à `2.3.0` o
 * `DELETE` responde `404`/`405` e é ignorado.
 */
export async function releaseBout(boutId: string): Promise<void> {
  await request<never>(`/bouts/${boutId}/start`, { method: 'DELETE' });
}

/**
 * O que está a acontecer na pista, enquanto acontece (contrato §7, `1.5.0`).
 *
 * *Fire-and-forget* e **sem retry**: quem repete é o lote seguinte, com os mesmos `seq` — o
 * servidor ignora em silêncio um `seq` que já lá esteja. Repetir aqui gastava o limite de 60
 * pedidos/min que este endpoint partilha com o *polling*, para mandar o que o próximo toque já
 * vai levar.
 */
export async function postBoutEvents(
  boutId: string,
  events: LiveBoutEvent[],
): Promise<LiveEventsResponse> {
  return body(
    await request<LiveEventsResponse>(`/bouts/${boutId}/events`, {
      method: 'POST',
      body: { events },
      retries: 1,
    }),
  );
}

/**
 * Regista o resultado. O `201` e o `200` têm o mesmo corpo e querem dizer a mesma coisa ao
 * árbitro: ficou registado. Só o `409` se distingue, e esse chega como `ApiError`.
 */
export async function scoreBout(boutId: string, payload: ScoreRequest): Promise<BoutScoreResponse> {
  return body(
    await request<BoutScoreResponse>(`/bouts/${boutId}/score`, { method: 'POST', body: payload }),
  );
}

// ─── Eliminatórias ──────────────────────────────────────────────────────────

/*
 * **Não há listas de quadro.** As duas que aqui viviam — `/poules/{p}/elimination` e
 * `/tournaments/{t}/elimination` — saíram da API na `2.0.0`: uma sessão alcança um combate, e
 * desenhar o resto seria desenhá-lo a partir de dados a que ela não tem direito. O quadro vê-se na
 * web, que é onde é feito.
 */

/** Leitura pura, e **só o combate do próprio código**: qualquer outro id responde `404`. */
export async function getMatch(matchId: string): Promise<MatchDetail> {
  return body(await request<MatchDetail>(`/elimination/${matchId}`));
}

export async function startMatch(matchId: string): Promise<StartResponse> {
  return body(await request<StartResponse>(`/elimination/${matchId}/start`, { method: 'POST' }));
}

/**
 * Igual ao `releaseBout` — mesmas regras, mesma limpeza, mesmo `204` (contrato `2.3.0`). Mais raro
 * aqui, porque um código alcança um combate e não há lista onde enganar a linha.
 */
export async function releaseMatch(matchId: string): Promise<void> {
  await request<never>(`/elimination/${matchId}/start`, { method: 'DELETE' });
}

/** Igual ao dos assaltos — mesmo corpo, mesmo `seq`, mesma resposta (contrato §7). */
export async function postMatchEvents(
  matchId: string,
  events: LiveBoutEvent[],
): Promise<LiveEventsResponse> {
  return body(
    await request<LiveEventsResponse>(`/elimination/${matchId}/events`, {
      method: 'POST',
      body: { events },
      retries: 1,
    }),
  );
}

export async function scoreMatch(
  matchId: string,
  payload: ScoreRequest,
): Promise<MatchScoreResponse> {
  return body(
    await request<MatchScoreResponse>(`/elimination/${matchId}/score`, {
      method: 'POST',
      body: payload,
    }),
  );
}
