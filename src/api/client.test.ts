import {
  configureClient,
  onSessionSignal,
  request,
  sessionEpoch,
  type SessionSignal,
} from './client';
import { ApiError, NetworkError } from './errors';

/**
 * O cliente HTTP, na parte que não se vê: cabeçalhos, envelope de erro, `ETag` e o sinal de sessão.
 *
 * O `fetch` é postiço aqui de propósito — o que se testa é o que a app **faz com** a resposta, e
 * isso não precisa de rede. Que as respostas a sério têm estas formas é o que o
 * `src/api/live.test.ts` verifica, contra a plataforma.
 */

interface FakeResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

const respond = ({ status, headers = {}, body }: FakeResponse): Response =>
  ({
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) =>
        Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ??
        null,
    },
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  }) as unknown as Response;

const mockFetch = () => jest.spyOn(globalThis, 'fetch');

beforeEach(() => {
  configureClient({
    baseUrl: 'https://poole.esgrima.pt',
    token: 'tok',
    clientHeader: 'poole-referee-app/test',
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('cabeçalhos (contrato §2)', () => {
  it('leva `Accept`, `X-Client` e o token, e o `Content-Type` só quando há corpo', async () => {
    const fetchMock = mockFetch().mockResolvedValue(respond({ status: 200, body: {} }));

    await request('/session');
    const [, get] = fetchMock.mock.calls[0]!;
    const getHeaders = (get as RequestInit).headers as Record<string, string>;

    expect(getHeaders.Accept).toBe('application/json');
    expect(getHeaders['X-Client']).toBe('poole-referee-app/test');
    expect(getHeaders.Authorization).toBe('Bearer tok');
    expect(getHeaders['Content-Type']).toBeUndefined();

    await request('/bouts/1/score', { method: 'POST', body: { a: 5, b: 3 } });
    const [, post] = fetchMock.mock.calls[1]!;
    expect(((post as RequestInit).headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  it('não leva token no `connect` — é o único endpoint público', async () => {
    const fetchMock = mockFetch().mockResolvedValue(respond({ status: 200, body: {} }));

    await request('/connect', { method: 'POST', body: { pin: '111111' }, anonymous: true });

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).not.toHaveProperty('Authorization');
  });
});

describe('ETag (contrato §5)', () => {
  it('devolve o `ETag` e reenvia-o em `If-None-Match`', async () => {
    const fetchMock = mockFetch().mockResolvedValue(
      respond({ status: 200, headers: { ETag: '"abc"' }, body: {} }),
    );

    const first = await request('/poules/x/bouts');
    expect(first.etag).toBe('"abc"');

    await request('/poules/x/bouts', { etag: first.etag });
    const [, init] = fetchMock.mock.calls[1]!;
    expect(((init as RequestInit).headers as Record<string, string>)['If-None-Match']).toBe('"abc"');
  });

  /**
   * A aresta que fez o `304` nunca acontecer contra a plataforma a sério: o proxy comprime, o
   * `ETag` sai enfraquecido, e o servidor compara por igualdade de string. Ver a caixa do §5 do
   * contrato — a correção a sério é de lá, esta é a que impede a app de pagar por ela.
   */
  it('normaliza um `ETag` fraco para a forma forte antes de o reenviar', async () => {
    mockFetch().mockResolvedValue(
      respond({ status: 200, headers: { ETag: 'W/"abc"' }, body: {} }),
    );

    const response = await request('/poules/x/bouts');
    expect(response.etag).toBe('"abc"');
  });

  it('um 304 não traz corpo e o cliente fica com a cache que tinha', async () => {
    mockFetch().mockResolvedValue(respond({ status: 304, headers: { ETag: '"abc"' } }));

    const response = await request('/poules/x/bouts', { etag: '"abc"' });

    expect(response.status).toBe(304);
    expect(response.notModified).toBe(true);
    expect(response.data).toBeNull();
  });
});

describe('envelope de erro (contrato §3)', () => {
  it('transforma o envelope num `ApiError` com o `code` intacto', async () => {
    mockFetch().mockResolvedValue(
      respond({
        status: 409,
        body: {
          code: 'bout_already_scored',
          message: 'Já registado por outra pessoa.',
          current: { score_a: 4, score_b: 5, scored_at: '2026-07-24T17:31:02Z' },
        },
      }),
    );

    const failure = await request('/bouts/1/score', { method: 'POST', body: {} }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 409, code: 'bout_already_scored' });
    expect((failure as ApiError).current).toMatchObject({ score_a: 4, score_b: 5 });
  });

  it('um erro sem envelope não rebenta o cliente', async () => {
    // Página de manutenção, proxy, 502 em HTML: nada disto vem com `code`, e a app tem de
    // continuar a funcionar na mesma.
    mockFetch().mockResolvedValue(respond({ status: 502 }));

    const failure = await request('/session', { retries: 1 }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe('server_error');
    expect((failure as ApiError).isKnown).toBe(true);
  });

  it('um `code` desconhecido passa tal e qual, sem crash', async () => {
    mockFetch().mockResolvedValue(
      respond({ status: 418, body: { code: 'inventado_amanha', message: 'Uma coisa nova.' } }),
    );

    const failure = (await request('/session', { retries: 1 }).catch(
      (error: unknown) => error,
    )) as ApiError;

    expect(failure.code).toBe('inventado_amanha');
    expect(failure.isKnown).toBe(false);
    expect(failure.message).toBe('Uma coisa nova.');
  });

  it('lê o `Retry-After` de um 429', async () => {
    mockFetch().mockResolvedValue(
      respond({
        status: 429,
        headers: { 'Retry-After': '42' },
        body: { code: 'pin_throttled', message: 'Demasiadas tentativas.' },
      }),
    );

    const failure = (await request('/connect', {
      method: 'POST',
      anonymous: true,
      retries: 1,
    }).catch((error: unknown) => error)) as ApiError;

    expect(failure.retryAfterSeconds).toBe(42);
  });

  it('sem resposta nenhuma é falha de rede, não erro de servidor', async () => {
    mockFetch().mockRejectedValue(new TypeError('Network request failed'));

    await expect(request('/session', { retries: 1 })).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('sinal de sessão (contrato §6)', () => {
  it('emite a expiração que veio no cabeçalho', async () => {
    mockFetch().mockResolvedValue(
      respond({
        status: 200,
        headers: { 'X-Session-Expires-At': '2026-07-24T18:42:11Z' },
        body: {},
      }),
    );

    const signals: SessionSignal[] = [];
    const unsubscribe = onSessionSignal((signal) => signals.push(signal));

    await request('/session');
    unsubscribe();

    expect(signals).toContainEqual(
      expect.objectContaining({ kind: 'alive', expiresAt: '2026-07-24T18:42:11Z' }),
    );
  });

  it('emite o fim de sessão com o `code` que distingue os três 401', async () => {
    mockFetch().mockResolvedValue(
      respond({ status: 401, body: { code: 'poule_complete', message: 'Está completa.' } }),
    );

    const signals: SessionSignal[] = [];
    const unsubscribe = onSessionSignal((signal) => signals.push(signal));

    await request('/session', { retries: 1 }).catch(() => undefined);
    unsubscribe();

    expect(signals).toContainEqual(
      expect.objectContaining({
        kind: 'unauthorized',
        code: 'poule_complete',
        message: 'Está completa.',
      }),
    );
  });
});

describe('época da sessão', () => {
  it('marca cada sinal com a sessão em que o pedido partiu', async () => {
    mockFetch().mockResolvedValue(
      respond({ status: 401, body: { code: 'token_revoked', message: 'Outro dispositivo.' } }),
    );

    const signals: SessionSignal[] = [];
    const unsubscribe = onSessionSignal((signal) => signals.push(signal));

    const sentUnder = sessionEpoch();
    const inFlight = request('/session', { retries: 1 }).catch(() => undefined);

    // O árbitro volta a ligar-se enquanto o pedido anterior ainda está no ar.
    configureClient({ token: 'tok-novo' });
    await inFlight;
    unsubscribe();

    // O sinal traz a época **antiga**, e é por isso que a store o pode ignorar em vez de apagar
    // um token que acabou de nascer.
    expect(signals[0]?.epoch).toBe(sentUnder);
    expect(sessionEpoch()).toBeGreaterThan(sentUnder);
  });
});

describe('retry (contrato §4)', () => {
  it('repete um `GET` que falhou por rede e devolve o que a segunda tentativa trouxer', async () => {
    const fetchMock = mockFetch()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValue(respond({ status: 200, body: { ok: true } }));

    const response = await request<{ ok: boolean }>('/poules/x/bouts');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.data).toEqual({ ok: true });
  }, 10_000);

  it('nunca repete um 409 — o resultado do outro não muda por insistir', async () => {
    const fetchMock = mockFetch().mockResolvedValue(
      respond({ status: 409, body: { code: 'bout_already_scored', message: 'Já registado.' } }),
    );

    await request('/bouts/1/score', { method: 'POST', body: {} }).catch(() => undefined);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
