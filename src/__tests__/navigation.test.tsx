import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { useSessionStore } from '@/session/store';

/**
 * Percorre o esqueleto de ponta a ponta sobre a árvore de rotas real:
 * Ligar → Lista → Assalto → submeter → Lista.
 *
 * É isto que prova que o esqueleto é navegável. Substitui o clique manual no simulador.
 */
describe('fluxo do esqueleto', () => {
  beforeEach(() => {
    useSessionStore.getState().disconnect();
  });

  it('liga com um PIN de 6 dígitos e mostra a lista de assaltos', async () => {
    const router = renderRouter('./app', { initialUrl: '/connect' });
    await router;
    await screen.findByText('Connect to a poule');

    await fireEvent.changeText(screen.getByLabelText('PIN'), '111111');
    await fireEvent.press(screen.getByText('Connect'));

    await screen.findByText('Poule 3 — Sabre Masculino');
    expect(router.getPathname()).toBe('/poule');
    expect(screen.getByText('3 of 15 bouts')).toBeTruthy();
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
    expect(useSessionStore.getState().status).toBe('disconnected');
  });

  it('abre o assalto seguinte, conta toques e submete', async () => {
    useSessionStore.getState().connect('111111');
    const router = renderRouter('./app', { initialUrl: '/poule' });
    await router;

    // O assalto 4 está `in_progress` na fixture, por isso o cartão do topo oferece retomá-lo.
    await fireEvent.press(await screen.findByText('Resume'));
    await screen.findByText('Bout 4');
    expect(router.getPathname()).toBe('/bout/b_01J8X004');

    // 5–0: cinco toques para o atleta A.
    const addA = screen.getByLabelText('One more touch for Marta Lopes');
    for (let i = 0; i < 5; i++) await fireEvent.press(addA);

    // A confirmação da spec §6 é agora uma folha inferior, não um `Alert` do sistema (ADR-016).
    await fireEvent.press(screen.getByText('Submit result'));
    await screen.findByText('Confirm result');
    await fireEvent.press(screen.getByText('Record'));

    await screen.findByText('4 of 15 bouts');
    expect(router.getPathname()).toBe('/poule');

    const bout = useSessionStore.getState().bouts.find((b) => b.id === 'b_01J8X004');
    expect(bout).toMatchObject({ status: 'done', score_a: 5, score_b: 0 });
  });

  it('bloqueia o submeter enquanto o resultado for um empate', async () => {
    useSessionStore.getState().connect('111111');
    await renderRouter('./app', { initialUrl: '/bout/b_01J8X004' });

    await screen.findByText('Bout 4');

    // 0–0 é um empate, e a plataforma recusa-os (contrato §7). O botão desativado é o aviso —
    // o resultado empatado está nos dois números grandes logo por cima.
    expect(screen.getByText('Submit result')).toBeDisabled();

    await fireEvent.press(screen.getByLabelText('One more touch for Marta Lopes'));
    expect(screen.getByText('Submit result')).not.toBeDisabled();
  });

  it('vai para o ecrã de poule completa quando o último assalto é registado', async () => {
    useSessionStore.getState().connect('111111');
    for (const bout of useSessionStore.getState().bouts) {
      if (bout.status !== 'done') useSessionStore.getState().recordScore(bout.id, 5, 1);
    }

    const router = renderRouter('./app', { initialUrl: '/poule' });
    await router;

    await screen.findByText('Poule complete');
    expect(router.getPathname()).toBe('/complete');
  });
});
