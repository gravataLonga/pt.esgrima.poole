import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError, NetworkError } from '@/api/errors';
import { queryKeys } from '@/api/queries';
import { drainQueue } from '@/queue/drain';

import { competitionKey, useSessionStore } from './store';

export interface ConnectState {
  connecting: boolean;
  /** Mensagem pronta a mostrar. `null` quando não há nada de errado. */
  error: string | null;
  /** `true` enquanto o *throttle* do servidor estiver a correr. Levanta-se sozinho. */
  blocked: boolean;
  /** Instante (epoch ms) em que o bloqueio levanta, para o escrever ao árbitro. */
  blockedUntil: number | null;
  connect: (pin: string, baseUrl?: string) => Promise<void>;
  clearError: () => void;
}

/**
 * Ligar, com os estados que o ecrã 1 precisa de mostrar: *a ligar* · *PIN inválido* · *bloqueado
 * até HH:MM* · *sem rede* (spec §6).
 *
 * Vive fora dos ecrãs porque há dois caminhos para a mesma ligação — escrever seis dígitos e ler
 * o QR — e o contrato §9 é explícito: *"Ler o QR e escrever o PIN são o mesmo caminho, com a
 * mesma validação e o mesmo tratamento de erro."*
 */
export function useConnect(): ConnectState {
  const { t } = useTranslation();
  const connectSession = useSessionStore((s) => s.connect);
  const client = useQueryClient();

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);

  /**
   * O bloqueio levanta-se sozinho quando a janela do servidor passa. Quem o **liga** é a resposta
   * `429`, lá em baixo; aqui só se agenda o desligar. Comparar `Date.now()` a cada render não
   * serviria: um render não acontece por o tempo ter passado.
   */
  useEffect(() => {
    if (!blocked || blockedUntil === null) return;

    const id = setTimeout(() => setBlocked(false), Math.max(0, blockedUntil - Date.now()));
    return () => clearTimeout(id);
  }, [blocked, blockedUntil]);

  const connect = useCallback(
    async (pin: string, baseUrl?: string) => {
      setConnecting(true);
      setError(null);

      try {
        await connectSession(pin, baseUrl);

        const { scope, poule, match } = useSessionStore.getState();

        // A fila sobrevive a uma reconexão e drena com o token novo. É o cenário que o
        // `submission_id` existe para cobrir: o servidor devolve 200, não um 409 falso. **Só o
        // que é desta pista** — o resto fica à espera de quem o possa entregar (spec §8).
        void drainQueue(competitionKey({ poule, match }));

        // `scope` decide o ecrã. O árbitro escreve seis dígitos e não sabe — nem tem de saber —
        // que tipo de código lhe deram (contrato §7).
        if (scope === 'match' && match) {
          // O combate já veio no `connect`: semeá-lo na cache é o que cumpre a promessa do
          // contrato §7 — *"o combate abre, sem um segundo pedido pelo meio"*. Sem isto o ecrã
          // abria em "a carregar" para pedir o que acabou de receber.
          client.setQueryData(queryKeys.match(match.id), match);
          router.replace({ pathname: '/match/[id]', params: { id: match.id } });
          return;
        }

        router.replace('/poule');
      } catch (failure) {
        setError(messageFor(failure, t));

        if (failure instanceof ApiError && failure.code === 'pin_throttled') {
          // Sem `Retry-After` fica um minuto, que é a janela do limite do servidor (5/min).
          setBlockedUntil(Date.now() + (failure.retryAfterSeconds ?? 60) * 1000);
          setBlocked(true);
        }
      } finally {
        setConnecting(false);
      }
    },
    [connectSession, client, t],
  );

  return {
    connecting,
    error,
    blocked,
    blockedUntil,
    connect,
    clearError: useCallback(() => setError(null), []),
  };
}

/**
 * O `message` do servidor já vem em pt-PT e pronto a mostrar (contrato §3), mas a app está em
 * `en`: misturar as duas línguas no mesmo ecrã seria pior do que traduzir os casos que a app
 * conhece. Um `code` desconhecido cai no `message` do servidor, que é sempre melhor do que nada.
 *
 * **O `410 competition_finished` é a exceção, e é uma decisão de contrato.** É a única `message`
 * que muda com o caso: diz se a poule fechou por um quadro, se foi toda disputada, ou se o combate
 * já foi arbitrado — e, quando é a primeira, diz para onde ir (*"cada combate das eliminatórias tem
 * o seu próprio código — peça o da sua pista"*). Uma constante em `en` no lugar disso deixa o
 * árbitro parado à espera do organizador no meio de um evento que claramente não terminou. A frase
 * certa na língua errada desbloqueia-o; a frase errada na língua certa não.
 */
function messageFor(failure: unknown, t: (key: string) => string): string {
  if (failure instanceof NetworkError) return t('connect.error.network');

  if (failure instanceof ApiError) {
    switch (failure.code) {
      case 'pin_invalid':
        return t('connect.error.invalid');
      case 'competition_finished':
        // Sem `message` do servidor sobra a constante, que continua a ser melhor do que nada.
        return failure.message || t('connect.error.finished');
      case 'pin_throttled':
        return t('connect.error.throttled');
      case 'validation_failed':
        return t('connect.error.invalid');
      default:
        return failure.message;
    }
  }

  return t('connect.error.unknown');
}
