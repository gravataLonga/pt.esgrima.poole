import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { useQueueStore } from '@/queue/store';
import { useSessionStore } from '@/session/store';

import { connectPoule, connectTournament, resetApp } from './support/app';
import { eventsOf, seedBracket, state as fakeState } from './support/fakeApi';

/**
 * Percorre a app de ponta a ponta sobre a árvore de rotas real, contra o servidor falso:
 * Ligar → Lista → Assalto → submeter → Lista, e as bifurcações que o contrato prevê.
 *
 * Substitui o clique manual no simulador. O que aqui se prova é a navegação e o que o árbitro vê;
 * que as formas trocadas são mesmo as do servidor prova-se em `src/api/live.test.ts`.
 */
describe('ligar', () => {
  beforeEach(() => resetApp());

  it('liga com um PIN de 6 dígitos e mostra a lista de assaltos', async () => {
    const router = renderRouter('./app', { initialUrl: '/connect' });
    await router;
    await screen.findByText('Connect to a poule');

    await fireEvent.changeText(screen.getByLabelText('PIN'), '111111');
    await fireEvent.press(screen.getByText('Connect'));

    await screen.findByText('Poule 3 — Sabre Masculino');
    expect(router.getPathname()).toBe('/poule');
    expect(await screen.findByText('3 of 15 bouts')).toBeTruthy();
  });

  it('assina o ecrã de abertura com a marca', async () => {
    await renderRouter('./app', { initialUrl: '/connect' });
    await screen.findByText('Connect to a poule');

    // O wordmark é uma imagem, e o rótulo é a única forma de o alcançar — no ecrã e no VoiceOver.
    expect(screen.getByLabelText('Esgrima.pt')).toBeTruthy();
  });

  it('não deixa ligar com o PIN incompleto', async () => {
    await renderRouter('./app', { initialUrl: '/connect' });
    await screen.findByText('Connect to a poule');

    await fireEvent.changeText(screen.getByLabelText('PIN'), '111');
    await fireEvent.press(screen.getByText('Connect'));

    expect(screen.getByText('The PIN has 6 digits.')).toBeTruthy();
    expect(useSessionStore.getState().phase).toBe('disconnected');
  });

  it('mostra o código inválido no ecrã e fica onde está', async () => {
    const router = renderRouter('./app', { initialUrl: '/connect' });
    await router;
    await screen.findByText('Connect to a poule');

    await fireEvent.changeText(screen.getByLabelText('PIN'), '000000');
    await fireEvent.press(screen.getByText('Connect'));

    // O `422 pin_invalid` é erro de digitação, não fim de caminho: o ecrã mantém-se (contrato §8).
    await screen.findByText('Wrong code. Check the six digits on the poule sheet.');
    expect(router.getPathname()).toBe('/connect');
    expect(useSessionStore.getState().phase).toBe('disconnected');
  });

  it('bloqueia o botão quando o servidor manda travar', async () => {
    await renderRouter('./app', { initialUrl: '/connect' });
    await screen.findByText('Connect to a poule');

    await fireEvent.changeText(screen.getByLabelText('PIN'), '999999');
    await fireEvent.press(screen.getByText('Connect'));

    // `429 pin_throttled`: o campo fica bloqueado até à hora que o `Retry-After` disser (spec §6).
    await screen.findByText('Too many attempts. Wait a moment before trying again.');
    expect(screen.getByText('Connect')).toBeDisabled();
  });

  it('um código de torneio vai direto ao quadro, sem lista de assaltos', async () => {
    const router = renderRouter('./app', { initialUrl: '/connect' });
    await router;
    await screen.findByText('Connect to a poule');

    await fireEvent.changeText(screen.getByLabelText('PIN'), '777777');
    await fireEvent.press(screen.getByText('Connect'));

    // É o `scope` da resposta que decide o ecrã — o árbitro escreve seis dígitos e não sabe, nem
    // tem de saber, que tipo de código lhe deram (contrato §7).
    await screen.findByText('Direct elimination');
    expect(router.getPathname()).toBe('/bracket');
  });
});

describe('arbitrar um assalto', () => {
  beforeEach(() => resetApp());

  it('abre o assalto seguinte, conta toques e submete', async () => {
    connectPoule();
    const router = renderRouter('./app', { initialUrl: '/poule' });
    await router;

    // O assalto 4 está `in_progress` na fixture, por isso o cartão do topo oferece retomá-lo.
    await fireEvent.press(await screen.findByText('Resume'));
    await screen.findByText('Bout 4');
    expect(router.getPathname()).toBe('/bout/b_01J8X004');

    // 5–0: cinco toques para o atleta A.
    const addA = await screen.findByLabelText('One more touch for Marta Lopes');
    for (let i = 0; i < 5; i++) await fireEvent.press(addA);

    // A confirmação da spec §6 é uma folha inferior, não um `Alert` do sistema (ADR-016).
    await fireEvent.press(screen.getByText('Submit result'));
    await screen.findByText('Confirm result');
    await fireEvent.press(screen.getByText('Record'));

    await waitFor(() => expect(router.getPathname()).toBe('/poule'));

    const bout = fakeState.bouts.find((candidate) => candidate.id === 'b_01J8X004');
    expect(bout).toMatchObject({ status: 'done', score_a: 5, score_b: 0 });
    // Registado é registado: nada fica em fila.
    expect(useQueueStore.getState().items).toHaveLength(0);
  });

  it('bloqueia o submeter enquanto o resultado for um empate', async () => {
    connectPoule();
    await renderRouter('./app', { initialUrl: '/bout/b_01J8X004' });

    await screen.findByText('Bout 4');

    // 0–0 é um empate, e a plataforma recusa-os (contrato §7). O botão desativado é o aviso —
    // o resultado empatado está nos dois números grandes logo por cima.
    expect(screen.getByText('Submit result')).toBeDisabled();

    await fireEvent.press(await screen.findByLabelText('One more touch for Marta Lopes'));
    expect(screen.getByText('Submit result')).not.toBeDisabled();
  });

  it('mostra o conflito com o resultado que ganhou, e não repete', async () => {
    connectPoule();
    fakeState.failNextScore = 'conflict';

    await renderRouter('./app', { initialUrl: '/bout/b_01J8X004' });
    await screen.findByText('Bout 4');

    await fireEvent.press(await screen.findByLabelText('One more touch for Marta Lopes'));
    await fireEvent.press(screen.getByText('Submit result'));
    await fireEvent.press(await screen.findByText('Record'));

    // Sem opção de forçar: corrigir um resultado é trabalho da plataforma web (spec §6, ecrã 4).
    await screen.findByText('Already recorded');
    expect(useQueueStore.getState().items).toHaveLength(0);
  });

  it('sem rede, guarda o resultado e diz que ainda não foi enviado', async () => {
    connectPoule();
    fakeState.failNextScore = 'network';

    const router = renderRouter('./app', { initialUrl: '/bout/b_01J8X004' });
    await router;
    await screen.findByText('Bout 4');

    await fireEvent.press(await screen.findByLabelText('One more touch for Marta Lopes'));
    await fireEvent.press(screen.getByText('Submit result'));
    await fireEvent.press(await screen.findByText('Record'));

    await waitFor(() => expect(router.getPathname()).toBe('/poule'));

    // A app não finge que enviou (spec §8): o resultado fica na fila e o aviso está na lista.
    const queued = useQueueStore.getState().items;
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: 'bout', target_id: 'b_01J8X004' });
    expect(await screen.findByText(/waiting for the network/)).toBeTruthy();
  });
});

describe('mudança de fase', () => {
  beforeEach(() => resetApp());

  it('a poule fechada com quadro gerado leva ao quadro sem pedir código novo', async () => {
    seedBracket();
    connectPoule({ locked: true, elimination: { matches_total: 3, matches_done: 0 } });

    const router = renderRouter('./app', { initialUrl: '/poule' });
    await router;

    await screen.findByText('Direct elimination');
    expect(router.getPathname()).toBe('/bracket');
  });

  it('feita a transição, a lista e o quadro alternam-se', async () => {
    seedBracket();
    connectPoule({ locked: true, elimination: { matches_total: 3, matches_done: 0 } });

    const router = renderRouter('./app', { initialUrl: '/poule' });
    await router;
    await screen.findByText('Direct elimination');

    await fireEvent.press(screen.getByText('Back to the bouts'));

    // A transição automática acontece **uma vez** (spec §6). A lista fechada continua a ser
    // consultável: os resultados já registados são metade do uso deste ecrã.
    expect(router.getPathname()).toBe('/poule');
  });

  it('a poule fechada sem quadro fica em leitura, com a escrita desativada', async () => {
    connectPoule({ locked: true, elimination: null });

    const router = renderRouter('./app', { initialUrl: '/poule' });
    await router;

    await screen.findByText(
      'Poule locked — the direct elimination table has been generated. Read-only mode.',
    );
    expect(router.getPathname()).toBe('/poule');
    expect(await screen.findByText('Resume')).toBeDisabled();
  });

  it('a competição encerrada tem ecrã próprio, e não uma mensagem de erro', async () => {
    connectPoule();

    // `complete` chega sempre de um `401 poule_complete` (contrato §6). É fim, não avaria.
    await act(async () => {
      useSessionStore.setState({ phase: 'complete', endReason: 'poule_complete' });
    });

    const router = renderRouter('./app', { initialUrl: '/poule' });
    await router;

    await screen.findByText('Poule complete');
    expect(router.getPathname()).toBe('/complete');
  });
});

/**
 * Sair de uma competição — spec §6.
 *
 * Até haver estes dois botões, a única saída era o `401 poule_complete` do servidor: uma poule toda
 * pontuada, ou uma poule errada, deixava o árbitro preso no ecrã da lista.
 */
describe('sair e concluir', () => {
  beforeEach(() => resetApp());

  /** Deixa a poule como o servidor a devolve com tudo pontuado. */
  const scoreEveryBout = () => {
    fakeState.bouts = fakeState.bouts.map((bout) => ({
      ...bout,
      status: 'done',
      score_a: 5,
      score_b: 3,
      scored_at: '2026-07-25T17:00:00Z',
    }));
  };

  it('sair termina a sessão e volta ao ecrã de ligar', async () => {
    connectPoule();

    const router = renderRouter('./app', { initialUrl: '/poule' });
    await router;
    await screen.findByText('Poule 3 — Sabre Masculino');

    await fireEvent.press(screen.getByText('Leave'));
    await screen.findByText('Leave this competition?');
    // O segundo "Leave" é o da folha — o do cabeçalho continua montado por baixo.
    await fireEvent.press(screen.getAllByText('Leave').at(-1)!);

    await waitFor(() => expect(router.getPathname()).toBe('/connect'));
    expect(useSessionStore.getState().phase).toBe('disconnected');
    expect(useSessionStore.getState().endReason).toBe('signed_out');
  });

  it('desistir da folha deixa a sessão como estava', async () => {
    connectPoule();

    const router = renderRouter('./app', { initialUrl: '/poule' });
    await router;
    await screen.findByText('Poule 3 — Sabre Masculino');

    await fireEvent.press(screen.getByText('Leave'));
    await fireEvent.press(await screen.findByText('Stay'));

    expect(router.getPathname()).toBe('/poule');
    expect(useSessionStore.getState().phase).toBe('poule');
  });

  it('concluir só aparece quando não há mais nada para arbitrar', async () => {
    connectPoule();
    await renderRouter('./app', { initialUrl: '/poule' });
    await screen.findByText('Poule 3 — Sabre Masculino');

    // 3 de 15 assaltos: há muito que fazer, e sair a meio é o botão do cabeçalho.
    expect(screen.queryByText('Finish')).toBeNull();
  });

  it('com a poule toda pontuada, concluir leva ao resumo', async () => {
    connectPoule();
    scoreEveryBout();

    const router = renderRouter('./app', { initialUrl: '/poule' });
    await router;

    await fireEvent.press(await screen.findByText('Finish'));
    await screen.findByText('Finish here?');
    await fireEvent.press(screen.getAllByText('Finish').at(-1)!);

    await waitFor(() => expect(router.getPathname()).toBe('/complete'));
    await screen.findByText('Poule complete');
    // Concluir é uma decisão do árbitro: o resumo mostra o que ficou feito, e a sessão só acaba no
    // botão de ligar a outra.
    expect(useSessionStore.getState().phase).toBe('complete');
  });

  it('a poule fechada sem quadro também tem por onde sair', async () => {
    connectPoule({ locked: true, elimination: null });

    await renderRouter('./app', { initialUrl: '/poule' });
    await screen.findByText('Resume');

    // Só leitura: não há nada para arbitrar, mesmo com assaltos por disputar (contrato §7).
    expect(screen.getByText('Finish')).toBeTruthy();
  });
});

describe('quadro de eliminatórias', () => {
  beforeEach(() => resetApp());

  it('mostra o quadro inteiro e não deixa abrir quem ainda espera o vencedor', async () => {
    seedBracket();
    connectTournament();

    const router = renderRouter('./app', { initialUrl: '/bracket' });
    await router;

    await screen.findByText('Round 1');
    // A final aparece por preencher — é assim que o árbitro vê o caminho (spec §6, ecrã 5).
    expect(screen.getByText('Round 2')).toBeTruthy();
    expect(screen.getAllByText('Awaiting winner').length).toBeGreaterThan(0);

    await fireEvent.press(screen.getAllByText('Awaiting winner')[0]!);
    expect(router.getPathname()).toBe('/bracket');
  });

  it('abre um combate pronto no mesmo ecrã de assalto, com os presets do quadro', async () => {
    seedBracket();
    connectTournament();

    const router = renderRouter('./app', { initialUrl: '/bracket' });
    await router;

    await fireEvent.press(await screen.findByText('Ana Silva'));

    await screen.findByText('Round 1 · 1');
    expect(router.getPathname()).toBe('/match/m_1');
    // 15 toques, e não os 5 da poule: o alvo vem da API (contrato §7).
    expect(screen.getByText('To 15 touches')).toBeTruthy();
  });

  it('espelha o combate ao vivo para o quadro, e não para os assaltos de poule', async () => {
    seedBracket();
    connectTournament();

    const router = renderRouter('./app', { initialUrl: '/bracket' });
    await router;

    await fireEvent.press(await screen.findByText('Ana Silva'));
    await screen.findByText('Round 1 · 1');

    await fireEvent.press(screen.getByLabelText('One more touch for Ana Silva'));

    // `POST /elimination/{id}/events`: um combate a decorrer mostra o placar a subir tal como um
    // assalto de poule (contrato §7).
    expect(eventsOf('match', 'm_1')).toMatchObject([
      { seq: 1, type: 'touch', side: 'a', score_a: 1, score_b: 0 },
    ]);
    expect(eventsOf('bout', 'm_1')).toHaveLength(0);
  });
});
