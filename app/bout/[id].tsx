import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useReducer, useState } from 'react';
import { Alert, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Clock,
  PRIORITY_SECONDS,
  ScoreColumn,
  TimeSheet,
  boutRules,
  boutTiming,
  canSubmit,
  cardCount,
  initialBoutRules,
  needsDecidingTouch,
  nextClockAction,
  phaseDuration,
  useAllowLandscape,
  useIsLandscape,
  usePassivity,
  usePriorityDraw,
  winner,
  type BoutPhase,
  type CardKind,
  type Side,
} from '@/bout';
import { useSessionStore } from '@/session/store';
import { useTimer } from '@/timer/useTimer';
import {
  Banner,
  Button,
  Screen,
  Sheet,
  Text,
  colors,
  fonts,
  radius,
  spacing,
  touch,
  type,
} from '@/ui';

/**
 * Ecrã 3 — Assalto (spec §7).
 *
 * ESQUELETO: não há `POST /start` e o resultado é gravado só em memória. O cronómetro, as fases, os
 * contadores, os cartões, a prioridade e a regra do empate são reais — são regra de domínio, não
 * integração.
 */
export default function BoutScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();

  const poule = useSessionStore((s) => s.poule);
  const bout = useSessionStore((s) => s.bouts.find((b) => b.id === id));
  const recordScore = useSessionStore((s) => s.recordScore);

  const target = poule?.touch_cap ?? 5;

  const timing = useMemo(
    () =>
      boutTiming({
        duration_seconds: poule?.duration_seconds ?? 180,
        periods: poule?.periods ?? 1,
        rest_seconds: poule?.rest_seconds,
      }),
    [poule?.duration_seconds, poule?.periods, poule?.rest_seconds],
  );

  const [rules, dispatch] = useReducer(boutRules, undefined, () =>
    initialBoutRules(target, bout?.score_a ?? 0, bout?.score_b ?? 0),
  );

  // Período e descanso são fases do assalto, não do cronómetro (ADR-015). A prioridade já vive no
  // redutor porque decide o vencedor, e é dela que se deriva a terceira fase.
  const [period, setPeriod] = useState(1);
  const [resting, setResting] = useState(false);
  const [sheet, setSheet] = useState<'none' | 'time' | 'submit'>('none');
  // O tempo com que a folha de acerto abre, fotografado no toque. Ler `timer.remainingMs` a cada
  // render remontava os campos dez vezes por segundo com o cronómetro a correr.
  const [timeSnapshotMs, setTimeSnapshotMs] = useState(0);
  // Conta os sinais de combate — toque ou cartão. Cada incremento reinicia o minuto de passividade.
  const [combatToken, setCombatToken] = useState(0);

  const onPrioritySettled = useCallback(
    (side: Side) => dispatch({ type: 'drawPriority', side }),
    [],
  );
  const priorityDraw = usePriorityDraw(onPrioritySettled);

  useAllowLandscape();
  const landscape = useIsLandscape();

  const phase: BoutPhase = rules.priority ? 'priority' : resting ? 'rest' : 'period';
  const durationSeconds = phaseDuration(phase, timing, PRIORITY_SECONDS);

  // Fim de tempo tem de ser percetível sem olhar (spec §7). `Vibration` é do core do RN; o som
  // fica para a F3, com o `expo-av` (ADR-002).
  const onExpire = useCallback(() => Vibration.vibrate([0, 400, 180, 400]), []);
  const timer = useTimer(durationSeconds, { onExpire });

  // Não se conta passividade no intervalo: os atletas não estão em pista.
  const passivity = usePassivity({
    running: timer.state === 'running' && phase !== 'rest',
    resetToken: combatToken,
  });

  const touched = rules.a !== (bout?.score_a ?? 0) || rules.b !== (bout?.score_b ?? 0);

  const onLeave = () => {
    if (!touched) {
      router.replace('/poule');
      return;
    }

    // Spec §6: sair com resultado por submeter pede confirmação. Fica no `Alert` nativo de
    // propósito — é destrutivo e vem da navegação, e o corte de contexto do sistema é a mensagem.
    Alert.alert(t('bout.leaveTitle'), t('bout.leaveMessage'), [
      { text: t('bout.leaveStay'), style: 'cancel' },
      {
        text: t('bout.leaveDiscard'),
        style: 'destructive',
        onPress: () => router.replace('/poule'),
      },
    ]);
  };

  if (!bout || !poule) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text>{t('bout.notFound')}</Text>
          <Button label={t('bout.back')} onPress={() => router.replace('/poule')} />
        </View>
      </Screen>
    );
  }

  const nameOf = (side: Side) => (side === 'a' ? bout.fencer_a.name : bout.fencer_b.name);

  const action = nextClockAction({
    phase,
    period,
    timing,
    expired: timer.state === 'expired',
    tied: rules.a === rules.b,
  });

  const onAction = () => {
    if (!action) return;

    if (action.kind === 'rest') {
      setResting(true);
      return;
    }

    if (action.kind === 'nextPeriod') {
      setResting(false);
      setPeriod(action.period);
      return;
    }

    // A piscadela mostra o sorteio a acontecer, como nos aparelhos da FIE. A marca fixa-se no
    // atleta sorteado quando ela pára — daí não haver aqui nenhum aviso escrito.
    priorityDraw.start();
  };

  const onSubmit = () => {
    recordScore(bout.id, rules.a, rules.b);
    setSheet('none');
    router.replace('/poule');
  };

  const cardsOf = (side: Side): Record<CardKind, number> => ({
    yellow: cardCount(rules, side, 'yellow'),
    red: cardCount(rules, side, 'red'),
    black: cardCount(rules, side, 'black'),
  });

  /**
   * Um toque ou um cartão é sempre precedido de "halt": param o cronómetro, e reiniciam o minuto
   * de passividade. Fica aqui e não no redutor porque mexe no cronómetro, que é um hook.
   */
  const registerCombat = () => {
    if (timer.state === 'running') timer.toggle();
    setCombatToken((token) => token + 1);
  };

  const setScore = (side: Side) => (value: number) => {
    registerCombat();
    dispatch({ type: 'touch', side, delta: value > rules[side] ? 1 : -1 });
  };

  const giveCard = (side: Side) => (kind: CardKind) => {
    registerCombat();
    dispatch({ type: 'card', side, kind });
  };

  const submittable = canSubmit(rules);
  const deciding = needsDecidingTouch(rules);
  const decided = winner(rules);

  const clock = (
    <Clock
      timer={timer}
      durationSeconds={durationSeconds}
      phase={phase}
      period={period}
      timing={timing}
      priorityName={rules.priority ? nameOf(rules.priority) : null}
      passivityMs={phase === 'rest' ? null : passivity.remainingMs}
      action={action}
      onAction={onAction}
      onNudge={timer.adjust}
      onEditTime={() => {
        setTimeSnapshotMs(timer.remainingMs);
        setSheet('time');
      }}
      compact={landscape}
    />
  );

  const columns = (['a', 'b'] as const).map((side) => (
    <ScoreColumn
      key={side}
      fencer={side === 'a' ? bout.fencer_a : bout.fencer_b}
      score={rules[side]}
      opponentScore={side === 'a' ? rules.b : rules.a}
      target={target}
      cards={cardsOf(side)}
      hasPriority={rules.priority === side}
      flashingPriority={priorityDraw.flashing === side}
      onChange={setScore(side)}
      onCard={giveCard(side)}
      compact={landscape}
    />
  ));

  const submit = (
    <Button
      label={t('bout.submit')}
      size="compact"
      onPress={() => setSheet('submit')}
      // Desativado chega: o resultado empatado está nos dois números grandes, logo ali por cima.
      // Quando a prioridade entra em jogo, o banner explica o que falta.
      disabled={!submittable}
    />
  );

  const undo = rules.cards.length > 0 && (
    <Button
      label={t('bout.cards.undo')}
      variant="secondary"
      size="compact"
      onPress={() => dispatch({ type: 'undoCard' })}
    />
  );

  return (
    // Deitado, o *notch* e a barra de gestos passam para os lados: sem as arestas laterais, a
    // coluna da esquerda fica por baixo do recorte do ecrã.
    <Screen edges={landscape ? ['top', 'bottom', 'left', 'right'] : ['top', 'bottom']}>
      <View style={[styles.header, landscape ? styles.headerCompact : null]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('bout.back')}
          onPress={onLeave}
          style={({ pressed }) => [styles.backButton, pressed ? styles.backPressed : null]}
        >
          <View style={styles.chevron} />
        </Pressable>

        <Text variant="title" style={styles.headerTitle} numberOfLines={1}>
          {t('bout.title', { sequence: bout.sequence })}
        </Text>

        <View style={styles.targetChip}>
          <Text variant="caption" color={colors.dark} style={styles.targetLabel}>
            {t('bout.target', { target })}
          </Text>
        </View>
      </View>

      {deciding && decided ? (
        <View style={styles.banner}>
          <Banner
            tone="warning"
            compact={landscape}
            message={t('bout.priority.decidingTouch', { name: nameOf(decided) })}
          />
        </View>
      ) : null}

      {landscape ? (
        <View style={styles.landscape}>
          <View style={styles.landscapeColumn}>{columns[0]}</View>
          <View style={styles.landscapeClock}>
            <View style={styles.landscapeClockSlot}>{clock}</View>
            <View style={styles.landscapeActions}>
              {undo ? <View style={styles.landscapeAction}>{undo}</View> : null}
              <View style={styles.landscapeAction}>{submit}</View>
            </View>
          </View>
          <View style={styles.landscapeColumn}>{columns[1]}</View>
        </View>
      ) : (
        <>
          {clock}
          <View style={styles.scoreArea}>{columns}</View>
          <View style={styles.actions}>
            {undo}
            {submit}
          </View>
        </>
      )}

      <TimeSheet
        visible={sheet === 'time'}
        remainingMs={timeSnapshotMs}
        durationSeconds={durationSeconds}
        onApply={(ms) => {
          timer.set(ms);
          setSheet('none');
        }}
        onReset={() => {
          timer.reset();
          setSheet('none');
        }}
        onClose={() => setSheet('none')}
      />

      <Sheet
        visible={sheet === 'submit'}
        title={t('bout.confirmTitle')}
        subtitle={decided ? t('bout.confirmMessage', { winner: nameOf(decided) }) : undefined}
        onClose={() => setSheet('none')}
        actions={
          <>
            <Button label={t('bout.confirmYes')} onPress={onSubmit} />
            <Button
              label={t('bout.confirmNo')}
              variant="secondary"
              onPress={() => setSheet('none')}
            />
          </>
        }
      >
        <ScoreRecap bout={bout} scoreA={rules.a} scoreB={rules.b} />
      </Sheet>
    </Screen>
  );
}

interface ScoreRecapProps {
  bout: { fencer_a: { name: string }; fencer_b: { name: string } };
  scoreA: number;
  scoreB: number;
}

/** O resultado outra vez, em grande. Registar não tem desfazer — vale a pena relê-lo. */
function ScoreRecap({ bout, scoreA, scoreB }: ScoreRecapProps) {
  return (
    <View style={styles.recap}>
      <RecapSide name={bout.fencer_a.name} score={scoreA} leading={scoreA > scoreB} />
      <Text style={styles.recapDash}>–</Text>
      <RecapSide name={bout.fencer_b.name} score={scoreB} leading={scoreB > scoreA} />
    </View>
  );
}

function RecapSide({ name, score, leading }: { name: string; score: number; leading: boolean }) {
  return (
    <View style={styles.recapSide}>
      <Text style={[styles.recapScore, leading ? styles.recapScoreLeading : null]}>{score}</Text>
      <Text variant="caption" color={colors.textMuted} numberOfLines={1} style={styles.recapName}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
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
  targetChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.grayLight,
    borderWidth: 1,
    borderColor: colors.grayMedium,
  },
  targetLabel: {
    fontFamily: fonts.workSansBold,
  },
  banner: {
    marginBottom: spacing.sm,
  },
  scoreArea: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  actions: {
    gap: spacing.sm,
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
    // O cronómetro ao centro do espaço que sobra. Encostado ao topo, deixava um buraco no meio da
    // coluna do meio que não existe nas colunas dos lados.
    flex: 1,
    justifyContent: 'center',
  },
  landscapeActions: {
    // Lado a lado, e não empilhados: a altura de um telemóvel deitado não chega para dois botões
    // por baixo de um cronómetro.
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  landscapeAction: {
    flex: 1,
  },
  recap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: spacing.md,
  },
  recapSide: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  recapScore: {
    fontFamily: fonts.montserrat,
    fontSize: type.display + 8,
    lineHeight: (type.display + 8) * 1.1,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  recapScoreLeading: {
    color: colors.dark,
  },
  recapName: {
    textAlign: 'center',
  },
  recapDash: {
    fontFamily: fonts.montserrat,
    fontSize: type.xxl,
    color: colors.grayDark,
    marginTop: spacing.sm,
  },
});
