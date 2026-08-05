import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  BoutInfo,
  Clock,
  EventSheet,
  PrioritySheet,
  ScoreBoard,
  TimeSheet,
  boutTiming,
  cardCount,
  useAllowLandscape,
  useBoutEngine,
  useIsLandscape,
  type CardKind,
  type ScoreColumnProps,
  type Side,
} from '@/bout';
import { Button, Screen, Text, colors, radius, spacing, touch, type } from '@/ui';

/**
 * Modo cronómetro — um assalto, offline, sem atletas e sem sessão (ADR-021).
 *
 * **Não importa `@/session/store`, e não pode passar a importar.** É essa ausência que garante que
 * o ecrã continua a funcionar sem rede quando as fases F1–F5 trouxerem cliente HTTP, fila e
 * expiração de sessão — e é o que o teste de navegação verifica.
 *
 * Conduzir o assalto é o mesmo trabalho do ecrã ligado, e vem inteiro do `useBoutEngine`. O que
 * muda é só o que aqui não existe: identidade dos atletas e destino do resultado.
 */

/**
 * Presets de poule FIE, fixos. Não há API que os mande, e um ecrã de configuração para os pedir
 * seria mais interface do que o modo inteiro — o `± 10 s` e o "Acertar" do mostrador cobrem o
 * desvio pontual. `periods: 1` e `restSeconds: 0` fecham as fases de descanso e de período
 * seguinte: aqui só existem o tempo regulamentar e a morte súbita.
 */
const STANDALONE = { target: 5, durationSeconds: 180, periods: 1, restSeconds: 0 };

export default function TimerScreen() {
  const { t } = useTranslation();

  const timing = useMemo(
    () =>
      boutTiming({
        duration_seconds: STANDALONE.durationSeconds,
        periods: STANDALONE.periods,
        rest_seconds: STANDALONE.restSeconds,
      }),
    [],
  );

  const engine = useBoutEngine({ target: STANDALONE.target, timing });
  const { rules, timer } = engine;

  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  // O tempo com que a folha de acerto abre, fotografado no toque. Ler `timer.remainingMs` a cada
  // render remontava os campos dez vezes por segundo com o cronómetro a correr.
  const [timeSnapshotMs, setTimeSnapshotMs] = useState(0);

  // Como no ecrã de assalto: aqui não há sequer lista para onde voltar depois de o telemóvel
  // bloquear, e o assalto perdia-se.
  useKeepAwake();
  useAllowLandscape();
  const landscape = useIsLandscape();

  const sides = {
    a: { label: t('timer.sideGreen'), tone: 'green' as const },
    b: { label: t('timer.sideRed'), tone: 'red' as const },
  };

  /** Há assalto em curso — o suficiente para perder alguma coisa ao sair ou ao recomeçar. */
  const started = rules.a > 0 || rules.b > 0 || rules.cards.length > 0;

  const onLeave = () => {
    if (!started) {
      router.replace('/connect');
      return;
    }

    Alert.alert(t('timer.leaveTitle'), t('timer.leaveMessage'), [
      { text: t('bout.leaveStay'), style: 'cancel' },
      {
        text: t('timer.leaveDiscard'),
        style: 'destructive',
        onPress: () => router.replace('/connect'),
      },
    ]);
  };

  const onNewBout = () => {
    if (!started) {
      engine.reset();
      return;
    }

    Alert.alert(t('timer.newBoutTitle'), t('timer.newBoutMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('timer.newBout'), style: 'destructive', onPress: engine.reset },
    ]);
  };

  const cardsOf = (side: Side): Record<CardKind, number> => ({
    yellow: cardCount(rules, side, 'yellow'),
    red: cardCount(rules, side, 'red'),
    black: cardCount(rules, side, 'black'),
  });

  const clock = (
    <Clock
      timer={timer}
      durationSeconds={engine.durationSeconds}
      phase={engine.phase}
      period={engine.period}
      timing={timing}
      passivityMs={engine.passivityMs}
      action={engine.action}
      onAction={engine.onAction}
      onPriority={() => setPriorityOpen(true)}
      onNudge={timer.adjust}
      onEditTime={() => {
        setTimeSnapshotMs(timer.remainingMs);
        setTimeSheetOpen(true);
      }}
      onStartRest={engine.startRest}
      onGoToPeriod={engine.goToPeriod}
      compact={landscape}
    />
  );

  const columnFor = (side: Side): ScoreColumnProps => ({
    label: sides[side].label,
    // Sem atletas: é isto que colapsa o bloco de nome e dá lugar à faixa de cor.
    number: null,
    club: null,
    tone: sides[side].tone,
    score: rules[side],
    opponentScore: side === 'a' ? rules.b : rules.a,
    target: STANDALONE.target,
    cards: cardsOf(side),
    hasPriority: rules.priority === side,
    flashingPriority: engine.priorityDraw.flashing === side,
    onChange: engine.setScore(side),
    onCard: engine.giveCard(side),
    onUndoCard: (kind: CardKind) => engine.undoCard(side, kind),
    // Quem está à esquerda da pista encosta o nome à esquerda; quem está à direita, à direita.
    align: side === 'a' ? 'start' : 'end',
  });

  const columns = { a: columnFor('a'), b: columnFor('b') };

  // Não há "Submeter": não há para onde submeter. E o empate fica por decidir se o árbitro assim o
  // quiser — `canSubmit` existe porque a plataforma recusa `a === b` (contrato §7), e aqui não há
  // plataforma nenhuma para o recusar.
  //
  // Secundário, sempre: recomeçar nunca é a ação principal deste ecrã — a principal é tocar no
  // mostrador para arrancar.
  const newBout = (
    <Button label={t('timer.newBout')} variant="panel" size="compact" onPress={onNewBout} />
  );

  const events = (
    <Button
      label={t('bout.events.open')}
      variant="secondary"
      size="compact"
      onPress={() => setEventsOpen(true)}
    />
  );

  return (
    // Deitado, o *notch* e a barra de gestos passam para os lados: sem as arestas laterais, a
    // coluna da esquerda fica por baixo do recorte do ecrã (ADR-013).
    <Screen edges={landscape ? ['top', 'bottom', 'left', 'right'] : ['top', 'bottom']}>
      <View style={[styles.header, landscape ? styles.headerCompact : null]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('timer.leaveDiscard')}
          onPress={onLeave}
          style={({ pressed }) => [styles.backButton, pressed ? styles.backPressed : null]}
        >
          <View style={styles.chevron} />
        </Pressable>

        <Text variant="title" style={styles.headerTitle} numberOfLines={1}>
          {t('timer.title')}
        </Text>

        <BoutInfo timing={timing} target={STANDALONE.target} />
      </View>

      {landscape ? (
        <View style={styles.landscape}>
          <View style={styles.landscapeColumn}>
            <ScoreBoard sides={[columns.a]} compact />
          </View>
          <View style={styles.landscapeClock}>
            <View style={styles.landscapeClockSlot}>{clock}</View>
            <View style={styles.landscapeActions}>
              <View style={styles.landscapeAction}>{events}</View>
              <View style={styles.landscapeAction}>{newBout}</View>
            </View>
          </View>
          <View style={styles.landscapeColumn}>
            <ScoreBoard sides={[columns.b]} compact />
          </View>
        </View>
      ) : (
        <>
          {clock}
          <ScoreBoard sides={[columns.a, columns.b]} />
          <View style={styles.actionRow}>
            <View style={styles.actionAside}>{events}</View>
            <View style={styles.actionMain}>{newBout}</View>
          </View>
        </>
      )}

      <PrioritySheet
        visible={priorityOpen}
        current={rules.priority}
        // Sem atletas, os lados são as cores — e uma cor não tem clube nem apelido.
        fencerOf={(side) => ({ name: sides[side].label, club: null })}
        onDraw={() => {
          setPriorityOpen(false);
          engine.priorityDraw.start();
        }}
        onSet={(side) => {
          setPriorityOpen(false);
          engine.setPriority(side);
        }}
        onClose={() => setPriorityOpen(false)}
      />

      <EventSheet
        visible={eventsOpen}
        log={engine.log}
        timing={timing}
        nameOf={(side) => sides[side].label}
        onClose={() => setEventsOpen(false)}
      />

      <TimeSheet
        visible={timeSheetOpen}
        remainingMs={timeSnapshotMs}
        durationSeconds={engine.durationSeconds}
        onApply={(ms) => {
          timer.set(ms);
          setTimeSheetOpen(false);
        }}
        onReset={() => {
          timer.reset();
          setTimeSheetOpen(false);
        }}
        onClose={() => setTimeSheetOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  headerCompact: {
    marginBottom: spacing.sm,
  },
  backButton: {
    width: touch.min,
    height: touch.min,
    marginLeft: -spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  backPressed: {
    backgroundColor: colors.grayLight,
  },
  chevron: {
    width: 12,
    height: 12,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.dark,
    transform: [{ rotate: '45deg' }],
    marginLeft: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: type.xl,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionAside: {
    flex: 1,
  },
  actionMain: {
    flex: 2,
  },
  landscape: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  landscapeColumn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
  },
  landscapeClock: {
    // Mais largo do que as colunas: em landscape o cronómetro é o que se lê da outra ponta da
    // pista, e os dígitos precisam de espaço.
    flex: 1.25,
    gap: spacing.sm,
  },
  landscapeClockSlot: {
    flex: 1,
    justifyContent: 'center',
  },
  landscapeActions: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  landscapeAction: {
    flex: 1,
  },
});
