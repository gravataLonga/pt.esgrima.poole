import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { poule as fixturePoule } from '@/fixtures/poule';
import { useRefereeingStore } from '@/poule';

import { connectPoule, resetApp } from './support/app';
import { state as fakeState } from './support/fakeApi';

/**
 * Ecrã 2: os estados por assalto e a folha de poule. Complementa `navigation.test.tsx`, que só
 * prova que a árvore de rotas se percorre.
 *
 * Estado da fixture: assaltos 1–3 registados, 4 a decorrer, 5–15 por disputar.
 */
describe('lista de assaltos e folha de poule', () => {
  beforeEach(async () => {
    resetApp();
    connectPoule();
    await renderRouter('./app', { initialUrl: '/poule' });
    await screen.findByText('Poule 3 — Sabre Masculino');
  });

  describe('estados', () => {
    it('destaca o assalto a decorrer no cartão do topo', async () => {
      expect(await screen.findByText('Resume')).toBeTruthy();
      expect(screen.getAllByText('In progress').length).toBeGreaterThan(0);
    });

    it('diz quem se deve ir preparar a seguir', async () => {
      // A seguir ao assalto 4 vem o 5: Carla Neves (3) contra Ana Silva (1).
      expect(await screen.findByText('3 Carla Neves vs 1 Ana Silva')).toBeTruthy();
    });

    it('marca exatamente um assalto como "preparar" na lista', async () => {
      // Dois no ecrã: a etiqueta da tira "a seguir" no cartão e o badge da linha da lista.
      await screen.findByText('Resume');
      expect(screen.getAllByText('On deck')).toHaveLength(2);
    });

    it('mostra os restantes como por disputar', async () => {
      await screen.findByText('Resume');
      expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    });
  });

  describe('vista de grelha', () => {
    beforeEach(async () => {
      await screen.findByText('Resume');
      await fireEvent.press(screen.getByText('Grid'));
    });

    it('troca a lista pela classificação e pela matriz', async () => {
      expect(await screen.findByText('Standings')).toBeTruthy();
      expect(screen.getByText('Poule grid')).toBeTruthy();
    });

    it('mostra os lugares que o servidor calculou', async () => {
      // Seis atletas, seis lugares — vindos do `GET /standings`, sem o cliente reordenar nada
      // (contrato §7: "o cliente mostra `place` tal como vem").
      expect(await screen.findByText('1°')).toBeTruthy();
      expect(screen.getByText('6°')).toBeTruthy();
    });

    it('rotula as células com o par e o resultado, para o VoiceOver', async () => {
      // Assalto 1 da fixture: Ana Silva 5 — Bruno Dias 3.
      expect(
        await screen.findByLabelText('Ana Silva against Bruno Dias: 5 given, 3 received'),
      ).toBeTruthy();
      expect(
        screen.getByLabelText('Bruno Dias against Ana Silva: 3 given, 5 received'),
      ).toBeTruthy();
    });

    it('volta à lista de assaltos', async () => {
      await screen.findByText('Standings');
      await fireEvent.press(screen.getAllByText('Bouts')[0]!);

      expect(await screen.findByText('Resume')).toBeTruthy();
    });
  });
});

describe('sem nenhum assalto em pista', () => {
  it('o atual diz "começar" e só o seguinte diz "preparar"', async () => {
    resetApp();
    connectPoule();

    // Tira o assalto 4 de `in_progress`: passa a ser ele o de começar, e o 5 o de preparar.
    fakeState.bouts = fakeState.bouts.map((bout) =>
      bout.status === 'in_progress' ? { ...bout, status: 'pending' as const } : bout,
    );

    await renderRouter('./app', { initialUrl: '/poule' });
    await screen.findByText('Poule 3 — Sabre Masculino');

    // O botão do cartão do topo e o badge da linha. O cartão não repete o badge (seria a mesma
    // palavra duas vezes, uma por cima da outra).
    expect(await screen.findAllByText('Start')).toHaveLength(2);
    // Um badge na lista, mais a etiqueta da tira "a seguir" no cartão do topo.
    expect(screen.getAllByText('On deck')).toHaveLength(2);
    expect(screen.queryByText('In progress')).toBeNull();
  });
});

/**
 * Contrato `2.2.0`: uma poule atrasada é levada a uma segunda pista por um segundo árbitro, com a
 * folha e o código que já lá estavam. A lista passa a poder mostrar assaltos a decorrer que não são
 * deste telemóvel — e o cartão do topo, que propõe uma **ação**, tem de seguir este e não o outro.
 */
describe('dois árbitros na mesma poule', () => {
  /** Põe o assalto `sequence` a decorrer, como o faria o `start` do árbitro da outra pista. */
  const alsoInProgress = (sequence: number) => {
    fakeState.bouts = fakeState.bouts.map((bout) =>
      bout.sequence === sequence ? { ...bout, status: 'in_progress' as const } : bout,
    );
  };

  it('o cartão do topo é o meu assalto, e não o primeiro a decorrer da lista', async () => {
    resetApp();
    connectPoule();

    // O 4 é do árbitro do lado (fixture); este dispositivo começou o 5.
    alsoInProgress(5);
    useRefereeingStore.setState({
      started: { [fixturePoule.uuid]: { bout_id: 'b_01J8X005', at: new Date().toISOString() } },
    });

    const router = renderRouter('./app', { initialUrl: '/poule' });
    await router;
    await screen.findByText('Poule 3 — Sabre Masculino');

    // O botão do cartão é a prova: leva ao assalto deste dispositivo, não ao do árbitro do lado.
    await fireEvent.press(await screen.findByText('Resume'));
    expect(router.getPathname()).toBe('/bout/b_01J8X005');
  });

  it('acabado o meu, o cartão não agarra o assalto que continua noutra pista', async () => {
    resetApp();
    connectPoule();

    // Este dispositivo arbitrou o 1 e acabou-o; o 4 continua a decorrer, na outra pista.
    useRefereeingStore.setState({
      started: { [fixturePoule.uuid]: { bout_id: 'b_01J8X001', at: new Date().toISOString() } },
    });

    await renderRouter('./app', { initialUrl: '/poule' });
    await screen.findByText('Poule 3 — Sabre Masculino');

    // "Começar" sobre o primeiro por disputar — e não "Retomar" sobre o assalto de outro.
    expect(await screen.findAllByText('Start')).toHaveLength(2);
    expect(screen.queryByText('Resume')).toBeNull();
    // O do outro continua a dizer o que é: é a informação que interessa a quem está na outra pista.
    expect(screen.getByText('In progress')).toBeTruthy();
  });
});

describe('poule isolada', () => {
  it('não destaca "o próximo": com `ordered: false` a ordem não tem valor regulamentar', async () => {
    resetApp();
    connectPoule({ ordered: false });

    await renderRouter('./app', { initialUrl: '/poule' });
    await screen.findByText('Poule 3 — Sabre Masculino');
    await screen.findByText('Bouts');

    // Numa poule isolada o plantel muda a meio e a ordem é regerada, por isso não há cartão de
    // assalto atual nem "a seguir" — qualquer `pending` serve (contrato §7).
    expect(screen.queryByText('Current bout')).toBeNull();
    expect(screen.queryByText('Resume')).toBeNull();
  });
});

describe('folha de poule sem assaltos', () => {
  it('mostra a caixa de estado vazio em vez de uma grelha vazia', async () => {
    resetApp();
    connectPoule();
    fakeState.bouts = [];
    fakeState.standings = [];

    await renderRouter('./app', { initialUrl: '/poule' });
    await screen.findByText('Poule 3 — Sabre Masculino');
    await fireEvent.press(await screen.findByText('Grid'));

    // Dois blocos, a mesma caixa tracejada em cada um.
    expect(await screen.findAllByText('The poule needs at least two fencers.')).toHaveLength(2);
  });
});
