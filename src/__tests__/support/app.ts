/**
 * Ponto de partida limpo para um teste que renderiza a app inteira.
 *
 * Três estados sobrevivem entre testes do mesmo ficheiro e têm de ser repostos à mão: o servidor
 * falso, os dois *stores* de zustand e a cache do React Query. Esquecer qualquer um deles faz um
 * teste passar por causa do anterior — que é a pior forma de um teste passar.
 */

import { QueryClient } from '@tanstack/react-query';

import type { PouleSummary, TournamentSummary } from '@/api/types';
import { defaultBaseUrl } from '@/config/env';
import { useQueueStore } from '@/queue/store';
import { phaseFor, useSessionStore } from '@/session/store';

import { resetFakeApi, seedPoule, seedTournament, type FakeState } from './fakeApi';

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
    tournament: null,
    expiresAt: null,
    endReason: null,
    // Sem isto, um teste que tenha ido ao quadro deixava a transição automática já dada como
    // feita, e o teste seguinte não era levado lá.
    bracketAnnounced: false,
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
    tournament: null,
    expiresAt: null,
    endReason: null,
    bracketAnnounced: false,
  });

  return poule;
}

/** O mesmo, para uma sessão de âmbito `tournament` — que só arbitra o quadro. */
export function connectTournament(overrides: Partial<TournamentSummary> = {}): TournamentSummary {
  const tournament = seedTournament(overrides);

  useSessionStore.setState({
    phase: 'bracket',
    restoring: false,
    scope: 'tournament',
    poule: null,
    tournament,
    expiresAt: null,
    endReason: null,
    bracketAnnounced: false,
  });

  return tournament;
}
