import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { Bout } from '@/api/types';
import { Classification, Grid, boutStates, buildSheet, currentBout, onDeckBout } from '@/poule';
import type { BoutState } from '@/poule';
import { useSessionStore } from '@/session/store';
import {
  Badge,
  Banner,
  Button,
  ProgressBar,
  Screen,
  SegmentedControl,
  Text,
  colors,
  fonts,
  radius,
  shadow,
  spacing,
  touch,
  type,
} from '@/ui';

type PouleView = 'bouts' | 'sheet';

/**
 * Ecrã 2 — Lista de assaltos e folha de poule (spec §6).
 *
 * ESQUELETO: sem polling, sem ETag, sem pull to refresh — a lista vem do store em memória.
 */
export default function PouleScreen() {
  const { t } = useTranslation();
  const poule = useSessionStore((s) => s.poule);
  const bouts = useSessionStore((s) => s.bouts);
  const status = useSessionStore((s) => s.status);

  const [view, setView] = useState<PouleView>('bouts');

  // A folha percorre todos os assaltos e ordena a classificação. Recalculá-la a cada render do
  // ecrã seria desperdício — muda só quando um resultado entra.
  const sheet = useMemo(() => buildSheet(bouts), [bouts]);
  const states = useMemo(() => boutStates(bouts), [bouts]);

  if (!poule) return <Redirect href="/connect" />;
  if (status === 'complete') return <Redirect href="/complete" />;

  const current = currentBout(bouts);
  const onDeck = onDeckBout(bouts);
  const readOnly = status === 'read_only';
  const showClubs = poule.tournament_name !== null;

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="label" color={colors.textMuted} style={styles.eyebrow}>
          {poule.tournament_name ?? t('poule.isolated')}
        </Text>
        <Text variant="title">{poule.name}</Text>

        <View style={styles.progress}>
          <ProgressBar value={poule.bouts_total ? poule.bouts_done / poule.bouts_total : 0} />
          <Text variant="caption" color={colors.dark}>
            {t('poule.progress', { done: poule.bouts_done, total: poule.bouts_total })}
          </Text>
        </View>
      </View>

      {readOnly ? <Banner message={t('poule.readOnly')} tone="warning" /> : null}

      <View style={styles.switcher}>
        <SegmentedControl
          accessibilityLabel={t('poule.viewSwitcher')}
          value={view}
          onChange={setView}
          segments={[
            { value: 'bouts', label: t('poule.viewBouts') },
            { value: 'sheet', label: t('poule.viewSheet') },
          ]}
        />
      </View>

      {view === 'sheet' ? (
        <ScrollView contentContainerStyle={styles.sheet} showsVerticalScrollIndicator={false}>
          <Classification standings={sheet.standings} showClubs={showClubs} />
          <Grid sheet={sheet} showClubs={showClubs} />
        </ScrollView>
      ) : (
        <>
          {current ? (
            <CurrentBoutCard
              bout={current}
              state={states[current.id] ?? 'pending'}
              onDeck={onDeck}
              readOnly={readOnly}
            />
          ) : null}

          <Text variant="label" color={colors.textMuted} style={styles.listTitle}>
            {t('poule.listTitle')}
          </Text>

          <FlatList
            data={bouts}
            keyExtractor={(bout) => bout.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const state = states[item.id] ?? 'pending';

              return (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/bout/[id]', params: { id: item.id } })}
                  style={({ pressed }) => [
                    styles.row,
                    state === 'done' ? styles.rowDone : null,
                    state === 'on_deck' ? styles.rowOnDeck : null,
                    state === 'up_next' || state === 'in_progress' ? styles.rowActive : null,
                    pressed ? styles.rowPressed : null,
                  ]}
                >
                  <BoutLine bout={item} state={state} tone="light" />
                </Pressable>
              );
            }}
          />
        </>
      )}
    </Screen>
  );
}

interface CurrentBoutCardProps {
  bout: Bout;
  state: BoutState;
  onDeck: Bout | undefined;
  readOnly: boolean;
}

/**
 * O cartão do topo responde a duas perguntas de uma vez: *quem está em pista* e *quem se deve ir
 * preparar*. A segunda é a razão de o `on_deck` existir — sem ela o árbitro tem de percorrer a
 * lista para saber a quem chamar a seguir.
 */
function CurrentBoutCard({ bout, state, onDeck, readOnly }: CurrentBoutCardProps) {
  const { t } = useTranslation();
  const running = state === 'in_progress';

  return (
    <View style={styles.currentCard}>
      {/* Sempre "assalto atual": o estado exato já vem no badge da linha, e ter as duas coisas a
          dizer "A DECORRER" uma por cima da outra era ruído. */}
      <Text variant="caption" color={colors.green} style={styles.currentLabel}>
        {t('poule.current')}
      </Text>

      {/* Em `up_next` o badge diria "Começar" mesmo por cima de um botão "Começar". O estado só
          vale a pena aqui quando difere da ação — ou seja, quando o assalto já está a decorrer. */}
      <BoutLine bout={bout} state={state} tone="dark" hideBadge={state === 'up_next'} />

      <Button
        label={running ? t('poule.resume') : t('poule.start')}
        onPress={() => router.push({ pathname: '/bout/[id]', params: { id: bout.id } })}
        disabled={readOnly}
      />

      {onDeck ? (
        <View style={styles.onDeckStrip}>
          <Text variant="caption" color={colors.textMutedOnDark} style={styles.onDeckLabel}>
            {t('poule.state.on_deck')}
          </Text>
          <Text variant="label" color={colors.light} numberOfLines={1} style={styles.onDeckNames}>
            {t('poule.pairing', {
              a: onDeck.fencer_a.number,
              nameA: onDeck.fencer_a.name,
              b: onDeck.fencer_b.number,
              nameB: onDeck.fencer_b.name,
            })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

interface BoutLineProps {
  bout: Bout;
  state: BoutState;
  /** `dark` para o cartão do assalto atual, que tem fundo escuro. */
  tone: 'light' | 'dark';
  hideBadge?: boolean;
}

/** Tom do `Badge` por estado. `done` não usa badge — mostra o resultado. */
const badgeTone = {
  pending: 'gray',
  up_next: 'green',
  on_deck: 'warning',
  in_progress: 'green',
  done: 'gray',
} as const;

function BoutLine({ bout, state, tone, hideBadge = false }: BoutLineProps) {
  const { t } = useTranslation();

  const onDark = tone === 'dark';
  const nameColor = onDark ? colors.light : colors.dark;
  const mutedColor = onDark ? colors.textMutedOnDark : colors.textMuted;

  return (
    <View style={styles.line}>
      <View style={[styles.sequenceChip, onDark ? styles.sequenceChipOnDark : null]}>
        <Text variant="caption" color={onDark ? colors.dark : colors.light} style={styles.sequence}>
          {bout.sequence}
        </Text>
      </View>

      <View style={styles.names}>
        <FencerRow fencer={bout.fencer_a} nameColor={nameColor} clubColor={mutedColor} />
        <Text variant="caption" color={mutedColor} style={styles.vs}>
          {t('poule.vs')}
        </Text>
        <FencerRow fencer={bout.fencer_b} nameColor={nameColor} clubColor={mutedColor} />
      </View>

      <View style={styles.trailing}>
        {state === 'done' ? (
          <Text style={styles.result} color={nameColor}>
            {bout.score_a}–{bout.score_b}
          </Text>
        ) : hideBadge ? null : (
          <Badge label={t(`poule.state.${state}`)} tone={badgeTone[state]} />
        )}
      </View>
    </View>
  );
}

interface FencerRowProps {
  fencer: Bout['fencer_a'];
  nameColor: string;
  clubColor: string;
}

function FencerRow({ fencer, nameColor, clubColor }: FencerRowProps) {
  return (
    <View style={styles.fencerRow}>
      <Text variant="label" color={clubColor} style={styles.fencerNumber}>
        {fencer.number}
      </Text>
      <Text variant="label" color={nameColor} numberOfLines={1} style={styles.fencerName}>
        {fencer.name}
      </Text>
      {fencer.club ? (
        <Text variant="caption" color={clubColor} numberOfLines={1} style={styles.fencerClub}>
          {fencer.club}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  eyebrow: {
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  progress: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  switcher: {
    marginBottom: spacing.md,
  },
  sheet: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  currentCard: {
    gap: spacing.sm + 4,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radius.r16,
    backgroundColor: colors.dark,
    ...shadow.raised,
  },
  currentLabel: {
    fontFamily: fonts.montserrat,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  onDeckStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.darkBorder,
  },
  onDeckLabel: {
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  onDeckNames: {
    flex: 1,
    fontFamily: fonts.workSansBold,
  },
  listTitle: {
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  row: {
    minHeight: touch.min,
    justifyContent: 'center',
    padding: spacing.sm + 4,
    borderRadius: radius.r10,
    borderWidth: 1,
    borderColor: colors.grayMedium,
    backgroundColor: colors.light,
  },
  rowDone: {
    // Esbatido (spec §6), mas com opacidade moderada: a 0.55 o resultado deixava de se ler ao
    // longe, e consultar resultados já registados é metade do uso desta lista.
    opacity: 0.75,
    backgroundColor: colors.grayLight,
    borderColor: colors.grayLight,
  },
  rowOnDeck: {
    borderColor: colors.warning,
  },
  rowActive: {
    borderColor: colors.green,
    borderWidth: 2,
  },
  rowPressed: {
    backgroundColor: colors.grayMedium,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
  },
  sequenceChip: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.dark,
  },
  sequenceChipOnDark: {
    backgroundColor: colors.green,
  },
  sequence: {
    fontFamily: fonts.montserrat,
    fontVariant: ['tabular-nums'],
  },
  names: {
    flex: 1,
    gap: 2,
  },
  fencerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs + 2,
  },
  fencerNumber: {
    width: 14,
    fontVariant: ['tabular-nums'],
  },
  fencerName: {
    fontFamily: fonts.workSansBold,
    flexShrink: 1,
  },
  fencerClub: {
    flexShrink: 1,
  },
  vs: {
    marginLeft: 20,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  trailing: {
    alignItems: 'flex-end',
  },
  result: {
    fontFamily: fonts.montserrat,
    fontSize: type.xl,
    fontVariant: ['tabular-nums'],
  },
});
