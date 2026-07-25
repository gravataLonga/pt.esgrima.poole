/**
 * Cliente HTTP único. Nenhum `fetch` solto no resto da app.
 *
 * Cobre o contrato §2 (cabeçalhos), §3 (envelope de erro), §4 (retry com backoff), §5
 * (ETag/If-None-Match) e §6 (`X-Session-Expires-At`).
 *
 * **Sem imports de `react-native`, de propósito.** O que este ficheiro faz é HTTP e mais nada, e
 * mantê-lo assim é o que permite corrê-lo contra o servidor a sério (`src/api/live.test.ts`). O
 * que precisa da plataforma — o `X-Client`, o `base_url` — entra por `configureClient`.
 */

import { ApiError, NetworkError } from './errors';
import { API_PREFIX, HEADER_CLIENT, HEADER_SESSION_EXPIRES_AT, type ErrorEnvelope } from './types';

export interface ClientConfig {
  /** Sem barra final e sem `/api/v1` — o prefixo é acrescentado aqui. */
  baseUrl: string;
  /** `null` antes de ligar. Nunca vai para log nem para relatório de crash (spec §9). */
  token: string | null;
  /** Valor do `X-Client`. Ex.: `poole-referee-app/0.1.0 (ios 17.4)`. */
  clientHeader: string;
}

/**
 * Um pedido a um servidor que não responde não pode ficar pendurado: em pavilhão a rede não cai,
 * engasga-se, e uma promessa que nunca resolve é um botão a girar para sempre. Ao fim disto a
 * tentativa conta como falha de rede — e um resultado por registar vai para a fila.
 */
export const REQUEST_TIMEOUT_MS = 12_000;

/** Tentativas de um `GET` (contrato §4): 3 no total, com backoff exponencial e jitter. */
export const GET_RETRIES = 3;

const BACKOFF_MS = [1_000, 2_000, 4_000];

/** Teto da espera quando o servidor manda `Retry-After` (contrato §5). */
export const MAX_BACKOFF_MS = 60_000;

let config: ClientConfig = {
  baseUrl: '',
  token: null,
  clientHeader: 'poole-referee-app',
};

/**
 * Conta as trocas de token. Um pedido leva o número que valia quando partiu, e quem o ouvir do
 * outro lado pode comparar.
 *
 * É o que impede uma resposta atrasada de derrubar a sessão que a substituiu: em pavilhão um `GET`
 * pode passar meio minuto no ar entre esperas e tentativas, e um `401` do token velho chega depois
 * de o árbitro já ter voltado a ligar-se. Sem isto, esse `401` apagava o token novo.
 */
let epoch = 0;

export function configureClient(next: Partial<ClientConfig>): void {
  if ('token' in next && next.token !== config.token) epoch += 1;
  config = { ...config, ...next };
}

/** O número da sessão em curso. A store guarda-o para reconhecer sinais fora de prazo. */
export function sessionEpoch(): number {
  return epoch;
}

export function clientConfig(): Readonly<ClientConfig> {
  return config;
}

/**
 * O que o cliente aprende sobre a sessão em cada resposta. A store da sessão subscreve isto em vez
 * de o cliente a importar — sem isso, `client → store → client` fecha um ciclo de imports.
 */
export type SessionSignal =
  /** Um token válido foi resolvido; a janela deslizante recomeçou (contrato §6). */
  | { kind: 'alive'; expiresAt: string; epoch: number }
  /** `401`: o token morreu. O `code` diz qual dos três foi (contrato §11 B). */
  | { kind: 'unauthorized'; code: string; message: string; epoch: number };

type SessionListener = (signal: SessionSignal) => void;

const listeners = new Set<SessionListener>();

export function onSessionSignal(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(signal: SessionSignal): void {
  for (const listener of listeners) listener(signal);
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  /** Valor de `If-None-Match`, quando o pedido suporta validação condicional (contrato §5). */
  etag?: string;
  /** `POST /connect` é o único endpoint sem token. */
  anonymous?: boolean;
  /** Tentativas. Por omissão 3 num `GET` e 1 no resto — quem repete o `score` é a fila. */
  retries?: number;
  signal?: AbortSignal;
}

export interface ApiResponse<T> {
  status: number;
  /** `null` num `304` (o cliente mantém a cache) e num `204`. */
  data: T | null;
  /** `true` quando o servidor confirmou que nada mudou. */
  notModified: boolean;
  etag?: string;
  sessionExpiresAt?: string;
}

/** Espera com jitter de ±30% (contrato §4) — sem ele, N dispositivos repetem em uníssono. */
export function backoffFor(attempt: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds !== undefined) {
    return Math.min(retryAfterSeconds * 1_000, MAX_BACKOFF_MS);
  }

  const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 1_000;
  return Math.round(base * (0.7 + Math.random() * 0.6));
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Repetir um 4xx não o faz passar a valer — exceto quando o servidor pediu para esperar. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof ApiError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return false;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const method = options.method ?? 'GET';
  const attempts = options.retries ?? (method === 'GET' ? GET_RETRIES : 1);

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      const retryAfter = lastError instanceof ApiError ? lastError.retryAfterSeconds : undefined;
      await sleep(backoffFor(attempt - 1, retryAfter));
    }

    try {
      return await attemptRequest<T>(path, method, options);
    } catch (error) {
      if (!isRetryable(error) || attempt === attempts - 1) throw error;
      lastError = error;
    }
  }

  // Inalcançável — o ciclo devolve ou lança em todas as tentativas. Fica pelo verificador de tipos.
  throw lastError ?? new NetworkError();
}

async function attemptRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  options: RequestOptions,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    [HEADER_CLIENT]: config.clientHeader,
  };

  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.etag) headers['If-None-Match'] = options.etag;
  if (!options.anonymous && config.token) headers.Authorization = `Bearer ${config.token}`;

  // `AbortSignal.timeout` ainda não existe em todos os motores onde a app corre; o controlador à
  // mão funciona em todos e ainda deixa encadear o `signal` de quem chamou.
  // Fotografado antes de partir: é a este token que a resposta vai dizer respeito, mesmo que
  // entretanto haja outro.
  const sentUnder = epoch;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener('abort', abortFromCaller);

  let response: Response;

  try {
    response = await fetch(`${config.baseUrl}${API_PREFIX}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    // Timeout, DNS, socket cortado — para o árbitro é tudo a mesma coisa: não houve resposta. A
    // distinção só interessaria a um log que a spec §9 não deixa escrever.
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }

  const sessionExpiresAt = response.headers.get(HEADER_SESSION_EXPIRES_AT) ?? undefined;
  if (sessionExpiresAt) emit({ kind: 'alive', expiresAt: sessionExpiresAt, epoch: sentUnder });

  const etag = strongEtag(response.headers.get('ETag'));

  if (response.status === 304) {
    return {
      status: 304,
      data: null,
      notModified: true,
      // O servidor compara a string em bruto, aspas incluídas; devolver a que enviámos mantém a
      // próxima validação condicional a bater certo mesmo quando o 304 vem sem `ETag`.
      etag: etag ?? options.etag,
      sessionExpiresAt,
    };
  }

  const payload = response.status === 204 ? null : await readJson(response);

  if (!response.ok) {
    const envelope = asEnvelope(payload, response.status);
    const retryAfter = Number(response.headers.get('Retry-After'));

    if (response.status === 401) {
      emit({
        kind: 'unauthorized',
        code: envelope.code,
        message: envelope.message,
        epoch: sentUnder,
      });
    }

    throw new ApiError(
      response.status,
      envelope,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }

  return { status: response.status, data: payload as T, notModified: false, etag, sessionExpiresAt };
}

/**
 * Devolve o `ETag` na forma **forte**, sem o prefixo `W/`.
 *
 * Um proxy que comprime a resposta enfraquece o `ETag` — o nginx à frente da plataforma serve
 * `W/"abc"` a quem manda `Accept-Encoding: gzip`, que é toda a gente, o `fetch` do React Native
 * incluído. O servidor compara o `If-None-Match` por **igualdade de string** com o `ETag` forte que
 * gerou, por isso devolver-lhe o `W/"abc"` que ele próprio mandou nunca casa: a resposta é sempre
 * `200` com o corpo inteiro, e o `304` do contrato §5 nunca acontece em produção.
 *
 * Reenviar a forma forte resolve-o do lado do cliente, e continua a estar certo se o servidor
 * passar a fazer a comparação fraca que o RFC 9110 §13.1.2 manda fazer no `If-None-Match` — que é
 * a correção a sério, e está anotada no contrato §5.
 */
function strongEtag(value: string | null): string | undefined {
  if (!value) return undefined;
  return value.startsWith('W/') ? value.slice(2) : value;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Um erro sem envelope — proxy do pavilhão, página de manutenção, 502 em HTML — não pode rebentar
 * o cliente. Vira um `server_error` com uma mensagem que se pode mostrar (contrato §3).
 */
function asEnvelope(payload: unknown, status: number): ErrorEnvelope {
  if (payload && typeof payload === 'object') {
    const candidate = payload as Partial<ErrorEnvelope>;
    if (typeof candidate.code === 'string' && typeof candidate.message === 'string') {
      return candidate as ErrorEnvelope;
    }
  }

  return { code: 'server_error', message: `HTTP ${status}` };
}
