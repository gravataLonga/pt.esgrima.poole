import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { useQueueStore } from '@/queue/store';
import { useSessionStore } from '@/session/store';

import { connectMatch, connectPoule, poll, resetApp } from './support/app';
import { eventsOf, readyMatch, seedMatch, state as fakeState, wasReleased } from './support/fakeApi';

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
    await screen.findByText('Connect to your piste');

    await fireEvent.changeText(screen.getByLabelText('PIN'), '111111');
    await fireEvent.press(screen.getByText('Connect'));

    await screen.findByText('Poule 3 — Sabre Masculino');
    expect(router.getPathname()).toBe('/poule');
    expect(await screen.findByText('3 of 15 bouts')).toBeTruthy();
  });

  it('assina o ecrã de abertura com a marca', async () => {
    await renderRouter('./app', { initialUrl: '/connect' });
    await screen.findByText('Connect to your piste');

    // O wordmark é uma imagem, e o rótulo é a única forma de o alcançar — no ecrã e no VoiceOver.
    expect(screen.getByLabelText('Esgrima.pt')).toBeTruthy();
  });

  it('explica onde está o código da pista, e fecha a folha', async () => {
    await renderRouter('./app', { initialUrl: '/connect' });
    await screen.findByText('Connect to your piste');

    // Fechada, o conteúdo não está montado — o `Modal` só o desenha quando é visível.
    expect(screen.queryByText('Where is the code?')).toBeNull();

    // O alvo é um "?" sem texto: o rótulo é a única forma de lhe chegar, no teste e no VoiceOver.
    await fireEvent.press(screen.getByLabelText('Where is the code?'));

    await screen.findByText('Where is the code?');
    expect(screen.getByText('The QR is on the poule sheet or the match card.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Got it'));

    await waitFor(() => expect(screen.queryByText('Where is the code?')).toBeNull());
    // A folha é explicação e não caminho: fecha-a e o ecrã fica exatamente onde estava.
    expect(useSessionStore.getState().phase).toBe('disconnected');
  });

  it('cola um código com espaços e enche as seis casas', async () => {
    const router = renderRouter('./app', { initialUrl: '/connect' });
    await router;
    await screen.findByText('Connect to your piste');

    // Quem copia o código de uma mensagem traz o que lá estiver à volta. O corte tem de contar
    // dígitos e não caracteres: um `maxLength` de 6 é o sistema a cortar a colagem aos seis
    // **caracteres** antes de alguém lhe tirar o que não é dígito — e o que sobra são quatro
    // dígitos e um botão que não deixa ligar. Esse corte é nativo e não acontece aqui, por isso
    // o `maxLength` verifica-se à parte: o `changeText` entrega sempre o texto inteiro.
    const field = screen.getByLabelText('PIN');
    expect(field.props.maxLength).toBeUndefined();

    await fireEvent.changeText(field, 'PIN 111 111');
    await fireEvent.press(screen.getByText('Connect'));

    await screen.findByText('Poule 3 — Sabre Masculino');
    expect(router.getPathname()).toBe('/poule');
  });

  it('não deixa ligar com o PIN incompleto', async () => {
    await renderRouter('./app', { initialUrl: '/connect' });
    await screen.findByText('Connect to your piste');

    await fireEvent.changeText(screen.getByLabelText('PIN'), '111');
    await fireEvent.press(screen.getByText('Connect'));

    expect(screen.getByText('The PIN has 6 digits.')).toBeTruthy();
    expect(useSessionStore.getState().phase).toBe('disconnected');
  });

  it('mostra o código inválido no ecrã e fica onde está', async () => {
    const router = renderRouter('./app', { initialUrl: '/connect' });
    await router;
    await screen.findByText('Connect to your piste');

    await fireEvent.changeText(screen.getByLabelText('PIN'), '000000');
    await fireEvent.press(screen.getByText('Connect'));

    // O `422 pin_invalid` é erro de digitação, não fim de caminho: o ecrã mantém-se (contrato §8).
    await screen.findByText('Wrong code. Check the six digits for your piste.');
    expect(router.getPathname()).toBe('/connect');
    expect(useSessionStore.getState().phase).toBe('disconnected');
  });

  it('bloqueia o botão quando o servidor manda travar', async () => {
    await renderRouter('./app', { initialUrl: '/connect' });
    await screen.findByText('Connect to your piste');

    await fireEvent.changeText(screen.getByLabelText('PIN'), '999999');
    await fireEvent.press(screen.getByText('Connect'));

    // `429 pin_throttled`: o campo fica bloqueado até à hora que o `Retry-After` disser (spec §6).
    await screen.findByText('Too many attempts. Wait a moment before trying again.');
    expect(screen.getByText('Connect')).toBeDisabled();
  });

  it('um código de combate vai direto ao combate, sem lista de assaltos', async () => {
    const router = renderRouter('./app', { initialUrl: '/connect' });
    await router;
    await screen.findByText('Connect to your piste');

    await fireEvent.changeText(screen.getByLabelText('PIN'), '777777');
    await fireEvent.press(screen.getByText('Connect'));

    // É o `scope` da resposta que decide o ecrã — o árbitro escreve seis dígitos e não sabe, nem
    // tem de saber, que tipo de código lhe deram (contrato §7).
    await screen.findByText('Round 2 · 1');
    expect(router.getPathname()).toBe('/match/m_1');
    // O combate veio no próprio `connect`: 15 toques, e não os 5 da poule. O alvo mudou-se para
    // dentro do "?", ao lado do resto das regras deste assalto.
    await fireEvent.press(screen.getByLabelText('This bout'));
    expect(screen.getByText('15 touches')).toBeTruthy();
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
    // O rótulo é o título do assalto — o que o aviso da fila mostra dali a horas, já sem lista
    // carregada — e **não** os nomes dos dois atletas: isto vai a disco (spec §9).
    expect(queued[0]).toMatchObject({ kind: 'bout', target_id: 'b_01J8X004', label: 'Bout 4' });
    expect(JSON.stringify(queued)).not.toMatch(/Marta Lopes|Ana Silva/);
    expect(await screen.findByText(/waiting for the network/)).toBeTruthy();
  });
});

describe('mudança de fase', () => {
  beforeEach(() => resetApp());

  it('a poule fechada com quadro fica em leitura e diz para onde a competição foi', async () => {
    connectPoule({ locked: true, elimination: { matches_total: 3, matches_done: 1 } });

    const router = renderRouter('./app', { initialUrl: '/poule' });
    await router;

    // O quadro corre em códigos que este token não alcança (contrato §7). O banner substitui o
    // ecrã de quadro que aqui havia: sem ele, o árbitro vê uma lista que deixou de aceitar
    // resultados e não tem nada que lho explique.
    await screen.findByText(/moved on to the elimination table \(1\/3 matches decided\)/);
    await screen.findByText(/each match has its own six-digit code/i);

    expect(router.getPathname()).toBe('/poule');
    expect(await screen.findByText('Resume')).toBeDisabled();
  });

  it('a poule fechada sem quadro fica em leitura, com a escrita desativada', async () => {
    connectPoule({ locked: true, elimination: null });

    const router = renderRouter('./app', { initialUrl: '/poule' });
    await router;

    await screen.findByText('Poule closed. Read-only mode.');
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

    // O do cabeçalho é um ícone: o rótulo é a única forma de lhe chegar, no teste e no VoiceOver.
    await fireEvent.press(screen.getByLabelText('Leave'));
    await screen.findByText('Leave this piste?');
    // O "Leave" escrito é o da folha, e é o único que resta.
    await fireEvent.press(screen.getByText('Leave'));

    await waitFor(() => expect(router.getPathname()).toBe('/connect'));
    expect(useSessionStore.getState().phase).toBe('disconnected');
    expect(useSessionStore.getState().endReason).toBe('signed_out');
  });

  it('desistir da folha deixa a sessão como estava', async () => {
    connectPoule();

    const router = renderRouter('./app', { initialUrl: '/poule' });
    await router;
    await screen.findByText('Poule 3 — Sabre Masculino');

    await fireEvent.press(screen.getByLabelText('Leave'));
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

/**
 * O combate de eliminatória — uma sessão inteira, num ecrã só (contrato `2.0.0`).
 *
 * Não há quadro para desenhar: o código é da pista, e alcança **este** combate e mais nenhum. O que
 * era a lista do quadro a decidir o que abre passou a ser este ecrã a decidir o que mostra.
 */
describe('combate de eliminatória', () => {
  beforeEach(() => resetApp());

  it('arbitra o combate no mesmo ecrã de assalto, com os presets do quadro', async () => {
    connectMatch();

    const router = renderRouter('./app', { initialUrl: '/match/m_1' });
    await router;

    await screen.findByText('Round 2 · 1');
    // A prova é a única coisa que diz ao árbitro onde está: chegou com seis dígitos (contrato §7).
    expect(screen.getByText('Torneio de Verão 2026')).toBeTruthy();
    // 15 toques, e não os 5 da poule: o alvo vem da API (contrato §7), e lê-se no "?".
    await fireEvent.press(screen.getByLabelText('This bout'));
    expect(screen.getByText('15 touches')).toBeTruthy();
    expect(screen.getByText('Sudden death')).toBeTruthy();

    // Quantos períodos e quanto dura cada um são duas linhas, e não "3 × 3 min" numa só.
    expect(screen.getByText('Periods')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Time per period')).toBeTruthy();
    expect(screen.getByText('3 min')).toBeTruthy();
    expect(router.getPathname()).toBe('/match/m_1');
  });

  it('carrega o que a lista carregava numa poule: sessão, fila e "Sair"', async () => {
    connectMatch();

    const router = renderRouter('./app', { initialUrl: '/match/m_1' });
    await router;
    await screen.findByText('Round 2 · 1');

    // Sem lista por baixo, este ecrã é a sessão: sem "Sair" aqui não havia forma de largar a
    // pista antes de o token expirar sozinho, 60 minutos depois.
    await fireEvent.press(screen.getByLabelText('Leave'));
    await screen.findByText('Leave this piste?');
    await fireEvent.press(screen.getByText('Leave'));

    await waitFor(() => expect(router.getPathname()).toBe('/connect'));
    expect(useSessionStore.getState().phase).toBe('disconnected');
  });

  it('um combate por preencher espera, e não deixa arbitrar', async () => {
    connectMatch({ ready: false, fencer_a: null, fencer_b: null });

    await renderRouter('./app', { initialUrl: '/match/m_1' });

    // O código pode ser entregue antes de se saber quem sobe (contrato §7, `ready`). Não é erro,
    // não é "já arbitrado", e não há nada para o árbitro tocar.
    await screen.findByText('Waiting for the previous round');
    expect(screen.getAllByText('Awaiting winner').length).toBe(2);

    // Nada de cronómetro nem de contadores: sem atletas não há o que cronometrar, e o servidor
    // recusaria o resultado com `409 match_not_ready`.
    expect(screen.queryByText('Submit result')).toBeNull();
    expect(screen.queryByLabelText('This bout')).toBeNull();
  });

  it('destranca-se sozinho quando a ronda anterior acaba', async () => {
    connectMatch({ ready: false, fencer_a: null, fencer_b: null });

    await renderRouter('./app', { initialUrl: '/match/m_1' });
    await screen.findByText('Waiting for the previous round');

    // O vencedor subiu, do lado do servidor. É o *poll* deste ecrã que dá pela mudança — sem ele o
    // árbitro ficava a olhar para um ecrã trancado à espera de nada.
    readyMatch();
    await act(() => poll());

    await screen.findByLabelText('This bout');
    expect(await screen.findByLabelText('One more touch for Ana Silva')).toBeTruthy();
  });

  it('espelha o combate ao vivo para a eliminatória, e não para os assaltos de poule', async () => {
    connectMatch();

    await renderRouter('./app', { initialUrl: '/match/m_1' });
    await screen.findByText('Round 2 · 1');

    await fireEvent.press(screen.getByLabelText('One more touch for Ana Silva'));

    // `POST /elimination/{id}/events`: um combate a decorrer mostra o placar a subir tal como um
    // assalto de poule (contrato §7).
    expect(eventsOf('match', 'm_1')).toMatchObject([
      { seq: 1, type: 'touch', side: 'a', score_a: 1, score_b: 0 },
    ]);
    expect(eventsOf('bout', 'm_1')).toHaveLength(0);
  });

  it('registar o resultado encerra a pista e mostra o resumo com o resultado', async () => {
    connectMatch();

    const router = renderRouter('./app', { initialUrl: '/match/m_1' });
    await router;
    await screen.findByText('Round 2 · 1');

    const addA = await screen.findByLabelText('One more touch for Ana Silva');
    for (let i = 0; i < 15; i++) await fireEvent.press(addA);

    await fireEvent.press(screen.getByText('Submit result'));
    await screen.findByText('Confirm result');
    await fireEvent.press(screen.getByText('Record'));

    // Registado o resultado não há mais nada nesta pista: o token morre e a app leva o árbitro ao
    // resumo (contrato §7). O resumo mostra o **resultado**, não "4/15 assaltos".
    await waitFor(() => expect(router.getPathname()).toBe('/complete'));
    await screen.findByText('Match recorded');
    expect(screen.getByText('15–0')).toBeTruthy();
    expect(fakeState.match).toMatchObject({ status: 'done', score_a: 15, score_b: 0 });
  });

  it('sem rede, o resultado do combate fica guardado e o resumo mostra-o na mesma', async () => {
    connectMatch();
    fakeState.failNextScore = 'network';

    const router = renderRouter('./app', { initialUrl: '/match/m_1' });
    await router;
    await screen.findByText('Round 2 · 1');

    await fireEvent.press(await screen.findByLabelText('One more touch for Ana Silva'));
    await fireEvent.press(screen.getByText('Submit result'));
    await fireEvent.press(await screen.findByText('Record'));

    await waitFor(() => expect(router.getPathname()).toBe('/complete'));

    // O resultado é do árbitro mesmo antes de chegar ao servidor — releitura nenhuma o traria, e
    // o resumo mostraria um combate por pontuar sobre um resultado que ele deu (spec §8).
    expect(screen.getByText('1–0')).toBeTruthy();
    expect(useQueueStore.getState().items).toMatchObject([{ kind: 'match', target_id: 'm_1' }]);
  });

  /**
   * Contrato `2.3.0`. Aqui não há "voltar à lista" — o combate **é** a sessão —, e por isso a única
   * saída sem resultado é o "Sair". Sem o dizer, o combate ficava a decorrer para sempre na página
   * da poule, com o árbitro já noutra pista.
   */
  it('sair da sessão liberta o combate que ficou a decorrer', async () => {
    connectMatch();

    const router = renderRouter('./app', { initialUrl: '/match/m_1' });
    await router;
    await screen.findByText('Round 2 · 1');

    await fireEvent.press(screen.getByLabelText('Timer'));
    expect(fakeState.match?.status).toBe('in_progress');

    await fireEvent.press(screen.getByLabelText('Leave'));
    await screen.findByText('Leave this piste?');
    await fireEvent.press(screen.getByText('Leave'));

    await waitFor(() => expect(wasReleased('match', 'm_1')).toBe(true));
    expect(fakeState.match?.status).toBe('pending');
  });

  it('sair depois de registar o resultado não liberta nada', async () => {
    connectMatch();

    const router = renderRouter('./app', { initialUrl: '/match/m_1' });
    await router;
    await screen.findByText('Round 2 · 1');

    await fireEvent.press(screen.getByLabelText('Timer'));
    const addA = await screen.findByLabelText('One more touch for Ana Silva');
    for (let i = 0; i < 15; i++) await fireEvent.press(addA);

    await fireEvent.press(screen.getByText('Submit result'));
    await fireEvent.press(await screen.findByText('Record'));
    await waitFor(() => expect(router.getPathname()).toBe('/complete'));

    // O resumo termina a sessão à saída, e o combate acabou: pedir a libertação de um combate que
    // se acabou de registar é dizer a coisa errada ao registo do organizador.
    await fireEvent.press(screen.getByText('Connect to another piste'));

    expect(wasReleased('match', 'm_1')).toBe(false);
    expect(fakeState.match?.status).toBe('done');
  });

  it('um resultado preso noutra pista diz que precisa do código dessa pista', async () => {
    connectMatch();
    fakeState.failNextScore = 'network';

    const first = renderRouter('./app', { initialUrl: '/match/m_1' });
    await first;
    await screen.findByText('Round 2 · 1');

    await fireEvent.press(await screen.findByLabelText('One more touch for Ana Silva'));
    await fireEvent.press(screen.getByText('Submit result'));
    await fireEvent.press(await screen.findByText('Record'));
    await waitFor(() => expect(useQueueStore.getState().items).toHaveLength(1));

    // A pista seguinte, com outro código. O token dela não alcança o combate anterior — e o
    // filtro do `drainQueue` existe para não o mandar com o token errado. Contá-lo à mistura com
    // os desta pista dizia ao árbitro que a app estava a tratar do assunto; não está.
    seedMatch({ id: 'm_2', round: 2, position: 2 });
    connectMatch({ id: 'm_2', round: 2, position: 2 });

    await renderRouter('./app', { initialUrl: '/match/m_2' });
    await screen.findByText('Round 2 · 2');

    expect(await screen.findByText(/no longer connected to/)).toBeTruthy();
  });
});
