import type { MatchDetail, PouleSummary } from '@/api/types';
import { poule as fixturePoule } from '@/fixtures/poule';

import { nothingLeftToDo, type CompetitionState } from './completion';

/**
 * O botão de concluir aparece por esta função e mais nada. Errar para o lado do "aparece" tira o
 * árbitro de uma competição a meio; errar para o outro deixa-o preso numa lista toda pontuada, que
 * é o defeito que isto veio corrigir.
 */
const withPoule = (overrides: Partial<PouleSummary>, phase: CompetitionState['phase'] = 'poule') =>
  nothingLeftToDo({
    phase,
    poule: { ...fixturePoule, bouts_done: 0, bouts_total: 15, ...overrides },
    match: null,
  });

const withMatch = (overrides: Partial<MatchDetail> = {}) =>
  nothingLeftToDo({
    phase: 'match',
    poule: null,
    match: {
      id: 'm_1',
      competition_name: 'Torneio',
      bracket: 4,
      round: 2,
      position: 1,
      status: 'pending',
      ready: true,
      fencer_a: null,
      fencer_b: null,
      score_a: null,
      score_b: null,
      scored_at: null,
      scored_by_me: false,
      target: 15,
      duration_seconds: 180,
      periods: 3,
      allow_draw: false,
      locked: false,
      ...overrides,
    },
  });

describe('nothingLeftToDo', () => {
  it('não aparece com a poule a meio', () => {
    expect(withPoule({ bouts_done: 7 })).toBe(false);
  });

  it('aparece com todos os assaltos registados e sem quadro', () => {
    expect(withPoule({ bouts_done: 15 })).toBe(true);
  });

  it('o quadro para onde os atletas foram não conta — esta sessão não o arbitra', () => {
    // Até à `1.5.0` isto dava `false`: o quadro da poule era arbitrável com o mesmo código, e
    // sobrava trabalho. Na `2.0.0` o `elimination` é informativo e cada combate tem código
    // próprio — quem acabou o cartão acabou o que tinha para fazer (contrato §7).
    expect(withPoule({ bouts_done: 15, elimination: { matches_total: 3, matches_done: 1 } })).toBe(
      true,
    );
  });

  it('uma poule fechada com assaltos por disputar já não é trabalho do árbitro', () => {
    // O quadro foi gerado com a poule a meio: o que falta devolve `422 poule_locked` (contrato §7).
    expect(withPoule({ bouts_done: 12, locked: true }, 'read_only')).toBe(true);
  });

  it('a poule fechada sem quadro é só leitura, e não há mais nada a fazer', () => {
    expect(withPoule({ bouts_done: 15 }, 'read_only')).toBe(true);
  });

  it('não aparece antes de a lista chegar', () => {
    // `0/0` é uma poule a carregar, não uma poule acabada.
    expect(withPoule({ bouts_done: 0, bouts_total: 0 })).toBe(false);
    expect(nothingLeftToDo({ phase: 'poule', poule: null, match: null })).toBe(false);
  });

  it('num combate nunca aparece — registar o resultado é que encerra a pista', () => {
    // Antes de registar há sempre um combate por arbitrar: o próprio. Depois de registar, o
    // servidor invalida o token e o `401 poule_complete` leva ao resumo sozinho (contrato §7).
    expect(withMatch()).toBe(false);
    expect(withMatch({ status: 'done', score_a: 15, score_b: 11, locked: true })).toBe(false);
  });

  it('não aparece sem sessão nem no ecrã de resumo', () => {
    expect(withPoule({ bouts_done: 15 }, 'disconnected')).toBe(false);
    expect(withPoule({ bouts_done: 15 }, 'complete')).toBe(false);
  });
});
