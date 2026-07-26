/**
 * Os dígitos do marcador, desenhados como no aparelho: **sete segmentos, e cada segmento é uma fila
 * de pontos**.
 *
 * Não é uma matriz de pontos livre. Nos marcadores da FIE — o Favero que serve de referência — cada
 * traço do algarismo é uma corrente de LEDs, e é dessa corrente que vem o ar electrónico. Uma
 * matriz 5×7 daria letras de consola; sete segmentos dão um mostrador.
 *
 * A grelha é de 5 colunas por 7 linhas, com os segmentos a partilhar os cantos: o `1` fica com a
 * coluna direita inteira (as sete linhas) e não com dois troços separados, que é o que se vê num
 * mostrador a sério.
 *
 * Só existe o que o cronómetro escreve — `0`–`9`, `:` e `,`. Ver `formatClock`.
 */

/** Altura da grelha, em pontos. Igual para dígitos e separadores. */
export const GLYPH_ROWS = 7;
/** Largura de um algarismo, em pontos. */
export const DIGIT_COLUMNS = 5;
/** Largura de `:` e `,`: uma coluna só. */
export const SEPARATOR_COLUMNS = 1;
/** Espaço entre caracteres, na mesma unidade das colunas. */
export const CHAR_GAP_COLUMNS = 1;

export interface Dot {
  row: number;
  column: number;
}

export interface Glyph {
  /** Quantas colunas da grelha este caractere ocupa. */
  columns: number;
  /** Só os pontos **acesos**. Os apagados não se desenham — no painel preto não se veem. */
  dots: Dot[];
}

const rowDots = (row: number): Dot[] =>
  Array.from({ length: DIGIT_COLUMNS }, (_, column) => ({ row, column }));

const columnDots = (column: number, from: number, to: number): Dot[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ row: from + index, column }));

/**
 * Os sete segmentos pela nomenclatura habitual:
 * ```
 *  aaa
 * f   b
 *  ggg
 * e   c
 *  ddd
 * ```
 * Cada um **inclui os seus extremos** — é a sobreposição nos cantos que fecha o contorno do `0` e
 * dá ao `1` uma coluna contínua.
 */
const SEGMENTS = {
  a: rowDots(0),
  b: columnDots(DIGIT_COLUMNS - 1, 0, 3),
  c: columnDots(DIGIT_COLUMNS - 1, 3, GLYPH_ROWS - 1),
  d: rowDots(GLYPH_ROWS - 1),
  e: columnDots(0, 3, GLYPH_ROWS - 1),
  f: columnDots(0, 0, 3),
  g: rowDots(3),
} as const;

type Segment = keyof typeof SEGMENTS;

const DIGITS: Record<string, Segment[]> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'g', 'e', 'd'],
  '3': ['a', 'b', 'g', 'c', 'd'],
  '4': ['f', 'g', 'b', 'c'],
  '5': ['a', 'f', 'g', 'c', 'd'],
  '6': ['a', 'f', 'g', 'e', 'c', 'd'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
};

/**
 * A vírgula dos décimos é **um ponto em baixo**, não uma vírgula desenhada: num mostrador de
 * segmentos a casa decimal é sempre um ponto, e a 5 pontos de largura não há forma de desenhar a
 * cauda sem ela parecer sujidade. O valor com vírgula continua inteiro no rótulo de acessibilidade.
 */
const SEPARATORS: Record<string, Dot[]> = {
  ':': [
    { row: 2, column: 0 },
    { row: 4, column: 0 },
  ],
  ',': [{ row: GLYPH_ROWS - 1, column: 0 }],
};

function dedupe(dots: Dot[]): Dot[] {
  const seen = new Map<number, Dot>();
  for (const dot of dots) seen.set(dot.row * DIGIT_COLUMNS + dot.column, dot);
  return [...seen.values()];
}

/** Um caractere desconhecido dá um algarismo apagado — ocupa o lugar e não desenha nada. */
export function glyphFor(char: string): Glyph {
  const segments = DIGITS[char];
  if (segments) {
    return {
      columns: DIGIT_COLUMNS,
      dots: dedupe(segments.flatMap((name) => [...SEGMENTS[name]])),
    };
  }

  const dots = SEPARATORS[char];
  if (dots) return { columns: SEPARATOR_COLUMNS, dots };

  return { columns: DIGIT_COLUMNS, dots: [] };
}

/** Largura de uma linha inteira, em colunas da grelha, espaços entre caracteres incluídos. */
export function columnsFor(value: string): number {
  return [...value].reduce(
    (total, char, index) => total + glyphFor(char).columns + (index > 0 ? CHAR_GAP_COLUMNS : 0),
    0,
  );
}
