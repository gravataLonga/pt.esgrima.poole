/**
 * Leitura do payload do QR — contrato §9.
 *
 * Fallbacks, por ordem: JSON `v1` → `base_url` + `pin`; string de 6 dígitos → `base_url` da última
 * sessão; qualquer outra coisa → "QR não reconhecido". Uma `v` desconhecida é rejeitada com
 * mensagem própria ("atualiza a app"), não silenciosamente.
 *
 * ESQUELETO — por implementar na F1, junto com o `expo-camera`.
 */

import type { QrPayloadV1 } from '@/api/types';

export type QrParseResult =
  | { kind: 'payload'; payload: QrPayloadV1 }
  | { kind: 'pin'; pin: string }
  | { kind: 'unsupported_version'; version: number }
  | { kind: 'unrecognised' };

export function parseQr(_raw: string): QrParseResult {
  throw new Error('qr/parse: por implementar (F1)');
}
