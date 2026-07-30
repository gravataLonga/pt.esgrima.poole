import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { useRefereeingStore } from '@/poule';
import { useQueueStore } from '@/queue/store';
import { useSessionStore } from '@/session/store';
import { Screen } from '@/ui';

/**
 * Porta de entrada. A app já não abre sempre no ecrã de ligar: havendo um token guardado, valida-o
 * primeiro com `GET /session` (contrato §7) e vai direta ao que há para arbitrar — o cartão da
 * poule, ou o combate que o código abriu.
 *
 * Enquanto isso não resolve, o ecrã fica escuro como o *splash*. Piscar o formulário de PIN e
 * substituí-lo pela lista meio segundo depois é pior do que esperar meio segundo.
 */
export default function Index() {
  const restoring = useSessionStore((s) => s.restoring);
  const phase = useSessionStore((s) => s.phase);
  const match = useSessionStore((s) => s.match);
  const restore = useSessionStore((s) => s.restore);
  const hydrate = useQueueStore((s) => s.hydrate);
  const hydrateRefereeing = useRefereeingStore((s) => s.hydrate);

  useEffect(() => {
    void restore();
    // A fila é do disco, não da sessão: pode haver resultados por enviar de uma sessão que já
    // expirou, e é isso que se recupera aqui.
    void hydrate();
    // E qual era o assalto deste dispositivo antes de a app ser morta (contrato `2.2.0`).
    void hydrateRefereeing();
  }, [restore, hydrate, hydrateRefereeing]);

  if (restoring) {
    return (
      <Screen tone="dark">
        <View />
      </Screen>
    );
  }

  if (phase === 'complete') return <Redirect href="/complete" />;
  // A fase `match` só existe com o combate em mão — é o `phaseFor` que o garante —, mas o `href`
  // precisa do id e um `undefined` aqui abriria `/match/undefined`.
  if (phase === 'match' && match) {
    return <Redirect href={{ pathname: '/match/[id]', params: { id: match.id } }} />;
  }
  if (phase === 'poule' || phase === 'read_only') return <Redirect href="/poule" />;

  return <Redirect href="/connect" />;
}
