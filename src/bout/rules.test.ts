import {
  PRIORITY_DRAW_STEPS,
  boutRules,
  canSubmit,
  cardCount,
  drawPrioritySide,
  initialBoutRules,
  needsDecidingTouch,
  priorityDrawFrames,
  winner,
  type BoutAction,
  type BoutRulesState,
} from './rules';

const run = (state: BoutRulesState, ...actions: BoutAction[]): BoutRulesState =>
  actions.reduce(boutRules, state);

const start = (a = 0, b = 0) => initialBoutRules(5, a, b);

describe('toques', () => {
  it('sobe e desce', () => {
    const state = run(start(), { type: 'touch', side: 'a', delta: 1 });
    expect(state.a).toBe(1);
    expect(boutRules(state, { type: 'touch', side: 'a', delta: -1 }).a).toBe(0);
  });

  it('não passa do limite nem desce abaixo de zero', () => {
    expect(run(start(5), { type: 'touch', side: 'a', delta: 1 }).a).toBe(5);
    expect(run(start(0), { type: 'touch', side: 'a', delta: -1 }).a).toBe(0);
  });

  it('usa o limite que vem da API, não um valor fixo', () => {
    const toFifteen = run(initialBoutRules(15, 5), { type: 'touch', side: 'a', delta: 1 });
    expect(toFifteen.a).toBe(6);
  });
});

describe('cartões', () => {
  it('o amarelo regista-se sem mexer no resultado', () => {
    const state = run(start(2, 1), { type: 'card', side: 'a', kind: 'yellow' });

    expect(state).toMatchObject({ a: 2, b: 1 });
    expect(cardCount(state, 'a', 'yellow')).toBe(1);
  });

  it('o vermelho dá um toque ao adversário', () => {
    const state = run(start(2, 1), { type: 'card', side: 'a', kind: 'red' });
    expect(state).toMatchObject({ a: 2, b: 2 });
  });

  it('o preto regista-se sem pontuar — a exclusão é decidida na plataforma', () => {
    const state = run(start(2, 1), { type: 'card', side: 'a', kind: 'black' });

    expect(state).toMatchObject({ a: 2, b: 1 });
    expect(cardCount(state, 'a', 'black')).toBe(1);
  });

  it('o vermelho não passa o adversário do limite de toques', () => {
    const state = run(start(0, 5), { type: 'card', side: 'a', kind: 'red' });
    expect(state.b).toBe(5);
  });

  it('acumula cartões do mesmo tipo', () => {
    const state = run(
      start(),
      { type: 'card', side: 'a', kind: 'yellow' },
      { type: 'card', side: 'a', kind: 'yellow' },
      { type: 'card', side: 'b', kind: 'yellow' },
    );

    expect(cardCount(state, 'a', 'yellow')).toBe(2);
    expect(cardCount(state, 'b', 'yellow')).toBe(1);
  });
});

describe('anular cartão', () => {
  it('remove o último e devolve o toque que ele deu', () => {
    const state = run(
      start(2, 1),
      { type: 'card', side: 'a', kind: 'yellow' },
      { type: 'card', side: 'a', kind: 'red' },
      { type: 'undoCard' },
    );

    expect(state).toMatchObject({ a: 2, b: 1 });
    expect(state.cards).toHaveLength(1);
    expect(cardCount(state, 'a', 'yellow')).toBe(1);
  });

  it('não devolve um toque que o cartão nunca chegou a dar', () => {
    // Vermelho com o adversário já nos 5: não pontuou, logo anular não pode tirar nada.
    const state = run(start(0, 5), { type: 'card', side: 'a', kind: 'red' }, { type: 'undoCard' });

    expect(state.b).toBe(5);
    expect(state.cards).toHaveLength(0);
  });

  it('é inerte sem cartões', () => {
    const state = start(3, 2);
    expect(boutRules(state, { type: 'undoCard' })).toBe(state);
  });

  it('com lado e tipo, anula aquele cartão e não o último do assalto', () => {
    const state = run(
      start(),
      { type: 'card', side: 'a', kind: 'red' }, // dá um toque ao b
      { type: 'card', side: 'b', kind: 'yellow' },
      { type: 'undoCard', side: 'a', kind: 'red' },
    );

    // O amarelo do b ficou; o toque que o vermelho tinha dado voltou atrás.
    expect(state.b).toBe(0);
    expect(cardCount(state, 'b', 'yellow')).toBe(1);
    expect(cardCount(state, 'a', 'red')).toBe(0);
  });

  it('anula o mais recente daquele tipo quando há vários', () => {
    const state = run(
      start(),
      { type: 'card', side: 'a', kind: 'yellow' },
      { type: 'card', side: 'a', kind: 'yellow' },
      { type: 'undoCard', side: 'a', kind: 'yellow' },
    );

    expect(cardCount(state, 'a', 'yellow')).toBe(1);
  });

  it('é inerte quando aquele atleta não tem cartão daquele tipo', () => {
    const state = run(start(), { type: 'card', side: 'a', kind: 'yellow' });
    expect(boutRules(state, { type: 'undoCard', side: 'b', kind: 'yellow' })).toBe(state);
  });

  it('não deixa o placar negativo quando o toque do vermelho já tinha sido retirado à mão', () => {
    const state = run(
      start(),
      { type: 'card', side: 'a', kind: 'red' }, // b passa a 1
      { type: 'touch', side: 'b', delta: -1 }, // e o árbitro tira-o
      { type: 'undoCard' },
    );

    expect(state.b).toBe(0);
  });
});

describe('prioridade', () => {
  it('o sorteio é 50/50 e determinístico para um valor dado', () => {
    expect(drawPrioritySide(0)).toBe('a');
    expect(drawPrioritySide(0.49)).toBe('a');
    expect(drawPrioritySide(0.5)).toBe('b');
    expect(drawPrioritySide(0.99)).toBe('b');
  });

  describe('piscadela do sorteio', () => {
    it('alterna entre os dois lados', () => {
      const sides = priorityDrawFrames('a', [10, 10, 10, 10]).map((f) => f.side);
      expect(sides).toEqual(['b', 'a', 'b', 'a']);
    });

    it('acaba sempre no lado sorteado, seja qual for o número de passos', () => {
      for (const count of [1, 2, 3, 4, 5, 10]) {
        const steps = Array.from({ length: count }, () => 10);
        expect(priorityDrawFrames('b', steps).at(-1)?.side).toBe('b');
        expect(priorityDrawFrames('a', steps).at(-1)?.side).toBe('a');
      }
    });

    it('acumula os instantes e trava no fim', () => {
      const frames = priorityDrawFrames('a', [70, 90, 140]);

      expect(frames.map((f) => f.at)).toEqual([70, 160, 300]);
      // Intervalos a crescer: é a travagem que faz aquilo parecer um sorteio.
      expect(PRIORITY_DRAW_STEPS.at(-1)!).toBeGreaterThan(PRIORITY_DRAW_STEPS[0]!);
    });
  });

  it('decide o vencedor quando os toques estão iguais', () => {
    const tied = start(3, 3);
    expect(winner(tied)).toBeNull();
    expect(winner(run(tied, { type: 'drawPriority', side: 'b' }))).toBe('b');
  });

  it('não altera o vencedor quando alguém está à frente', () => {
    const decided = run(start(4, 3), { type: 'drawPriority', side: 'b' });
    expect(winner(decided)).toBe('a');
  });

  it('o primeiro toque na morte súbita resolve o assalto', () => {
    const state = run(
      start(3, 3),
      { type: 'drawPriority', side: 'b' },
      { type: 'touch', side: 'a', delta: 1 },
    );

    expect(winner(state)).toBe('a');
    expect(canSubmit(state)).toBe(true);
    expect(needsDecidingTouch(state)).toBe(false);
  });
});

describe('submissão', () => {
  it('está bloqueada enquanto o resultado for um empate', () => {
    expect(canSubmit(start(3, 3))).toBe(false);
    expect(canSubmit(start(4, 3))).toBe(true);
  });

  it('continua bloqueada com prioridade sorteada e toques iguais', () => {
    // A plataforma recusa `a === b` mesmo havendo vencedor — o ecrã tem de pedir o toque decisivo.
    const state = run(start(3, 3), { type: 'drawPriority', side: 'a' });

    expect(winner(state)).toBe('a');
    expect(canSubmit(state)).toBe(false);
    expect(needsDecidingTouch(state)).toBe(true);
  });

  it('o toque decisivo desbloqueia a submissão', () => {
    const state = run(
      start(3, 3),
      { type: 'drawPriority', side: 'a' },
      { type: 'touch', side: 'a', delta: 1 },
    );

    expect(canSubmit(state)).toBe(true);
    expect(needsDecidingTouch(state)).toBe(false);
  });
});

describe('assalto novo', () => {
  it('limpa toques, cartões e prioridade, e mantém os presets', () => {
    const state = run(
      start(),
      { type: 'touch', side: 'a', delta: 1 },
      { type: 'card', side: 'b', kind: 'red' },
      { type: 'drawPriority', side: 'a' },
      { type: 'reset' },
    );

    expect(state).toEqual(initialBoutRules(5));
  });

  it('não deixa o "anular" alcançar cartões do assalto anterior', () => {
    // Sem isto, um vermelho dado antes do reset devolveria um toque que já não existe.
    const state = run(
      start(),
      { type: 'card', side: 'a', kind: 'red' },
      { type: 'reset' },
      { type: 'undoCard' },
    );

    expect(state.b).toBe(0);
    expect(state.cards).toHaveLength(0);
  });
});
