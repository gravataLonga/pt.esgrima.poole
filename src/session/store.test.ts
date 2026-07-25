import { resetApp } from '@/__tests__/support/app';
import { state as fakeState, seedMatch, seedPoule } from '@/__tests__/support/fakeApi';
import { configureClient, request } from '@/api/client';
import type { PouleSummary } from '@/api/types';

import { competitionKey, millisUntilExpiry, phaseFor, useSessionStore } from './store';

/** Uma poule fechada, com ou sem quadro gerado — as duas leituras de `locked` (contrato §7). */
const locked = (elimination: PouleSummary['elimination']): PouleSummary => ({
  ...seedPoule(),
  locked: true,
  elimination,
});

describe('sessão', () => {
  beforeEach(() => resetApp());

  it('arranca desligada', () => {
    expect(useSessionStore.getState().phase).toBe('disconnected');
    expect(useSessionStore.getState().poule).toBeNull();
  });

  it('connect troca o PIN pela poule e passa à fase de poule', async () => {
    await useSessionStore.getState().connect('111111');

    const state = useSessionStore.getState();
    expect(state.phase).toBe('poule');
    expect(state.scope).toBe('poule');
    expect(state.poule?.bouts_total).toBe(15);
    expect(state.expiresAt).not.toBeNull();
  });

  it('um PIN de combate abre o combate, que vem já na resposta do connect', async () => {
    await useSessionStore.getState().connect('777777');

    const state = useSessionStore.getState();
    expect(state.phase).toBe('match');
    expect(state.scope).toBe('match');
    expect(state.poule).toBeNull();
    // Sem um segundo pedido pelo meio: o combate inteiro vem no `connect` (contrato §7).
    expect(state.match).toMatchObject({
      id: 'm_1',
      target: 15,
      competition_name: expect.any(String),
    });
    expect(competitionKey(state)).toBe('m_1');
  });

  it('propaga o erro do servidor para o ecrã o apresentar', async () => {
    await expect(useSessionStore.getState().connect('000000')).rejects.toMatchObject({
      code: 'pin_invalid',
    });

    expect(useSessionStore.getState().phase).toBe('disconnected');
  });

  it('disconnect apaga a sessão e escreve a razão', async () => {
    await useSessionStore.getState().connect('111111');
    await useSessionStore.getState().disconnect();

    const state = useSessionStore.getState();
    expect(state.phase).toBe('disconnected');
    expect(state.poule).toBeNull();
    expect(state.endReason).toBe('signed_out');
  });

  it('restore sem token guardado não inventa sessão nenhuma', async () => {
    await useSessionStore.getState().restore();

    expect(useSessionStore.getState().phase).toBe('disconnected');
    expect(useSessionStore.getState().restoring).toBe(false);
  });

  it('restore valida o token guardado e volta ao que havia para arbitrar', async () => {
    await useSessionStore.getState().connect('111111');
    // Como um relançar da app: o que sobrevive é o token no Keychain, não o que estava em memória.
    useSessionStore.setState({ phase: 'disconnected', poule: null, restoring: true });

    await useSessionStore.getState().restore();

    expect(useSessionStore.getState().phase).toBe('poule');
    expect(useSessionStore.getState().poule?.name).toBe('Poule 3 — Sabre Masculino');
  });
});

describe('progresso e mudança de fase', () => {
  beforeEach(() => resetApp());

  it('applySummary traz o progresso do poll para o cabeçalho', async () => {
    await useSessionStore.getState().connect('111111');
    const before = useSessionStore.getState().poule!.bouts_done;

    const poule = { ...useSessionStore.getState().poule!, bouts_done: before + 1 };
    useSessionStore.getState().applySummary({ poule });

    expect(useSessionStore.getState().poule?.bouts_done).toBe(before + 1);
    expect(useSessionStore.getState().phase).toBe('poule');
  });

  it('a poule fechar deixa-a em leitura — o quadro corre em códigos que este token não alcança', async () => {
    await useSessionStore.getState().connect('111111');

    // Até à `1.5.0` isto levava ao quadro. Na `2.0.0` um token de poule não alcança quadro
    // nenhum, nem sequer o desenhado a partir dela: o que a app faz é dizê-lo (contrato §7).
    useSessionStore
      .getState()
      .applySummary({ poule: locked({ matches_total: 3, matches_done: 0 }) });

    expect(useSessionStore.getState().phase).toBe('read_only');
  });

  it('a poule fechar sem quadro fica em só leitura, e não acaba a sessão', async () => {
    await useSessionStore.getState().connect('111111');

    useSessionStore.getState().applySummary({ poule: locked(null) });

    expect(useSessionStore.getState().phase).toBe('read_only');
  });

  it('phaseFor decide a fase pelo âmbito e pelo fecho da poule', () => {
    expect(phaseFor('match', null, seedMatch())).toBe('match');
    expect(phaseFor('poule', seedPoule())).toBe('poule');
    expect(phaseFor('poule', locked({ matches_total: 3, matches_done: 1 }))).toBe('read_only');
    expect(phaseFor('poule', locked(null))).toBe('read_only');
  });

  it('um âmbito que a app não conheça nunca cai no ramo da poule', () => {
    // É este o bug que a `2.0.0` provocava numa app tipada para a `1.5.0`: o `scope: "match"` caía
    // no ramo da poule, a poule vinha `null`, e o primeiro pedido era `/poules/undefined/bouts`.
    expect(phaseFor('tournament' as never, null)).toBe('disconnected');
    expect(phaseFor('match', null, null)).toBe('disconnected');
    expect(phaseFor('poule', null)).toBe('disconnected');
  });
});

describe('fim da competição', () => {
  beforeEach(() => resetApp());

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('um 401 poule_complete termina a sessão sem ser erro', async () => {
    await useSessionStore.getState().connect('111111');

    // Este é o único sinal de fim que não nasce em `@/api/endpoints`: vem do cliente HTTP, que o
    // emite ao ver um `401` em **qualquer** resposta (contrato §6). Daí ser o único teste da
    // sessão que fala com o `request` e com um `fetch` postiço.
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 401,
      ok: false,
      headers: new Map<string, string>() as unknown as Headers,
      text: async () =>
        JSON.stringify({ code: 'poule_complete', message: 'Esta poule já está completa.' }),
    } as unknown as Response);

    configureClient({ baseUrl: 'https://poole.esgrima.pt', token: 'fake-token' });
    await expect(request('/session', { retries: 1 })).rejects.toThrow();

    const state = useSessionStore.getState();
    // O retrato do que ficou feito mantém-se — é o que o ecrã 6 mostra. O que morre é o token.
    expect(state.phase).toBe('complete');
    expect(state.endReason).toBe('poule_complete');
    expect(state.poule).not.toBeNull();
  });

  it('a fase `complete` não é revertida por um summary que chegue atrasado', async () => {
    await useSessionStore.getState().connect('111111');
    useSessionStore.setState({ phase: 'complete' });

    useSessionStore.getState().applySummary({ poule: seedPoule() });

    expect(useSessionStore.getState().phase).toBe('complete');
  });
});

describe('janela deslizante', () => {
  beforeEach(() => resetApp());

  it('conta os milissegundos que faltam, e deixa-os passar a negativo', () => {
    const now = Date.parse('2026-07-24T17:00:00Z');

    expect(millisUntilExpiry(null, now)).toBeNull();
    expect(millisUntilExpiry('2026-07-24T17:05:00Z', now)).toBe(5 * 60_000);
    expect(millisUntilExpiry('2026-07-24T16:59:00Z', now)).toBe(-60_000);
  });

  it('a pista da fila é a que estiver ligada: o UUID da poule, ou o id do combate', () => {
    expect(competitionKey({ poule: null, match: null })).toBeNull();
    expect(competitionKey({ poule: seedPoule(), match: null })).toBe(fakeState.poule!.uuid);

    // Um combate não tem UUID — tem o seu id opaco, e é esse que agrupa a fila (spec §8).
    const match = seedMatch();
    expect(competitionKey({ poule: null, match })).toBe(match.id);
  });
});
