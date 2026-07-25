/**
 * Uma função por endpoint do contrato §7. Cada uma delega no cliente único de `client.ts`.
 *
 * ESQUELETO — por implementar na F1/F2/F3.
 */

import type {
  BoutDetail,
  BoutsResponse,
  ConnectRequest,
  ConnectResponse,
  ScoreRequest,
  ScoreResponse,
  SessionResponse,
  StartResponse,
} from './types';

const notImplemented = (endpoint: string): Promise<never> =>
  Promise.reject(new Error(`api/endpoints: ${endpoint} por implementar`));

export function connect(_body: ConnectRequest): Promise<ConnectResponse> {
  return notImplemented('POST /connect');
}

export function getBouts(_pouleUuid: string, _etag?: string): Promise<BoutsResponse> {
  return notImplemented('GET /poules/{poule}/bouts');
}

export function getBout(_boutId: string): Promise<BoutDetail> {
  return notImplemented('GET /bouts/{bout}');
}

export function startBout(_boutId: string): Promise<StartResponse> {
  return notImplemented('POST /bouts/{bout}/start');
}

export function scoreBout(_boutId: string, _body: ScoreRequest): Promise<ScoreResponse> {
  return notImplemented('POST /bouts/{bout}/score');
}

export function getSession(): Promise<SessionResponse> {
  return notImplemented('GET /session');
}

export function deleteSession(): Promise<void> {
  return notImplemented('DELETE /session');
}
