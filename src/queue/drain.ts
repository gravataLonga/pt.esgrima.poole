/**
 * Drenagem da fila de submissões — spec §8.
 *
 * Dispara quando a app volta ao *foreground*, quando um `score` falha, ou de 30 em 30 s. Por
 * ordem, um item de cada vez: dois `POST` em paralelo sobre a mesma poule não ganham nada e
 * multiplicam o risco de bater no limite de 60/min.
 *
 * Tratamento por resposta (spec §8): `201`/`200` remove · `409` remove e notifica · `404` remove,
 * notifica e pede *refetch* · `422` remove e reporta · `401` **para e mantém a fila**.
 */

import { scoreBout, scoreMatch } from '@/api/endpoints';
import { ApiError, isConflict, isGone, isUnauthorized, NetworkError } from '@/api/errors';

import { useQueueStore, type QueuedScore } from './store';

export const DRAIN_INTERVAL_MS = 30_000;

/** Uma drenagem de cada vez. Duas em simultâneo enviariam o mesmo item duas vezes. */
let draining = false;

export interface DrainOutcome {
  /** Itens que ficaram registados no servidor nesta passagem. */
  sent: number;
  /** Itens que saíram da fila sem ficar registados (409/404/422). */
  dropped: number;
  /** `true` quando parou por falta de rede ou por `401` — a fila fica como estava. */
  interrupted: boolean;
}

/**
 * @param competitionUuid Só se drena o que pertence à competição ligada.
 *
 * A fila é **por competição** (spec §8). Sem este filtro, ligar-se a uma poule nova com resultados
 * por enviar de outra mandava-os com o token errado: o servidor responde `404` — não é seu — e a
 * app deitava-os fora com um aviso enganador sobre um atleta removido. Ficam onde estão, à espera
 * de quem os possa entregar.
 */
export async function drainQueue(competitionUuid?: string | null): Promise<DrainOutcome> {
  const outcome: DrainOutcome = { sent: 0, dropped: 0, interrupted: false };

  if (draining) return outcome;
  draining = true;

  try {
    const items = useQueueStore
      .getState()
      .items.filter((item) => !competitionUuid || item.competition_uuid === competitionUuid);

    for (const item of items) {
      const result = await send(item);

      if (result === 'sent') {
        useQueueStore.getState().remove(item.submission_id);
        outcome.sent += 1;
        continue;
      }

      if (result === 'stop') {
        outcome.interrupted = true;
        break;
      }

      useQueueStore.getState().remove(item.submission_id);
      outcome.dropped += 1;
    }
  } finally {
    draining = false;
  }

  return outcome;
}

type SendResult = 'sent' | 'drop' | 'stop';

async function send(item: QueuedScore): Promise<SendResult> {
  const payload = {
    submission_id: item.submission_id,
    a: item.a,
    b: item.b,
    ...(item.events ? { events: item.events } : {}),
  };

  try {
    if (item.kind === 'bout') await scoreBout(item.target_id, payload);
    else await scoreMatch(item.target_id, payload);

    return 'sent';
  } catch (error) {
    // Sem rede não se perde nada: o item fica onde está e a próxima passagem tenta outra vez.
    if (error instanceof NetworkError) return 'stop';

    // `401` para tudo e **mantém a fila**. Voltar a ligar emite um token novo, e o
    // `submission_id` sobrevive à rotação — é por isso que o drenar a seguir dá 200 e não 409.
    if (isUnauthorized(error)) return 'stop';

    if (isConflict(error)) {
      const current = error instanceof ApiError ? error.current : undefined;
      notify(item, 'conflict', formatConflict(current));
      return 'drop';
    }

    // O assalto desapareceu — um atleta foi removido na web enquanto o resultado esperava por
    // rede. Sem esta regra a app ou tenta para sempre, ou deita o resultado fora em silêncio.
    if (isGone(error)) {
      notify(item, 'gone');
      return 'drop';
    }

    // `429` e `408` não são recusas: o servidor pediu para voltar mais tarde (contrato §8). Parar
    // com a fila intacta é o que respeita o pedido — a passagem seguinte é daí a 30 s.
    if (error instanceof ApiError && (error.status === 429 || error.status === 408)) return 'stop';

    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      notify(item, 'rejected', error.message);
      return 'drop';
    }

    // 5xx e o resto: o servidor pode estar a reiniciar. Fica em fila.
    return 'stop';
  }
}

function notify(item: QueuedScore, reason: 'conflict' | 'gone' | 'rejected', detail?: string): void {
  useQueueStore.getState().notify({
    submission_id: item.submission_id,
    label: item.label,
    reason,
    detail,
  });
}

function formatConflict(current: { score_a: number | null; score_b: number | null } | undefined) {
  if (!current || current.score_a === null || current.score_b === null) return undefined;
  return `${current.score_a}–${current.score_b}`;
}
