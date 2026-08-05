import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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

import { BoutInfo } from './BoutInfo';
import { Clock } from './Clock';
import { EventSheet } from './EventSheet';
import { PrioritySheet } from './PrioritySheet';
import { ScoreBoard } from './ScoreBoard';
import type { ScoreColumnProps } from './ScoreColumn';
import { TimeSheet } from './TimeSheet';
import { useAllowLandscape, useIsLandscape } from './orientation';
import type { BoutTiming } from './phase';
import { canSubmit, cardCount, winner, type CardKind, type Side } from './rules';
import { useBoutEngine } from './useBoutEngine';
import { useLiveEvents, type LiveEventSender } from './useLiveEvents';

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
  /**
   * `true` → o assalto está `in_progress` e **não foi este dispositivo** que o começou: a poule
   * está a ser arbitrada noutra pista com o mesmo código (contrato `2.2.0`).
   *
   * Vale um banner e mais nada. O contrato §6 fecha a porta a reservar ou atribuir assaltos, e o
   * que sobra — dois árbitros a submeterem o mesmo — está resolvido desde a `1.0.0`: o primeiro
   * leva o assalto e o segundo recebe o `409`, que já tem folha própria aqui.
   */
  startedElsewhere?: boolean;
}

/** O resultado tal como o árbitro o deu por bom — tenha ele chegado ao servidor ou à fila. */
export interface RecordedScore {
  a: number;
  b: number;
  /** `true` → ficou em fila à espera de rede. O resultado é o mesmo; o que falta é caminho. */
  queued: boolean;
}

export interface BoutScreenProps {
  assignment: BoutAssignment | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /**
   * Para onde se volta — a lista de assaltos da poule.
   *
   * **Ausente numa sessão de combate**, e é deliberado: não há lista por baixo. O combate *é* a
   * sessão (contrato §7), e as saídas dele são o "Sair" do cabeçalho e registar o resultado. Sem
   * isto, o galho de "voltar" apontava a um ecrã que já não existe.
   */
  back?: () => void;
  /** Linha por cima do título — a prova a que o combate pertence. */
  eyebrow?: string;
  /**
   * Barra de sessão e fila: o que a lista carrega numa poule e ninguém carrega num combate.
   * Só em *portrait* — deitado, o ecrã é do cronómetro e das duas colunas.
   */
  chrome?: ReactNode;
  /**
   * O que fica **ao lado do "?"**, no canto do cabeçalho — o "Sair" de uma sessão de combate.
   *
   * Existe porque os dois são o mesmo tipo de coisa: um círculo com um ícone, que se toca uma vez
   * por assalto ou uma vez por dia. Numa faixa própria por baixo do cabeçalho ficavam empilhados um
   * sobre o outro, dois círculos iguais em coluna, e a faixa gastava uma linha inteira do ecrã para
   * carregar um botão. Só em *portrait*, pela mesma razão do `chrome`.
   */
  action?: ReactNode;
  /** `POST .../start`, *fire-and-forget*: falhar não bloqueia a arbitragem (contrato §7). */
  onStart: () => void;
  /**
   * `DELETE .../start` (contrato `2.3.0`): o árbitro **saiu deste assalto sem resultado**, e a
   * pista fica livre. É a outra metade do `onStart`, e só se chama quando foi este dispositivo a
   * pôr o assalto em pista — de outro modo pedia-se a libertação do assalto do árbitro do lado.
   *
   * Só a app sabe isto, e sabe-o por navegação: do lado do servidor sair do ecrã não se distingue
   * de um telemóvel no bolso a meio de um assalto a sério. **Nunca depois de um resultado** — o
   * assalto acabou, não foi abandonado.
   */
  onRelease?: () => void;
  /**
   * `POST .../events`: a pista ao vivo (contrato §7, `1.5.0`). Opcional por construção — sem ela o
   * ecrã comporta-se exatamente como antes, e a plataforma volta a saber do assalto só no fim.
   */
  onEvents?: LiveEventSender;
  /** Chamado depois de o estado do servidor mudar, para as listas se atualizarem. */
  onRecorded: () => void;
  /**
   * O assalto acabou e o resultado é o do árbitro. **Quem decide para onde se vai é a rota**: a
   * lista, numa poule; o resumo da pista, num combate, onde registar o resultado encerra a sessão.
   * Ausente → volta-se pelo `back`, que é o comportamento de sempre.
   */
  onFinished?: (result: RecordedScore) => void;
}

type SheetKind = 'none' | 'time' | 'submit' | 'conflict' | 'events' | 'priority';

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
  const { assignment, loading, error, onRetry, back, chrome, action } = props;

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
              {/* Sem lista por baixo não há "voltar": o que resta é o "Sair", que termina a
                  sessão de vez em vez de fingir que há para onde ir. Aqui não há cabeçalho onde o
                  pôr, por isso vem com o resto do `chrome` — é a única saída deste ecrã. */}
              {back ? (
                <Button label={t('bout.back')} variant="secondary" onPress={back} />
              ) : (
                <>
                  {chrome}
                  {action ? <View style={styles.errorAction}>{action}</View> : null}
                </>
              )}
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

function Refereeing({
  assignment,
  back,
  eyebrow,
  chrome,
  action,
  onStart,
  onRelease,
  onEvents,
  onRecorded,
  onFinished,
}: RefereeingProps) {
  const { t } = useTranslation();

  // Num assalto fechado não há nada a espelhar: a escrita está travada dos dois lados, e o
  // servidor responderia `422 poule_locked` a cada toque de consulta.
  const live = useLiveEvents(assignment.locked ? null : (onEvents ?? null));

  const engine = useBoutEngine({
    target: assignment.target,
    timing: assignment.timing,
    // Um assalto retomado abre com o que já lá estava — e um já registado mostra o resultado.
    initialA: assignment.scoreA ?? 0,
    initialB: assignment.scoreB ?? 0,
    onEvent: live.record,
  });
  const { rules, timer } = engine;

  const [sheet, setSheet] = useState<SheetKind>('none');
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState<ScoreConflictCurrent | undefined>();
  const [problem, setProblem] = useState<string | null>(null);

  // O tempo com que a folha de acerto abre, fotografado no toque. Ler `timer.remainingMs` a cada
  // render remontava os campos dez vezes por segundo com o cronómetro a correr.
  const [timeSnapshotMs, setTimeSnapshotMs] = useState(0);

  // O ecrã não adormece enquanto se arbitra. Entre o fim de um período e o início do seguinte
  // passam-se minutos sem ninguém tocar no telemóvel, e o bloqueio a meio de um assalto custa o
  // tempo de o desbloquear — com uma mão, encostado à pista. Solta-se ao desmontar o ecrã.
  useKeepAwake();
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

  /**
   * ...e se ele ainda está de pé. Separado do `started` porque respondem a perguntas diferentes: um
   * impede um segundo `POST`, o outro diz se há alguma coisa para libertar à saída (contrato
   * `2.3.0`). Cai com o resultado — um assalto registado não se abandona.
   */
  const holding = useRef(false);

  useEffect(() => {
    if (started.current || timer.state !== 'running' || assignment.locked) return;
    started.current = true;
    holding.current = true;
    onStart();
  }, [timer.state, assignment.locked, onStart]);

  const touched = rules.a !== (assignment.scoreA ?? 0) || rules.b !== (assignment.scoreB ?? 0);

  /**
   * A pista fica livre. Só quando foi este dispositivo a ocupá-la: sem cronómetro arrancado não
   * subiu `start` nenhum, e pedir a libertação de um assalto que não é nosso é dizer a coisa errada.
   */
  const release = () => {
    if (!holding.current) return;
    holding.current = false;
    onRelease?.();
  };

  const onLeave = () => {
    if (!back) return;

    if (!touched) {
      release();
      back();
      return;
    }

    // Spec §6: sair com resultado por submeter pede confirmação. Fica no `Alert` nativo de
    // propósito — é destrutivo e vem da navegação, e o corte de contexto do sistema é a mensagem.
    Alert.alert(t('bout.leaveTitle'), t('bout.leaveMessage'), [
      { text: t('bout.leaveStay'), style: 'cancel' },
      {
        text: t('bout.leaveDiscard'),
        style: 'destructive',
        onPress: () => {
          release();
          back();
        },
      },
    ]);
  };

  /** Registado, ou guardado à espera de rede: nos dois casos o assalto acabou para o árbitro. */
  const finish = (queued: boolean) => {
    setSheet('none');
    // O assalto não fica por libertar: fica **pontuado**. Um resultado em fila também conta — é o
    // `score` que há de chegar que fecha o assalto, e libertá-lo agora era apagar-lhe os eventos e
    // pôr uma linha `abandoned` no registo do organizador por cima de um resultado que existe.
    holding.current = false;

    if (onFinished) onFinished({ a: rules.a, b: rules.b, queued });
    else back?.();
  };

  const nameOf = (side: Side): string =>
    (side === 'a' ? assignment.fencerA?.name : assignment.fencerB?.name) ?? t('bout.unknownFencer');

  const onConfirm = async () => {
    setSubmitting(true);
    setProblem(null);

    /*
     * A última linha da história do combate, antes do resultado (contrato `2.1.0`). É emitida a
     * cada confirmação e não uma só vez: um `rejected` devolve o árbitro ao assalto para corrigir e
     * submeter outra vez, e foram dois fins de combate declarados.
     *
     * O `live.discard()` que vem a seguir à submissão não a apanha — o `record` manda o lote de
     * imediato, e o que já vai em voo chega na mesma.
     */
    engine.end();

    const result = await submitScore({
      kind: assignment.kind,
      targetId: assignment.id,
      a: rules.a,
      b: rules.b,
      competitionUuid: assignment.competitionUuid,
      // O título do assalto, **não os nomes**. Este rótulo vai a disco com a fila e pode lá ficar
      // 24 h; a spec §9 não persiste dados pessoais. E é o mesmo texto que o árbitro tinha no
      // cabeçalho enquanto arbitrava, por isso identifica o assalto tão bem como os dois nomes.
      label: assignment.title,
    });

    setSubmitting(false);
    handle(result);
  };

  const handle = (result: SubmitResult) => {
    // O assalto acabou: o que ficou por espelhar deixa de interessar, e é o resultado que conta.
    // Guardá-lo à espera de rede era pôr uma linha temporal a competir com resultados por enviar
    // (spec §8) — só o `rejected` deixa o árbitro no assalto, a corrigir e a submeter outra vez.
    if (result.kind !== 'rejected') live.discard();

    switch (result.kind) {
      case 'recorded':
        onRecorded();
        finish(false);
        return;

      case 'queued':
      case 'unauthorized':
        // Não se finge que enviou (spec §8). O aviso viaja com o resultado, e é onde o árbitro vai
        // a seguir que ele decide se continua a arbitrar ou se vai procurar rede.
        finish(true);
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
  const decided = winner(rules);

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
      onPriority={() => setSheet('priority')}
      onNudge={timer.adjust}
      onEditTime={() => {
        setTimeSnapshotMs(timer.remainingMs);
        setSheet('time');
      }}
      onStartRest={engine.startRest}
      onGoToPeriod={engine.goToPeriod}
      compact={landscape}
    />
  );

  const columnFor = (side: Side): ScoreColumnProps => {
    const fencer = side === 'a' ? assignment.fencerA : assignment.fencerB;

    return {
      label: fencer?.name ?? t('bout.unknownFencer'),
      number: fencer?.number ?? null,
      club: fencer?.club ?? null,
      tone: null,
      score: rules[side],
      opponentScore: side === 'a' ? rules.b : rules.a,
      target,
      cards: cardsOf(side),
      hasPriority: rules.priority === side,
      flashingPriority: engine.priorityDraw.flashing === side,
      onChange: engine.setScore(side),
      onCard: engine.giveCard(side),
      onUndoCard: (kind: CardKind) => engine.undoCard(side, kind),
      // Quem está à esquerda da pista encosta o nome à esquerda; quem está à direita, à direita.
      align: side === 'a' ? 'start' : 'end',
    };
  };

  const columns = { a: columnFor('a'), b: columnFor('b') };

  // Tecla preta de letras verdes: a ação que fecha o assalto fala a língua do mostrador que está
  // por cima dela, e não a do botão verde de uma lista.
  const submit = (
    <Button
      label={t('bout.submit')}
      variant="panel"
      size="compact"
      onPress={() => setSheet('submit')}
      // Desativado chega: o resultado empatado está nos dois números grandes, logo ali por cima —
      // também na morte súbita, onde o que falta é o toque que a decide.
      disabled={!submittable}
    />
  );

  const events = (
    <Button
      label={t('bout.events.open')}
      variant="secondary"
      size="compact"
      onPress={() => setSheet('events')}
    />
  );

  return (
    // Deitado, o *notch* e a barra de gestos passam para os lados: sem as arestas laterais, a
    // coluna da esquerda fica por baixo do recorte do ecrã.
    <Screen edges={landscape ? ['top', 'bottom', 'left', 'right'] : ['top', 'bottom']}>
      <View style={[styles.header, landscape ? styles.headerCompact : null]}>
        {/* Sem `back` não há galho: numa sessão de combate não existe ecrã por baixo deste. */}
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('bout.back')}
            onPress={onLeave}
            style={({ pressed }) => [styles.backButton, pressed ? styles.backPressed : null]}
          >
            <View style={styles.chevron} />
          </Pressable>
        ) : null}

        <View style={styles.headerTitles}>
          {eyebrow && !landscape ? (
            <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          <Text variant="title" style={styles.headerTitle} numberOfLines={1}>
            {assignment.title}
          </Text>
        </View>

        <BoutInfo timing={timing} target={target} />
        {/* Depois do "?", e por isso mais para fora: sair é a ação mais rara e a mais definitiva
            das duas, e é onde a lista de poule já a tem — no canto. */}
        {action && !landscape ? action : null}
      </View>

      {/* Deitado o ecrã é do cronómetro e das duas colunas: um banner de sessão ali rouba a
          altura que os dígitos precisam, e o árbitro está a olhar para a pista, não para a app. */}
      {chrome && !landscape ? <View style={styles.chrome}>{chrome}</View> : null}

      {assignment.locked ? (
        <View style={styles.banner}>
          <Banner tone="warning" compact={landscape} message={t('bout.locked')} />
        </View>
      ) : null}

      {/* Fechado ganha ao "está noutra pista": um assalto fechado já não se arbitra em lado
          nenhum, e dois banners a dizer coisas diferentes sobre o mesmo assalto é ruído. */}
      {assignment.startedElsewhere && !assignment.locked ? (
        <View style={styles.banner}>
          <Banner tone="warning" compact={landscape} message={t('bout.startedElsewhere')} />
        </View>
      ) : null}

      {problem ? (
        <View style={styles.banner}>
          <Banner tone="danger" compact={landscape} message={problem} />
        </View>
      ) : null}

      {landscape ? (
        <View style={styles.landscape}>
          <View style={styles.landscapeColumn}>
            <ScoreBoard sides={[columns.a]} compact />
          </View>
          <View style={styles.landscapeClock}>
            <View style={styles.landscapeClockSlot}>{clock}</View>
            <View style={styles.landscapeActions}>
              <View style={styles.landscapeAction}>{events}</View>
              <View style={styles.landscapeAction}>{submit}</View>
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
            <View style={styles.actionMain}>{submit}</View>
          </View>
        </>
      )}

      <EventSheet
        visible={sheet === 'events'}
        log={engine.log}
        timing={timing}
        nameOf={nameOf}
        onClose={() => setSheet('none')}
      />

      <PrioritySheet
        visible={sheet === 'priority'}
        current={rules.priority}
        fencerOf={(side) => {
          const fencer = side === 'a' ? assignment.fencerA : assignment.fencerB;
          return { name: fencer?.name ?? t('bout.unknownFencer'), club: fencer?.club ?? null };
        }}
        onDraw={() => {
          setSheet('none');
          engine.priorityDraw.start();
        }}
        onSet={(side) => {
          setSheet('none');
          engine.setPriority(side);
        }}
        onClose={() => setSheet('none')}
      />

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
        <ScoreRecap nameA={nameOf('a')} nameB={nameOf('b')} scoreA={rules.a} scoreB={rules.b} />
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
                setSheet('none');
                // O servidor tem outra verdade: reler é o que a traz. Numa poule volta-se à
                // lista; num combate o `401 poule_complete` da releitura leva ao resumo sozinho.
                onRecorded();
                back?.();
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
  /** Sem cabeçalho, o "Sair" fica onde os outros botões deste ecrã estão: ao centro. */
  errorAction: {
    alignItems: 'center',
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
  headerTitles: {
    flex: 1,
    // Sem isto, um nome de prova comprido empurra a marca de alvo para fora do ecrã.
    minWidth: 0,
  },
  headerTitle: {
    fontSize: type.xl,
  },
  chrome: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  banner: {
    marginBottom: spacing.sm,
  },
  /** Consultar e registar na mesma linha, com o peso trocado: ver é uma escapadela, registar é o fim. */
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
