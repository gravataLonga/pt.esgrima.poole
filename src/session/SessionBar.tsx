import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Banner } from '@/ui';

import { EXPIRY_WARNING_MS, millisUntilExpiry, useSessionStore } from './store';

export interface SessionBarProps {
  /** `true` quando o último *poll* falhou. É a única noção de "offline" que a app precisa. */
  offline: boolean;
}

/** De minuto a minuto chega: o aviso é "está a acabar", não uma contagem decrescente. */
const TICK_MS = 30_000;

/**
 * O estado da ligação, em banner e só quando há o que dizer.
 *
 * Dois avisos, nunca os dois ao mesmo tempo: **sem ligação**, que é o que explica uma lista que
 * não se atualiza; e **sessão a acabar**, a menos de 5 minutos do fim da janela deslizante
 * (contrato §6). O segundo é o que evita que o árbitro descubra que a sessão morreu no momento em
 * que tenta registar um resultado.
 */
export function SessionBar({ offline }: SessionBarProps) {
  const { t } = useTranslation();
  const expiresAt = useSessionStore((s) => s.expiresAt);

  // O tempo passa sem que nada mude no store: sem este tique o aviso só apareceria no render
  // seguinte, que num ecrã parado pode nunca acontecer.
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  if (offline) {
    return (
      <View>
        <Banner tone="warning" message={t('session.offline')} />
      </View>
    );
  }

  const remaining = millisUntilExpiry(expiresAt);
  if (remaining === null || remaining > EXPIRY_WARNING_MS) return null;

  return (
    <View>
      <Banner
        tone="warning"
        message={
          remaining > 0
            ? t('session.expiring', { minutes: Math.max(1, Math.round(remaining / 60_000)) })
            : t('session.expired')
        }
      />
    </View>
  );
}
