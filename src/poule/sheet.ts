/**
 * Matriz da folha de poule, derivada da lista de assaltos.
 *
 * **A classificação já não se calcula aqui.** O contrato `1.2.0` acrescentou
 * `GET /poules/{uuid}/standings` e diz-lhe o essencial: *"O servidor é que ordena. (…) O cliente
 * mostra `place` tal como vem e não reordena."* Manter uma segunda implementação dos critérios de
 * desempate FIE deste lado era ter duas respostas para a mesma pergunta — e a que o árbitro vê na
 * web ganharia sempre.
 *
 * A **matriz** continua aqui porque o contrato §7 diz explicitamente que ela não é servida: cada
 * célula é o resultado de um assalto, e esses já vêm em `GET /poules/{uuid}/bouts`. Não é cálculo
 * de classificação — é a mesma lista noutra disposição.
 */

import type { Bout, Fencer } from '@/api/types';

/** Uma célula da matriz, na perspetiva do atleta **da linha**. */
export type SheetCell =
  /** Diagonal: o atleta contra si próprio. */
  | { kind: 'self' }
  /** Assalto por disputar — célula vazia, nunca `0` (spec §9). */
  | { kind: 'empty' }
  | { kind: 'score'; given: number; received: number };

export interface PouleSheet {
  /** Atletas por número de poule — é a ordem das linhas e das colunas da matriz. */
  fencers: Fencer[];
  /** `cells[linha][coluna]`, indexado pela posição em `fencers`. */
  cells: SheetCell[][];
}

/** Atletas presentes nos assaltos, sem repetições, por `number` ascendente. */
export function fencersFromBouts(bouts: Bout[]): Fencer[] {
  const byId = new Map<number, Fencer>();

  for (const bout of bouts) {
    byId.set(bout.fencer_a.id, bout.fencer_a);
    byId.set(bout.fencer_b.id, bout.fencer_b);
  }

  // O `number` é sempre inteiro numa poule; só na eliminatória é que vem `null` (contrato §7), e
  // esses atletas nunca chegam aqui. O `?? 0` é para o verificador de tipos, não para o caso real.
  return [...byId.values()].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
}

/** Um assalto conta para a folha quando tem os dois resultados — `status` sozinho não chega. */
function isScored(bout: Bout): bout is Bout & { score_a: number; score_b: number } {
  return bout.status === 'done' && bout.score_a !== null && bout.score_b !== null;
}

export function buildSheet(bouts: Bout[]): PouleSheet {
  const fencers = fencersFromBouts(bouts);
  const indexOf = new Map(fencers.map((fencer, index) => [fencer.id, index]));

  const cells: SheetCell[][] = fencers.map((_, row) =>
    fencers.map((__, column) => (row === column ? { kind: 'self' } : { kind: 'empty' })),
  );

  for (const bout of bouts) {
    if (!isScored(bout)) continue;

    const a = indexOf.get(bout.fencer_a.id);
    const b = indexOf.get(bout.fencer_b.id);
    // Um atleta removido da poule deixa assaltos órfãos (contrato §8, `not_found`). Ignorá-los é
    // preferível a rebentar a folha inteira.
    if (a === undefined || b === undefined || a === b) continue;

    const { score_a: scoreA, score_b: scoreB } = bout;

    // Espelhado: cada célula mostra sempre os toques **dados** pelo atleta da linha.
    cells[a]![b] = { kind: 'score', given: scoreA, received: scoreB };
    cells[b]![a] = { kind: 'score', given: scoreB, received: scoreA };
  }

  return { fencers, cells };
}
