import { sheetName, splitName } from './name';

describe('nome do atleta no marcador', () => {
  it('escreve o apelido primeiro e o nome próprio por baixo', () => {
    expect(splitName('Ana Silva')).toEqual({ family: 'Silva', given: 'Ana' });
  });

  it('num nome composto fica com as duas pontas', () => {
    expect(splitName('Álvaro Branco da Silva')).toEqual({ family: 'Silva', given: 'Álvaro' });
  });

  it('um nome de uma palavra só não inventa segunda linha', () => {
    expect(splitName('Ronaldinho')).toEqual({ family: 'Ronaldinho', given: '' });
  });

  it('aguenta espaços a mais, que é como os nomes chegam de um CSV', () => {
    expect(splitName('  Ana   Maria  Silva  ')).toEqual({ family: 'Silva', given: 'Ana' });
  });

  it('um nome vazio não dá linha nenhuma', () => {
    expect(splitName('')).toEqual({ family: '', given: '' });
  });
});

describe('nome do atleta na folha de poule', () => {
  it('escreve-se numa linha só, com vírgula', () => {
    expect(sheetName('Álvaro Branco da Silva')).toBe('Silva, Álvaro');
  });

  it('sem nome próprio não sobra vírgula pendurada', () => {
    expect(sheetName('Ronaldinho')).toBe('Ronaldinho');
    expect(sheetName('')).toBe('');
  });
});
