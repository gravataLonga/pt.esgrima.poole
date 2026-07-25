import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useQueueStore } from '@/queue/store';
import { Banner, spacing } from '@/ui';

import { competitionKey, useSessionStore } from './store';

/**
 * O que está por enviar e o que se perdeu pelo caminho — spec §8.
 *
 * A app **não finge que enviou**: um resultado guardado localmente aparece aqui, contado, até o
 * servidor o confirmar. Os avisos (409, assalto removido, submissão recusada) ficam até serem
 * tocados: são a única vez que o árbitro fica a saber que um resultado que ele deu por registado
 * não ficou.
 *
 * **Duas contagens, e a segunda nasceu com o contrato `2.0.0`.** Com um código por pista, um
 * resultado que ficou em fila só pode ser entregue pelo token daquela pista: o da pista seguinte
 * não a alcança, e o filtro do `drainQueue` — que existe precisamente para não o mandar com o token
 * errado — deixa-o parado. Contá-lo à mistura com os desta pista dizia ao árbitro que a app estava
 * a tratar do assunto. Não está: aquele resultado precisa de que alguém volte a ligar-se àquele
 * código, e é isso que este segundo banner diz.
 */
export function QueueBanner() {
  const { t } = useTranslation();
  const items = useQueueStore((s) => s.items);
  const notices = useQueueStore((s) => s.notices);
  const dismiss = useQueueStore((s) => s.dismissNotice);
  const here = useSessionStore(competitionKey);

  const pending = items.filter((item) => item.competition_uuid === here).length;
  const stranded = items.length - pending;

  if (items.length === 0 && notices.length === 0) return null;

  return (
    <View style={styles.stack}>
      {pending > 0 ? (
        <Banner tone="warning" message={t('queue.pending', { count: pending })} />
      ) : null}

      {stranded > 0 ? (
        <Banner tone="warning" message={t('queue.stranded', { count: stranded })} />
      ) : null}

      {notices.map((notice) => (
        <Pressable
          key={notice.submission_id}
          accessibilityRole="button"
          accessibilityLabel={t('queue.dismiss')}
          onPress={() => dismiss(notice.submission_id)}
        >
          <Banner
            tone="danger"
            message={t(`queue.notice.${notice.reason}`, {
              label: notice.label,
              detail: notice.detail ?? '',
            })}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.sm,
  },
});
