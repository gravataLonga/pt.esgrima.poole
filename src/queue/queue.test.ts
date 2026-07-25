import AsyncStorage from '@react-native-async-storage/async-storage';

import { resetApp } from '@/__tests__/support/app';
import { seedPoule, state as fakeState } from '@/__tests__/support/fakeApi';

import { drainQueue } from './drain';
import { MAX_ITEM_AGE_MS, MAX_QUEUE_SIZE, useQueueStore, type QueuedScore } from './store';
import { submitScore } from './submit';

/**
 * A fila — spec §8. **Perder um resultado registado é inaceitável**, e é isso que estes testes
 * guardam: o que entra, o que sai, o que se avisa, e o que sobrevive a fechar a app.
 */

const item = (overrides: Partial<QueuedScore> = {}): QueuedScore => ({
  submission_id: 'sub-1',
  kind: 'bout',
  target_id: 'b_01J8X005',
  a: 5,
  b: 3,
  competition_uuid: 'poule-uuid',
  queued_at: new Date().toISOString(),
  label: 'Ana Silva vs Bruno Dias',
  ...overrides,
});

beforeEach(async () => {
  resetApp();
  seedPoule();
  await AsyncStorage.clear();
  useQueueStore.setState({ items: [], notices: [], hydrated: true });
});

describe('o que entra na fila', () => {
  it('guarda por ordem de chegada e não duplica a mesma submissão', () => {
    const { enqueue } = useQueueStore.getState();

    enqueue(item({ submission_id: 'sub-1' }));
    enqueue(item({ submission_id: 'sub-2', target_id: 'b_01J8X006' }));
    // A mesma submissão outra vez é o mesmo resultado a ser reconfirmado, não um segundo.
    enqueue(item({ submission_id: 'sub-1' }));

    expect(useQueueStore.getState().items.map((queued) => queued.submission_id)).toEqual([
      'sub-1',
      'sub-2',
    ]);
  });

  it('pára no limite em vez de crescer sem fim', () => {
    const { enqueue } = useQueueStore.getState();

    for (let index = 0; index < MAX_QUEUE_SIZE + 5; index += 1) {
      enqueue(item({ submission_id: `sub-${index}`, target_id: `b_${index}` }));
    }

    // Uma poule de 12 tem 66 assaltos; 50 pendentes já é catástrofe operacional (spec §8).
    expect(useQueueStore.getState().items).toHaveLength(MAX_QUEUE_SIZE);
  });
});

describe('sobreviver a fechar a app', () => {
  it('relê do disco o que ficou por enviar', async () => {
    useQueueStore.getState().enqueue(item());
    // A escrita é assíncrona de propósito — não bloqueia quem está a arbitrar.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Como um relançar da app: memória vazia, disco intacto.
    useQueueStore.setState({ items: [], notices: [], hydrated: false });
    await useQueueStore.getState().hydrate();

    expect(useQueueStore.getState().items).toHaveLength(1);
    expect(useQueueStore.getState().items[0]?.submission_id).toBe('sub-1');
  });

  it('descarta o que passou das 24 h, mas **avisa** em vez de o deitar fora em silêncio', async () => {
    const old = item({
      submission_id: 'sub-velho',
      queued_at: new Date(Date.now() - MAX_ITEM_AGE_MS - 1000).toISOString(),
    });

    await AsyncStorage.setItem('poole.referee.queue.v1', JSON.stringify([old, item()]));
    useQueueStore.setState({ items: [], notices: [], hydrated: false });

    await useQueueStore.getState().hydrate();

    const { items, notices } = useQueueStore.getState();
    expect(items.map((queued) => queued.submission_id)).toEqual(['sub-1']);
    // A poule dessa altura já acabou. O árbitro tem de saber que aquele resultado nunca chegou.
    expect(notices).toEqual([
      expect.objectContaining({ submission_id: 'sub-velho', reason: 'expired' }),
    ]);
  });
});

describe('drenar', () => {
  it('envia por ordem e esvazia a fila', async () => {
    const { enqueue } = useQueueStore.getState();
    enqueue(item({ submission_id: 'sub-1', target_id: 'b_01J8X005' }));
    enqueue(item({ submission_id: 'sub-2', target_id: 'b_01J8X006' }));

    const outcome = await drainQueue();

    expect(outcome).toMatchObject({ sent: 2, dropped: 0, interrupted: false });
    expect(useQueueStore.getState().items).toHaveLength(0);
    expect(fakeState.bouts.find((bout) => bout.id === 'b_01J8X005')?.score_a).toBe(5);
  });

  it('sem rede, pára e **mantém** a fila', async () => {
    useQueueStore.getState().enqueue(item());
    fakeState.offline = true;

    const outcome = await drainQueue();

    expect(outcome).toMatchObject({ sent: 0, interrupted: true });
    expect(useQueueStore.getState().items).toHaveLength(1);
  });

  it('num 401 pára e mantém a fila — é o que a reconexão vai drenar', async () => {
    useQueueStore.getState().enqueue(item());
    fakeState.failNextScore = 'unauthorized';

    const outcome = await drainQueue();

    expect(outcome.interrupted).toBe(true);
    expect(useQueueStore.getState().items).toHaveLength(1);
  });

  it('num 409 tira da fila e avisa com o resultado que ganhou', async () => {
    useQueueStore.getState().enqueue(item());
    fakeState.failNextScore = 'conflict';

    const outcome = await drainQueue();

    expect(outcome).toMatchObject({ sent: 0, dropped: 1 });
    expect(useQueueStore.getState().items).toHaveLength(0);
    expect(useQueueStore.getState().notices[0]).toMatchObject({
      reason: 'conflict',
      detail: '4–5',
    });
  });

  it('num 404 tira da fila e explica que o assalto desapareceu', async () => {
    useQueueStore.getState().enqueue(item());
    fakeState.failNextScore = 'gone';

    await drainQueue();

    // Um atleta removido na web enquanto o resultado esperava por rede. Sem esta regra a app ou
    // tenta para sempre, ou deita o resultado fora em silêncio (spec §8).
    expect(useQueueStore.getState().items).toHaveLength(0);
    expect(useQueueStore.getState().notices[0]).toMatchObject({ reason: 'gone' });
  });
});

describe('o que não é recusa', () => {
  it('um 429 não deita o resultado fora — pára e espera (contrato §8)', async () => {
    useQueueStore.getState().enqueue(item());
    fakeState.failNextScore = 'throttled';

    const outcome = await drainQueue();

    // "Demasiados pedidos" é o servidor a pedir para voltar mais tarde, não a recusar o resultado.
    expect(outcome).toMatchObject({ sent: 0, dropped: 0, interrupted: true });
    expect(useQueueStore.getState().items).toHaveLength(1);
    expect(useQueueStore.getState().notices).toHaveLength(0);
  });

  it('um 429 no envio imediato guarda em fila em vez de reportar recusa', async () => {
    fakeState.failNextScore = 'throttled';

    const result = await submitScore({
      kind: 'bout',
      targetId: 'b_01J8X005',
      a: 5,
      b: 3,
      competitionUuid: 'poule-uuid',
      label: 'Ana Silva vs Bruno Dias',
    });

    expect(result).toEqual({ kind: 'queued' });
    expect(useQueueStore.getState().items).toHaveLength(1);
  });
});

describe('a fila é por competição (spec §8)', () => {
  it('não manda os resultados de outra poule com o token desta', async () => {
    const { enqueue } = useQueueStore.getState();
    enqueue(item({ submission_id: 'desta', competition_uuid: 'poule-uuid' }));
    enqueue(item({ submission_id: 'doutra', competition_uuid: 'outra-poule', target_id: 'b_01J8X006' }));

    const outcome = await drainQueue('poule-uuid');

    // O da outra poule ficaria `404` — não é seu — e a app deitava-o fora com um aviso enganador
    // sobre um atleta removido. Fica onde está, à espera de quem o possa entregar.
    expect(outcome).toMatchObject({ sent: 1, dropped: 0 });
    expect(useQueueStore.getState().items.map((queued) => queued.submission_id)).toEqual(['doutra']);
  });
});

describe('fila cheia', () => {
  it('avisa em vez de deitar fora em silêncio', () => {
    const { enqueue } = useQueueStore.getState();

    for (let index = 0; index < MAX_QUEUE_SIZE; index += 1) {
      enqueue(item({ submission_id: `sub-${index}`, target_id: `b_${index}` }));
    }
    enqueue(item({ submission_id: 'a-mais', target_id: 'b_a_mais' }));

    expect(useQueueStore.getState().items).toHaveLength(MAX_QUEUE_SIZE);
    // Tudo neste módulo evita perder um resultado em silêncio. Este caminho era o único buraco.
    expect(useQueueStore.getState().notices).toEqual([
      expect.objectContaining({ submission_id: 'a-mais', reason: 'full' }),
    ]);
  });
});

describe('idempotência (contrato §4)', () => {
  it('a submissão que falhou por rede vai para a fila com a chave que já tinha', async () => {
    fakeState.failNextScore = 'network';

    const result = await submitScore(
      {
        kind: 'bout',
        targetId: 'b_01J8X005',
        a: 5,
        b: 3,
        competitionUuid: 'poule-uuid',
        label: 'Ana Silva vs Bruno Dias',
      },
      'chave-fixa',
    );

    expect(result).toEqual({ kind: 'queued' });
    expect(useQueueStore.getState().items[0]?.submission_id).toBe('chave-fixa');
  });

  it('drenar a mesma submissão sobre um assalto já pontuado dá 200, não um 409 falso', async () => {
    const submission = {
      kind: 'bout' as const,
      targetId: 'b_01J8X005',
      a: 5,
      b: 3,
      competitionUuid: 'poule-uuid',
      label: 'Ana Silva vs Bruno Dias',
    };

    // Chegou ao servidor; a resposta é que não chegou à app.
    await submitScore(submission, 'chave-fixa');

    // A app repete a **mesma** submissão — é a mesma tentativa, não uma nova. É este o cenário
    // que a chave de idempotência existe para cobrir: sem ela, o autor recebia "já registado por
    // outra pessoa" sobre o seu próprio registo.
    const repeated = await submitScore(submission, 'chave-fixa');

    expect(repeated).toEqual({ kind: 'recorded' });
  });

  it('uma submissão diferente sobre o mesmo assalto é conflito, com o resultado que ganhou', async () => {
    const submission = {
      kind: 'bout' as const,
      targetId: 'b_01J8X005',
      a: 5,
      b: 3,
      competitionUuid: 'poule-uuid',
      label: 'Ana Silva vs Bruno Dias',
    };

    await submitScore(submission, 'chave-de-quem-chegou-primeiro');
    const second = await submitScore({ ...submission, a: 2, b: 5 }, 'outra-chave');

    expect(second).toMatchObject({ kind: 'conflict' });
    expect(second).toMatchObject({ current: { score_a: 5, score_b: 3 } });
  });
});

describe('confirmar duas vezes o mesmo assalto', () => {
  const submission = {
    kind: 'bout' as const,
    targetId: 'b_01J8X005',
    a: 5,
    b: 3,
    competitionUuid: 'poule-uuid',
    label: 'Ana Silva vs Bruno Dias',
  };

  it('reaproveita a chave que já está em fila, em vez de inventar uma segunda', async () => {
    fakeState.offline = true;
    await submitScore(submission);
    await submitScore(submission);
    fakeState.offline = false;

    // O `submission_id` pertence ao **resultado**, não à tentativa (contrato §4). Sem isto, a
    // segunda confirmação entrava como submissão nova e o drenar devolvia ao próprio autor um
    // "já registado por outra pessoa" sobre o registo dele — o falso 409 que a chave evita.
    expect(useQueueStore.getState().items).toHaveLength(1);

    const outcome = await drainQueue();
    expect(outcome).toMatchObject({ sent: 1, dropped: 0 });
    expect(useQueueStore.getState().notices).toHaveLength(0);
  });
});
