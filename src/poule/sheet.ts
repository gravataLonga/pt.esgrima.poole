/**
 * Folha de poule — classificação e matriz, derivadas da lista de assaltos.
 *
 * `docs/poole-grelha-spec.md` descreve um cliente que **não calcula nada**, alimentado por
 * `GET /poole/{uuid}/match`. Esse endpoint não existe no contrato desta app: o `API-CONTRACT.md` §1
 * exclui classificações do seu âmbito e o que a app recebe é `GET /poules/{uuid}/bouts`. A matriz e
 * a classificação são portanto derivadas aqui, dos mesmos assaltos que a lista já mostra — ver
 * ADR-011.
 *
 * Regras de classificação (FIE, `docs/poole-grelha-spec.md` §2): **V/M → indicador (TD−TR) → TD**,
 * todas descendentes. Empates completos partilham lugar (1, 2, 2, 4).
 */

import type { Bout, Fencer } from '@/api/types';

/** Uma célula da matriz, na perspetiva do atleta **da linha**. */
export type SheetCell =
  /** Diagonal: o atleta contra si próprio. */
  | { kind: 'self' }
  /** Assalto por disputar — célula vazia, nunca `0` (spec §9). */
  | { kind: 'empty' }
  | { kind: 'score'; given: number; received: number };

export interface Standing {
  fencer: Fencer;
  /** V — vitórias. */
  victories: number;
  /** TS/TD — toques dados. */
  given: number;
  /** TR — toques recebidos. */
  received: number;
  /** Indicador, `given - received`. */
  diff: number;
  /** Lugar, 1..n. Empates completos partilham o lugar e saltam o seguinte. */
  place: number;
  /** M — assaltos já disputados. */
  done: number;
  /** Assaltos em falta, `n - 1 - done`. */
  missing: number;
}

export interface PouleSheet {
  /** Atletas por número de poule — é a ordem das linhas e das colunas da matriz. */
  fencers: Fencer[];
  /** `cells[linha][coluna]`, indexado pela posição em `fencers`. */
  cells: SheetCell[][];
  /** Classificação, já ordenada por lugar. */
  standings: Standing[];
}

/** Atletas presentes nos assaltos, sem repetições, por `number` ascendente. */
export function fencersFromBouts(bouts: Bout[]): Fencer[] {
  const byId = new Map<number, Fencer>();

  for (const bout of bouts) {
    byId.set(bout.fencer_a.id, bout.fencer_a);
    byId.set(bout.fencer_b.id, bout.fencer_b);
  }

  return [...byId.values()].sort((a, b) => a.number - b.number);
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

  const totals = fencers.map(() => ({ victories: 0, given: 0, received: 0, done: 0 }));

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

    const totalA = totals[a]!;
    const totalB = totals[b]!;

    totalA.given += scoreA;
    totalA.received += scoreB;
    totalA.done += 1;
    totalB.given += scoreB;
    totalB.received += scoreA;
    totalB.done += 1;

    // Não há empates em poule (contrato §7); um `score_a === score_b` inválido não dá vitória a
    // ninguém em vez de dar a ambos.
    if (scoreA > scoreB) totalA.victories += 1;
    else if (scoreB > scoreA) totalB.victories += 1;
  }

  return { fencers, cells, standings: rank(fencers, totals) };
}

interface Totals {
  victories: number;
  given: number;
  received: number;
  done: number;
}

/** Índice V/M. Sem assaltos disputados vale 0 — assim quem ainda não jogou não lidera a poule. */
function ratio(totals: Totals): number {
  return totals.done === 0 ? 0 : totals.victories / totals.done;
}

function rank(fencers: Fencer[], totals: Totals[]): Standing[] {
  const rows = fencers.map((fencer, index) => {
    const total = totals[index]!;
    return {
      fencer,
      victories: total.victories,
      given: total.given,
      received: total.received,
      diff: total.given - total.received,
      done: total.done,
      missing: fencers.length - 1 - total.done,
      ratio: ratio(total),
    };
  });

  const sorted = [...rows].sort(
    (a, b) =>
      b.ratio - a.ratio ||
      b.diff - a.diff ||
      b.given - a.given ||
      a.fencer.number - b.fencer.number,
  );

  const tied = (a: (typeof sorted)[number], b: (typeof sorted)[number]) =>
    a.ratio === b.ratio && a.diff === b.diff && a.given === b.given;

  let place = 0;
  return sorted.map(({ ratio: _, ...standing }, index) => {
    const previous = sorted[index - 1];
    // Empate completo partilha o lugar; a seguir salta-se para o índice real (1, 2, 2, 4).
    place = previous && tied(sorted[index]!, previous) ? place : index + 1;

    return { ...standing, place };
  });
}
