import { Redirect, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSessionStore } from '@/session/store';
import { Button, Screen, Text, colors, fonts, radius, spacing, type } from '@/ui';

/** Ecrã 5 — Poule completa (spec §6). Sessão terminada, não é um erro. */
export default function CompleteScreen() {
  const { t } = useTranslation();
  const poule = useSessionStore((s) => s.poule);
  const disconnect = useSessionStore((s) => s.disconnect);

  if (!poule) return <Redirect href="/connect" />;

  const onRestart = () => {
    disconnect();
    router.replace('/connect');
  };

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.check}>
            <View style={styles.checkMark} />
          </View>

          <Text variant="display" style={styles.title}>
            {t('complete.title')}
          </Text>

          <Text color={colors.grayDark} style={styles.message}>
            {t('complete.message')}
          </Text>

          <View style={styles.tally}>
            {/* Padrão numérico, como o `5–3` da lista: não passa por `t()`. */}
            <Text style={styles.tallyNumber}>
              {poule.bouts_done}/{poule.bouts_total}
            </Text>
            <Text variant="label" color={colors.dark}>
              {t('complete.tallyLabel')}
            </Text>
            <Text variant="caption" color={colors.grayDark} style={styles.tallyName}>
              {poule.name}
            </Text>
          </View>
        </View>

        <Button label={t('complete.again')} onPress={onRestart} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: spacing.xl,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  check: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.green,
  },
  /** Visto desenhado com Views — não há biblioteca de ícones instalada. */
  checkMark: {
    width: 26,
    height: 14,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
    borderColor: colors.dark,
    transform: [{ rotate: '-45deg' }],
    marginTop: -6,
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    maxWidth: 300,
  },
  tally: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.grayMedium,
    alignSelf: 'stretch',
  },
  tallyNumber: {
    fontFamily: fonts.montserrat,
    fontSize: type.display,
    color: colors.dark,
    fontVariant: ['tabular-nums'],
  },
  tallyName: {
    textAlign: 'center',
  },
});
