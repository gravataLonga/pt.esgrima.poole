/**
 * Tipos do contrato de API — fonte de verdade única.
 *
 * Tipados a partir de `docs/API-CONTRACT.md` v1.0.0 (§7 Endpoints, §8 Catálogo de erros,
 * §9 Emparelhamento QR/PIN). Este ficheiro não contém mais nada: sem lógica, sem helpers.
 *
 * Regra de tolerância (contrato §1): a app ignora campos que não conhece e nunca falha por os
 * receber. As interfaces abaixo descrevem o mínimo garantido, não o máximo possível.
 */

/**
 * Versão do contrato **em vigor**, não a versão do documento. As `1.1.0` e `1.2.0` estão propostas
 * só deste lado e por espelhar na plataforma (ADR-017), portanto o que os dois lados garantem
 * continua a ser a `1.0.0`. Sobe quando a plataforma implementar.
 */
export const API_CONTRACT_VERSION = '1.0.0';

/** Prefixo de versão da API. Um MAJOR do contrato implica um prefixo novo. */
export const API_PREFIX = '/api/v1';

// ─── Objetos partilhados (contrato §7) ──────────────────────────────────────

export interface Fencer {
  /** Id do atleta dentro da poule. */
  id: number;
  /** Número na folha de poule, 1..n — é o que o árbitro chama em voz alta. */
  number: number;
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
  /** ISO-8601 UTC. */
  scored_at: string | null;
  /** `true` se foi a sessão atual a registar. Distingue "eu registei" de "outro registou". */
  scored_by_me: boolean;
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
  /**
   * Descanso entre períodos, em segundos (FIE: 60). Ausente, `null` ou `0` → sem descanso.
   * Aditivo em 1.1.0: um servidor em 1.0.0 não o manda, e a app não oferece descanso.
   */
  rest_seconds?: number | null;
  bouts_total: number;
  bouts_done: number;
  /** `true` → eliminatórias geradas; toda a escrita passa a devolver 422. */
  locked: boolean;
}

// ─── POST /connect ──────────────────────────────────────────────────────────

export interface ConnectRequest {
  /** 6 dígitos, só numérico. */
  pin: string;
  /** ≤ 64 chars. Mostrado na web em "quem está a arbitrar". */
  device_name?: string;
}

export interface ConnectResponse {
  token: string;
  /** ISO-8601 UTC. */
  expires_at: string;
  poule: PouleSummary;
}

// ─── GET /poules/{poule}/bouts ──────────────────────────────────────────────

export interface BoutsResponse {
  poule: PouleSummary;
  /** Já ordenados por `sequence` pelo servidor. */
  bouts: Bout[];
}

// ─── GET /bouts/{bout} ──────────────────────────────────────────────────────

export interface BoutDetail {
  id: string;
  sequence: number;
  status: BoutStatus;
  fencer_a: Fencer;
  fencer_b: Fencer;
  score_a: number | null;
  score_b: number | null;
  /** Toques que terminam o assalto. Igual ao `touch_cap` da poule. */
  target: number;
  duration_seconds: number;
  periods: number;
  /** O mesmo campo do `PouleSummary`. */
  rest_seconds?: number | null;
  /** `false` em poule — o cliente desativa o submeter enquanto `a === b`. */
  allow_draw: boolean;
  /** `true` → só leitura. */
  poule_locked: boolean;
}

// ─── POST /bouts/{bout}/start ───────────────────────────────────────────────

export interface StartResponse {
  id: string;
  status: 'in_progress';
}

// ─── POST /bouts/{bout}/score ───────────────────────────────────────────────

export interface ScoreRequest {
  /** Inteiro, `0 ≤ a ≤ target`, corresponde a `fencer_a`. */
  a: number;
  /** Inteiro, `0 ≤ b ≤ target`, corresponde a `fencer_b`. */
  b: number;
}

/** Corpo de 201 (gravado agora) e de 200 (retry seguro da mesma sessão com o mesmo resultado). */
export interface ScoreResponse {
  id: string;
  status: 'done';
  score_a: number;
  score_b: number;
  bouts_done: number;
  bouts_total: number;
}

/** Campo extra do 409 `bout_already_scored`. */
export interface ScoreConflictCurrent {
  score_a: number;
  score_b: number;
  /** ISO-8601 UTC. */
  scored_at: string;
}

// ─── GET /session ───────────────────────────────────────────────────────────

export interface SessionResponse {
  expires_at: string;
  poule: PouleSummary;
}

// ─── Erros (contrato §3 e §8) ───────────────────────────────────────────────

/**
 * Catálogo de `code`. São **estáveis** e a única coisa sobre a qual o cliente faz lógica —
 * nunca sobre `message`. Um `code` fora desta lista é tratado como erro genérico recuperável.
 */
export const ERROR_CODES = [
  'pin_invalid',
  'pin_expired',
  'pin_throttled',
  'token_expired',
  'token_revoked',
  'poule_complete',
  'poule_scope_mismatch',
  'not_found',
  'bout_already_scored',
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
  /** Só em `bout_already_scored`. */
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

/** Presente em todas as respostas autenticadas, incluindo 4xx. */
export const HEADER_SESSION_EXPIRES_AT = 'X-Session-Expires-At';
export const HEADER_CLIENT = 'X-Client';
