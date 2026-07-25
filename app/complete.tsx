import { Redirect, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSessionStore } from '@/session/store';
import { Button, Screen, Text, colors, fonts, radius, spacing, type } from '@/ui';

/**
 * Ecrã 6 — Competição completa (spec §6). Sessão terminada, **não é um erro**.
 *
 * Chega-se aqui de um `401 poule_complete`, que o servidor só devolve quando a competição está
 * encerrada para sempre — assaltos feitos **e** quadro decidido (contrato §6). O token já foi
 * limpo pelo ouvinte da sessão; o que sobra no store é o retrato do que ficou feito.
 */
export default function CompleteScreen() {
  const { t } = useTranslation();
  const poule = useSessionStore((s) => s.poule);
  const tournament = useSessionStore((s) => s.tournament);
  const disconnect = useSessionStore((s) => s.disconnect);

  if (!poule && !tournament) return <Redirect href="/connect" />;

  const name = poule?.name ?? tournament?.name ?? '';
  const done = poule ? poule.bouts_done : (tournament?.matches_done ?? 0);
  const total = poule ? poule.bouts_total : (tournament?.matches_total ?? 0);

  const onRestart = () => {
    void disconnect();
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
              {done}/{total}
            </Text>
            <Text variant="label" color={colors.dark}>
              {t('complete.tallyLabel')}
            </Text>
            <Text variant="caption" color={colors.grayDark} style={styles.tallyName}>
              {name}
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
