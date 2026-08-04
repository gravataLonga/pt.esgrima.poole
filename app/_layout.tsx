// Importados por subpath de propósito: o root do pacote exporta todos os pesos e o Metro
// empacotaria as ~36 TTF das duas famílias.
import { Montserrat_400Regular } from '@expo-google-fonts/montserrat/400Regular';
import { Montserrat_700Bold } from '@expo-google-fonts/montserrat/700Bold';
import { WorkSans_400Regular } from '@expo-google-fonts/work-sans/400Regular';
import { WorkSans_700Bold } from '@expo-google-fonts/work-sans/700Bold';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { lockPortrait } from '@/bout';
import '@/i18n';
import { DRAIN_INTERVAL_MS, drainQueue } from '@/queue/drain';
import { competitionKey, useSessionStore } from '@/session/store';
import { colors } from '@/ui';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // O cliente HTTP já repete o que é repetível, com o backoff do contrato §4. Uma segunda
      // camada de retry por cima multiplicava as tentativas e atrasava o ecrã de erro.
      retry: false,
      // Em *background* o polling pára (contrato §5): nada muda no ecrã e a rede do pavilhão é o
      // recurso escasso.
      refetchIntervalInBackground: false,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_700Bold,
    WorkSans_400Regular,
    WorkSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // `app.json` deixa as quatro orientações abertas porque o iOS não deixa rodar nada sem isso. O
  // portrait volta a ser a regra aqui, e só o ecrã de assalto a levanta (`useAllowLandscape`).
  useEffect(lockPortrait, []);

  /**
   * O React Query não sabe o que é uma app de telemóvel: sem isto o `focusManager` fica sempre em
   * "focado" e o polling continua com a app minimizada. Ao voltar ao *foreground* há *refetch*
   * imediato (contrato §5) e a fila drena — que é o momento em que a rede costuma voltar.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      const active = status === 'active';
      focusManager.setFocused(active);
      if (active) void drainQueue(competitionKey(useSessionStore.getState()));
    });

    return () => subscription.remove();
  }, []);

  /** A rede pode voltar sem a app sair do ecrã. De 30 em 30 s tenta-se de novo (spec §8). */
  useEffect(() => {
    const id = setInterval(
      () => void drainQueue(competitionKey(useSessionStore.getState())),
      DRAIN_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, []);

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.light } }}
        >
          <Stack.Screen name="index" />
          {/* Ligar nunca é um passo em frente: chega-se lá do arranque da app, ou de uma sessão que
              acabou — sempre por `Redirect`/`replace`. A deslizada da direita é a gramática de
              "entrei mais fundo", e à primeira abertura dava a ideia de que se tinha saltado um
              ecrã. Como o `index` também é escuro, o fundido não se vê: sai do splash direto para o
              formulário. */}
          <Stack.Screen name="connect" options={{ animation: 'fade' }} />
          <Stack.Screen name="scan" />
          <Stack.Screen name="timer" />
          <Stack.Screen name="poule" />
          <Stack.Screen name="bout/[id]" />
          <Stack.Screen name="match/[id]" />
          <Stack.Screen name="complete" />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
