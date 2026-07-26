import { ApiError, NetworkError } from './errors';
import { MAX_QUERY_RETRIES, retryPolicy } from './queries';

/**
 * A política de repetição das queries — a parte que decide se o árbitro chega a ver um erro.
 *
 * Existe por uma avaria concreta: sem a contagem, uma falha que não passa deixava a lista de
 * assaltos em "A carregar assaltos…" para sempre, com o ecrã de erro e o seu "tentar outra vez"
 * inalcançáveis por baixo.
 */
const apiError = (status: number, code: string) => new ApiError(status, { code, message: '' });

describe('retryPolicy', () => {
  it('insiste enquanto houver tentativas', () => {
    expect(retryPolicy(0, new NetworkError())).toBe(true);
    expect(retryPolicy(MAX_QUERY_RETRIES - 1, new NetworkError())).toBe(true);
  });

  it('desiste ao fim das tentativas — é isso que faz aparecer o ecrã de erro', () => {
    expect(retryPolicy(MAX_QUERY_RETRIES, new NetworkError())).toBe(false);
    expect(retryPolicy(MAX_QUERY_RETRIES + 5, new NetworkError())).toBe(false);
  });

  it('não repete o que não vai mudar de resposta', () => {
    // Sessão morta, poule que já não existe, token de outra pista: insistir só atrasa o ecrã que
    // explica o que aconteceu.
    expect(retryPolicy(0, apiError(401, 'session_expired'))).toBe(false);
    expect(retryPolicy(0, apiError(404, 'not_found'))).toBe(false);
    expect(retryPolicy(0, apiError(403, 'poule_scope_mismatch'))).toBe(false);
  });

  it('insiste num erro do servidor, que pode passar', () => {
    expect(retryPolicy(0, apiError(500, 'server_error'))).toBe(true);
  });
});
