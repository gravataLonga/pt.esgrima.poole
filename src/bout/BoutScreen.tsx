import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useRefereeingPollingMode } from '@/api/polling';
import type { Fencer, ScoreConflictCurrent } from '@/api/types';
import { submitScore, type SubmitResult } from '@/queue/submit';
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

import { Clock } from './Clock';
import { ScoreColumn } from './ScoreColumn';
import { TimeSheet } from './TimeSheet';
import { useAllowLandscape, useIsLandscape } from './orientation';
import type { BoutTiming } from './phase';
import { canSubmit, cardCount, needsDecidingTouch, winner, type CardKind, type Side } from './rules';
import { useBoutEngine } from './useBoutEngine';

/**
 * O que este ecrã precisa de saber para conduzir um assalto, seja ele de poule ou de quadro.
 *
 * O contrato §7 diz que a app arbitra os dois "no mesmo ecrã de assalto", e é literal: a única
 * diferença é o URL para onde o resultado vai e o texto do cabeçalho. Tudo o resto — cronómetro,
 * toques, cartões, prioridade, empate — é regra de esgrima, e essa não sabe em que fase está.
 */
export interface BoutAssignment {
  kind: 'bout' | 'match';
  /** Id opaco, tal como veio da API. */
  id: string;
  title: string;
  fencerA: Fencer | null;
  fencerB: Fencer | null;
  /** Toques que terminam o assalto — `target` da API, nunca hardcoded. */
  target: number;
  timing: BoutTiming;
  scoreA: number | null;
  scoreB: number | null;
  /** `true` → só leitura: a poule fechou, ou o quadro está decidido. */
  locked: boolean;
  competitionUuid: string;
}

export interface BoutScreenProps {
  assignment: BoutAssignment | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** Para onde se volta: a lista de assaltos ou o quadro. */
  home: Href;
  /** `POST .../start`, *fire-and-forget*: falhar não bloqueia a arbitragem (contrato §7). */
  onStart: () => void;
  /** Chamado depois de o servidor confirmar, para as listas se atualizarem. */
  onRecorded: () => void;
}

type SheetKind = 'none' | 'time' | 'submit' | 'conflict';

/**
 * Carregar, falhar, ou arbitrar. A arbitragem em si vive num componente à parte e **só monta com
 * os presets em mão**.
 *
 * A razão é o motor do assalto: `useBoutEngine` fixa o alvo e o resultado de partida no primeiro
 * render e não tem por onde os mudar depois. Montá-lo antes de o `GET` de detalhe chegar deixava
 * um combate de quadro preso nos 5 toques da poule — o `+` desenhado até 15, e o contador a parar
 * nos 5. A `key` garante o mesmo entre dois assaltos: assalto novo, motor novo.
 */
export function BoutScreen(props: BoutScreenProps) {
  const { t } = useTranslation();
  const { assignment, loading, error, onRetry, home } = props;

  const goHome = () => router.replace(home);

  if (!assignment) {
    return (
      <Screen>
        <View style={styles.centered}>
          {loading ? (
            <>
              <Text variant="title">{t('bout.loading')}</Text>
              <Text color={colors.textMuted}>{t('bout.loadingHint')}</Text>
            </>
          ) : (
            <>
              <Text variant="title">{t('bout.notFound')}</Text>
              {error ? <Text color={colors.textMuted}>{describe(error)}</Text> : null}
              <Button label={t('common.retry')} onPress={onRetry} />
              <Button label={t('bout.back')} variant="secondary" onPress={goHome} />
            </>
          )}
        </View>
      </Screen>
    );
  }

  return <Refereeing {...props} key={assignment.id} assignment={assignment} />;
}

interface RefereeingProps extends Omit<BoutScreenProps, 'assignment'> {
  assignment: BoutAssignment;
}

function Refereeing({ assignment, home, onStart, onRecorded }: RefereeingProps) {
  const { t } = useTranslation();

  const engine = useBoutEngine({
    target: assignment.target,
    timing: assignment.timing,
    // Um assalto retomado abre com o que já lá estava — e um já registado mostra o resultado.
    initialA: assignment.scoreA ?? 0,
    initialB: assignment.scoreB ?? 0,
  });
  const { rules, timer } = engine;

  const [sheet, setSheet] = useState<SheetKind>('none');
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState<ScoreConflictCurrent | undefined>();
  const [problem, setProblem] = useState<string | null>(null);

  // O tempo com que a folha de acerto abre, fotografado no toque. Ler `timer.remainingMs` a cada
  // render remontava os campos dez vezes por segundo com o cronómetro a correr.
  const [timeSnapshotMs, setTimeSnapshotMs] = useState(0);

  useAllowLandscape();
  const landscape = useIsLandscape();

  // A lista continua montada por baixo deste ecrã. Enquanto o cronómetro corre, deixa de
  // revalidar — não se interrompe uma arbitragem para perguntar por uma lista que ninguém vê.
  useRefereeingPollingMode(timer.state === 'running');

  /**
   * O `start` sobe **uma vez**, no primeiro arranque do cronómetro (spec §7). É o que põe o
   * assalto em `in_progress` no widget "joga agora" da web; sem ele nenhum assalto sai de
   * `pending`. Repeti-lo a cada pausa/retoma seria ruído — e o endpoint é idempotente, mas o
   * pedido não é grátis.
   */
  const started = useRef(false);

  useEffect(() => {
    if (started.current || timer.state !== 'running' || assignment.locked) return;
    started.current = true;
    onStart();
  }, [timer.state, assignment.locked, onStart]);

  const touched = rules.a !== (assignment.scoreA ?? 0) || rules.b !== (assignment.scoreB ?? 0);

  const goHome = () => router.replace(home);

  const onLeave = () => {
    if (!touched) {
      goHome();
      return;
    }

    // Spec §6: sair com resultado por submeter pede confirmação. Fica no `Alert` nativo de
    // propósito — é destrutivo e vem da navegação, e o corte de contexto do sistema é a mensagem.
    Alert.alert(t('bout.leaveTitle'), t('bout.leaveMessage'), [
      { text: t('bout.leaveStay'), style: 'cancel' },
      { text: t('bout.leaveDiscard'), style: 'destructive', onPress: goHome },
    ]);
  };

  const nameOf = (side: Side): string =>
    (side === 'a' ? assignment.fencerA?.name : assignment.fencerB?.name) ?? t('bout.unknownFencer');

  const onConfirm = async () => {
    setSubmitting(true);
    setProblem(null);

    const result = await submitScore({
      kind: assignment.kind,
      targetId: assignment.id,
      a: rules.a,
      b: rules.b,
      competitionUuid: assignment.competitionUuid,
      label: `${nameOf('a')} vs ${nameOf('b')}`,
    });

    setSubmitting(false);
    handle(result);
  };

  const handle = (result: SubmitResult) => {
    switch (result.kind) {
      case 'recorded':
        setSheet('none');
        onRecorded();
        goHome();
        return;

      case 'queued':
      case 'unauthorized':
        // Não se finge que enviou (spec §8). O aviso vive na lista, onde o árbitro vai a seguir,
        // porque é lá que ele decide se continua a arbitrar ou se vai procurar rede.
        setSheet('none');
        goHome();
        return;

      case 'conflict':
        setConflict(result.current);
        setSheet('conflict');
        return;

      case 'gone':
        setSheet('none');
        setProblem(t('bout.error.gone'));
        onRecorded();
        return;

      case 'rejected':
        setSheet('none');
        setProblem(result.message);
    }
  };

  const cardsOf = (side: Side): Record<CardKind, number> => ({
    yellow: cardCount(rules, side, 'yellow'),
    red: cardCount(rules, side, 'red'),
    black: cardCount(rules, side, 'black'),
  });

  const target = assignment.target;
  const timing = assignment.timing;
  const submittable = canSubmit(rules) && !assignment.locked;
  const deciding = needsDecidingTouch(rules);
  const decided = winner(rules);

  const clock = (
    <Clock
      timer={timer}
      durationSeconds={engine.durationSeconds}
      phase={engine.phase}
      period={engine.period}
      timing={timing}
      priorityName={rules.priority ? nameOf(rules.priority) : null}
      passivityMs={engine.passivityMs}
      action={engine.action}
      onAction={engine.onAction}
      onNudge={timer.adjust}
      onEditTime={() => {
        setTimeSnapshotMs(timer.remainingMs);
        setSheet('time');
      }}
      compact={landscape}
    />
  );

  const columns = (['a', 'b'] as const).map((side) => {
    const fencer = side === 'a' ? assignment.fencerA : assignment.fencerB;

    return (
      <ScoreColumn
        key={side}
        label={fencer?.name ?? t('bout.unknownFencer')}
        number={fencer?.number ?? null}
        club={fencer?.club ?? null}
        tone={null}
        score={rules[side]}
        opponentScore={side === 'a' ? rules.b : rules.a}
        target={target}
        cards={cardsOf(side)}
        hasPriority={rules.priority === side}
        flashingPriority={engine.priorityDraw.flashing === side}
        onChange={engine.setScore(side)}
        onCard={engine.giveCard(side)}
        compact={landscape}
      />
    );
  });

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
      onPress={engine.undoCard}
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
          {assignment.title}
        </Text>

        <View style={styles.targetChip}>
          <Text variant="caption" color={colors.dark} style={styles.targetLabel}>
            {t('bout.target', { target })}
          </Text>
        </View>
      </View>

      {assignment.locked ? (
        <View style={styles.banner}>
          <Banner tone="warning" compact={landscape} message={t('bout.locked')} />
        </View>
      ) : null}

      {problem ? (
        <View style={styles.banner}>
          <Banner tone="danger" compact={landscape} message={problem} />
        </View>
      ) : null}

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
        durationSeconds={engine.durationSeconds}
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
        onClose={() => (submitting ? undefined : setSheet('none'))}
        actions={
          <>
            <Button
              label={submitting ? t('bout.confirmSending') : t('bout.confirmYes')}
              onPress={() => void onConfirm()}
              disabled={submitting}
            />
            <Button
              label={t('bout.confirmNo')}
              variant="secondary"
              onPress={() => setSheet('none')}
              disabled={submitting}
            />
          </>
        }
      >
        <ScoreRecap
          nameA={nameOf('a')}
          nameB={nameOf('b')}
          scoreA={rules.a}
          scoreB={rules.b}
        />
      </Sheet>

      {/* Conflito (spec §6, ecrã 4): folha modal, não ecrã. Sem opção de forçar — corrigir um
          resultado é trabalho da plataforma web. */}
      <Sheet
        visible={sheet === 'conflict'}
        title={t('bout.conflict.title')}
        subtitle={conflictMessage(conflict, t)}
        onClose={() => setSheet('none')}
        actions={
          <>
            <Button
              label={t('bout.conflict.backToList')}
              onPress={() => {
                onRecorded();
                goHome();
              }}
            />
            <Button
              label={t('bout.conflict.stay')}
              variant="secondary"
              onPress={() => setSheet('none')}
            />
          </>
        }
      />
    </Screen>
  );
}

/**
 * O que se diz ao árbitro sobre o resultado que ganhou a corrida.
 *
 * Três formas, porque há três coisas diferentes que se podem saber. O `scored_at` pode vir `null`
 * mesmo num assalto pontuado (contrato §12): nesse caso mostra-se o resultado sem hora, em vez de
 * uma frase que acaba em "às .".
 */
function conflictMessage(
  current: ScoreConflictCurrent | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!current || current.score_a === null || current.score_b === null) {
    return t('bout.conflict.messageUnknown');
  }

  const time = formatTime(current.scored_at);
  const score = { a: current.score_a, b: current.score_b };

  return time
    ? t('bout.conflict.message', { ...score, time })
    : t('bout.conflict.messageNoTime', score);
}

/** A hora do resultado que ganhou, em relógio local — quem lê está no pavilhão, não em UTC. */
function formatTime(iso: string | null): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ScoreRecapProps {
  nameA: string;
  nameB: string;
  scoreA: number;
  scoreB: number;
}

/** O resultado outra vez, em grande. Registar não tem desfazer — vale a pena relê-lo. */
function ScoreRecap({ nameA, nameB, scoreA, scoreB }: ScoreRecapProps) {
  return (
    <View style={styles.recap}>
      <RecapSide name={nameA} score={scoreA} leading={scoreA > scoreB} />
      <Text style={styles.recapDash}>–</Text>
      <RecapSide name={nameB} score={scoreB} leading={scoreB > scoreA} />
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
