/**
 * Registar um resultado — o único caminho de escrita da app, e o único que não pode perder nada.
 *
 * O `submission_id` nasce **aqui**, uma vez, quando o árbitro confirma. Daí para a frente é o
 * mesmo em todas as tentativas: no envio imediato, na fila e em cada drenagem — inclusive depois
 * de a sessão expirar e a app voltar a ligar-se com outro token (contrato §4).
 */

import * as Crypto from 'expo-crypto';

import { scoreBout, scoreMatch } from '@/api/endpoints';
import { ApiError, isConflict, isGone, isUnauthorized, NetworkError } from '@/api/errors';
import type { BoutEvent, ScoreConflictCurrent } from '@/api/types';

import { useQueueStore } from './store';

export interface ScoreSubmission {
  kind: 'bout' | 'match';
  targetId: string;
  a: number;
  b: number;
  events?: BoutEvent[];
  competitionUuid: string;
  /**
   * O que o aviso da fila mostra quando a lista já não estiver à mão — o título do assalto, tal
   * como aparece no cabeçalho. **Nunca nomes de atletas:** isto vai a disco (spec §9).
   */
  label: string;
}

export type SubmitResult =
  /** Gravado pelo servidor: `201` agora, ou `200` porque esta mesma submissão já lá estava. */
  | { kind: 'recorded' }
  /** Sem rede ou servidor em baixo: guardado na fila, e o árbitro é avisado de que ainda não foi. */
  | { kind: 'queued' }
  /** Outra pessoa registou primeiro. Não se repete e não há forma de forçar (contrato §7). */
  | { kind: 'conflict'; current?: ScoreConflictCurrent }
  /** O assalto já não existe — atleta removido na web, ou poule fechada entretanto. */
  | { kind: 'gone' }
  /** `422`, ou qualquer outro 4xx que não vai passar a valer com o tempo. */
  | { kind: 'rejected'; message: string }
  /** A sessão morreu a meio. O resultado fica em fila e drena quando voltar a ligar. */
  | { kind: 'unauthorized' };

/** UUID v4 a sério — não uma string de `Math.random`, que é o que uma chave de idempotência não é. */
export function newSubmissionId(): string {
  return Crypto.randomUUID();
}

/**
 * A chave deste resultado. Se já houver uma submissão em fila para o mesmo assalto, é **essa** que
 * se repete.
 *
 * O contrato §4 diz que a chave pertence à submissão, não à tentativa. Sem esta procura, um árbitro
 * que confirme o mesmo resultado uma segunda vez — porque o primeiro ficou em fila e a lista ainda
 * o mostra por disputar — punha dois itens na fila com chaves diferentes, e o segundo drenava
 * contra o primeiro: `409`, "já registado por outra pessoa", sobre o registo dele próprio. É
 * precisamente o falso conflito que a chave existe para evitar.
 */
function submissionIdFor(submission: ScoreSubmission): string {
  const queued = useQueueStore
    .getState()
    .items.find(
      (item) => item.kind === submission.kind && item.target_id === submission.targetId,
    );

  return queued?.submission_id ?? newSubmissionId();
}

export async function submitScore(
  submission: ScoreSubmission,
  submissionId: string = submissionIdFor(submission),
): Promise<SubmitResult> {
  const payload = {
    submission_id: submissionId,
    a: submission.a,
    b: submission.b,
    ...(submission.events?.length ? { events: submission.events } : {}),
  };

  try {
    if (submission.kind === 'bout') await scoreBout(submission.targetId, payload);
    else await scoreMatch(submission.targetId, payload);

    return { kind: 'recorded' };
  } catch (error) {
    if (isConflict(error)) {
      return { kind: 'conflict', current: error instanceof ApiError ? error.current : undefined };
    }

    if (isGone(error)) return { kind: 'gone' };

    // Rede em baixo, servidor a reiniciar, sessão morta, ou o servidor a mandar esperar: em todos
    // o resultado é bom e o que falta é caminho até ao servidor. Vai para a fila com a chave que
    // já tem. **O `429` conta como estes** — o contrato §8 manda esperar pelo `Retry-After`, não
    // deitar fora o resultado.
    if (
      error instanceof NetworkError ||
      isUnauthorized(error) ||
      (error instanceof ApiError && (error.status >= 500 || isWorthWaiting(error)))
    ) {
      enqueue(submission, submissionId);
      return isUnauthorized(error) ? { kind: 'unauthorized' } : { kind: 'queued' };
    }

    if (error instanceof ApiError) return { kind: 'rejected', message: error.message };

    throw error;
  }
}

/** `429` e `408`: o servidor não recusou o resultado, pediu para voltar mais tarde. */
function isWorthWaiting(error: ApiError): boolean {
  return error.status === 429 || error.status === 408;
}

function enqueue(submission: ScoreSubmission, submissionId: string): void {
  useQueueStore.getState().enqueue({
    submission_id: submissionId,
    kind: submission.kind,
    target_id: submission.targetId,
    a: submission.a,
    b: submission.b,
    events: submission.events,
    competition_uuid: submission.competitionUuid,
    queued_at: new Date().toISOString(),
    label: submission.label,
  });
}
