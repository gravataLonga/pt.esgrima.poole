import { act, renderHook } from '@testing-library/react-native';

import { ApiError, NetworkError } from '@/api/errors';
import { MAX_BOUT_EVENTS, type LiveBoutEvent } from '@/api/types';

import { useLiveEvents, type LiveEventDraft } from './useLiveEvents';

/**
 * A pista ao vivo é *fire-and-forget*, e é isso que a torna fácil de partir sem ninguém dar por
 * isso: o ecrã não muda, o árbitro não vê erro nenhum, e a web fica a mostrar um assalto parado. O
 * que se verifica aqui é o que o contrato §7 promete ao servidor — contador por assalto, lote na
 * falha, nada que se repita sozinho.
 */
const touch = (
  side: 'a' | 'b',
  at_ms: number,
  score_a: number,
  score_b: number,
): LiveEventDraft => ({
  type: 'touch',
  side,
  period: 1,
  at_ms,
  score_a,
  score_b,
});

const setup = async (send: ((events: LiveBoutEvent[]) => Promise<unknown>) | null) =>
  renderHook(() => useLiveEvents(send));

type Hook = Awaited<ReturnType<typeof setup>>;

/** `record` é síncrono; o envio não. */
const record = async (hook: Hook, draft: LiveEventDraft): Promise<void> => {
  await act(async () => {
    hook.result.current.record(draft);
  });
};

describe('useLiveEvents', () => {
  it('numera a partir de 1 e manda o evento assim que acontece', async () => {
    const send = jest.fn<Promise<unknown>, [LiveBoutEvent[]]>(() =>
      Promise.resolve({ accepted: 1 }),
    );
    const hook = await setup(send);

    await record(hook, touch('a', 12_400, 1, 0));
    await record(hook, touch('b', 30_100, 1, 1));

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![0]).toEqual([{ ...touch('a', 12_400, 1, 0), seq: 1 }]);
    expect(send.mock.calls[1]![0]).toEqual([{ ...touch('b', 30_100, 1, 1), seq: 2 }]);
  });

  it('não manda nada sem emissor — é o modo cronómetro, que não tem servidor', async () => {
    const hook = await setup(null);

    // Não rebenta e não guarda nada: o `discard` a seguir é sobre uma lista que nunca existiu.
    await record(hook, touch('a', 1_000, 1, 0));
    await act(async () => {
      hook.result.current.discard();
    });
  });

  it('junta ao lote seguinte o que a rede não levou, sem duplicar o `seq`', async () => {
    const send = jest
      .fn<Promise<unknown>, [LiveBoutEvent[]]>()
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValue({ accepted: 2 });

    const hook = await setup(send);

    await record(hook, touch('a', 12_400, 1, 0));
    await record(hook, touch('b', 30_100, 1, 1));

    // O segundo pedido leva os dois eventos, com os números que já tinham: o servidor ignora o que
    // já lá esteja, e é assim que um toque enviado duas vezes continua a ser um toque.
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0].map((event) => event.seq)).toEqual([1, 2]);
  });

  it('desiste quando o servidor recusa de vez, em vez de insistir a cada toque', async () => {
    const send = jest.fn(() =>
      Promise.reject(new ApiError(422, { code: 'poule_locked', message: 'Bloqueada.' })),
    );

    const hook = await setup(send);

    await record(hook, touch('a', 12_400, 1, 0));
    await record(hook, touch('b', 30_100, 1, 1));
    await record(hook, touch('a', 45_000, 2, 1));

    // Uma tentativa, e mais nenhuma: o limite de pedidos é partilhado com o *polling* (contrato §7).
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('desiste do que ficou por enviar quando o assalto é submetido', async () => {
    const send = jest
      .fn<Promise<unknown>, [LiveBoutEvent[]]>()
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValue({ accepted: 1 });

    const hook = await setup(send);

    await record(hook, touch('a', 12_400, 1, 0));
    await act(async () => {
      hook.result.current.discard();
    });
    await record(hook, touch('b', 30_100, 1, 1));

    // O que a rede não levou não vai atrás do assalto seguinte: o resultado é que conta (spec §8).
    expect(send.mock.calls[1]![0]).toEqual([{ ...touch('b', 30_100, 1, 1), seq: 2 }]);
  });

  /**
   * Um servidor anterior à `2.1.0` não conhece os marcos do combate e recusa o lote **inteiro** com
   * `422` — incluindo os toques, que ele aceitava bem. Desistir aí custava o que já funcionava para
   * pagar o que ainda não existe do outro lado.
   */
  describe('contra um servidor que não conhece os marcos', () => {
    const validationFailed = () =>
      new ApiError(422, { code: 'validation_failed', message: 'Tipo desconhecido.' });

    const marker = (type: LiveEventDraft['type'], at_ms: number): LiveEventDraft => ({
      type,
      period: 1,
      at_ms,
    });

    it('tira os marcos do lote e continua a mandar o que ele conhece', async () => {
      const send = jest
        .fn<Promise<unknown>, [LiveBoutEvent[]]>()
        .mockRejectedValueOnce(validationFailed())
        .mockResolvedValue({ accepted: 1 });

      const hook = await setup(send);

      await record(hook, marker('bout_start', 0));
      await record(hook, touch('a', 12_400, 1, 0));

      expect(send.mock.calls[0]![0].map((event) => event.type)).toEqual(['bout_start']);
      expect(send.mock.calls[1]![0]).toEqual([{ ...touch('a', 12_400, 1, 0), seq: 2 }]);
    });

    it('deixa de os numerar, para o contador não ficar com buracos por nada', async () => {
      const send = jest
        .fn<Promise<unknown>, [LiveBoutEvent[]]>()
        .mockRejectedValueOnce(validationFailed())
        .mockResolvedValue({ accepted: 1 });

      const hook = await setup(send);

      await record(hook, marker('bout_start', 0));
      await record(hook, marker('clock_start', 0));
      await record(hook, touch('a', 12_400, 1, 0));

      // Três acontecimentos, dois pedidos: o `clock_start` já nem chega a ser numerado.
      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]![0]).toEqual([{ ...touch('a', 12_400, 1, 0), seq: 2 }]);
    });

    it('um `422` depois disso já é desistência, como qualquer outro 4xx', async () => {
      const send = jest
        .fn<Promise<unknown>, [LiveBoutEvent[]]>()
        .mockRejectedValue(validationFailed());

      const hook = await setup(send);

      await record(hook, marker('bout_start', 0));
      await record(hook, touch('a', 12_400, 1, 0));
      await record(hook, touch('b', 30_100, 1, 1));

      // O segundo `422` é sobre um lote sem marcos nenhuns: o corpo é que não serve, e insistir só
      // gastava o limite de pedidos.
      expect(send).toHaveBeenCalledTimes(2);
    });
  });

  it('pára no teto de eventos do assalto, em vez de esperar pelo `422`', async () => {
    const send = jest.fn<Promise<unknown>, [LiveBoutEvent[]]>(() =>
      Promise.resolve({ accepted: 1 }),
    );

    const hook = await setup(send);

    for (let i = 0; i < MAX_BOUT_EVENTS + 5; i += 1) {
      await record(hook, touch('a', i * 100, 1, 0));
    }

    // O contrato limita o assalto a 300, e os marcos triplicaram o volume. O `log` do motor continua
    // a crescer — a folha do histórico é do árbitro e não tem teto de servidor nenhum.
    expect(send).toHaveBeenCalledTimes(MAX_BOUT_EVENTS);
    expect(send.mock.calls.at(-1)![0].at(-1)!.seq).toBe(MAX_BOUT_EVENTS);
  });

  it('não deixa o lote crescer acima do que cabe num pedido', async () => {
    const send = jest.fn<Promise<unknown>, [LiveBoutEvent[]]>(() =>
      Promise.reject(new NetworkError()),
    );

    const hook = await setup(send);

    for (let i = 0; i < 60; i += 1) {
      await record(hook, touch('a', i * 1_000, 1, 0));
    }

    // Sempre 50 no máximo, e os que ficam são os mais recentes — o placar da web é o do último.
    const last = send.mock.calls.at(-1)![0];
    expect(last).toHaveLength(50);
    expect(last.at(-1)!.seq).toBe(60);
  });
});
