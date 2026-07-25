/**
 * Ponto de partida limpo para um teste que renderiza a app inteira.
 *
 * Três estados sobrevivem entre testes do mesmo ficheiro e têm de ser repostos à mão: o servidor
 * falso, os dois *stores* de zustand e a cache do React Query. Esquecer qualquer um deles faz um
 * teste passar por causa do anterior — que é a pior forma de um teste passar.
 */

import { QueryClient } from '@tanstack/react-query';

import type { MatchDetail, PouleSummary } from '@/api/types';
import { defaultBaseUrl } from '@/config/env';
import { useQueueStore } from '@/queue/store';
import { phaseFor, useSessionStore } from '@/session/store';

import { resetFakeApi, seedMatch, seedPoule, type FakeState } from './fakeApi';

/**
 * O `QueryClient` da app vive em `app/_layout.tsx` e não é exportado — nem passa a ser só para os
 * testes o alcançarem. O `QueryClientProvider` chama `mount()` ao montar, e é aí que se apanha a
 * instância que há para limpar.
 */
const mounted = new Set<QueryClient>();
const mount = QueryClient.prototype.mount;

QueryClient.prototype.mount = function rememberAndMount(this: QueryClient) {
  mounted.add(this);
  return mount.call(this);
};

/**
 * O que um *poll* faz: voltar a pedir o que está no ecrã.
 *
 * Existe para não obrigar um teste a esperar os 10 s ou 30 s de relógio real da cadência do
 * contrato §5. O que se verifica com isto é o que a app faz **com** a resposta nova, que é a parte
 * que pode partir; que o intervalo é o certo é configuração, e essa lê-se no `usePollInterval`.
 */
export async function poll(): Promise<void> {
  for (const client of mounted) await client.refetchQueries();
}

/** Repõe servidor falso, sessão, fila e cache. Chamar no `beforeEach` de qualquer teste de ecrã. */
export function resetApp(overrides: Partial<FakeState> = {}): void {
  resetFakeApi(overrides);

  for (const client of mounted) client.clear();

  useSessionStore.setState({
    phase: 'disconnected',
    // `false` e não `true`: sem isto o ecrã de entrada ficava para sempre à espera de um `restore`
    // que nenhum teste pede.
    restoring: false,
    baseUrl: defaultBaseUrl,
    scope: null,
    poule: null,
    match: null,
    expiresAt: null,
    endReason: null,
  });

  useQueueStore.setState({ items: [], notices: [], hydrated: true });
}

/**
 * Deixa a sessão como o `POST /connect` a deixaria, sem passar pelo ecrã de ligar. Os testes que
 * verificam o *ligar* em si escrevem o PIN; os outros começam já dentro da poule.
 */
export function connectPoule(overrides: Partial<PouleSummary> = {}): PouleSummary {
  const poule = seedPoule(overrides);

  useSessionStore.setState({
    phase: phaseFor('poule', poule),
    restoring: false,
    scope: 'poule',
    poule,
    match: null,
    expiresAt: null,
    endReason: null,
  });

  return poule;
}

/** O mesmo, para uma sessão de âmbito `match` — que arbitra **um** combate e mais nada. */
export function connectMatch(overrides: Partial<MatchDetail> = {}): MatchDetail {
  const match = seedMatch(overrides);

  useSessionStore.setState({
    phase: phaseFor('match', null, match),
    restoring: false,
    scope: 'match',
    poule: null,
    match,
    expiresAt: null,
    endReason: null,
  });

  return match;
}
