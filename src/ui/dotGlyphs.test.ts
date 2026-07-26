import { DIGIT_COLUMNS, GLYPH_ROWS, columnsFor, glyphFor } from './dotGlyphs';

/** Desenha o glifo como texto, para as asserções se lerem como o que se vê no ecrã. */
function render(char: string): string {
  const { columns, dots } = glyphFor(char);
  const lit = new Set(dots.map((dot) => `${dot.row}:${dot.column}`));

  return Array.from({ length: GLYPH_ROWS }, (_, row) =>
    Array.from({ length: columns }, (_, column) => (lit.has(`${row}:${column}`) ? '#' : '.')).join(
      '',
    ),
  ).join('\n');
}

describe('glyphFor', () => {
  it('fecha o contorno do zero e deixa o meio vazio', () => {
    expect(render('0')).toBe(
      ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####'].join('\n'),
    );
  });

  it('dá ao um a coluna direita inteira — sem buracos nos cantos', () => {
    expect(render('1')).toBe(
      ['....#', '....#', '....#', '....#', '....#', '....#', '....#'].join('\n'),
    );
  });

  it('acende os sete segmentos no oito', () => {
    expect(render('8')).toBe(
      ['#####', '#...#', '#...#', '#####', '#...#', '#...#', '#####'].join('\n'),
    );
  });

  it('desenha o três com o lado direito e as três barras', () => {
    expect(render('3')).toBe(
      ['#####', '....#', '....#', '#####', '....#', '....#', '#####'].join('\n'),
    );
  });

  it('não repete pontos onde os segmentos se tocam', () => {
    const dots = glyphFor('8').dots;
    const keys = new Set(dots.map((dot) => `${dot.row}:${dot.column}`));

    expect(keys.size).toBe(dots.length);
  });

  it('dá aos separadores uma coluna só', () => {
    expect(glyphFor(':').columns).toBe(1);
    expect(glyphFor(':').dots).toHaveLength(2);
    // A vírgula dos décimos é o ponto decimal do mostrador: um ponto, em baixo.
    expect(glyphFor(',').dots).toEqual([{ row: GLYPH_ROWS - 1, column: 0 }]);
  });

  it('trata um caractere desconhecido como algarismo apagado', () => {
    expect(glyphFor('X')).toEqual({ columns: DIGIT_COLUMNS, dots: [] });
  });
});

describe('columnsFor', () => {
  it('conta os caracteres e os espaços entre eles', () => {
    // 4 algarismos (5 colunas cada), 1 separador (1) e 4 espaços de 1.
    expect(columnsFor('03:00')).toBe(25);
    // Com décimos há mais um separador e mais um espaço.
    expect(columnsFor('0:09,9')).toBe(27);
  });

  it('é zero para uma linha vazia', () => {
    expect(columnsFor('')).toBe(0);
  });
});
