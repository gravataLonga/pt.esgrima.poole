import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useQueueStore } from '@/queue/store';
import { Button, Sheet, Text, colors, spacing } from '@/ui';

import { nothingLeftToDo } from './completion';
import { useSessionStore } from './store';

/**
 * As duas formas de sair de uma competição — spec §6.
 *
 * Até aqui só havia uma, e era do servidor: o `401 poule_complete`, que chega quando a competição
 * está encerrada para sempre. Enquanto não chegasse, não havia botão nenhum que devolvesse o
 * árbitro ao ecrã de ligar — nem para trocar de poule, nem para acabar o dia.
 *
 * - **Sair**, sempre disponível, no canto do cabeçalho. Termina a sessão e revoga o token.
 * - **Concluir**, só quando não há mais nada para arbitrar ([`nothingLeftToDo`](./completion.ts)).
 *   Leva ao resumo, e é lá que a sessão acaba.
 *
 * As duas confirmam antes, e as duas dizem a mesma coisa a seguir: **voltar custa seis dígitos**. O
 * PIN é de utilização múltipla (contrato §9), e é isso que faz de sair uma decisão barata.
 */
export function LeaveButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const disconnect = useSessionStore((s) => s.disconnect);
  const pending = useQueueStore((s) => s.items.length);

  const onLeave = () => {
    // Não se espera pela rede para sair: o `disconnect` apaga o token local primeiro e só depois
    // tenta revogá-lo. A fila fica (spec §9) e drena quando houver sessão outra vez.
    void disconnect();
    setOpen(false);
    router.replace('/connect');
  };

  return (
    <>
      <Button
        label={t('session.leave')}
        variant="secondary"
        size="compact"
        onPress={() => setOpen(true)}
      />

      <Sheet
        visible={open}
        title={t('session.leaveTitle')}
        subtitle={t('session.leaveMessage')}
        onClose={() => setOpen(false)}
        actions={
          <>
            <Button label={t('session.leave')} variant="danger" onPress={onLeave} />
            <Button label={t('session.stay')} variant="secondary" onPress={() => setOpen(false)} />
          </>
        }
      >
        {pending > 0 ? (
          <Text color={colors.textMuted}>{t('session.leaveQueued', { count: pending })}</Text>
        ) : null}
      </Sheet>
    </>
  );
}

/** O fim do trabalho. Não aparece enquanto houver um assalto ou um combate por arbitrar. */
export function FinishButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const finish = useSessionStore((s) => s.finish);
  const pending = useQueueStore((s) => s.items.length);

  const done = useSessionStore(nothingLeftToDo);
  if (!done) return null;

  const onFinish = () => {
    finish();
    setOpen(false);
    router.replace('/complete');
  };

  return (
    <View style={styles.finish}>
      <Button label={t('session.finish')} onPress={() => setOpen(true)} />

      <Sheet
        visible={open}
        title={t('session.finishTitle')}
        subtitle={t('session.finishMessage')}
        onClose={() => setOpen(false)}
        actions={
          <>
            <Button label={t('session.finish')} onPress={onFinish} />
            <Button label={t('common.cancel')} variant="secondary" onPress={() => setOpen(false)} />
          </>
        }
      >
        {pending > 0 ? (
          <Text color={colors.textMuted}>{t('session.leaveQueued', { count: pending })}</Text>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  finish: {
    paddingTop: spacing.sm,
  },
});
