import { ERROR_CODES, type ErrorCode, type ErrorEnvelope, type ScoreConflictCurrent } from './types';

/**
 * Erro de API normalizado. Toda a lógica do cliente decide sobre `code`, nunca sobre `message`
 * (contrato §3). Um `code` que não esteja no catálogo é aceite na mesma e tratado como genérico.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly envelope: ErrorEnvelope;
  /** Do cabeçalho `Retry-After`, quando o servidor o mandou (429). */
  readonly retryAfterSeconds?: number;

  constructor(status: number, envelope: ErrorEnvelope, retryAfterSeconds?: number) {
    super(envelope.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = envelope.code;
    this.envelope = envelope;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** `true` quando o `code` faz parte do catálogo do contrato. */
  get isKnown(): boolean {
    return isErrorCode(this.code);
  }

  /** O resultado que ganhou a corrida, num 409. */
  get current(): ScoreConflictCurrent | undefined {
    return this.envelope.current;
  }
}

export function isErrorCode(code: string): code is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(code);
}

/** Falha de transporte: não houve resposta do servidor (contrato §8, última linha). */
export class NetworkError extends Error {
  constructor(message = 'No response from the server.') {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Fim de sessão. Os três `code` de 401 chegam ao mesmo sítio — o ecrã de ligar — mas com razões
 * diferentes escritas, e o `poule_complete` nem sequer é erro (contrato §8).
 */
export function isUnauthorized(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401;
}

/**
 * O assalto já não existe do lado do servidor, ou nunca foi desta competição.
 *
 * O `403 poule_scope_mismatch` conta como o mesmo caso: o servidor responde "não existe" em vez de
 * "não é seu" para não revelar que ids existem no resto da prova, e o contrato §8 manda o cliente
 * tolerar as duas — o comportamento a programar é o do `404`.
 */
export function isGone(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 404 || error.code === 'poule_scope_mismatch');
}

/** Já registado por outra pessoa (assalto de poule ou combate de quadro). */
export function isConflict(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    (error.code === 'bout_already_scored' || error.code === 'match_already_scored')
  );
}
