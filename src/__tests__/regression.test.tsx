import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { connectPoule, connectTournament, resetApp } from './support/app';
import { seedBracket } from './support/fakeApi';

it('um combate de quadro conta até aos 15 toques que a API mandou', async () => {
  resetApp();
  seedBracket();
  connectTournament();

  await renderRouter('./app', { initialUrl: '/match/m_1' });
  await screen.findByText('Round 1 · 1');

  const add = await screen.findByLabelText('One more touch for Ana Silva');
  for (let i = 0; i < 9; i++) await fireEvent.press(add);

  expect(screen.getByLabelText('Ana Silva: 9 touches')).toBeTruthy();
});

it('reabrir um assalto já registado mostra o resultado que lá está', async () => {
  resetApp();
  connectPoule();

  // Assalto 1 da fixture: Ana Silva 5 — Rui Costa 3, já registado.
  await renderRouter('./app', { initialUrl: '/bout/b_01J8X001' });
  await screen.findByText('Bout 1');

  expect(await screen.findByLabelText('Ana Silva: 5 touches')).toBeTruthy();
});
