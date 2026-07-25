/**
 * Contrato contra o servidor a sério.
 *
 * Não corre por omissão: sem `LIVE_API_BASE_URL` e `LIVE_API_PIN` os testes são saltados, e o `npm
 * test` de toda a gente continua a não depender de haver rede nem plataforma instalada.
 *
 * ```sh
 * LIVE_API_BASE_URL=https://poole.esgrima.pt.test \
 * LIVE_API_PIN=123456 \
 * NODE_OPTIONS=--use-system-ca \
 * npm run test:live
 *
 * # e, com o PIN de um combate de eliminatória, a outra metade do contrato:
 * LIVE_API_SCOPE=match LIVE_API_PIN=654321 ... npm run test:live
 * ```
 *
 * O `--use-system-ca` só é preciso contra um `.test` local: ensina o Node a confiar na CA do
 * Herd/Valet, que já está no chaveiro do sistema. **Não** desligar a verificação de TLS para isto —
 * o contrato §2 obriga a HTTPS, e um teste que a desliga deixa de testar o que a app faz.
 *
 * O que isto verifica é o que nenhum mock consegue: que o **servidor a sério** responde com as
 * formas do contrato. Um mock testa a app contra a leitura que a app fez do contrato; isto testa-a
 * contra o outro lado. É a diferença entre "o cliente está consistente" e "os dois lados estão de
 * acordo".
 *
 * **Não escreve nada.** Ligar-se emite um token e invalida o do dispositivo anterior — isso já é
 * efeito suficiente para um teste. Registar resultados fica para o `live-score.ts`, que se corre à
 * mão contra dados descartáveis.
 */

import { clientConfig, configureClient, request } from './client';
import * as api from './endpoints';
import { ApiError } from './errors';
import {
  API_CONTRACT_VERSION,
  HEADER_SESSION_EXPIRES_AT,
  type LiveBoutEvent,
  type SessionScope,
} from './types';

const baseUrl = process.env.LIVE_API_BASE_URL;
const pin = process.env.LIVE_API_PIN;

/**
 * O âmbito do PIN, declarado por quem corre o teste. Não se descobre a meio: o Jest decide que
 * testes existem antes de qualquer `beforeAll` correr, e um `it.skip` calculado depois disso
 * ficaria a dizer "passou" sobre um teste que nunca chegou a verificar nada.
 */
const expectedScope: SessionScope = process.env.LIVE_API_SCOPE === 'match' ? 'match' : 'poule';

const live = baseUrl && pin ? describe : describe.skip;

/** Os endpoints de poule só existem no âmbito de poule (contrato §7). */
const pouleOnly = expectedScope === 'poule' ? it : it.skip;

/** E o combate só é alcançável pelo código dele — não há mais nenhuma forma de lá chegar. */
const matchOnly = expectedScope === 'match' ? it : it.skip;

/** ISO-8601 UTC com `Z`, como o contrato §2 exige. */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

live(`contrato ${API_CONTRACT_VERSION} contra ${baseUrl ?? '(saltado)'}`, () => {
  let scope: SessionScope;

  beforeAll(async () => {
    configureClient({
      baseUrl: baseUrl as string,
      token: null,
      clientHeader: 'poole-referee-app/live-test',
    });

    const response = await api.connect({ pin: pin as string, device_name: 'Jest live test' });

    expect(response.token).toEqual(expect.any(String));
    expect(response.expires_at).toMatch(ISO_UTC);
    expect(['poule', 'match']).toContain(response.scope);

    // Exatamente um dos dois vem preenchido — é o `scope` que diz qual (contrato §7).
    if (response.scope === 'poule') {
      expect(response.poule).not.toBeNull();
      expect(response.match).toBeNull();
    } else {
      // O combate inteiro vem aqui: o árbitro escreve seis dígitos e o combate abre, sem um
      // segundo pedido pelo meio.
      expect(response.poule).toBeNull();
      expect(response.match).toMatchObject({
        id: expect.any(String),
        competition_name: expect.any(String),
        ready: expect.any(Boolean),
        target: expect.any(Number),
        allow_draw: false,
      });
    }

    expect(response.scope).toBe(expectedScope);

    scope = response.scope;
    configureClient({ token: response.token });
  }, 30_000);

  it('GET /session devolve a mesma forma do connect, sem token', async () => {
    const session = await api.getSession();

    expect(session.expires_at).toMatch(ISO_UTC);
    expect(session.scope).toBe(scope);
    expect(session).not.toHaveProperty('token');
  });

  it('serve `X-Session-Expires-At` em todas as respostas autenticadas', async () => {
    const response = await request<unknown>('/session');
    expect(response.sessionExpiresAt).toMatch(ISO_UTC);
  });

  it('recusa um token inválido com 401 e sem o cabeçalho de expiração', async () => {
    const good = clientConfig().token;
    configureClient({ token: '999|naoexisteestetokendecerteza' });

    try {
      await expect(api.getSession()).rejects.toMatchObject({ status: 401 });

      // Num 401 não há sessão viva e não existe data de expiração para reportar (contrato §2).
      const raw = await fetch(`${baseUrl}/api/v1/session`, {
        headers: { Accept: 'application/json', Authorization: 'Bearer 999|naoexiste' },
      });
      expect(raw.status).toBe(401);
      expect(raw.headers.get(HEADER_SESSION_EXPIRES_AT)).toBeNull();

      const envelope = (await raw.json()) as { code: string; message: string };
      expect(['token_expired', 'token_revoked', 'poule_complete']).toContain(envelope.code);
      expect(envelope.message).toEqual(expect.any(String));
    } finally {
      configureClient({ token: good });
    }
  });

  it('devolve `422 pin_invalid` a um PIN que não existe, ou `429` se já estiver a travar', async () => {
    const good = clientConfig().token;
    const failure = await api.connect({ pin: '000000' }).catch((error: unknown) => error);

    configureClient({ token: good });

    expect(failure).toBeInstanceOf(ApiError);

    // O `/connect` tem limite de 5/min por IP, e um teste que já se ligou algumas vezes pode
    // apanhá-lo. Não é falha: são os dois códigos que o contrato §8 prevê aqui, e o `429` traz o
    // `Retry-After` que a app usa para bloquear o campo até à hora certa.
    if ((failure as ApiError).status === 429) {
      expect((failure as ApiError).code).toBe('pin_throttled');
      expect((failure as ApiError).retryAfterSeconds).toEqual(expect.any(Number));
      return;
    }

    expect(failure).toMatchObject({ status: 422, code: 'pin_invalid' });
  });

  pouleOnly('GET /poules/{uuid}/bouts traz o summary e a lista ordenada', async () => {
    const uuid = (await api.getSession()).poule!.uuid;
    const response = await api.getBouts(uuid);
    const data = response.data!;

    expect(response.etag).toEqual(expect.any(String));

    // O `PouleSummary` do contrato §7, campo a campo.
    expect(data.poule).toMatchObject({
      uuid,
      name: expect.any(String),
      touch_cap: expect.any(Number),
      duration_seconds: expect.any(Number),
      periods: expect.any(Number),
      bouts_total: expect.any(Number),
      bouts_done: expect.any(Number),
      locked: expect.any(Boolean),
      ordered: expect.any(Boolean),
    });

    // Já ordenada por `sequence` pelo servidor — o cliente não reordena (contrato §7).
    const sequences = data.bouts.map((bout) => bout.sequence);
    expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);

    for (const bout of data.bouts) {
      expect(typeof bout.id).toBe('string');
      expect(['pending', 'in_progress', 'done']).toContain(bout.status);
      expect(typeof bout.scored_by_me).toBe('boolean');
      // `null` enquanto não estiver pontuado; nunca `0` por omissão.
      if (bout.status !== 'done') expect(bout.score_a).toBeNull();
    }
  });

  pouleOnly('devolve 304 ao mesmo ETag e o cliente mantém a cache', async () => {
    const uuid = (await api.getSession()).poule!.uuid;
    const first = await api.getBouts(uuid);

    const second = await api.getBouts(uuid, first.etag);

    expect(second.status).toBe(304);
    expect(second.notModified).toBe(true);
    expect(second.data).toBeNull();
  });

  pouleOnly('GET /standings vem ordenado por lugar e o cliente não reordena', async () => {
    const uuid = (await api.getSession()).poule!.uuid;
    const data = (await api.getStandings(uuid)).data!;

    const places = data.standings.map((row) => row.place);
    expect([...places].sort((a, b) => a - b)).toEqual(places);

    for (const row of data.standings) {
      expect(row.diff).toBe(row.given - row.received);
      expect(row.fencer.name).toEqual(expect.any(String));
    }
  });

  pouleOnly('GET /bouts/{id} é leitura pura e traz os presets do cronómetro', async () => {
    const uuid = (await api.getSession()).poule!.uuid;
    const list = (await api.getBouts(uuid)).data!;
    const first = list.bouts[0];
    if (!first) return;

    const before = first.status;
    const detail = await api.getBout(first.id);

    expect(detail).toMatchObject({
      id: first.id,
      target: expect.any(Number),
      duration_seconds: expect.any(Number),
      periods: expect.any(Number),
      // Não há empates em poule (contrato §7).
      allow_draw: false,
      poule_locked: expect.any(Boolean),
    });

    // Um `GET` não pode mudar estado: um prefetch ou um duplo-toque não podem abrir um assalto.
    const after = (await api.getBouts(uuid)).data!.bouts.find((bout) => bout.id === first.id);
    expect(after?.status).toBe(before);
  });

  pouleOnly('recusa um resultado empatado com 422 validation_failed', async () => {
    const uuid = (await api.getSession()).poule!.uuid;
    const list = (await api.getBouts(uuid)).data!;
    const pending = list.bouts.find((bout) => bout.status !== 'done');
    if (!pending) return;

    // `a === b` é recusado antes de gravar seja o que for — a chamada não escreve nada.
    const failure = await api
      .scoreBout(pending.id, { submission_id: crypto.randomUUID(), a: 3, b: 3 })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 422, code: 'validation_failed' });
    expect((failure as ApiError).envelope.errors).toBeDefined();
  });

  matchOnly('GET /elimination/{id} é leitura pura e traz os presets do quadro', async () => {
    const match = (await api.getSession()).match!;

    const before = match.status;
    const detail = await api.getMatch(match.id);

    expect(detail).toMatchObject({
      id: match.id,
      competition_name: expect.any(String),
      round: expect.any(Number),
      position: expect.any(Number),
      ready: expect.any(Boolean),
      target: expect.any(Number),
      duration_seconds: expect.any(Number),
      periods: expect.any(Number),
      // Um combate de quadro tem de ter vencedor, senão ninguém sobe (contrato §7).
      allow_draw: false,
      locked: expect.any(Boolean),
    });

    // Na eliminatória o atleta chega do quadro e já não tem número de folha.
    expect(detail.fencer_a?.number ?? null).toBeNull();
    if (!detail.ready) expect(detail.fencer_a === null || detail.fencer_b === null).toBe(true);

    // Um `GET` não pode mudar estado, aqui como no assalto de poule.
    expect((await api.getMatch(match.id)).status).toBe(before);
  });

  matchOnly('não alcança combate nenhum a não ser o do próprio código', async () => {
    // O código desceu ao combate precisamente para que uma sessão não veja o resto da prova
    // (contrato §7). O servidor responde `404` em vez de `403` para não revelar que ids existem.
    const failure = await api.getMatch('999999').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect([403, 404]).toContain((failure as ApiError).status);
  });

  /**
   * A matriz de idempotência do contrato §4, contra o servidor a sério. **Escreve**, por isso só
   * corre com `LIVE_API_ALLOW_WRITES=1` e contra uma poule descartável — um resultado registado
   * não se corrige pela API (contrato §7).
   */
  const writes =
    process.env.LIVE_API_ALLOW_WRITES === '1' && expectedScope === 'poule' ? it : it.skip;

  writes(
    'grava 201, repete 200 com a mesma submissão e recusa 409 com outra',
    async () => {
      const uuid = (await api.getSession()).poule!.uuid;
      const list = (await api.getBouts(uuid)).data!;
      const pending = list.bouts.find((bout) => bout.status === 'pending');

      if (!pending) throw new Error('A poule de teste não tem assaltos por pontuar.');

      const submissionId = crypto.randomUUID();
      const score = { submission_id: submissionId, a: 5, b: 3 };

      // 1. Gravado agora.
      const created = await api.scoreBout(pending.id, score);
      expect(created).toMatchObject({ id: pending.id, status: 'done', score_a: 5, score_b: 3 });
      expect(created.bouts_done).toBeGreaterThan(0);

      // 2. A mesma submissão outra vez — é a rede a engasgar-se, não um segundo resultado. Sem esta
      //    regra o autor recebia "já registado por outra pessoa" sobre o seu próprio registo.
      const repeated = await api.scoreBout(pending.id, score);
      expect(repeated).toEqual(created);

      // 3. Outra submissão sobre o mesmo assalto — aí sim, alguém chegou primeiro.
      const conflict = await api
        .scoreBout(pending.id, { submission_id: crypto.randomUUID(), a: 2, b: 5 })
        .catch((error: unknown) => error);

      expect(conflict).toBeInstanceOf(ApiError);
      expect(conflict).toMatchObject({ status: 409, code: 'bout_already_scored' });
      expect((conflict as ApiError).current).toMatchObject({ score_a: 5, score_b: 3 });
    },
    30_000,
  );

  writes(
    '`POST /start` é idempotente e muda o estado que o `GET` não muda',
    async () => {
      const uuid = (await api.getSession()).poule!.uuid;
      const list = (await api.getBouts(uuid)).data!;
      const pending = list.bouts.find((bout) => bout.status === 'pending');

      if (!pending) throw new Error('A poule de teste não tem assaltos por pontuar.');

      expect(await api.startBout(pending.id)).toEqual({ id: pending.id, status: 'in_progress' });
      expect(await api.startBout(pending.id)).toEqual({ id: pending.id, status: 'in_progress' });

      const after = (await api.getBouts(uuid)).data!.bouts.find((bout) => bout.id === pending.id);
      expect(after?.status).toBe('in_progress');
    },
    30_000,
  );

  writes(
    '`POST .../events` conta os novos e ignora em silêncio um `seq` repetido',
    async () => {
      const uuid = (await api.getSession()).poule!.uuid;
      const list = (await api.getBouts(uuid)).data!;
      const pending = list.bouts.find((bout) => bout.status !== 'done');

      if (!pending) throw new Error('A poule de teste não tem assaltos por pontuar.');

      const events: LiveBoutEvent[] = [
        { seq: 1, type: 'touch', side: 'a', period: 1, at_ms: 12_400, score_a: 1, score_b: 0 },
        { seq: 2, type: 'double', period: 1, at_ms: 30_100, score_a: 2, score_b: 1 },
      ];

      // Quantos foram novos depende de o assalto já ter recebido eventos numa corrida anterior.
      expect(await api.postBoutEvents(pending.id, events)).toMatchObject({
        accepted: expect.any(Number),
      });

      // O mesmo lote outra vez é o mesmo toque outra vez: nada de novo, e **não** é erro. É esta
      // linha que prova que o `seq` é a idempotência — sem ela, cada retry duplicava a linha
      // temporal do assalto.
      expect(await api.postBoutEvents(pending.id, events)).toEqual({ accepted: 0 });
    },
    30_000,
  );

  writes(
    'o ETag muda quando um resultado entra — senão o poll ficava cego',
    async () => {
      const uuid = (await api.getSession()).poule!.uuid;
      const before = await api.getBouts(uuid);
      const pending = before.data!.bouts.find((bout) => bout.status === 'pending');

      if (!pending) throw new Error('A poule de teste não tem assaltos por pontuar.');

      await api.scoreBout(pending.id, { submission_id: crypto.randomUUID(), a: 5, b: 1 });

      const after = await api.getBouts(uuid, before.etag);
      expect(after.status).toBe(200);
      expect(after.etag).not.toBe(before.etag);
    },
    30_000,
  );

  it('responde 404 a um id de outra competição, em vez de revelar que existe', async () => {
    // O contrato §8 reserva o `403 poule_scope_mismatch` mas deixa o servidor responder `404`
    // para não revelar que ids existem no resto da prova. O cliente tem de tolerar os dois.
    const failure = await api.getBout('999999').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect([403, 404]).toContain((failure as ApiError).status);
  });
});
