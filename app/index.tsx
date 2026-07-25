import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { useQueueStore } from '@/queue/store';
import { useSessionStore } from '@/session/store';
import { Screen } from '@/ui';

/**
 * Porta de entrada. A app já não abre sempre no ecrã de ligar: havendo um token guardado, valida-o
 * primeiro com `GET /session` (contrato §7) e vai direta ao que há para arbitrar — que pode ser a
 * lista de assaltos ou o quadro, consoante a poule tenha fechado entretanto.
 *
 * Enquanto isso não resolve, o ecrã fica escuro como o *splash*. Piscar o formulário de PIN e
 * substituí-lo pela lista meio segundo depois é pior do que esperar meio segundo.
 */
export default function Index() {
  const restoring = useSessionStore((s) => s.restoring);
  const phase = useSessionStore((s) => s.phase);
  const restore = useSessionStore((s) => s.restore);
  const hydrate = useQueueStore((s) => s.hydrate);

  useEffect(() => {
    void restore();
    // A fila é do disco, não da sessão: pode haver resultados por enviar de uma sessão que já
    // expirou, e é isso que se recupera aqui.
    void hydrate();
  }, [restore, hydrate]);

  if (restoring) {
    return (
      <Screen tone="dark">
        <View />
      </Screen>
    );
  }

  if (phase === 'complete') return <Redirect href="/complete" />;
  if (phase === 'bracket') return <Redirect href="/bracket" />;
  if (phase === 'poule' || phase === 'read_only') return <Redirect href="/poule" />;

  return <Redirect href="/connect" />;
}
