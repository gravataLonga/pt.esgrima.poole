import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { useSessionStore } from '@/session/store';

/**
 * Ecrã 2: os estados por assalto e a folha de poule. Complementa `navigation.test.tsx`, que só
 * prova que a árvore de rotas se percorre.
 *
 * Estado da fixture: assaltos 1–3 registados, 4 a decorrer, 5–15 por disputar.
 */
describe('lista de assaltos e folha de poule', () => {
  beforeEach(async () => {
    useSessionStore.getState().disconnect();
    useSessionStore.getState().connect('111111');
    await renderRouter('./app', { initialUrl: '/poule' });
    await screen.findByText('Poule 3 — Sabre Masculino');
  });

  describe('estados', () => {
    it('destaca o assalto a decorrer no cartão do topo', async () => {
      expect(await screen.findByText('Resume')).toBeTruthy();
      expect(screen.getAllByText('In progress').length).toBeGreaterThan(0);
    });

    it('diz quem se deve ir preparar a seguir', () => {
      // A seguir ao assalto 4 vem o 5: Carla Neves (3) contra Ana Silva (1).
      expect(screen.getByText('3 Carla Neves vs 1 Ana Silva')).toBeTruthy();
    });

    it('marca exatamente um assalto como "preparar" na lista', () => {
      // Dois no ecrã: a etiqueta da tira "a seguir" no cartão e o badge da linha da lista.
      expect(screen.getAllByText('On deck')).toHaveLength(2);
    });

    it('mostra os restantes como por disputar', () => {
      expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    });
  });

  describe('vista de grelha', () => {
    beforeEach(async () => {
      await fireEvent.press(screen.getByText('Grid'));
    });

    it('troca a lista pela classificação e pela matriz', async () => {
      expect(await screen.findByText('Standings')).toBeTruthy();
      expect(screen.getByText('Poule grid')).toBeTruthy();
    });

    it('mostra os lugares calculados a partir dos assaltos registados', () => {
      // Seis atletas, seis lugares — sem reordenar nada à mão.
      expect(screen.getByText('1°')).toBeTruthy();
      expect(screen.getByText('6°')).toBeTruthy();
    });

    it('rotula as células com o par e o resultado, para o VoiceOver', () => {
      // Assalto 1 da fixture: Ana Silva 5 — Bruno Dias 3.
      expect(
        screen.getByLabelText('Ana Silva against Bruno Dias: 5 given, 3 received'),
      ).toBeTruthy();
      expect(
        screen.getByLabelText('Bruno Dias against Ana Silva: 3 given, 5 received'),
      ).toBeTruthy();
    });

    it('volta à lista de assaltos', async () => {
      await fireEvent.press(screen.getByText('Grid'));
      await fireEvent.press(screen.getAllByText('Bouts')[0]!);

      expect(await screen.findByText('Resume')).toBeTruthy();
    });
  });
});

describe('sem nenhum assalto em pista', () => {
  it('o atual diz "começar" e só o seguinte diz "preparar"', async () => {
    useSessionStore.getState().disconnect();
    useSessionStore.getState().connect('111111');

    // Tira o assalto 4 de `in_progress`: passa a ser ele o de começar, e o 5 o de preparar.
    const bouts = useSessionStore
      .getState()
      .bouts.map((b) => (b.status === 'in_progress' ? { ...b, status: 'pending' as const } : b));
    useSessionStore.setState({ bouts });

    await renderRouter('./app', { initialUrl: '/poule' });
    await screen.findByText('Poule 3 — Sabre Masculino');

    // O botão do cartão do topo e o badge da linha. O cartão não repete o badge (seria a mesma
    // palavra duas vezes, uma por cima da outra).
    expect(screen.getAllByText('Start')).toHaveLength(2);
    // Um badge na lista, mais a etiqueta da tira "a seguir" no cartão do topo.
    expect(screen.getAllByText('On deck')).toHaveLength(2);
    expect(screen.queryByText('In progress')).toBeNull();
  });
});

describe('folha de poule sem assaltos', () => {
  it('mostra a caixa de estado vazio em vez de uma grelha vazia', async () => {
    useSessionStore.getState().disconnect();
    useSessionStore.getState().connect('111111');
    useSessionStore.setState({ bouts: [] });

    await renderRouter('./app', { initialUrl: '/poule' });
    await fireEvent.press(await screen.findByText('Grid'));

    // Dois blocos, a mesma caixa tracejada em cada um.
    expect(screen.getAllByText('The poule needs at least two fencers.')).toHaveLength(2);
  });
});
