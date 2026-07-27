import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Dimensions, Vibration } from 'react-native';

import type { PouleSummary } from '@/api/types';
import { useQueueStore } from '@/queue/store';
import { useSessionStore } from '@/session/store';

import { connectPoule, resetApp } from './support/app';
import { eventsOf, state as fakeState } from './support/fakeApi';

/**
 * Ecrã 3, na parte que só se vê renderizando: fases, cartões, acerto de tempo, morte súbita e
 * landscape. As regras por trás disto estão em `src/bout/rules.test.ts` e `src/bout/phase.test.ts`;
 * aqui verifica-se que chegam ao ecrã.
 *
 * Assalto 4 da fixture: Marta Lopes (5) contra Tiago Rocha (6).
 */
const BOUT = '/bout/b_01J8X004';

/**
 * Mexe nos presets da poule — é assim que se testa o que a API há de mandar. Tem de ser **antes**
 * do `open()`: os presets chegam ao ecrã no `GET /bouts/{id}`, não do store da sessão.
 */
const withPoule = (patch: Partial<PouleSummary>) => {
  if (fakeState.poule) fakeState.poule = { ...fakeState.poule, ...patch };
  const current = useSessionStore.getState().poule;
  if (current) useSessionStore.setState({ poule: { ...current, ...patch } });
};

const open = async () => {
  await renderRouter('./app', { initialUrl: BOUT });
  await screen.findByText('Bout 4');
};

beforeEach(() => {
  resetApp();
  connectPoule();
  jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('períodos', () => {
  it('diz em que tempo estamos, sem texto — só pontos e o rótulo para o VoiceOver', async () => {
    // A fixture manda 3 períodos e um minuto de descanso.
    await open();

    expect(screen.getByLabelText('Period 1 of 3')).toBeTruthy();
    expect(screen.queryByText(/period/i)).toBeNull();
  });

  it('o rótulo acompanha a mudança de período', async () => {
    withPoule({ duration_seconds: 1, rest_seconds: null });
    jest.useFakeTimers();
    await open();

    await fireEvent.press(screen.getByLabelText('Timer'));
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    await fireEvent.press(screen.getByText('Start period 2'));

    expect(screen.getByLabelText('Period 2 of 3')).toBeTruthy();
    jest.useRealTimers();
  });
});

describe('acertar o tempo', () => {
  it('soma e tira 10 s ao que falta', async () => {
    await open();
    expect(screen.getByLabelText('03:00')).toBeTruthy();

    await fireEvent.press(screen.getByText('+ 10 s'));
    expect(screen.getByLabelText('03:10')).toBeTruthy();

    await fireEvent.press(screen.getByText('− 10 s'));
    await fireEvent.press(screen.getByText('− 10 s'));
    expect(screen.getByLabelText('02:50')).toBeTruthy();
  });

  it('deixa escrever um tempo exato', async () => {
    await open();

    await fireEvent.press(screen.getByText('Adjust'));
    await screen.findByText('Adjust time');

    await fireEvent.changeText(screen.getByLabelText('Minutes'), '1');
    await fireEvent.changeText(screen.getByLabelText('Seconds'), '30');
    await fireEvent.press(screen.getByText('Apply'));

    expect(screen.getByLabelText('01:30')).toBeTruthy();
  });

  it('repor vive dentro do acerto e volta ao tempo cheio', async () => {
    await open();
    await fireEvent.press(screen.getByText('+ 10 s'));

    await fireEvent.press(screen.getByText('Adjust'));
    await fireEvent.press(await screen.findByText('Reset to 3:00'));

    expect(screen.getByLabelText('03:00')).toBeTruthy();
  });

  it('não deixa escrever mais de 59 segundos', async () => {
    await open();
    await fireEvent.press(screen.getByText('Adjust'));

    await fireEvent.changeText(await screen.findByLabelText('Minutes'), '0');
    await fireEvent.changeText(screen.getByLabelText('Seconds'), '99');
    await fireEvent.press(screen.getByText('Apply'));

    // 59 s ainda está acima do limiar dos décimos, por isso continua em MM:SS.
    expect(screen.getByLabelText('00:59')).toBeTruthy();
  });
});

describe('passividade e paragem do tempo', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const run = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  };

  it('conta o minuto de passividade enquanto o tempo principal corre', async () => {
    await open();
    expect(screen.getByLabelText('Passivity: 60 s')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Timer'));
    await run(15_000);

    expect(screen.getByLabelText('Passivity: 45 s')).toBeTruthy();
  });

  it('um toque pára o tempo principal e reinicia a passividade', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('Timer'));
    await run(20_000);

    await fireEvent.press(screen.getByLabelText('One more touch for Marta Lopes'));

    // "Halt": o cronómetro pára onde estava e o minuto recomeça.
    expect(screen.getByLabelText('02:40')).toBeTruthy();
    expect(screen.getByLabelText('Passivity: 60 s')).toBeTruthy();

    await run(10_000);
    expect(screen.getByLabelText('02:40')).toBeTruthy();
  });

  it('um cartão faz o mesmo', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('Timer'));
    await run(20_000);

    await fireEvent.press(screen.getByLabelText('Yellow card for Marta Lopes'));

    expect(screen.getByLabelText('02:40')).toBeTruthy();
    expect(screen.getByLabelText('Passivity: 60 s')).toBeTruthy();
  });

  it('esgotar o minuto não dá cartão nenhum nem pára nada', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('Timer'));
    await run(65_000);

    expect(screen.getByLabelText('Passivity: 0 s')).toBeTruthy();
    // O tempo principal continua a correr e ninguém levou cartão.
    expect(
      screen.getByLabelText('Yellow card for Marta Lopes').props.accessibilityValue,
    ).toMatchObject({ text: '0 given' });
    expect(screen.getByLabelText('Marta Lopes: 0 touches')).toBeTruthy();
  });

  it('não conta passividade durante o descanso', async () => {
    withPoule({ duration_seconds: 1, rest_seconds: 45 });
    await open();

    await fireEvent.press(screen.getByLabelText('Timer'));
    await run(1500);
    await fireEvent.press(screen.getByText('Start rest'));

    expect(screen.queryByLabelText(/Passivity/)).toBeNull();
  });
});

describe('cartões', () => {
  const giveRedTo = 'Red card for Marta Lopes — awards a touch to the opponent';
  const giveBlackTo = 'Black card for Marta Lopes';

  it('o vermelho dá um toque ao adversário', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText(giveRedTo));

    expect(screen.getByLabelText('Tiago Rocha: 1 touch')).toBeTruthy();
    expect(screen.getByLabelText('Marta Lopes: 0 touches')).toBeTruthy();
  });

  it('o preto dá-se uma vez e fica desativado', async () => {
    await open();

    await fireEvent.press(screen.getByLabelText(giveBlackTo));
    expect(screen.getByLabelText(giveBlackTo)).toBeDisabled();

    // Insistir não acrescenta um segundo preto.
    await fireEvent.press(screen.getByLabelText(giveBlackTo));
    expect(screen.getByLabelText(giveBlackTo).props.accessibilityValue).toMatchObject({
      text: '1 given',
    });
  });

  it('anular devolve o toque que o vermelho deu', async () => {
    await open();

    await fireEvent.press(screen.getByLabelText(giveRedTo));
    // Anula-se no próprio cartão, sem largar — não há botão à parte.
    await fireEvent(screen.getByLabelText(giveRedTo), 'longPress');

    expect(screen.getByLabelText('Tiago Rocha: 0 touches')).toBeTruthy();
    expect(screen.getByLabelText(giveRedTo).props.accessibilityValue).toMatchObject({
      text: '0 given',
    });
  });

  it('largar o dedo depois de anular não volta a dar o cartão', async () => {
    await open();

    await fireEvent.press(screen.getByLabelText(giveRedTo));

    // O gesto inteiro, como o sistema o entrega: o dedo pousa, a pressão longa dispara, e depois
    // larga-se. O `Pressable` decide se cancela o `onPress` do largar lendo o `onLongPress` que
    // existe **nesse instante** — e anular o último cartão punha-o a `undefined`, com o cartão a ser
    // dado outra vez ao levantar o dedo.
    await fireEvent(screen.getByLabelText(giveRedTo), 'pressIn');
    await fireEvent(screen.getByLabelText(giveRedTo), 'longPress');
    await fireEvent.press(screen.getByLabelText(giveRedTo));

    expect(screen.getByLabelText(giveRedTo).props.accessibilityValue).toMatchObject({
      text: '0 given',
    });
    expect(screen.getByLabelText('Tiago Rocha: 0 touches')).toBeTruthy();
  });

  it('anula o cartão daquele atleta, e não o último do assalto', async () => {
    await open();

    await fireEvent.press(screen.getByLabelText(giveRedTo));
    await fireEvent.press(screen.getByLabelText('Yellow card for Tiago Rocha'));

    // O último cartão do assalto é o amarelo do Tiago; anular no vermelho da Marta tira o dela.
    await fireEvent(screen.getByLabelText(giveRedTo), 'longPress');

    expect(
      screen.getByLabelText('Yellow card for Tiago Rocha').props.accessibilityValue,
    ).toMatchObject({ text: '1 given' });
    expect(screen.getByLabelText(giveRedTo).props.accessibilityValue).toMatchObject({
      text: '0 given',
    });
  });

  it('um preto dado por engano ainda se anula', async () => {
    await open();

    await fireEvent.press(screen.getByLabelText(giveBlackTo));
    await fireEvent(screen.getByLabelText(giveBlackTo), 'longPress');

    expect(screen.getByLabelText(giveBlackTo).props.accessibilityValue).toMatchObject({
      text: '0 given',
    });
    // E volta a poder dar-se.
    expect(screen.getByLabelText(giveBlackTo)).not.toBeDisabled();
  });
});

describe('controlo dos períodos', () => {
  it('avança e recua de período sem esperar pelo cronómetro', async () => {
    // A fixture manda 3 períodos.
    await open();
    expect(screen.getByLabelText('Period 1 of 3')).toBeTruthy();
    // Não há para onde recuar no primeiro.
    expect(screen.getByLabelText('Previous period')).toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Next period'));
    expect(screen.getByLabelText('Period 2 of 3')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Previous period'));
    expect(screen.getByLabelText('Period 1 of 3')).toBeTruthy();
  });

  it('o período seguinte recomeça no tempo cheio', async () => {
    await open();
    await fireEvent.press(screen.getByText('− 10 s'));
    expect(screen.getByLabelText('02:50')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Next period'));

    expect(screen.getByLabelText('03:00')).toBeTruthy();
  });

  it('pára no último período', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('Next period'));
    await fireEvent.press(screen.getByLabelText('Next period'));

    expect(screen.getByLabelText('Period 3 of 3')).toBeTruthy();
    expect(screen.getByLabelText('Next period')).toBeDisabled();
  });

  it('deixa entrar em descanso a meio do período', async () => {
    withPoule({ rest_seconds: 45 });
    await open();

    // Sem esperar que o tempo acabe — o botão está lá desde o princípio.
    await fireEvent.press(screen.getByText('Start rest'));

    expect(screen.getByText('Rest')).toBeTruthy();
    expect(screen.getByLabelText('00:45')).toBeTruthy();
  });

  it('não oferece descanso onde não há intervalo nenhum', async () => {
    withPoule({ rest_seconds: null });
    await open();

    expect(screen.queryByText('Start rest')).toBeNull();
  });
});

describe('linha temporal', () => {
  it('mostra o que já aconteceu, do mais recente para o mais antigo', async () => {
    await open();

    await fireEvent.press(screen.getByLabelText('One more touch for Marta Lopes'));
    await fireEvent.press(screen.getByLabelText('Yellow card for Tiago Rocha'));

    await fireEvent.press(screen.getByText('Timeline'));
    await screen.findByText('What happened');

    expect(screen.getByText('Yellow card')).toBeTruthy();
    expect(screen.getByText('Touch')).toBeTruthy();
    // O placar depois de cada acontecimento, e o período em que caiu.
    expect(screen.getAllByText('1–0')).toHaveLength(2);
    expect(screen.getAllByText('P1')).toHaveLength(2);
  });

  it('num assalto por começar diz que ainda não há nada', async () => {
    await open();

    await fireEvent.press(screen.getByText('Timeline'));

    expect(await screen.findByText('Nothing has happened in this bout yet.')).toBeTruthy();
  });

  it('mostra também os marcos do combate, com nome e sem placar', async () => {
    jest.useFakeTimers();
    await open();

    await fireEvent.press(screen.getByLabelText('Timer'));
    await act(async () => {
      jest.advanceTimersByTime(29_000);
    });
    await fireEvent.press(screen.getByLabelText('One more touch for Marta Lopes'));

    await fireEvent.press(screen.getByText('Timeline'));
    await screen.findByText('What happened');

    // O arranque e o halt são acontecimentos como os outros — um halt sem toque a seguir é
    // exatamente o que só ele conta.
    expect(screen.getByText('Start of bout')).toBeTruthy();
    expect(screen.getByText('Clock stopped')).toBeTruthy();

    // O placar pertence aos eventos que o mudam: só o toque o traz, e o painel não aparece nos
    // outros a dizer `–—–`, que se leria como um resultado a zero.
    expect(screen.getAllByText('1–0')).toHaveLength(1);

    jest.useRealTimers();
  });
});

describe('descanso entre períodos', () => {
  /** Leva o cronómetro da fase atual até ao fim. */
  const runOutOfTime = async () => {
    await fireEvent.press(screen.getByLabelText('Timer'));
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('oferece descanso no fim de um período que tem outro a seguir', async () => {
    withPoule({ duration_seconds: 1, rest_seconds: 60 });
    await open();
    await runOutOfTime();

    expect(screen.getByText('Start rest')).toBeTruthy();
  });

  it('conta o descanso que a API mandou e depois passa ao tempo seguinte', async () => {
    withPoule({ duration_seconds: 1, rest_seconds: 45 });
    await open();
    await runOutOfTime();

    await fireEvent.press(screen.getByText('Start rest'));

    expect(screen.getByText('Rest')).toBeTruthy();
    expect(screen.getByText('before period 2')).toBeTruthy();
    expect(screen.getByLabelText('00:45')).toBeTruthy();

    // Dispensar o resto do intervalo está sempre disponível.
    await fireEvent.press(screen.getByText('Start period 2'));

    expect(screen.getByLabelText('Period 2 of 3')).toBeTruthy();
    // Um segundo de período: abaixo do limiar, logo com minutos e décimos (`0:01,0`).
    expect(screen.getByLabelText('0:01,0')).toBeTruthy();
  });

  it('salta o descanso quando a API não o manda', async () => {
    withPoule({ duration_seconds: 1, rest_seconds: null });
    await open();
    await runOutOfTime();

    expect(screen.queryByText('Start rest')).toBeNull();
    expect(screen.getByText('Start period 2')).toBeTruthy();
  });
});

describe('prioridade e morte súbita', () => {
  /** Poule de um período: o primeiro fim de tempo já é o último. */
  const runOutOfLastPeriod = async () => {
    withPoule({ duration_seconds: 1, periods: 1 });
    await open();

    await fireEvent.press(screen.getByLabelText('Timer'));
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('oferece o sorteio quando o último período acaba empatado', async () => {
    await runOutOfLastPeriod();
    expect(screen.getByText('Draw priority')).toBeTruthy();
  });

  it('não oferece sorteio enquanto o tempo corre', async () => {
    withPoule({ periods: 1 });
    await open();

    expect(screen.queryByText('Draw priority')).toBeNull();
  });

  /** Deixa a piscadela do sorteio correr até ao fim. */
  const finishDraw = async () => {
    await fireEvent.press(screen.getByText('Draw priority'));
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
  };

  it('pisca entre os dois atletas antes de fixar a marca', async () => {
    await runOutOfLastPeriod();

    await fireEvent.press(screen.getByText('Draw priority'));
    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    // A meio do sorteio já há uma marca no ecrã, mas ainda não é o resultado.
    expect(screen.getAllByText('Priority').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('01:00')).toBeNull();
  });

  it('entra em morte súbita de um minuto quando a piscadela pára', async () => {
    await runOutOfLastPeriod();
    await finishDraw();

    expect(screen.getByLabelText('01:00')).toBeTruthy();
    // A marca fica num atleta só — é o que substitui o aviso escrito.
    expect(screen.getAllByText('Priority')).toHaveLength(1);
  });

  it('diz em uma linha o que falta para poder submeter', async () => {
    await runOutOfLastPeriod();
    await finishDraw();

    expect(screen.getByText(/record the deciding touch/)).toBeTruthy();
    expect(screen.queryByText(/No draws in poules/)).toBeNull();
  });
});

describe('submeter', () => {
  it('confirma numa folha da app, não num alerta do sistema', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('One more touch for Marta Lopes'));
    await fireEvent.press(screen.getByText('Submit result'));

    await screen.findByText('Confirm result');
    expect(screen.getByText('Marta Lopes wins. Recording cannot be undone.')).toBeTruthy();
  });

  it('cancelar fecha a folha sem gravar', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('One more touch for Marta Lopes'));
    await fireEvent.press(screen.getByText('Submit result'));
    await fireEvent.press(await screen.findByText('Cancel'));

    expect(screen.queryByText('Confirm result')).toBeNull();
    // Cancelar não escreve: o assalto continua como estava do lado do servidor.
    expect(fakeState.bouts.find((b) => b.id === 'b_01J8X004')?.status).toBe('in_progress');
  });
});

/**
 * A pista ao vivo (contrato §7, `1.5.0`). O ecrã não muda por causa disto — o que muda é que a
 * plataforma deixa de saber do assalto só no fim. Por isso o que se verifica é o que sai daqui.
 */
describe('a pista ao vivo', () => {
  const eventsOfBout = () => eventsOf('bout', 'b_01J8X004');

  it('cada toque sobe no instante em que cai, com o contador e o placar', async () => {
    await open();

    await fireEvent.press(screen.getByLabelText('One more touch for Marta Lopes'));
    await fireEvent.press(screen.getByLabelText('One more touch for Tiago Rocha'));

    expect(eventsOfBout()).toMatchObject([
      { seq: 1, type: 'touch', side: 'a', period: 1, score_a: 1, score_b: 0 },
      { seq: 2, type: 'touch', side: 'b', period: 1, score_a: 1, score_b: 1 },
    ]);
  });

  it('o cartão sobe com o toque que ele deu', async () => {
    await open();

    await fireEvent.press(
      screen.getByLabelText('Red card for Marta Lopes — awards a touch to the opponent'),
    );

    expect(eventsOfBout()).toMatchObject([
      { seq: 1, type: 'card_red', side: 'a', score_a: 0, score_b: 1 },
    ]);
  });

  it('retirar um toque não tem evento — o placar corrigido vai no seguinte', async () => {
    await open();

    await fireEvent.press(screen.getByLabelText('One more touch for Marta Lopes'));
    await fireEvent.press(screen.getByLabelText('One fewer touch for Marta Lopes'));
    await fireEvent.press(screen.getByLabelText('One more touch for Tiago Rocha'));

    expect(eventsOfBout()).toMatchObject([
      { seq: 1, type: 'touch', side: 'a', score_a: 1, score_b: 0 },
      { seq: 2, type: 'touch', side: 'b', score_a: 0, score_b: 1 },
    ]);
  });

  it('o combate inteiro sobe com os marcos, do arranque à morte súbita', async () => {
    jest.useFakeTimers();
    withPoule({ duration_seconds: 1, periods: 1 });
    await open();

    await fireEvent.press(screen.getByLabelText('Timer'));
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });

    await fireEvent.press(screen.getByText('Draw priority'));
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });

    /*
     * Os marcos do combate (contrato `2.1.0`). O que se fixa aqui é a **ordem**: o combate começa
     * uma vez, o primeiro período começa logo a seguir — e não em vez dele —, e o
     * `sudden_death_start` vem antes do sorteio, que é quem abre a morte súbita. A morte súbita é
     * `periods + 1` e conta-se ao segundo zero.
     */
    expect(eventsOfBout()).toMatchObject([
      { seq: 1, type: 'bout_start', period: 1, at_ms: 0, elapsed_ms: 0, remaining_ms: 1_000 },
      { seq: 2, type: 'period_start', period: 1, at_ms: 0, phase: 'period' },
      { seq: 3, type: 'clock_start', period: 1, at_ms: 0 },
      { seq: 4, type: 'period_end', period: 1, at_ms: 1_000, remaining_ms: 0 },
      {
        seq: 5,
        type: 'sudden_death_start',
        period: 2,
        at_ms: 0,
        phase: 'sudden_death',
        remaining_ms: 60_000,
      },
      { seq: 6, type: 'priority', period: 2, at_ms: 0, phase: 'sudden_death' },
    ]);

    // O `at` é hora de parede do dispositivo, e é o que responde a "a que horas começou".
    expect(eventsOfBout()[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);

    jest.useRealTimers();
  });

  it('confirmar o resultado fecha a história do combate antes de o registar', async () => {
    await open();

    await fireEvent.press(screen.getByLabelText('One more touch for Marta Lopes'));
    await fireEvent.press(screen.getByText('Submit result'));
    await fireEvent.press(await screen.findByText('Record'));

    // O `bout_end` é a última linha da história, **não** o registo dela: o que fica registado é o
    // `a`/`b` do `score`. Um combate cujo resultado nunca chegou fica com um e sem o outro.
    expect(eventsOfBout().at(-1)).toMatchObject({ type: 'bout_end', score_a: 1, score_b: 0 });
  });

  it('o que a rede não levou vai no lote seguinte, e não duplica', async () => {
    await open();

    fakeState.failNextEvents = 'network';
    await fireEvent.press(screen.getByLabelText('One more touch for Marta Lopes'));
    expect(eventsOfBout()).toHaveLength(0);

    await fireEvent.press(screen.getByLabelText('One more touch for Marta Lopes'));

    expect(eventsOfBout().map((event) => event.seq)).toEqual([1, 2]);
  });

  it('uma falha não estraga o assalto nem enche a fila de resultados', async () => {
    await open();

    fakeState.failNextEvents = 'network';
    await fireEvent.press(screen.getByLabelText('One more touch for Marta Lopes'));

    // O placar é da app e não espera por servidor nenhum; a fila é só para resultados (spec §8).
    expect(screen.getByLabelText('Marta Lopes: 1 touch')).toBeTruthy();
    expect(useQueueStore.getState().items).toHaveLength(0);
  });

  it('não espelha nada num assalto de uma poule fechada', async () => {
    withPoule({ locked: true });
    await open();

    await fireEvent.press(screen.getByLabelText('One more touch for Marta Lopes'));

    // Escrita travada dos dois lados: o servidor responderia `422 poule_locked` a cada toque.
    expect(eventsOfBout()).toHaveLength(0);
  });
});

describe('landscape', () => {
  const portrait = Dimensions.get('window');

  afterEach(() => {
    act(() => {
      Dimensions.set({ window: portrait, screen: portrait });
    });
  });

  it('sobrevive à rotação com todos os controlos', async () => {
    await open();

    const landscape = { ...portrait, width: portrait.height, height: portrait.width };
    await act(async () => {
      Dimensions.set({ window: landscape, screen: landscape });
    });

    // Deitado, o ecrã continua a ser o mesmo ecrã.
    expect(screen.getByLabelText('Timer')).toBeTruthy();
    expect(screen.getByLabelText('One more touch for Marta Lopes')).toBeTruthy();
    expect(screen.getByLabelText('Passivity: 60 s')).toBeTruthy();
    expect(screen.getByText('Adjust')).toBeTruthy();
    expect(screen.getByText('Submit result')).toBeTruthy();
  });
});
