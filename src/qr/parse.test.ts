import { parseQr } from './parse';

/**
 * O contrato §9 é o que este teste cobre — os três fallbacks de leitura, mais a recusa de `http://`.
 * É a única parte da leitura de QR que se testa sem câmara, e por isso é aqui que se põe o peso.
 */
describe('parseQr', () => {
  const payload = { v: 1, base_url: 'https://poole.esgrima.pt', pin: '483920' };

  describe('fallback 1 — JSON v1', () => {
    it('lê o payload do contrato', () => {
      expect(parseQr(JSON.stringify(payload))).toEqual({
        kind: 'payload',
        payload: { v: 1, base_url: 'https://poole.esgrima.pt', pin: '483920' },
      });
    });

    it('tolera espaço à volta — alguns geradores acrescentam newline', () => {
      expect(parseQr(`\n  ${JSON.stringify(payload)}  \n`).kind).toBe('payload');
    });

    it('tira a barra final em vez de recusar o QR por causa dela', () => {
      const result = parseQr(JSON.stringify({ ...payload, base_url: 'https://poole.esgrima.pt/' }));
      expect(result).toEqual({
        kind: 'payload',
        payload: { ...payload, base_url: 'https://poole.esgrima.pt' },
      });
    });

    it('aceita porta e subdiretório — self-hosting não vive sempre na raiz', () => {
      const base = 'https://esgrima.exemplo.pt:8443/poole';
      const result = parseQr(JSON.stringify({ ...payload, base_url: base }));
      expect(result).toEqual({ kind: 'payload', payload: { ...payload, base_url: base } });
    });

    it('ignora campos que não conhece', () => {
      const result = parseQr(JSON.stringify({ ...payload, tournament: 'Nacional', extra: 1 }));
      expect(result).toEqual({ kind: 'payload', payload });
    });
  });

  describe('fallback 2 — só o PIN', () => {
    it('lê seis dígitos', () => {
      expect(parseQr('483920')).toEqual({ kind: 'pin', pin: '483920' });
    });

    it('aceita um PIN todo a zeros — é um PIN válido do contrato', () => {
      expect(parseQr('000000')).toEqual({ kind: 'pin', pin: '000000' });
    });

    it.each(['48392', '4839201', '48392a', '48 392'])('recusa %p', (raw) => {
      expect(parseQr(raw).kind).toBe('unrecognised');
    });
  });

  describe('fallback 3 — não reconhecido', () => {
    it.each([
      ['vazio', ''],
      ['texto solto', 'https://esgrima.pt'],
      ['JSON partido', '{"v":1,'],
      ['JSON que não é objeto', '"483920"'],
      ['null', 'null'],
      ['array', '[1,2,3]'],
      ['sem versão', JSON.stringify({ base_url: 'https://poole.esgrima.pt', pin: '483920' })],
      ['versão em string', JSON.stringify({ ...payload, v: '1' })],
      ['sem pin', JSON.stringify({ v: 1, base_url: 'https://poole.esgrima.pt' })],
      ['pin curto', JSON.stringify({ ...payload, pin: '4839' })],
      ['pin numérico', JSON.stringify({ ...payload, pin: 483920 })],
      ['sem base_url', JSON.stringify({ v: 1, pin: '483920' })],
      ['base_url sem esquema', JSON.stringify({ ...payload, base_url: 'poole.esgrima.pt' })],
      ['base_url com query', JSON.stringify({ ...payload, base_url: 'https://p.pt?a=1' })],
      ['esquema estranho', JSON.stringify({ ...payload, base_url: 'ftp://poole.esgrima.pt' })],
    ])('recusa %s', (_label, raw) => {
      expect(parseQr(raw).kind).toBe('unrecognised');
    });
  });

  describe('versão desconhecida', () => {
    it('distingue-a de "não reconhecido" — a mensagem é "atualiza a app"', () => {
      expect(parseQr(JSON.stringify({ ...payload, v: 2 }))).toEqual({
        kind: 'unsupported_version',
        version: 2,
      });
    });

    it('decide pela versão antes de olhar para os outros campos', () => {
      // Um payload `v2` pode ter mudado a forma do resto. Validá-lo contra a v1 daria a mensagem
      // errada — "QR não reconhecido" em vez de "atualiza a app".
      expect(parseQr(JSON.stringify({ v: 2, session: 'abc' }))).toEqual({
        kind: 'unsupported_version',
        version: 2,
      });
    });
  });

  describe('http (contrato §9)', () => {
    it('recusa http em servidor público, com razão própria', () => {
      expect(parseQr(JSON.stringify({ ...payload, base_url: 'http://poole.esgrima.pt' }))).toEqual({
        kind: 'insecure_base_url',
        baseUrl: 'http://poole.esgrima.pt',
      });
    });

    it.each([
      'http://localhost:8000',
      'http://127.0.0.1:8000',
      'http://10.0.1.4',
      'http://192.168.1.70:8000',
    ])('deixa passar %s — exceção de desenvolvimento', (base) => {
      const result = parseQr(JSON.stringify({ ...payload, base_url: base }));
      expect(result).toEqual({ kind: 'payload', payload: { ...payload, base_url: base } });
    });

    it('não confunde um host que começa por "localhost" com o próprio localhost', () => {
      const raw = JSON.stringify({ ...payload, base_url: 'http://localhost.atacante.pt' });
      expect(parseQr(raw).kind).toBe('insecure_base_url');
    });
  });
});
