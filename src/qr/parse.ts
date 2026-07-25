/**
 * Leitura do payload do QR — contrato §9.
 *
 * Fallbacks, por ordem: JSON `v1` → `base_url` + `pin`; string de 6 dígitos → `base_url` da última
 * sessão; qualquer outra coisa → "QR não reconhecido". Uma `v` desconhecida é rejeitada com
 * mensagem própria ("atualiza a app"), não silenciosamente.
 *
 * Função pura: não conhece a câmara nem o store. Quem chama é que decide o que fazer com o
 * resultado — e, no caso `pin`, de onde vem o `base_url`.
 */

import type { QrPayloadV1 } from '@/api/types';

export type QrParseResult =
  | { kind: 'payload'; payload: QrPayloadV1 }
  | { kind: 'pin'; pin: string }
  | { kind: 'unsupported_version'; version: number }
  /**
   * Fora dos três fallbacks do contrato. O contrato manda recusar `http://` e recusar é o que isto
   * faz — mas com mensagem própria: quem aponta a app a um servidor de teste em `http://` acerta no
   * QR e no PIN, e "QR não reconhecido" mandava-o procurar o erro no sítio errado.
   */
  | { kind: 'insecure_base_url'; baseUrl: string }
  | { kind: 'unrecognised' };

const PIN = /^\d{6}$/;

/**
 * `https://host[:porta][/caminho]`. O caminho fica porque *self-hosting* pode viver num subdiretório;
 * query e fragmento não têm lugar num `base_url` e derrubam o match.
 */
const BASE_URL = /^(https?):\/\/([a-z0-9.-]+)(?::\d+)?(\/[^?#\s]*)?$/i;

/** Exceção de desenvolvimento do contrato §9 — só estes toleram `http://`. */
const LOCAL_HOST =
  /^(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/i;

export function parseQr(raw: string): QrParseResult {
  const text = raw.trim();

  // Antes do JSON: um QR que carregue só o PIN é o fallback 2 do contrato e nunca é JSON válido.
  if (PIN.test(text)) return { kind: 'pin', pin: text };

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { kind: 'unrecognised' };
  }

  if (typeof data !== 'object' || data === null) return { kind: 'unrecognised' };

  const { v, base_url: rawBaseUrl, pin } = data as Record<string, unknown>;

  // A versão decide-se primeiro: num payload de uma `v` futura o resto dos campos pode ter mudado
  // de forma, e validá-los contra a v1 daria "não reconhecido" onde a mensagem certa é "atualiza".
  if (typeof v !== 'number' || !Number.isInteger(v)) return { kind: 'unrecognised' };
  if (v !== 1) return { kind: 'unsupported_version', version: v };

  if (typeof pin !== 'string' || !PIN.test(pin)) return { kind: 'unrecognised' };
  if (typeof rawBaseUrl !== 'string') return { kind: 'unrecognised' };

  const match = BASE_URL.exec(rawBaseUrl.trim());
  if (!match) return { kind: 'unrecognised' };

  // Os grupos 1 e 2 não são opcionais no padrão; os valores por omissão existem só para o
  // `noUncheckedIndexedAccess`, que não sabe ler isso da expressão regular.
  const [, scheme = '', host = ''] = match;
  // O contrato diz "sem barra final", mas recusar por causa dela punia o árbitro por um erro do
  // servidor. Normaliza-se — `{base_url}/api/v1` tem de dar uma barra só.
  const baseUrl = rawBaseUrl.trim().replace(/\/+$/, '');

  if (scheme.toLowerCase() === 'http' && !LOCAL_HOST.test(host)) {
    return { kind: 'insecure_base_url', baseUrl };
  }

  return { kind: 'payload', payload: { v: 1, base_url: baseUrl, pin } };
}
