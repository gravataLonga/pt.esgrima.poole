/**
 * Tipos do contrato de API — fonte de verdade única.
 *
 * Tipados a partir de `docs/API-CONTRACT.md` v1.5.0 (§7 Endpoints, §8 Catálogo de erros,
 * §9 Emparelhamento QR/PIN). Este ficheiro não contém mais nada: sem lógica, sem helpers.
 *
 * Regra de tolerância (contrato §1): a app ignora campos que não conhece e nunca falha por os
 * receber. As interfaces abaixo descrevem o mínimo garantido, não o máximo possível.
 */

/**
 * Versão do contrato **em vigor nos dois lados**. A plataforma passou a servi-lo por inteiro
 * (contrato §11) e a app passou a falar com ela — deixou de ser a versão só do documento.
 */
export const API_CONTRACT_VERSION = '1.5.0';

/** Prefixo de versão da API. Um MAJOR do contrato implica um prefixo novo. */
export const API_PREFIX = '/api/v1';

// ─── Objetos partilhados (contrato §7) ──────────────────────────────────────

export interface Fencer {
  /** Id do atleta dentro da poule. */
  id: number;
  /**
   * Número na folha de poule, 1..n — é o que o árbitro chama em voz alta.
   * **`null` na eliminatória**, onde o atleta chega do quadro e já não tem número de folha.
   */
  number: number | null;
  name: string;
  club: string | null;
}

export type BoutStatus = 'pending' | 'in_progress' | 'done';

export interface Bout {
  /**
   * Id **opaco**. Nunca interpretar, decompor, ordenar ou construir — só devolver tal e qual.
   * É isto que isola a app da representação interna dos assaltos na plataforma.
   */
  id: string;
  /** Ordem de disputa, ≥ 1. O cliente não reordena. */
  sequence: number;
  status: BoutStatus;
  fencer_a: Fencer;
  fencer_b: Fencer;
  /** `null` enquanto `status !== 'done'`. */
  score_a: number | null;
  score_b: number | null;
  /**
   * ISO-8601 UTC. **`null` mesmo com `status: 'done'`** em resultados anteriores às colunas de
   * metadados da plataforma (contrato §12) — o resultado mostra-se à mesma, sem hora.
   */
  scored_at: string | null;
  /** `true` se foi a sessão atual a registar. Distingue "eu registei" de "outro registou". */
  scored_by_me: boolean;
}

/** Arma da competição. Determina que regras a app oferece — não há passividade no sabre. */
export type Weapon = 'foil' | 'epee' | 'sabre';

/** Progresso do quadro de uma poule. `null` no `PouleSummary` enquanto o quadro não existir. */
export interface EliminationProgress {
  matches_total: number;
  matches_done: number;
}

export interface PouleSummary {
  uuid: string;
  name: string;
  /** `null` se a poule for isolada (fora de um torneio). */
  tournament_name: string | null;
  /** Toques que terminam um assalto. Os presets vêm sempre da API, nunca hardcoded. */
  touch_cap: number;
  /** Duração de **um** período, em segundos. */
  duration_seconds: number;
  /** Número de períodos. `1` em poule. */
  periods: number;
  /** Descanso entre períodos, em segundos (FIE: 60). Ausente, `null` ou `0` → sem descanso. */
  rest_seconds?: number | null;
  /** Morte súbita com prioridade sorteada, em segundos (FIE t.41). Ausente ou `null` → 60. */
  sudden_death_seconds?: number | null;
  /** Minuto de não combatividade (FIE t.87). Ausente ou `null` → 60; `0` → não conta. */
  passivity_seconds?: number | null;
  /** Ausente ou `null` → a app não assume arma nenhuma e oferece o conjunto comum. */
  weapon?: Weapon | null;
  bouts_total: number;
  bouts_done: number;
  /** `true` → eliminatórias geradas; escrita **sobre assaltos de poule** devolve 422. */
  locked: boolean;
  /**
   * `true` → poule de torneio: a ordem é para cumprir e o `sequence` é estável.
   * `false` → poule isolada: o plantel muda, a ordem é regerada, não há "próximo assalto".
   */
  ordered: boolean;
  /** `null` enquanto o quadro não existir. Presente → há quadro desta poule para arbitrar. */
  elimination: EliminationProgress | null;
}

/** O equivalente para uma sessão de âmbito `tournament`, que arbitra o quadro e mais nada. */
export interface TournamentSummary {
  uuid: string;
  name: string;
  weapon?: Weapon | null;
  /** Progresso do quadro. `0`/`0` enquanto o quadro não for gerado. */
  matches_total: number;
  matches_done: number;
  /** `true` → o quadro já não aceita escrita. */
  locked: boolean;
}

export interface EliminationMatch {
  /** Id **opaco**, como o do assalto. */
  id: string;
  /** Tamanho do quadro — `8` num quadro de 8. Constante em todas as rondas. */
  bracket: number;
  /** Ronda, a contar do início do quadro. A app **não** deduz o nome da ronda daqui. */
  round: number;
  /** Posição dentro da ronda. É a ordem por que as pistas são chamadas. */
  position: number;
  status: BoutStatus;
  /** `false` → um dos lados ainda espera o vencedor da ronda anterior. Não abre. */
  ready: boolean;
  /** `null` enquanto o lugar não estiver preenchido. `number` é sempre `null` aqui. */
  fencer_a: Fencer | null;
  fencer_b: Fencer | null;
  score_a: number | null;
  score_b: number | null;
  scored_at: string | null;
  scored_by_me: boolean;
}

// ─── POST /connect ──────────────────────────────────────────────────────────

export interface ConnectRequest {
  /** 6 dígitos, só numérico. */
  pin: string;
  /** ≤ 64 chars. Mostrado na web em "quem está a arbitrar". */
  device_name?: string;
}

/** O que a sessão alcança. Determina o resto da resposta e o ecrã que a app abre. */
export type SessionScope = 'poule' | 'tournament';

export interface ConnectResponse {
  token: string;
  /** ISO-8601 UTC. */
  expires_at: string;
  scope: SessionScope;
  /** `PouleSummary` com `scope: 'poule'`; `null` com `scope: 'tournament'`. */
  poule: PouleSummary | null;
  /** `TournamentSummary` com `scope: 'tournament'`; `null` com `scope: 'poule'`. */
  tournament: TournamentSummary | null;
}

// ─── GET /poules/{poule}/bouts ──────────────────────────────────────────────

export interface BoutsResponse {
  poule: PouleSummary;
  /** Já ordenados por `sequence` pelo servidor. */
  bouts: Bout[];
}

// ─── GET /poules/{poule}/standings ──────────────────────────────────────────

export interface Standing {
  fencer: Fencer;
  /** **V** — vitórias. */
  victories: number;
  /** **M** — assaltos já disputados. `0` enquanto o atleta não jogar. */
  bouts: number;
  /** **TD/TS** — toques dados. */
  given: number;
  /** **TR** — toques recebidos. */
  received: number;
  /** Indicador, `given - received`. Pode ser negativo. */
  diff: number;
  /** Lugar. Empates completos partilham o lugar e saltam o seguinte (1, 2, 2, 4). */
  place: number;
}

export interface StandingsResponse {
  poule: PouleSummary;
  /** Já ordenada por lugar pelo servidor. O cliente **não** reordena. */
  standings: Standing[];
}

// ─── GET /poules/{poule}/elimination · /tournaments/{tournament}/elimination ─

export interface PouleEliminationResponse {
  poule: PouleSummary;
  /** Já ordenados por `round` e depois por `position`. Vazio → quadro por gerar. */
  matches: EliminationMatch[];
}

export interface TournamentEliminationResponse {
  tournament: TournamentSummary;
  matches: EliminationMatch[];
}

// ─── GET /bouts/{bout} · GET /elimination/{match} ───────────────────────────

/** Presets do cronómetro, iguais nos dois detalhes. Todos vêm da API, nenhum é hardcoded. */
export interface ClockPresets {
  /** Toques que terminam o assalto. `touch_cap` na poule, 15 por omissão no quadro. */
  target: number;
  /** Duração de **um** período, em segundos. */
  duration_seconds: number;
  /** Nº de períodos. `1` em poule, `3` por omissão num quadro. */
  periods: number;
  rest_seconds?: number | null;
  sudden_death_seconds?: number | null;
  passivity_seconds?: number | null;
  weapon?: Weapon | null;
}

export interface BoutDetail extends ClockPresets {
  id: string;
  sequence: number;
  status: BoutStatus;
  fencer_a: Fencer;
  fencer_b: Fencer;
  score_a: number | null;
  score_b: number | null;
  /** `false` em poule — o cliente desativa o submeter enquanto `a === b`. */
  allow_draw: boolean;
  /** `true` → só leitura. */
  poule_locked: boolean;
}

export interface EliminationMatchDetail extends ClockPresets {
  id: string;
  bracket: number;
  round: number;
  position: number;
  status: BoutStatus;
  ready: boolean;
  fencer_a: Fencer | null;
  fencer_b: Fencer | null;
  score_a: number | null;
  score_b: number | null;
  /** `false` — um combate de quadro tem de ter vencedor, senão ninguém sobe. */
  allow_draw: boolean;
  /** `true` → quadro fechado, só leitura. */
  locked: boolean;
}

// ─── POST .../start ─────────────────────────────────────────────────────────

export interface StartResponse {
  id: string;
  status: 'in_progress';
}

// ─── POST .../score ─────────────────────────────────────────────────────────

/** Conjunto fechado (contrato §7). Um `type` fora da lista devolve `422 validation_failed`. */
export type BoutEventType =
  | 'touch'
  | 'double'
  | 'card_yellow'
  | 'card_red'
  | 'card_black'
  | 'priority'
  | 'period_end';

export interface BoutEvent {
  type: BoutEventType;
  /** Ausente quando não se aplica (ex.: `double`). */
  side?: 'a' | 'b';
  /** Período em que ocorreu. A morte súbita é `periods + 1`. */
  period: number;
  /** Milissegundos decorridos **dentro do período**, medidos pelo cronómetro local. */
  at_ms: number;
}

/** Máximo de eventos por assalto (contrato §7). Acima disso, `422 validation_failed`. */
export const MAX_BOUT_EVENTS = 200;

// ─── POST .../events — a pista ao vivo (contrato 1.5.0, §7) ─────────────────

/**
 * O mesmo evento, enviado **enquanto o assalto decorre** em vez de em lote no fim.
 *
 * Duas diferenças em relação ao `BoutEvent` do `score`: o contador, que é a idempotência toda, e o
 * placar depois do evento — que vem contado pela app e **não** é recalculado pelo servidor.
 */
export interface LiveBoutEvent extends BoutEvent {
  /** Contador do próprio assalto, a partir de `1`. O assalto seguinte volta a numerar de `1`. */
  seq: number;
  /** Placar **depois** do evento. É o que a web mostra enquanto o assalto decorre. */
  score_a?: number;
  score_b?: number;
}

/** Eventos por pedido (contrato §7): 1 a 50. Acima disso, `422 validation_failed`. */
export const MAX_EVENTS_PER_REQUEST = 50;

export interface LiveEventsRequest {
  events: LiveBoutEvent[];
}

/** `accepted` é quantos eram novos. `0` quer dizer que já lá estavam todos — o pedido correu bem. */
export interface LiveEventsResponse {
  accepted: number;
}

export interface ScoreRequest {
  /**
   * UUID v4 gerado pelo cliente **uma vez**, no momento em que o árbitro confirma o resultado.
   * Chave de idempotência (contrato §4): não muda entre tentativas e sobrevive à rotação do
   * token — é a mesma tentativa a repetir-se, não uma nova.
   */
  submission_id: string;
  /** Inteiro, `0 ≤ a ≤ target`, corresponde a `fencer_a`. */
  a: number;
  /** Inteiro, `0 ≤ b ≤ target`, corresponde a `fencer_b`. */
  b: number;
  /** Linha temporal do assalto, para estatística. Descritiva, não autoritária. */
  events?: BoutEvent[];
}

/** Corpo de 201 (gravado agora) e de 200 (retry da mesma submissão). */
export interface BoutScoreResponse {
  id: string;
  status: 'done';
  score_a: number;
  score_b: number;
  bouts_done: number;
  bouts_total: number;
}

export interface MatchScoreResponse {
  id: string;
  status: 'done';
  score_a: number;
  score_b: number;
  matches_done: number;
  matches_total: number;
}

/** Campo extra do 409 `bout_already_scored` / `match_already_scored`. */
export interface ScoreConflictCurrent {
  score_a: number | null;
  score_b: number | null;
  /** ISO-8601 UTC. */
  scored_at: string | null;
}

// ─── GET /session ───────────────────────────────────────────────────────────

/** Mesma forma do `POST /connect`, sem o `token` — que a app já tem. */
export interface SessionResponse {
  expires_at: string;
  scope: SessionScope;
  poule: PouleSummary | null;
  tournament: TournamentSummary | null;
}

// ─── Erros (contrato §3 e §8) ───────────────────────────────────────────────

/**
 * Catálogo de `code`. São **estáveis** e a única coisa sobre a qual o cliente faz lógica —
 * nunca sobre `message`. Um `code` fora desta lista é tratado como erro genérico recuperável.
 */
export const ERROR_CODES = [
  'pin_invalid',
  'competition_finished',
  'pin_throttled',
  'token_expired',
  'token_revoked',
  'poule_complete',
  'poule_scope_mismatch',
  'not_found',
  'bout_already_scored',
  'match_already_scored',
  'match_not_ready',
  'poule_locked',
  'validation_failed',
  'rate_limited',
  'server_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorEnvelope {
  /** String estável do catálogo — ou desconhecida, se o servidor for mais recente. */
  code: string;
  /** Texto pt-PT já pronto a mostrar ao árbitro. */
  message: string;
  /** Só em `validation_failed`: mapa campo → lista de mensagens. */
  errors?: Record<string, string[]>;
  /** Só em `bout_already_scored` / `match_already_scored`. */
  current?: ScoreConflictCurrent;
}

// ─── Emparelhamento QR / PIN (contrato §9) ──────────────────────────────────

export interface QrPayloadV1 {
  v: 1;
  /** Sem barra final. `https://`, exceto em dev contra host local. */
  base_url: string;
  /** 6 dígitos. */
  pin: string;
}

// ─── Cabeçalhos (contrato §2) ───────────────────────────────────────────────

/** Presente em todas as respostas em que um token foi resolvido — **nunca** num 401. */
export const HEADER_SESSION_EXPIRES_AT = 'X-Session-Expires-At';
export const HEADER_CLIENT = 'X-Client';
