/**
 * Servidor falso, em memória, com as formas do contrato `1.4.2`.
 *
 * A spec §10 previa MSW. O que ela quer é que os cenários de erro se testem **sem os provocar no
 * servidor a sério**, e é isso que este módulo dá, com uma dependência a menos: os testes trocam o
 * módulo `@/api/endpoints` por este, que é a fronteira exata onde o contrato acaba e a app começa.
 *
 * Quem verifica que estas formas são as do servidor a sério é o `src/api/live.test.ts`, contra o
 * servidor a sério. Este ficheiro serve para exercitar a app; aquele para não a deixar acreditar
 * numa versão do contrato que só existe aqui dentro.
 */

import { ApiError, NetworkError } from '@/api/errors';
import type {
  Bout,
  BoutDetail,
  BoutScoreResponse,
  BoutsResponse,
  ConnectRequest,
  ConnectResponse,
  EliminationMatch,
  EliminationMatchDetail,
  MatchScoreResponse,
  PouleEliminationResponse,
  PouleSummary,
  ScoreRequest,
  SessionResponse,
  Standing,
  StandingsResponse,
  StartResponse,
  TournamentEliminationResponse,
  TournamentSummary,
} from '@/api/types';
import { bouts as fixtureBouts, poule as fixturePoule } from '@/fixtures/poule';

import type { ApiResponse } from '@/api/client';

export interface FakeState {
  connected: boolean;
  poule: PouleSummary | null;
  tournament: TournamentSummary | null;
  bouts: Bout[];
  standings: Standing[];
  matches: EliminationMatch[];
  /** `submission_id` por assalto/combate já pontuado — é o que faz o 200 do *retry*. */
  submissions: Map<string, string>;
  /** Versão da lista. Muda a cada escrita, e é o `ETag` (contrato §5). */
  version: number;
  /** Erro a devolver na próxima chamada de escrita, para os cenários da spec §12. */
  failNextScore: 'conflict' | 'network' | 'gone' | 'unauthorized' | 'throttled' | null;
  /** Todas as chamadas falham — o cenário "sem rede" inteiro. */
  offline: boolean;
}

const emptyState = (): FakeState => ({
  connected: false,
  poule: null,
  tournament: null,
  bouts: [],
  standings: [],
  matches: [],
  submissions: new Map(),
  version: 1,
  failNextScore: null,
  offline: false,
});

export const state: FakeState = emptyState();

/** Repõe o servidor entre testes. Sem isto um teste herdava os resultados do anterior. */
export function resetFakeApi(overrides: Partial<FakeState> = {}): void {
  Object.assign(state, emptyState(), overrides);
}

/** Liga a sessão sem passar pelo ecrã, para um teste poder começar já dentro da poule. */
export function seedPoule(overrides: Partial<PouleSummary> = {}): PouleSummary {
  state.connected = true;
  state.poule = { ...fixturePoule, ...overrides };
  state.tournament = null;
  state.bouts = fixtureBouts.map((bout) => ({ ...bout }));
  state.standings = standingsFrom(state.bouts);
  return state.poule;
}

export function seedTournament(overrides: Partial<TournamentSummary> = {}): TournamentSummary {
  state.connected = true;
  state.poule = null;
  state.tournament = {
    uuid: '3b7e9a04-0000-4000-8000-000000000001',
    name: 'Torneio de Verão 2026',
    weapon: 'sabre',
    matches_total: state.matches.length,
    matches_done: 0,
    locked: false,
    ...overrides,
  };
  return state.tournament;
}

/** Quadro de 4: duas meias-finais prontas e uma final à espera dos vencedores. */
export function seedBracket(): EliminationMatch[] {
  const fencer = (id: number, name: string) => ({ id, number: null, name, club: null });

  state.matches = [
    {
      id: 'm_1',
      bracket: 4,
      round: 1,
      position: 1,
      status: 'pending',
      ready: true,
      fencer_a: fencer(41, 'Ana Silva'),
      fencer_b: fencer(44, 'Rui Costa'),
      score_a: null,
      score_b: null,
      scored_at: null,
      scored_by_me: false,
    },
    {
      id: 'm_2',
      bracket: 4,
      round: 1,
      position: 2,
      status: 'pending',
      ready: true,
      fencer_a: fencer(42, 'Bruno Dias'),
      fencer_b: fencer(43, 'Carla Neves'),
      score_a: null,
      score_b: null,
      scored_at: null,
      scored_by_me: false,
    },
    {
      id: 'm_3',
      bracket: 4,
      round: 2,
      position: 1,
      status: 'pending',
      ready: false,
      fencer_a: null,
      fencer_b: null,
      score_a: null,
      score_b: null,
      scored_at: null,
      scored_by_me: false,
    },
  ];

  if (state.tournament) {
    state.tournament = { ...state.tournament, matches_total: 3, matches_done: 0 };
  }

  return state.matches;
}

// ─── Cálculos que o servidor a sério faz e o falso tem de imitar ────────────

function standingsFrom(bouts: Bout[]): Standing[] {
  const rows = new Map<number, Standing>();

  for (const bout of bouts) {
    for (const fencer of [bout.fencer_a, bout.fencer_b]) {
      if (!rows.has(fencer.id)) {
        rows.set(fencer.id, {
          fencer,
          victories: 0,
          bouts: 0,
          given: 0,
          received: 0,
          diff: 0,
          place: 1,
        });
      }
    }

    if (bout.score_a === null || bout.score_b === null) continue;

    const a = rows.get(bout.fencer_a.id)!;
    const b = rows.get(bout.fencer_b.id)!;

    a.given += bout.score_a;
    a.received += bout.score_b;
    a.bouts += 1;
    b.given += bout.score_b;
    b.received += bout.score_a;
    b.bouts += 1;

    if (bout.score_a > bout.score_b) a.victories += 1;
    else b.victories += 1;
  }

  const ordered = [...rows.values()]
    .map((row) => ({ ...row, diff: row.given - row.received }))
    .sort(
      (x, y) =>
        ratio(y) - ratio(x) || y.diff - x.diff || y.given - x.given || (x.fencer.number ?? 0) - (y.fencer.number ?? 0),
    );

  return ordered.map((row, index) => ({ ...row, place: index + 1 }));
}

const ratio = (row: Standing): number => (row.bouts === 0 ? 0 : row.victories / row.bouts);

const etag = (): string => `"fake-${state.version}"`;

function guard(): void {
  if (state.offline) throw new NetworkError();
  if (!state.connected) throw unauthorized('token_expired');
}

function unauthorized(code: string): ApiError {
  return new ApiError(401, { code, message: 'A sessão expirou. Volte a ligar-se.' });
}

function conditional<T>(data: T, ifNoneMatch?: string): ApiResponse<T> {
  const tag = etag();
  if (ifNoneMatch === tag) return { status: 304, data: null, notModified: true, etag: tag };
  return { status: 200, data, notModified: false, etag: tag };
}

function pouleSummary(): PouleSummary {
  const done = state.bouts.filter((bout) => bout.status === 'done').length;
  return { ...state.poule!, bouts_done: done, bouts_total: state.bouts.length };
}

// ─── Os endpoints, com as assinaturas de `@/api/endpoints` ──────────────────

export async function connect(payload: ConnectRequest): Promise<ConnectResponse> {
  if (state.offline) throw new NetworkError();

  if (payload.pin === '000000') {
    throw new ApiError(422, { code: 'pin_invalid', message: 'Código inválido.' });
  }

  if (payload.pin === '999999') {
    throw new ApiError(429, { code: 'pin_throttled', message: 'Demasiadas tentativas.' }, 60);
  }

  if (payload.pin === '888888') {
    throw new ApiError(410, {
      code: 'competition_finished',
      message: 'Esta competição já terminou.',
    });
  }

  // Um PIN de torneio abre o quadro; qualquer outro abre a poule (contrato §7, `scope`).
  if (payload.pin === '777777') {
    seedBracket();
    const tournament = seedTournament();
    return {
      token: 'fake-token',
      expires_at: inAnHour(),
      scope: 'tournament',
      poule: null,
      tournament,
    };
  }

  const poule = state.poule ? state.poule : seedPoule();
  state.connected = true;

  return { token: 'fake-token', expires_at: inAnHour(), scope: 'poule', poule, tournament: null };
}

const inAnHour = (): string => new Date(Date.now() + 60 * 60 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');

export async function getSession(): Promise<SessionResponse> {
  guard();

  return {
    expires_at: inAnHour(),
    scope: state.tournament ? 'tournament' : 'poule',
    poule: state.poule ? pouleSummary() : null,
    tournament: state.tournament,
  };
}

export async function deleteSession(): Promise<void> {
  state.connected = false;
}

export async function getBouts(_uuid: string, ifNoneMatch?: string): Promise<ApiResponse<BoutsResponse>> {
  guard();
  return conditional({ poule: pouleSummary(), bouts: state.bouts }, ifNoneMatch);
}

export async function getStandings(
  _uuid: string,
  ifNoneMatch?: string,
): Promise<ApiResponse<StandingsResponse>> {
  guard();
  return conditional({ poule: pouleSummary(), standings: state.standings }, ifNoneMatch);
}

export async function getBout(boutId: string): Promise<BoutDetail> {
  guard();

  const bout = state.bouts.find((candidate) => candidate.id === boutId);
  if (!bout) throw new ApiError(404, { code: 'not_found', message: 'Não encontrado.' });

  const poule = state.poule!;

  return {
    id: bout.id,
    sequence: bout.sequence,
    status: bout.status,
    fencer_a: bout.fencer_a,
    fencer_b: bout.fencer_b,
    score_a: bout.score_a,
    score_b: bout.score_b,
    target: poule.touch_cap,
    duration_seconds: poule.duration_seconds,
    periods: poule.periods,
    rest_seconds: poule.rest_seconds,
    sudden_death_seconds: poule.sudden_death_seconds,
    passivity_seconds: poule.passivity_seconds,
    weapon: poule.weapon,
    allow_draw: false,
    poule_locked: poule.locked,
  };
}

export async function startBout(boutId: string): Promise<StartResponse> {
  guard();

  state.bouts = state.bouts.map((bout) =>
    bout.id === boutId && bout.status === 'pending' ? { ...bout, status: 'in_progress' } : bout,
  );
  state.version += 1;

  return { id: boutId, status: 'in_progress' };
}

export async function scoreBout(
  boutId: string,
  payload: ScoreRequest,
): Promise<BoutScoreResponse> {
  guard();
  failIfAsked();

  const bout = state.bouts.find((candidate) => candidate.id === boutId);
  if (!bout) throw new ApiError(404, { code: 'not_found', message: 'Não encontrado.' });

  const existing = state.submissions.get(boutId);

  if (bout.status === 'done') {
    // Mesma submissão → 200 com o estado atual; outra → 409 com o `current` (contrato §4).
    if (existing === payload.submission_id) return recorded(bout);

    throw new ApiError(409, {
      code: 'bout_already_scored',
      message: 'Já registado por outra pessoa.',
      current: { score_a: bout.score_a, score_b: bout.score_b, scored_at: bout.scored_at },
    });
  }

  const scored: Bout = {
    ...bout,
    status: 'done',
    score_a: payload.a,
    score_b: payload.b,
    scored_at: new Date().toISOString(),
    scored_by_me: true,
  };

  state.bouts = state.bouts.map((candidate) => (candidate.id === boutId ? scored : candidate));
  state.submissions.set(boutId, payload.submission_id);
  state.standings = standingsFrom(state.bouts);
  state.version += 1;

  return recorded(scored);
}

function recorded(bout: Bout): BoutScoreResponse {
  return {
    id: bout.id,
    status: 'done',
    score_a: bout.score_a!,
    score_b: bout.score_b!,
    bouts_done: state.bouts.filter((candidate) => candidate.status === 'done').length,
    bouts_total: state.bouts.length,
  };
}

function failIfAsked(): void {
  const failure = state.failNextScore;
  if (!failure) return;
  state.failNextScore = null;

  if (failure === 'network') throw new NetworkError();
  if (failure === 'unauthorized') throw unauthorized('token_expired');
  if (failure === 'gone') throw new ApiError(404, { code: 'not_found', message: 'Não encontrado.' });

  if (failure === 'throttled') {
    throw new ApiError(429, { code: 'rate_limited', message: 'Demasiados pedidos.' }, 30);
  }

  throw new ApiError(409, {
    code: 'bout_already_scored',
    message: 'Já registado por outra pessoa.',
    current: { score_a: 4, score_b: 5, scored_at: '2026-07-24T17:31:02Z' },
  });
}

export async function getPouleElimination(
  _uuid: string,
  ifNoneMatch?: string,
): Promise<ApiResponse<PouleEliminationResponse>> {
  guard();
  return conditional({ poule: pouleSummary(), matches: state.matches }, ifNoneMatch);
}

export async function getTournamentElimination(
  _uuid: string,
  ifNoneMatch?: string,
): Promise<ApiResponse<TournamentEliminationResponse>> {
  guard();
  return conditional({ tournament: state.tournament!, matches: state.matches }, ifNoneMatch);
}

export async function getMatch(matchId: string): Promise<EliminationMatchDetail> {
  guard();

  const match = state.matches.find((candidate) => candidate.id === matchId);
  if (!match) throw new ApiError(404, { code: 'not_found', message: 'Não encontrado.' });

  return {
    id: match.id,
    bracket: match.bracket,
    round: match.round,
    position: match.position,
    status: match.status,
    ready: match.ready,
    fencer_a: match.fencer_a,
    fencer_b: match.fencer_b,
    score_a: match.score_a,
    score_b: match.score_b,
    // Os presets do quadro: 15 toques e 3 períodos, com descanso pelo meio (contrato §7).
    target: 15,
    duration_seconds: 180,
    periods: 3,
    rest_seconds: 60,
    sudden_death_seconds: 60,
    passivity_seconds: 60,
    allow_draw: false,
    locked: state.tournament?.locked ?? false,
  };
}

export async function startMatch(matchId: string): Promise<StartResponse> {
  guard();
  return { id: matchId, status: 'in_progress' };
}

export async function scoreMatch(
  matchId: string,
  payload: ScoreRequest,
): Promise<MatchScoreResponse> {
  guard();
  failIfAsked();

  const match = state.matches.find((candidate) => candidate.id === matchId);
  if (!match) throw new ApiError(404, { code: 'not_found', message: 'Não encontrado.' });

  if (!match.ready) {
    throw new ApiError(409, {
      code: 'match_not_ready',
      message: 'Este combate ainda espera o vencedor da ronda anterior.',
    });
  }

  const scored: EliminationMatch = {
    ...match,
    status: 'done',
    score_a: payload.a,
    score_b: payload.b,
    scored_at: new Date().toISOString(),
    scored_by_me: true,
  };

  state.matches = state.matches.map((candidate) =>
    candidate.id === matchId ? scored : candidate,
  );

  // O vencedor sobe de ronda **do lado do servidor**, na transação do resultado (contrato §7).
  promoteWinner(scored);
  state.version += 1;

  const done = state.matches.filter((candidate) => candidate.status === 'done').length;
  if (state.tournament) state.tournament = { ...state.tournament, matches_done: done };

  return {
    id: scored.id,
    status: 'done',
    score_a: payload.a,
    score_b: payload.b,
    matches_done: done,
    matches_total: state.matches.length,
  };
}

function promoteWinner(match: EliminationMatch): void {
  const winner = (match.score_a ?? 0) > (match.score_b ?? 0) ? match.fencer_a : match.fencer_b;
  if (!winner) return;

  const next = state.matches.find((candidate) => candidate.round === match.round + 1);
  if (!next) return;

  const slot = match.position % 2 === 1 ? 'fencer_a' : 'fencer_b';
  const promoted: EliminationMatch = { ...next, [slot]: winner };
  promoted.ready = promoted.fencer_a !== null && promoted.fencer_b !== null;

  state.matches = state.matches.map((candidate) =>
    candidate.id === next.id ? promoted : candidate,
  );
}
