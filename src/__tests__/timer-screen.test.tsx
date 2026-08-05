import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert, Vibration } from 'react-native';

import { useSessionStore } from '@/session/store';

import { resetApp } from './support/app';

/**
 * Modo cronómetro (ADR-021): um assalto, offline, sem atletas.
 *
 * O que aqui se verifica é sobretudo o que **não** acontece — não há nomes, não há submissão, e a
 * sessão nunca sai de `disconnected`. As regras por trás disto estão em `src/bout/rules.test.ts` e
 * `src/bout/phase.test.ts`; o motor partilhado com o ecrã ligado está coberto por
 * `bout-screen.test.tsx`.
 */
const open = async () => {
  await renderRouter('./app', { initialUrl: '/timer' });
  await screen.findByText('Timer');
};

beforeEach(() => {
  resetApp();
  jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('sem ligação', () => {
  it('abre sem sessão nenhuma e deixa-a por ligar', async () => {
    await open();

    expect(useSessionStore.getState().phase).toBe('disconnected');
    expect(useSessionStore.getState().poule).toBeNull();
  });

  it('chega-se lá a partir do ecrã de ligar, sem passar pela poule', async () => {
    const router = renderRouter('./app', { initialUrl: '/connect' });
    await router;
    await screen.findByText('Connect to your piste');

    await fireEvent.press(screen.getByText('Timer only'));

    await screen.findByText('Timer');
    expect(router.getPathname()).toBe('/timer');
    expect(useSessionStore.getState().phase).toBe('disconnected');
  });
});

describe('sem atletas', () => {
  it('as colunas são o verde e o vermelho, não nomes', async () => {
    await open();

    expect(screen.getByText('Green')).toBeTruthy();
    expect(screen.getByText('Red')).toBeTruthy();
    // A fixture da poule não pode ter chegado aqui por engano.
    expect(screen.queryByText('Ana Silva')).toBeNull();
    expect(screen.queryByText('Marta Lopes')).toBeNull();
  });

  it('o VoiceOver identifica os lados pela cor', async () => {
    await open();

    expect(screen.getByLabelText('One more touch for Green')).toBeTruthy();
    expect(screen.getByLabelText('One fewer touch for Red')).toBeTruthy();
  });
});

describe('conduzir o assalto', () => {
  it('conta toques dos dois lados', async () => {
    await open();

    await fireEvent.press(screen.getByLabelText('One more touch for Green'));
    await fireEvent.press(screen.getByLabelText('One more touch for Green'));
    await fireEvent.press(screen.getByLabelText('One more touch for Red'));

    expect(screen.getByLabelText('Green: 2 touches')).toBeTruthy();
    expect(screen.getByLabelText('Red: 1 touch')).toBeTruthy();
  });

  it('o cartão vermelho dá um toque ao adversário, e o anular devolve-o', async () => {
    await open();

    await fireEvent.press(
      screen.getByLabelText('Red card for Green — awards a touch to the opponent'),
    );
    expect(screen.getByLabelText('Red: 1 touch')).toBeTruthy();

    await fireEvent(
      screen.getByLabelText('Red card for Green — awards a touch to the opponent'),
      'longPress',
    );
    expect(screen.getByLabelText('Red: 0 touches')).toBeTruthy();
  });

  it('arranca em 3:00, o preset de poule', async () => {
    await open();

    expect(screen.getByLabelText('03:00')).toBeTruthy();
  });
});

describe('as regras deste assalto', () => {
  it('o "?" diz os presets e como se conduz, e fecha-se', async () => {
    await open();

    // Fechada, o conteúdo não está montado — o `Modal` só o desenha quando é visível.
    expect(screen.queryByText('How it works')).toBeNull();

    await fireEvent.press(screen.getByLabelText('This bout'));

    // Os presets do modo cronómetro: 5 toques, 3 minutos, um período só.
    expect(screen.getByText('5 touches')).toBeTruthy();
    expect(screen.getByText('3 min')).toBeTruthy();
    // Um período não é "períodos": a linha muda de nome em vez de dizer "1 ×".
    expect(screen.getByText('Time')).toBeTruthy();
    expect(screen.queryByText('Periods')).toBeNull();
    // E sem períodos não há descanso que separar — a linha nem aparece.
    expect(screen.queryByText('Rest')).toBeNull();

    // A pressão longa para anular um cartão não se descobre a olhar: é aqui que está escrita.
    expect(screen.getByText('Tap a card to give it; press and hold it to undo it.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Got it'));
    await waitFor(() => expect(screen.queryByText('How it works')).toBeNull());
  });
});

/**
 * A folha da prioridade é a mesma dos dois ecrãs, e está coberta em `bout-screen.test.tsx`. O que
 * aqui se verifica é a ligação: sem ela, o botão do sorteio ficava inerte neste ecrã.
 */
describe('a prioridade sem atletas', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('marca à mão a prioridade que o aparelho da pista tirou, e os lados são as cores', async () => {
    await open();

    await fireEvent.press(screen.getByLabelText('Timer'));
    await act(async () => {
      jest.advanceTimersByTime(181_000);
    });

    await fireEvent.press(screen.getByText('Draw priority'));
    await fireEvent.press(screen.getByLabelText('Priority to Red'));

    expect(screen.getByLabelText('Red has priority')).toBeTruthy();
    expect(screen.getByLabelText('01:00')).toBeTruthy();
  });
});

describe('sem para onde submeter', () => {
  it('não há botão de submeter — há um assalto novo', async () => {
    await open();

    expect(screen.queryByText('Submit result')).toBeNull();
    expect(screen.getByText('New bout')).toBeTruthy();
  });

  it('o empate não bloqueia nada: aqui não há plataforma para o recusar', async () => {
    await open();

    await fireEvent.press(screen.getByLabelText('One more touch for Green'));
    await fireEvent.press(screen.getByLabelText('One more touch for Red'));

    // 1–1 e o ecrã não pede toque decisivo nenhum.
    expect(screen.queryByText(/deciding touch/i)).toBeNull();
  });

  it('o assalto novo limpa o resultado sem confirmação quando não há nada a perder', async () => {
    await open();

    await fireEvent.press(screen.getByText('New bout'));

    expect(screen.getByLabelText('Green: 0 touches')).toBeTruthy();
  });

  it('o assalto novo repõe o resultado depois de confirmado', async () => {
    // Com toques na mesa, o "Novo assalto" passa por um `Alert` — que aqui se responde à mão.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirm = buttons?.at(-1);
      confirm?.onPress?.();
    });

    await open();

    await fireEvent.press(screen.getByLabelText('One more touch for Green'));
    await fireEvent.press(screen.getByLabelText('One more touch for Green'));
    expect(screen.getByLabelText('Green: 2 touches')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('New bout'));
    });

    expect(alert).toHaveBeenCalled();
    expect(screen.getByLabelText('Green: 0 touches')).toBeTruthy();
    expect(screen.getByLabelText('03:00')).toBeTruthy();
  });
});
