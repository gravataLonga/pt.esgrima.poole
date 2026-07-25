/**
 * Cliente HTTP único. Nenhum `fetch` solto no resto da app.
 *
 * Responsabilidades quando for implementado (F1): cabeçalhos do contrato §2, envelope de erro §3,
 * retry com backoff §4, ETag/If-None-Match §5 e leitura de `X-Session-Expires-At` §6.
 *
 * ESQUELETO — por implementar na F1.
 */

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  /** Valor de `If-None-Match`, quando o pedido suporta validação condicional. */
  etag?: string;
  signal?: AbortSignal;
}

export interface ApiResponse<T> {
  data: T;
  etag?: string;
  /** Valor de `X-Session-Expires-At`, quando presente. */
  sessionExpiresAt?: string;
}

export function request<T>(_path: string, _options: RequestOptions = {}): Promise<ApiResponse<T>> {
  return Promise.reject(new Error('api/client: por implementar (F1)'));
}
