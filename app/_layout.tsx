// Importados por subpath de propósito: o root do pacote exporta todos os pesos e o Metro
// empacotaria as ~36 TTF das duas famílias.
import { Montserrat_400Regular } from '@expo-google-fonts/montserrat/400Regular';
import { Montserrat_700Bold } from '@expo-google-fonts/montserrat/700Bold';
import { WorkSans_400Regular } from '@expo-google-fonts/work-sans/400Regular';
import { WorkSans_700Bold } from '@expo-google-fonts/work-sans/700Bold';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { lockPortrait } from '@/bout';
import '@/i18n';
import { colors } from '@/ui';

void SplashScreen.preventAutoHideAsync();

/**
 * O QueryClient existe desde já para que a F2 só tenha de acrescentar queries — nenhuma corre
 * enquanto não houver API.
 */
const queryClient = new QueryClient();

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

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.light } }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="connect" />
          <Stack.Screen name="timer" />
          <Stack.Screen name="poule" />
          <Stack.Screen name="bout/[id]" />
          <Stack.Screen name="complete" />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
