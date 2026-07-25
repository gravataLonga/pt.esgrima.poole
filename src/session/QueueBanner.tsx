import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useQueueStore } from '@/queue/store';
import { Banner, spacing } from '@/ui';

/**
 * O que está por enviar e o que se perdeu pelo caminho — spec §8.
 *
 * A app **não finge que enviou**: um resultado guardado localmente aparece aqui, contado, até o
 * servidor o confirmar. Os avisos (409, assalto removido, submissão recusada) ficam até serem
 * tocados: são a única vez que o árbitro fica a saber que um resultado que ele deu por registado
 * não ficou.
 */
export function QueueBanner() {
  const { t } = useTranslation();
  const pending = useQueueStore((s) => s.items.length);
  const notices = useQueueStore((s) => s.notices);
  const dismiss = useQueueStore((s) => s.dismissNotice);

  if (pending === 0 && notices.length === 0) return null;

  return (
    <View style={styles.stack}>
      {pending > 0 ? <Banner tone="warning" message={t('queue.pending', { count: pending })} /> : null}

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
