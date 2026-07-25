import type { PouleSummary, TournamentSummary } from '@/api/types';
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
    tournament: null,
  });

const withTournament = (overrides: Partial<TournamentSummary>) =>
  nothingLeftToDo({
    phase: 'bracket',
    poule: null,
    tournament: {
      uuid: 't',
      name: 'Torneio',
      matches_total: 4,
      matches_done: 0,
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

  it('não aparece enquanto o quadro da poule tiver combates por arbitrar', () => {
    expect(withPoule({ bouts_done: 15, elimination: { matches_total: 3, matches_done: 1 } })).toBe(
      false,
    );
  });

  it('aparece quando a poule e o quadro dela estão os dois feitos', () => {
    expect(withPoule({ bouts_done: 15, elimination: { matches_total: 3, matches_done: 3 } })).toBe(
      true,
    );
  });

  it('uma poule fechada com assaltos por disputar já não é trabalho do árbitro', () => {
    // O quadro foi gerado com a poule a meio: o que falta devolve `422 poule_locked` (contrato §7).
    expect(withPoule({ bouts_done: 12, locked: true })).toBe(true);
  });

  it('a poule fechada sem quadro é só leitura, e não há mais nada a fazer', () => {
    expect(withPoule({ bouts_done: 15 }, 'read_only')).toBe(true);
  });

  it('não aparece antes de a lista chegar', () => {
    // `0/0` é uma poule a carregar, não uma poule acabada.
    expect(withPoule({ bouts_done: 0, bouts_total: 0 })).toBe(false);
    expect(nothingLeftToDo({ phase: 'poule', poule: null, tournament: null })).toBe(false);
  });

  it('num torneio conta o quadro, e um quadro por gerar não conta', () => {
    expect(withTournament({ matches_done: 2 })).toBe(false);
    expect(withTournament({ matches_done: 4 })).toBe(true);
    expect(withTournament({ matches_total: 0, matches_done: 0 })).toBe(false);
  });

  it('não aparece sem sessão nem no ecrã de resumo', () => {
    expect(withPoule({ bouts_done: 15 }, 'disconnected')).toBe(false);
    expect(withPoule({ bouts_done: 15 }, 'complete')).toBe(false);
  });
});
