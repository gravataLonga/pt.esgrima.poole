/**
 * O nome do atleta como um marcador o escreve: **apelido primeiro**, nome próprio por baixo.
 *
 * A API manda uma linha só — `name`, e nada que diga onde acaba o nome próprio e começa o apelido
 * (contrato §7). A app parte-a pelos espaços e fica com as duas pontas: a última palavra é o
 * apelido, a primeira é o nome próprio. É a convenção da FIE nas folhas e nos marcadores, e é o que
 * o árbitro chama em voz alta.
 *
 * O meio perde-se de propósito. "Álvaro Branco da Silva" dá `Silva` / `Álvaro`, e não
 * "Branco da Silva": numa coluna com metade da largura do telemóvel, um apelido composto ou entra
 * em corpo pequeno de mais para se ler de relance, ou é cortado a meio — e cortado a meio identifica
 * pior do que a última palavra sozinha. O nome inteiro continua a viajar nos rótulos de
 * acessibilidade e na folha de poule, que é onde ele serve para identificar.
 */
export interface SplitName {
  /** Última palavra do nome. Vazia só se o nome vier vazio. */
  family: string;
  /** Primeira palavra. Vazia num nome de uma palavra só — aí não há segunda linha para escrever. */
  given: string;
}

export function splitName(name: string): SplitName {
  const parts = name.split(' ').filter((part) => part.length > 0);

  if (parts.length === 0) return { family: '', given: '' };
  // Uma palavra só é o apelido, e não sobra nada para a linha de baixo.
  if (parts.length === 1) return { family: parts[0] ?? '', given: '' };

  return { family: parts[parts.length - 1] ?? '', given: parts[0] ?? '' };
}

/**
 * O mesmo nome numa linha só — `Lima, Álvaro` —, para as tabelas da folha de poule.
 *
 * No marcador as duas partes empilham-se, porque ali há altura e o apelido é para se ler de longe.
 * Numa linha de tabela não há: o nome inteiro saía truncado a meio ("Álvaro Branco…", que não
 * identifica ninguém numa poule com dois Álvaros) e a vírgula é a convenção da própria folha.
 */
export function sheetName(name: string): string {
  const { family, given } = splitName(name);
  return given ? `${family}, ${given}` : family;
}
