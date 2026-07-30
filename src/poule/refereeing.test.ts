import AsyncStorage from '@react-native-async-storage/async-storage';

import { MAX_ENTRY_AGE_MS, useRefereeingStore } from './refereeing';

/**
 * A memória de qual assalto é o **deste** dispositivo — contrato `2.2.0`.
 *
 * O que estes testes guardam é o caso que a torna necessária: a app é morta em *background* a meio
 * de uma poule, e ao voltar tem de continuar a saber qual dos assaltos a decorrer é o seu.
 */

const STORAGE_KEY = 'poole.referee.refereeing.v1';

beforeEach(async () => {
  await AsyncStorage.clear();
  useRefereeingStore.setState({ started: {} });
});

it('guarda o assalto começado, por pista', () => {
  const { markStarted } = useRefereeingStore.getState();

  markStarted('poule-uuid', 'b_4');
  markStarted('outra-poule', 'b_9');

  expect(useRefereeingStore.getState().started['poule-uuid']?.bout_id).toBe('b_4');
  expect(useRefereeingStore.getState().started['outra-poule']?.bout_id).toBe('b_9');
});

it('sobrevive a fechar a app', async () => {
  useRefereeingStore.getState().markStarted('poule-uuid', 'b_4');

  // A app morre e volta: o *store* em memória é novo, o disco é o mesmo.
  useRefereeingStore.setState({ started: {} });
  await useRefereeingStore.getState().hydrate();

  expect(useRefereeingStore.getState().started['poule-uuid']?.bout_id).toBe('b_4');
});

it('o disco atrasado não desfaz o que o árbitro acabou de fazer', async () => {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ 'poule-uuid': { bout_id: 'b_1', at: new Date().toISOString() } }),
  );

  // Começar um assalto antes de o disco responder é o caso normal de quem abre a app e vai direto
  // arbitrar. A hidratação não pode passar-lhe por cima.
  useRefereeingStore.getState().markStarted('poule-uuid', 'b_4');
  await useRefereeingStore.getState().hydrate();

  expect(useRefereeingStore.getState().started['poule-uuid']?.bout_id).toBe('b_4');
});

it('esquece as pistas de ontem', async () => {
  const ontem = new Date(Date.now() - MAX_ENTRY_AGE_MS - 1000).toISOString();

  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      antiga: { bout_id: 'b_1', at: ontem },
      recente: { bout_id: 'b_2', at: new Date().toISOString() },
    }),
  );

  await useRefereeingStore.getState().hydrate();

  expect(useRefereeingStore.getState().started.antiga).toBeUndefined();
  expect(useRefereeingStore.getState().started.recente?.bout_id).toBe('b_2');
  // E não volta a aparecer na hidratação seguinte: a limpeza também vai a disco.
  expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '{}')).not.toHaveProperty(
    'antiga',
  );
});

it('um disco ilegível não trava a app', async () => {
  await AsyncStorage.setItem(STORAGE_KEY, 'isto não é JSON');

  await expect(useRefereeingStore.getState().hydrate()).resolves.toBeUndefined();
  expect(useRefereeingStore.getState().started).toEqual({});
});
