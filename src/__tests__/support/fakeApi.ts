/**
 * Servidor falso, em memória, com as formas do contrato `2.0.0`.
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
  LiveBoutEvent,
  LiveEventsResponse,
  MatchDetail,
  MatchScoreResponse,
  PouleSummary,
  ScoreRequest,
  SessionResponse,
  Standing,
  StandingsResponse,
  StartResponse,
} from '@/api/types';
import { bouts as fixtureBouts, poule as fixturePoule } from '@/fixtures/poule';

import type { ApiResponse } from '@/api/client';

export interface FakeState {
  connected: boolean;
  poule: PouleSummary | null;
  /** O combate desta sessão. Uma sessão de combate vê **um** e mais nenhum (contrato §7). */
  match: MatchDetail | null;
  bouts: Bout[];
  standings: Standing[];
  /** `submission_id` por assalto/combate já pontuado — é o que faz o 200 do *retry*. */
  submissions: Map<string, string>;
  /** Eventos ao vivo recebidos, por assalto/combate. A chave `(assalto, seq)` é única. */
  events: Map<string, LiveBoutEvent[]>;
  /**
   * Os `DELETE .../start` que chegaram, por ordem (contrato `2.3.0`). O `204` é o mesmo com ou sem
   * nada para libertar, por isso só o registo diz se a app **pediu** — que é o que distingue sair
   * de um assalto de o acabar.
   */
  released: string[];
  /** Erro a devolver no próximo `POST .../events`. */
  failNextEvents: 'network' | 'locked' | null;
  /** Versão da lista. Muda a cada escrita, e é o `ETag` (contrato §5). */
  version: number;
  /** Erro a devolver na próxima chamada de escrita, para os cenários da spec §12. */
  failNextScore: 'conflict' | 'network' | 'gone' | 'unauthorized' | 'throttled' | null;
  /** Todas as chamadas falham — o cenário "sem rede" inteiro. */
  offline: boolean;
  /**
   * Porque é que o token morreu. `poule_complete` é o que o servidor devolve quando não há mais
   * nada a fazer naquela pista — num combate, assim que o resultado é registado (contrato §6).
   */
  endCode: 'token_expired' | 'token_revoked' | 'poule_complete';
}

const emptyState = (): FakeState => ({
  connected: false,
  poule: null,
  match: null,
  bouts: [],
  standings: [],
  submissions: new Map(),
  events: new Map(),
  released: [],
  failNextEvents: null,
  version: 1,
  failNextScore: null,
  offline: false,
  endCode: 'token_expired',
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
  state.match = null;
  state.bouts = fixtureBouts.map((bout) => ({ ...bout }));
  state.standings = standingsFrom(state.bouts);
  return state.poule;
}

const fencer = (id: number, name: string, club: string | null = null) => ({
  id,
  number: null,
  name,
  club,
});

/**
 * Um combate de eliminatória, com os presets do quadro: 15 toques, 3 períodos e descanso pelo meio
 * (contrato §7). É **um só** — uma sessão de combate não alcança o da pista ao lado.
 */
export function seedMatch(overrides: Partial<MatchDetail> = {}): MatchDetail {
  state.connected = true;
  state.poule = null;
  state.match = {
    id: 'm_1',
    competition_name: 'Torneio de Verão 2026',
    bracket: 4,
    round: 2,
    position: 1,
    status: 'pending',
    ready: true,
    fencer_a: fencer(41, 'Ana Silva', 'CE Lisboa'),
    fencer_b: fencer(44, 'Rui Costa'),
    score_a: null,
    score_b: null,
    scored_at: null,
    scored_by_me: false,
    target: 15,
    duration_seconds: 180,
    periods: 3,
    rest_seconds: 60,
    sudden_death_seconds: 60,
    passivity_seconds: 60,
    weapon: 'sabre',
    allow_draw: false,
    locked: false,
    ...overrides,
  };

  return state.match;
}

/**
 * O combate destranca-se: a ronda anterior acabou e o vencedor subiu, do lado do servidor. É o que
 * um *poll* do `useMatchDetail` encontra — a app não faz nada para o provocar.
 */
export function readyMatch(a = fencer(41, 'Ana Silva'), b = fencer(44, 'Rui Costa')): void {
  if (!state.match) return;
  state.match = { ...state.match, ready: true, fencer_a: a, fencer_b: b };
  state.version += 1;
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
        ratio(y) - ratio(x) ||
        y.diff - x.diff ||
        y.given - x.given ||
        (x.fencer.number ?? 0) - (y.fencer.number ?? 0),
    );

  return ordered.map((row, index) => ({ ...row, place: index + 1 }));
}

const ratio = (row: Standing): number => (row.bouts === 0 ? 0 : row.victories / row.bouts);

const etag = (): string => `"fake-${state.version}"`;

function guard(): void {
  if (state.offline) throw new NetworkError();
  if (!state.connected) throw unauthorized(state.endCode);
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

  // Um PIN de combate abre o combate; qualquer outro abre a poule (contrato §7, `scope`). O
  // combate vem já na resposta — sem um segundo pedido pelo meio.
  if (payload.pin === '777777') {
    const match = state.match ?? seedMatch();
    state.connected = true;

    return { token: 'fake-token', expires_at: inAnHour(), scope: 'match', poule: null, match };
  }

  const poule = state.poule ? state.poule : seedPoule();
  state.connected = true;

  return { token: 'fake-token', expires_at: inAnHour(), scope: 'poule', poule, match: null };
}

const inAnHour = (): string =>
  new Date(Date.now() + 60 * 60 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');

export async function getSession(): Promise<SessionResponse> {
  guard();

  return {
    expires_at: inAnHour(),
    scope: state.match ? 'match' : 'poule',
    poule: state.poule ? pouleSummary() : null,
    match: state.match,
  };
}

export async function deleteSession(): Promise<void> {
  state.connected = false;
}

export async function getBouts(
  _uuid: string,
  ifNoneMatch?: string,
): Promise<ApiResponse<BoutsResponse>> {
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

/**
 * O árbitro saiu do assalto sem resultado (contrato `2.3.0`): volta a `pending` e os eventos em
 * direto desta tentativa são apagados. **`204` sempre**, mesmo quando não havia nada para libertar
 * — nem um assalto de outro árbitro, nem um já pontuado, dão erro nenhum de volta.
 *
 * O servidor a sério só liberta o assalto de quem chamou o `start`, e guarda quem foi
 * (`started_by_token_id`). Aqui há um dispositivo só, por isso o que este falso pode imitar é a
 * outra metade da regra: um assalto `done` fica como está.
 */
export async function releaseBout(boutId: string): Promise<void> {
  // Antes do `guard()`: o que este registo responde é se a **app pediu**, e ela pede na mesma
  // contra uma sessão morta — é aí que dizer a coisa errada custa um pedido e uma linha no registo.
  state.released.push(`bout:${boutId}`);
  guard();

  state.bouts = state.bouts.map((bout) =>
    bout.id === boutId && bout.status === 'in_progress' ? { ...bout, status: 'pending' } : bout,
  );
  state.events.delete(`bout:${boutId}`);
  state.version += 1;
}

/** O gémeo das eliminatórias — mesmas regras, mesma limpeza (contrato `2.3.0`). */
export async function releaseMatch(matchId: string): Promise<void> {
  state.released.push(`match:${matchId}`);
  guard();

  if (state.match?.id === matchId && state.match.status === 'in_progress') {
    state.match = { ...state.match, status: 'pending' };
  }

  state.events.delete(`match:${matchId}`);
  state.version += 1;
}

/**
 * A pista ao vivo (contrato §7, `1.5.0`). O servidor a sério guarda `(assalto, seq)` como chave
 * única e ignora em silêncio um `seq` repetido — é isso que faz de um reenvio um não-evento, e é o
 * que este imita.
 */
export async function postBoutEvents(
  boutId: string,
  events: LiveBoutEvent[],
): Promise<LiveEventsResponse> {
  guard();
  failEventsIfAsked();

  return { accepted: keepNewEvents(`bout:${boutId}`, events) };
}

export async function postMatchEvents(
  matchId: string,
  events: LiveBoutEvent[],
): Promise<LiveEventsResponse> {
  guard();
  failEventsIfAsked();

  return { accepted: keepNewEvents(`match:${matchId}`, events) };
}

/** Guarda os que ainda não lá estavam e devolve quantos foram. */
function keepNewEvents(key: string, events: LiveBoutEvent[]): number {
  const kept = state.events.get(key) ?? [];
  const seen = new Set(kept.map((event) => event.seq));
  const fresh = events.filter((event) => !seen.has(event.seq));

  state.events.set(key, [...kept, ...fresh]);
  return fresh.length;
}

/** Os eventos recebidos de um assalto, por ordem de chegada. */
export function eventsOf(kind: 'bout' | 'match', id: string): LiveBoutEvent[] {
  return state.events.get(`${kind}:${id}`) ?? [];
}

/** Se a app pediu a libertação deste assalto — o `DELETE .../start` do contrato `2.3.0`. */
export function wasReleased(kind: 'bout' | 'match', id: string): boolean {
  return state.released.includes(`${kind}:${id}`);
}

function failEventsIfAsked(): void {
  const failure = state.failNextEvents;
  if (!failure) return;
  state.failNextEvents = null;

  if (failure === 'network') throw new NetworkError();

  throw new ApiError(422, { code: 'poule_locked', message: 'A poule está bloqueada.' });
}

export async function scoreBout(boutId: string, payload: ScoreRequest): Promise<BoutScoreResponse> {
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
  if (failure === 'gone')
    throw new ApiError(404, { code: 'not_found', message: 'Não encontrado.' });

  if (failure === 'throttled') {
    throw new ApiError(429, { code: 'rate_limited', message: 'Demasiados pedidos.' }, 30);
  }

  throw new ApiError(409, {
    code: 'bout_already_scored',
    message: 'Já registado por outra pessoa.',
    current: { score_a: 4, score_b: 5, scored_at: '2026-07-24T17:31:02Z' },
  });
}

/** Só o combate do próprio código: qualquer outro id responde `404` (contrato §7). */
function ownMatch(matchId: string): MatchDetail {
  if (!state.match || state.match.id !== matchId) {
    throw new ApiError(404, { code: 'not_found', message: 'Não encontrado.' });
  }

  return state.match;
}

export async function getMatch(matchId: string): Promise<MatchDetail> {
  guard();
  return ownMatch(matchId);
}

export async function startMatch(matchId: string): Promise<StartResponse> {
  guard();

  const match = ownMatch(matchId);

  if (!match.ready) {
    throw new ApiError(409, {
      code: 'match_not_ready',
      message: 'Este combate ainda espera o vencedor da ronda anterior.',
    });
  }

  state.match = { ...match, status: 'in_progress' };
  return { id: matchId, status: 'in_progress' };
}

export async function scoreMatch(
  matchId: string,
  payload: ScoreRequest,
): Promise<MatchScoreResponse> {
  guard();
  failIfAsked();

  const match = ownMatch(matchId);

  if (!match.ready) {
    throw new ApiError(409, {
      code: 'match_not_ready',
      message: 'Este combate ainda espera o vencedor da ronda anterior.',
    });
  }

  const existing = state.submissions.get(matchId);

  if (match.status === 'done') {
    if (existing === payload.submission_id) return matchRecorded(match);

    throw new ApiError(409, {
      code: 'match_already_scored',
      message: 'Já registado por outra pessoa.',
      current: { score_a: match.score_a, score_b: match.score_b, scored_at: match.scored_at },
    });
  }

  state.match = {
    ...match,
    status: 'done',
    score_a: payload.a,
    score_b: payload.b,
    scored_at: new Date().toISOString(),
    scored_by_me: true,
  };

  state.submissions.set(matchId, payload.submission_id);
  state.version += 1;

  /*
   * **É o fim da sessão** (contrato §7): registado o resultado, não há mais nada nesta pista, o
   * token é invalidado e o pedido **seguinte** recebe `401 poule_complete`. A resposta deste
   * chega na mesma. O vencedor sobe de ronda do lado do servidor, para um combate que esta
   * sessão não alcança e que tem código próprio.
   */
  state.connected = false;
  state.endCode = 'poule_complete';

  return matchRecorded(state.match);
}

function matchRecorded(match: MatchDetail): MatchScoreResponse {
  return {
    id: match.id,
    status: 'done',
    score_a: match.score_a!,
    score_b: match.score_b!,
    // Contam o quadro inteiro, não o que esta sessão alcança (contrato §7).
    matches_done: 5,
    matches_total: 15,
  };
}
