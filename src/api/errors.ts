import { ERROR_CODES, type ErrorCode, type ErrorEnvelope } from './types';

/**
 * Erro de API normalizado. Toda a lógica do cliente decide sobre `code`, nunca sobre `message`
 * (contrato §3). Um `code` que não esteja no catálogo é aceite na mesma e tratado como genérico.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly envelope: ErrorEnvelope;

  constructor(status: number, envelope: ErrorEnvelope) {
    super(envelope.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = envelope.code;
    this.envelope = envelope;
  }

  /** `true` quando o `code` faz parte do catálogo do contrato. */
  get isKnown(): boolean {
    return isErrorCode(this.code);
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
