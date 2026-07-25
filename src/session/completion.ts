/**
 * "Já não há nada para fazer aqui" — a condição que faz aparecer o botão de concluir.
 *
 * O `401 poule_complete` do contrato §6 só chega quando não há mais nada a fazer naquela pista, e é
 * o servidor que o decide. Numa poule isso pode demorar o resto da prova — o cartão fica disputado e
 * só o quadro a encerra —, e nesse intervalo o árbitro ficava a olhar para uma lista toda pontuada
 * sem forma de sair dela.
 *
 * Isto é a leitura da app sobre o que **esta sessão** ainda pode arbitrar. Não é o fim da
 * competição, e por isso não revoga nada: o PIN é de utilização múltipla e voltar custa seis
 * dígitos.
 */

import type { MatchDetail, PouleSummary } from '@/api/types';

import type { SessionPhase } from './store';

export interface CompetitionState {
  phase: SessionPhase;
  poule: PouleSummary | null;
  match: MatchDetail | null;
}

export function nothingLeftToDo({ phase, poule, match }: CompetitionState): boolean {
  // Sem sessão não há o que concluir, e `complete` já lá está.
  if (phase === 'disconnected' || phase === 'complete') return false;

  // A poule fechou: a escrita sobre os assaltos está toda travada, e o que se segue corre nos
  // códigos dos combates — que esta sessão não alcança (contrato §7).
  if (phase === 'read_only') return true;

  /*
   * **Num combate não há nada a concluir**, e é deliberado que este botão não apareça.
   *
   * Registar o resultado encerra a sessão do lado do servidor: o token é invalidado e o pedido
   * seguinte traz `401 poule_complete`, que leva ao resumo sozinho. Antes disso há sempre um
   * combate por arbitrar — o próprio —, e um botão de "concluir" ali seria uma forma de o árbitro
   * sair sem registar o resultado, que é a única coisa que esta sessão existe para fazer. Sair sem
   * registar continua a ser possível, mas pelo "Sair", que diz o que é.
   */
  if (match) return false;

  if (!poule) return false;

  // O quadro para onde os atletas foram não conta: é informativo e esta sessão não o arbitra.
  // `bouts_total` a zero é uma poule ainda a carregar, não uma poule acabada.
  return poule.bouts_total > 0 && poule.bouts_done >= poule.bouts_total;
}
