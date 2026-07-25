import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Dimensions, Vibration } from 'react-native';

import type { PouleSummary } from '@/api/types';
import { useSessionStore } from '@/session/store';

import { connectPoule, resetApp } from './support/app';
import { state as fakeState } from './support/fakeApi';

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
    expect(screen.getByText('03:00')).toBeTruthy();

    await fireEvent.press(screen.getByText('+ 10 s'));
    expect(screen.getByText('03:10')).toBeTruthy();

    await fireEvent.press(screen.getByText('− 10 s'));
    await fireEvent.press(screen.getByText('− 10 s'));
    expect(screen.getByText('02:50')).toBeTruthy();
  });

  it('deixa escrever um tempo exato', async () => {
    await open();

    await fireEvent.press(screen.getByText('Adjust'));
    await screen.findByText('Adjust time');

    await fireEvent.changeText(screen.getByLabelText('Minutes'), '1');
    await fireEvent.changeText(screen.getByLabelText('Seconds'), '30');
    await fireEvent.press(screen.getByText('Apply'));

    expect(screen.getByText('01:30')).toBeTruthy();
  });

  it('repor vive dentro do acerto e volta ao tempo cheio', async () => {
    await open();
    await fireEvent.press(screen.getByText('+ 10 s'));

    await fireEvent.press(screen.getByText('Adjust'));
    await fireEvent.press(await screen.findByText('Reset to 3:00'));

    expect(screen.getByText('03:00')).toBeTruthy();
  });

  it('não deixa escrever mais de 59 segundos', async () => {
    await open();
    await fireEvent.press(screen.getByText('Adjust'));

    await fireEvent.changeText(await screen.findByLabelText('Minutes'), '0');
    await fireEvent.changeText(screen.getByLabelText('Seconds'), '99');
    await fireEvent.press(screen.getByText('Apply'));

    // 59 s ainda está acima do limiar dos décimos, por isso continua em MM:SS.
    expect(screen.getByText('00:59')).toBeTruthy();
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
    expect(screen.getByText('02:40')).toBeTruthy();
    expect(screen.getByLabelText('Passivity: 60 s')).toBeTruthy();

    await run(10_000);
    expect(screen.getByText('02:40')).toBeTruthy();
  });

  it('um cartão faz o mesmo', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('Timer'));
    await run(20_000);

    await fireEvent.press(screen.getByLabelText('Yellow card for Marta Lopes'));

    expect(screen.getByText('02:40')).toBeTruthy();
    expect(screen.getByLabelText('Passivity: 60 s')).toBeTruthy();
  });

  it('esgotar o minuto não dá cartão nenhum nem pára nada', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('Timer'));
    await run(65_000);

    expect(screen.getByLabelText('Passivity: 0 s')).toBeTruthy();
    // O tempo principal continua a correr e ninguém levou cartão.
    expect(screen.queryByText('Undo last card')).toBeNull();
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
    await fireEvent.press(screen.getByText('Undo last card'));

    expect(screen.getByLabelText('Tiago Rocha: 0 touches')).toBeTruthy();
    expect(screen.queryByText('Undo last card')).toBeNull();
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
    expect(screen.getByText('00:45')).toBeTruthy();

    // Dispensar o resto do intervalo está sempre disponível.
    await fireEvent.press(screen.getByText('Start period 2'));

    expect(screen.getByLabelText('Period 2 of 3')).toBeTruthy();
    // Um segundo de período: abaixo do limiar, logo com minutos e décimos (`0:01,0`).
    expect(screen.getByText('0:01,0')).toBeTruthy();
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
    expect(screen.queryByText('Sudden death')).toBeNull();
  });

  it('entra em morte súbita de um minuto quando a piscadela pára', async () => {
    await runOutOfLastPeriod();
    await finishDraw();

    expect(screen.getByText('Sudden death')).toBeTruthy();
    expect(screen.getByText('01:00')).toBeTruthy();
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
