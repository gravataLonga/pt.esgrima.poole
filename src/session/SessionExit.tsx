import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useQueueStore } from '@/queue/store';
import { Button, Sheet, Text, colors, radius, spacing } from '@/ui';

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
      {/* Um ícone, e não a palavra: o cabeçalho é do nome da poule, e "Sair" escrito por extenso
          ocupava-lhe um terço da largura para uma ação que se usa uma vez por dia. A porta com a
          seta é o desenho de sair em todo o lado, e o nome continua lá para o VoiceOver. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('session.leave')}
        onPress={() => setOpen(true)}
        // O alvo desenhado tem 36 pt; o `hitSlop` leva-o aos 48 pt das HIG sem o engordar.
        hitSlop={6}
        style={({ pressed }) => [styles.leave, pressed ? styles.leavePressed : null]}
      >
        <ExitGlyph />
      </Pressable>

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

/**
 * Uma porta e uma seta a sair dela, desenhadas com `View`s — não há biblioteca de ícones instalada,
 * e o resto da app faz o mesmo (o play/pausa do cronómetro, os galhos de período).
 *
 * A porta é um retângulo **aberto do lado por onde se sai**: fechado dos quatro lados era uma
 * moldura, e a seta parecia estar a bater-lhe na parede.
 */
function ExitGlyph() {
  return (
    <View style={styles.glyph}>
      <View style={styles.door} />
      <View style={styles.arrowShaft} />
      <View style={styles.arrowHead} />
    </View>
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

/** Espessura do traço do ícone. Uma constante porque o desenho tem de a repetir em quatro sítios. */
const STROKE = 2;

const styles = StyleSheet.create({
  finish: {
    paddingTop: spacing.sm,
  },
  leave: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1.5,
    // `textMuted` e não `grayDark`: o contorno é o que identifica o botão, e a WCAG 1.4.11 pede-lhe
    // 3:1. O `grayDark` sobre branco dá 1.77 — o mesmo erro que motivou o `contrast.test.ts`.
    borderColor: colors.textMuted,
  },
  leavePressed: {
    backgroundColor: colors.grayLight,
  },
  glyph: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  door: {
    width: 9,
    height: 16,
    borderWidth: STROKE,
    // Aberta do lado por onde se sai.
    borderRightWidth: 0,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    borderColor: colors.dark,
  },
  arrowShaft: {
    width: 7,
    height: STROKE,
    marginLeft: 1,
    backgroundColor: colors.dark,
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderLeftWidth: 5,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.dark,
  },
});
