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
  EliminationMatchDetail,
  MatchScoreResponse,
  PouleEliminationResponse,
  ScoreRequest,
  SessionResponse,
  StandingsResponse,
  StartResponse,
  TournamentEliminationResponse,
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
 * Regista o resultado. O `201` e o `200` têm o mesmo corpo e querem dizer a mesma coisa ao
 * árbitro: ficou registado. Só o `409` se distingue, e esse chega como `ApiError`.
 */
export async function scoreBout(boutId: string, payload: ScoreRequest): Promise<BoutScoreResponse> {
  return body(
    await request<BoutScoreResponse>(`/bouts/${boutId}/score`, { method: 'POST', body: payload }),
  );
}

// ─── Eliminatórias ──────────────────────────────────────────────────────────

export function getPouleElimination(
  pouleUuid: string,
  etag?: string,
): Promise<ApiResponse<PouleEliminationResponse>> {
  return request<PouleEliminationResponse>(`/poules/${pouleUuid}/elimination`, { etag });
}

export function getTournamentElimination(
  tournamentUuid: string,
  etag?: string,
): Promise<ApiResponse<TournamentEliminationResponse>> {
  return request<TournamentEliminationResponse>(`/tournaments/${tournamentUuid}/elimination`, {
    etag,
  });
}

export async function getMatch(matchId: string): Promise<EliminationMatchDetail> {
  return body(await request<EliminationMatchDetail>(`/elimination/${matchId}`));
}

export async function startMatch(matchId: string): Promise<StartResponse> {
  return body(await request<StartResponse>(`/elimination/${matchId}/start`, { method: 'POST' }));
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
