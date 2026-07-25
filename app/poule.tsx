import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useBouts, useStandings } from '@/api/queries';
import type { Bout } from '@/api/types';
import { Classification, Grid, boutStates, buildSheet, currentBout, onDeckBout } from '@/poule';
import type { BoutState } from '@/poule';
import { FinishButton, LeaveButton, QueueBanner, SessionBar } from '@/session';
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
 * Polling de 10 s com `If-None-Match` (contrato §5): um `304` não altera a lista nem a faz piscar,
 * porque a query devolve a mesma instância dos dados. Em *background* o polling pára — quem o liga
 * e desliga é o `focusManager` do `_layout`.
 */
export default function PouleScreen() {
  const { t } = useTranslation();
  const phase = useSessionStore((s) => s.phase);
  const poule = useSessionStore((s) => s.poule);
  const bracketAnnounced = useSessionStore((s) => s.bracketAnnounced);

  const [view, setView] = useState<PouleView>('bouts');

  const bouts = useBouts(poule?.uuid ?? null);
  // A classificação só é pedida com a folha aberta: seria um segundo `GET` de 10 em 10 s por um
  // ecrã que o árbitro consulta entre assaltos, não durante.
  const standings = useStandings(poule?.uuid ?? null, view === 'sheet');

  const list = useMemo(() => bouts.data?.bouts ?? [], [bouts.data]);

  // A matriz percorre todos os assaltos. Recalculá-la a cada render seria desperdício — e um
  // `304` devolve a mesma instância da lista, por isso isto não corre de 10 em 10 segundos.
  const sheet = useMemo(() => buildSheet(list), [list]);
  const states = useMemo(() => boutStates(list), [list]);

  if (phase === 'disconnected') return <Redirect href="/connect" />;
  if (phase === 'complete') return <Redirect href="/complete" />;
  // A poule fechou e o quadro abriu: a app muda de fase sozinha, sem pedir código novo (spec §6).
  // **Uma vez.** Feita a transição, a lista continua alcançável — fechada para escrita, mas os
  // resultados já registados são metade do uso deste ecrã, e o quadro tem um botão para cá voltar.
  if (phase === 'bracket' && !bracketAnnounced) return <Redirect href="/bracket" />;
  if (!poule) return <Redirect href="/connect" />;

  const readOnly = phase === 'read_only';
  const showClubs = poule.tournament_name !== null;

  // Só há "próximo assalto" quando a ordem tem valor regulamentar. Numa poule isolada o plantel
  // muda a meio, a ordem é regerada e qualquer `pending` serve (contrato §7, `ordered`).
  const current = poule.ordered ? currentBout(list) : undefined;
  const onDeck = poule.ordered ? onDeckBout(list) : undefined;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitles}>
            <Text variant="label" color={colors.textMuted} style={styles.eyebrow}>
              {poule.tournament_name ?? t('poule.isolated')}
            </Text>
            <Text variant="title">{poule.name}</Text>
          </View>

          {/* Sair está sempre a um toque: a sessão pertence à poule, e trocar de poule — ou acabar
              o dia — não pode depender de o servidor a dar por encerrada. */}
          <LeaveButton />
        </View>

        <View style={styles.progress}>
          <ProgressBar value={poule.bouts_total ? poule.bouts_done / poule.bouts_total : 0} />
          <Text variant="caption" color={colors.dark}>
            {t('poule.progress', { done: poule.bouts_done, total: poule.bouts_total })}
          </Text>
        </View>
      </View>

      <SessionBar offline={bouts.isError} />
      <QueueBanner />

      {readOnly ? <Banner message={t('poule.readOnly')} tone="warning" /> : null}

      {/* Enquanto a poule e o quadro coexistem, o quadro fica a um toque. Quando a poule fecha, a
          transição deixa de precisar deste botão — passa a ser automática. */}
      {poule.elimination ? (
        <View style={styles.bracketLink}>
          <Button
            label={t('poule.openBracket', {
              done: poule.elimination.matches_done,
              total: poule.elimination.matches_total,
            })}
            variant="secondary"
            size="compact"
            onPress={() => router.push('/bracket')}
          />
        </View>
      ) : null}

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

      {bouts.isLoading ? (
        <View style={styles.centered}>
          <Text color={colors.textMuted}>{t('poule.loading')}</Text>
        </View>
      ) : bouts.isError && list.length === 0 ? (
        <View style={styles.centered}>
          <Text variant="title">{t('poule.error.title')}</Text>
          <Text color={colors.textMuted} style={styles.centeredText}>
            {t('poule.error.body')}
          </Text>
          <Button label={t('common.retry')} onPress={() => void bouts.refetch()} />
        </View>
      ) : view === 'sheet' ? (
        <ScrollView
          contentContainerStyle={styles.sheet}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={standings.isFetching && !standings.isLoading}
              onRefresh={() => void standings.refetch()}
              tintColor={colors.dark}
            />
          }
        >
          <Classification standings={standings.data?.standings ?? []} showClubs={showClubs} />
          <Grid sheet={sheet} standings={standings.data?.standings ?? []} showClubs={showClubs} />
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
            data={list}
            keyExtractor={(bout) => bout.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                // `isFetching` sem `isLoading`: o indicador é para o *pull to refresh* e para o
                // poll de fundo, não para o primeiro carregamento, que já tem ecrã próprio.
                refreshing={bouts.isFetching && !bouts.isLoading}
                onRefresh={() => void bouts.refetch()}
                tintColor={colors.dark}
              />
            }
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text color={colors.textMuted} style={styles.centeredText}>
                  {t('poule.empty')}
                </Text>
              </View>
            }
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

      {/* Só quando não sobra nada por arbitrar. Fora do scroll: quem acabou a poule não deve ter
          de a percorrer até ao fim para encontrar a saída. */}
      <FinishButton />
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headerTitles: {
    flex: 1,
    gap: spacing.xs,
    // Sem isto, um nome de poule comprido empurra o botão de sair para fora do ecrã.
    minWidth: 0,
  },
  eyebrow: {
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  progress: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  bracketLink: {
    marginBottom: spacing.sm,
  },
  switcher: {
    marginBottom: spacing.md,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  centeredText: {
    textAlign: 'center',
    maxWidth: 300,
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
    flexGrow: 1,
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
