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

/**
 * Contrato `2.3.0`: o árbitro sai do assalto sem resultado, e a pista fica livre dos dois lados —
 * no servidor, com o `DELETE .../start`; aqui, com o que a app deixa de poder dizer que é seu.
 */
describe('largar o assalto', () => {
  it('deixa de haver um assalto meu, e não de haver memória da pista', () => {
    const { markStarted, clearStarted } = useRefereeingStore.getState();

    markStarted('poule-uuid', 'b_4');
    clearStarted('poule-uuid');

    // As duas metades: o assalto já não é deste dispositivo, mas ele arbitrou aqui — e é isso que
    // impede o cartão do topo de voltar a propor o assalto do árbitro do lado.
    expect(useRefereeingStore.getState().started['poule-uuid']?.bout_id).toBeNull();
    expect(useRefereeingStore.getState().started).toHaveProperty('poule-uuid');
  });

  it('não inventa memória de uma pista onde nunca se arbitrou', () => {
    useRefereeingStore.getState().clearStarted('poule-nunca-tocada');

    expect(useRefereeingStore.getState().started).toEqual({});
  });

  it('vai a disco, como o começar', async () => {
    useRefereeingStore.getState().markStarted('poule-uuid', 'b_4');
    useRefereeingStore.getState().clearStarted('poule-uuid');

    useRefereeingStore.setState({ started: {} });
    await useRefereeingStore.getState().hydrate();

    // Sem isto, uma app morta a seguir a largar o assalto voltava a achar que ele era dela.
    expect(useRefereeingStore.getState().started['poule-uuid']?.bout_id).toBeNull();
  });
});

it('um disco ilegível não trava a app', async () => {
  await AsyncStorage.setItem(STORAGE_KEY, 'isto não é JSON');

  await expect(useRefereeingStore.getState().hydrate()).resolves.toBeUndefined();
  expect(useRefereeingStore.getState().started).toEqual({});
});
