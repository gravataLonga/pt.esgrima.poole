/**
 * A pista ao vivo — o que se passou no assalto, enviado enquanto se passa (contrato §7, `1.5.0`).
 *
 * Sem isto a plataforma só sabe do assalto no fim, e uma poule a meio parece, na web, uma poule que
 * ninguém começou. **Nada disto entra no resultado**: o que fica registado continua a ser o `a`/`b`
 * do `POST .../score`.
 *
 * Três regras, e são elas que justificam este ficheiro existir em vez de um `void post(...)` no
 * ecrã:
 *
 * 1. **O contador é a idempotência toda.** Um toque é indistinguível do toque idêntico ao lado dele;
 *    só o `seq` os separa. Numera-se a partir de `1` dentro do assalto, e o servidor ignora em
 *    silêncio um `seq` repetido.
 * 2. **Na falha, junta-se ao lote seguinte** — não se repete sozinho, não se enfileira. A fila da
 *    spec §8 existe para o que não se pode perder, e um toque não é isso.
 * 3. **Falhar nunca trava a arbitragem.** Nada disto sobe ao ecrã: nem erro, nem espera.
 */

import { useCallback, useRef } from 'react';

import { isRetryable } from '@/api/client';
import { MAX_EVENTS_PER_REQUEST, type LiveBoutEvent } from '@/api/types';

/** O que o motor do assalto sabe do evento. O `seq` é atribuído aqui. */
export type LiveEventDraft = Omit<LiveBoutEvent, 'seq'>;

/** Para onde vai o lote: `postBoutEvents` numa poule, `postMatchEvents` num quadro. */
export type LiveEventSender = (events: LiveBoutEvent[]) => Promise<unknown>;

export interface LiveEvents {
  /** Numera o evento, junta-o ao lote e manda-o. Inerte sem emissor. */
  record: (draft: LiveEventDraft) => void;
  /** Desiste do que ficou por enviar — o assalto acabou e o resultado é que conta. */
  discard: () => void;
}

export function useLiveEvents(send: LiveEventSender | null): LiveEvents {
  const nextSeq = useRef(1);
  const pending = useRef<LiveBoutEvent[]>([]);
  /** Um pedido de cada vez: dois em paralelo mandariam o mesmo lote duas vezes. */
  const sending = useRef(false);
  /**
   * O servidor recusou de uma forma que não passa a valer com o tempo — poule fechada, sessão
   * morta, id que já não existe. Insistir a cada toque só gastava o limite de 60 pedidos/min que
   * este endpoint partilha com o *polling*.
   */
  const givenUp = useRef(false);

  const flush = useCallback(async () => {
    if (!send || sending.current || givenUp.current) return;

    sending.current = true;

    try {
      while (pending.current.length > 0) {
        const batch = pending.current;

        try {
          await send(batch);
        } catch (error) {
          if (isRetryable(error)) break;

          pending.current = [];
          givenUp.current = true;
          break;
        }

        // Só sai o que foi enviado: um toque que caiu durante o pedido fica para o lote seguinte.
        const sent = new Set(batch.map((event) => event.seq));
        pending.current = pending.current.filter((event) => !sent.has(event.seq));
      }
    } finally {
      sending.current = false;
    }
  }, [send]);

  const record = useCallback(
    (draft: LiveEventDraft) => {
      if (!send || givenUp.current) return;

      const event: LiveBoutEvent = { ...draft, seq: nextSeq.current };
      nextSeq.current += 1;

      // O lote cabe num pedido, e o que se deita fora é o mais antigo: a linha temporal fica com um
      // buraco, mas o placar que a web mostra é o do evento mais recente.
      pending.current = [...pending.current, event].slice(-MAX_EVENTS_PER_REQUEST);

      void flush();
    },
    [flush, send],
  );

  const discard = useCallback(() => {
    pending.current = [];
  }, []);

  return { record, discard };
}
