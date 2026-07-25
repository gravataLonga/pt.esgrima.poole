/**
 * "Já não há nada para fazer aqui" — a condição que faz aparecer o botão de concluir.
 *
 * O `401 poule_complete` do contrato §6 só chega quando a competição está encerrada **para
 * sempre**: assaltos feitos *e* quadro decidido, e é o servidor que o decide. Entre acabar a poule e
 * isso acontecer há um intervalo que pode durar o resto da prova — o organizador ainda não gerou o
 * quadro, ou gerou-o e é outra pessoa a arbitrá-lo — e nesse intervalo o árbitro ficava a olhar
 * para uma lista toda pontuada sem forma de sair dela.
 *
 * Isto é a leitura da app sobre o que **esta sessão** ainda pode arbitrar. Não é o fim da
 * competição, e por isso não revoga nada: o PIN é de utilização múltipla e voltar custa seis
 * dígitos.
 */

import type { PouleSummary, TournamentSummary } from '@/api/types';

import type { SessionPhase } from './store';

export interface CompetitionState {
  phase: SessionPhase;
  poule: PouleSummary | null;
  tournament: TournamentSummary | null;
}

export function nothingLeftToDo({ phase, poule, tournament }: CompetitionState): boolean {
  // Sem sessão não há o que concluir, e `complete` já lá está.
  if (phase === 'disconnected' || phase === 'complete') return false;

  // A poule fechou e não há quadro para arbitrar: a escrita está toda fechada (spec §6).
  if (phase === 'read_only') return true;

  if (tournament) {
    return tournament.matches_total > 0 && tournament.matches_done >= tournament.matches_total;
  }

  if (!poule) return false;

  // Uma poule fechada já não aceita resultados, mesmo com assaltos por disputar — o que falta
  // deixou de ser trabalho do árbitro no momento em que o quadro foi gerado (contrato §7).
  const boutsLeft = !poule.locked && poule.bouts_done < poule.bouts_total;

  const bracket = poule.elimination;
  const bracketLeft = bracket ? bracket.matches_done < bracket.matches_total : false;

  // `bouts_total` a zero é uma poule ainda a carregar, não uma poule acabada.
  return poule.bouts_total > 0 && !boutsLeft && !bracketLeft;
}
