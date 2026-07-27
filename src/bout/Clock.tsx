import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TENTHS_THRESHOLD_MS, formatClock, formatCountdown } from '@/timer/format';
import type { Timer } from '@/timer/useTimer';
import {
  Button,
  DotDisplay,
  ProgressBar,
  Text,
  colors,
  columnsFor,
  fonts,
  radius,
  shadow,
  spacing,
  type,
} from '@/ui';

import type { BoutPhase, BoutTiming, ClockAction } from './phase';

/** Quanto os botões de acerto somam ou tiram de cada vez. */
export const NUDGE_MS = 10_000;

/**
 * A largura do mostrador é sempre a do formato mais comprido — o dos décimos. Reservada de uma vez,
 * os algarismos mantêm o tamanho quando o cronómetro cruza os 10 s e passa de `MM:SS` a `M:SS,d`.
 */
const CLOCK_COLUMNS = Math.max(columnsFor('00:00'), columnsFor('0:00,0'));

export interface ClockProps {
  timer: Timer;
  durationSeconds: number;
  phase: BoutPhase;
  /** Período atual, 1..periods. */
  period: number;
  timing: BoutTiming;
  /** Relógio de passividade. `null` nas fases em que não se conta (descanso). */
  passivityMs: number | null;
  /** O passo seguinte do assalto, ou `null` se não houver. */
  action: ClockAction | null;
  onAction: () => void;
  onNudge: (deltaMs: number) => void;
  onEditTime: () => void;
  /** Entrar em descanso a meio de um período. `null` onde não há intervalo que valha. */
  onStartRest?: (() => void) | null;
  /** Mudar de período à mão. `null` num assalto de um período só. */
  onGoToPeriod?: ((period: number) => void) | null;
  compact?: boolean;
}

/**
 * O mostrador **é** o botão de iniciar/parar (spec §7), com o alvo tocável a ocupar o cartão
 * inteiro — muito acima dos 96 pt exigidos.
 *
 * Por baixo, duas linhas e nunca mais: acertar o tempo (`−10 s`, `Acertar`, `+10 s`) e **um só**
 * passo seguinte, que muda com a fase. O `Repor` mudou-se para dentro do "Acertar": estava colado
 * ao mostrador, era o único botão da linha e ficava a ocupar a largura toda por nada.
 */
export function Clock({
  timer,
  durationSeconds,
  phase,
  period,
  timing,
  passivityMs,
  action,
  onAction,
  onNudge,
  onEditTime,
  onStartRest = null,
  onGoToPeriod = null,
  compact = false,
}: ClockProps) {
  const { t } = useTranslation();

  const durationMs = durationSeconds * 1000;
  const running = timer.state === 'running';
  const expired = timer.state === 'expired';
  const critical = !expired && timer.remainingMs < TENTHS_THRESHOLD_MS;
  const elapsed = durationMs > 0 ? 1 - timer.remainingMs / durationMs : 1;

  const clockText = formatClock(timer.remainingMs);
  // Verde é a cor de repouso do mostrador — é a do relógio nos marcadores da FIE, e no painel preto
  // é a que se lê de mais longe. O descanso apaga-a de propósito: aí o tempo que corre não é o do
  // assalto, e um mostrador verde a contar dizia o contrário.
  const clockColor = expired
    ? colors.danger
    : critical
      ? colors.warning
      : phase === 'rest'
        ? colors.textMutedOnDark
        : colors.green;
  const barColor = expired ? colors.danger : critical ? colors.warning : colors.green;
  const restButton = onStartRest !== null && action?.kind !== 'rest';

  return (
    <View style={styles.block}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('bout.timer.label')}
        accessibilityHint={t(`bout.timer.${timer.state}`)}
        accessibilityState={{ disabled: expired }}
        onPress={timer.toggle}
        disabled={expired}
        style={({ pressed }) => [
          styles.card,
          compact ? styles.cardCompact : null,
          expired ? styles.cardExpired : null,
          phase === 'rest' ? styles.cardRest : null,
          phase === 'priority' ? styles.cardSuddenDeath : null,
          pressed && !expired ? styles.cardPressed : null,
        ]}
      >
        {running ? <RunningPulse /> : null}

        {passivityMs === null ? null : <Passivity remainingMs={passivityMs} />}

        <PhaseHeader
          phase={phase}
          period={period}
          timing={timing}
          onGoToPeriod={onGoToPeriod}
        />

        <DotDisplay
          value={clockText}
          label={clockText}
          color={clockColor}
          reserveColumns={CLOCK_COLUMNS}
          style={compact ? styles.displayCompact : styles.display}
        />

        <ProgressBar value={elapsed} color={barColor} trackColor={colors.darkBorder} />

        {/* Só o símbolo, a canto. "Em pausa — tocar para continuar" por baixo de um mostrador que
            já é o botão era explicar o óbvio a ocupar uma linha; e a borda verde já diz, de longe,
            que o tempo corre. O texto continua a existir como `accessibilityHint`, que é onde ele
            serve para alguma coisa. Nada quando esgota: aí não há nada para premir. */}
        {expired ? null : (
          <View style={styles.stateGlyph}>{running ? <PauseGlyph /> : <PlayGlyph />}</View>
        )}
      </Pressable>

      {/* Acertar o tempo é trabalho miúdo — o botão grande deste ecrã é o mostrador. Daí o `small`,
          que encolhe o desenho e devolve o alvo tocável em `hitSlop`. */}
      <View style={styles.nudgeRow}>
        <View style={styles.nudge}>
          <Button
            label={t('bout.time.minus', { seconds: NUDGE_MS / 1000 })}
            variant="secondary"
            size="small"
            onPress={() => onNudge(-NUDGE_MS)}
            disabled={timer.remainingMs <= 0}
          />
        </View>
        <View style={styles.nudge}>
          {/* Desativado a correr: os campos abrem com o tempo que falta, e esse valor muda dez
              vezes por segundo — a folha remontava debaixo do dedo. O `±10 s` continua a servir
              para acertar sem parar. */}
          <Button
            label={t('bout.time.edit')}
            variant="secondary"
            size="small"
            onPress={onEditTime}
            disabled={running}
          />
        </View>
        <View style={styles.nudge}>
          <Button
            label={t('bout.time.plus', { seconds: NUDGE_MS / 1000 })}
            variant="secondary"
            size="small"
            onPress={() => onNudge(NUDGE_MS)}
          />
        </View>
      </View>

      {/* O descanso pedido pelo árbitro desaparece no instante em que o passo seguinte já é ele —
          dois botões com a mesma palavra, lado a lado, era escolher entre o mesmo e o mesmo. */}
      {restButton || action ? (
        <View style={styles.actionRow}>
          {restButton ? (
            <View style={styles.action}>
              <Button
                label={t('bout.phase.startRest')}
                variant="secondary"
                size="compact"
                onPress={onStartRest ?? undefined}
              />
            </View>
          ) : null}
          {action ? (
            <View style={styles.action}>
              <Button label={actionLabel(action, t)} size="compact" onPress={onAction} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A borda a respirar enquanto o tempo corre.
 *
 * Verde fixo dizia "a correr" tão bem como dizia "parado com uma borda verde" — a 2 m e de relance,
 * uma cor estática não tem estado. O que se lê à distância é **movimento**, e é a única coisa no
 * ecrã que se mexe sozinha quando o cronómetro anda.
 *
 * Vive numa camada por cima da borda do painel, e não na borda dela: animar `borderColor` obrigava
 * a largar o *native driver* e a passar cada fotograma pela ponte JS, ao lado de um cronómetro que
 * já re-renderiza a 20 Hz. `opacity` anima-se no lado nativo e não custa nada.
 */
function RunningPulse() {
  // `useState` e não `useRef`: o valor animado é lido no estilo, e as regras do React Compiler
  // proíbem ler `.current` no render. Mesma razão do ADR-008.
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.2,
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return <Animated.View pointerEvents="none" style={[styles.pulse, { opacity: pulse }]} />;
}

/**
 * O minuto de não combatividade (FIE t.87), ao canto oposto do play/pausa. Chegar a zero **não**
 * faz nada — só passa a laranja. Dar o P-cartão é decisão do árbitro, e dá-se pelos cartões
 * normais; automatizá-lo seria arbitrar por ele.
 */
function Passivity({ remainingMs }: { remainingMs: number }) {
  const { t } = useTranslation();
  const expired = remainingMs <= 0;

  return (
    <View
      accessible
      accessibilityLabel={t('bout.passivity.label', {
        seconds: Math.ceil(Math.max(0, remainingMs) / 1000),
      })}
      style={[styles.passivity, expired ? styles.passivityExpired : null]}
    >
      <Text style={[styles.passivityTag, expired ? styles.passivityTextExpired : null]}>
        {t('bout.passivity.tag')}
      </Text>
      <Text style={[styles.passivityTime, expired ? styles.passivityTextExpired : null]}>
        {formatCountdown(remainingMs)}
      </Text>
    </View>
  );
}

type Translate = ReturnType<typeof useTranslation>['t'];

function actionLabel(action: ClockAction, t: Translate): string {
  if (action.kind === 'rest') return t('bout.phase.startRest');
  if (action.kind === 'drawPriority') return t('bout.priority.draw');
  return t('bout.phase.startPeriod', { period: action.period });
}

interface PhaseHeaderProps {
  phase: BoutPhase;
  period: number;
  timing: BoutTiming;
  onGoToPeriod: ((period: number) => void) | null;
}

/**
 * Em que ponto do assalto se está — **sempre** visível.
 *
 * Num período são só os pontos, sem texto: disputado, a decorrer e por disputar distinguem-se pela
 * cor e pelo tamanho, e a palavra "tempo" repetida por cima de um cronómetro não acrescentava
 * nada. O rótulo continua a existir para o VoiceOver, que não vê cores. O descanso mantém texto
 * porque aí a diferença **não** é de contagem, é de natureza.
 */
function PhaseHeader({ phase, period, timing, onGoToPeriod }: PhaseHeaderProps) {
  const { t } = useTranslation();

  // Na morte súbita não vai texto nenhum para dentro do mostrador: a borda laranja diz a fase, e a
  // marca na coluna de quem tem prioridade diz o nome — escrito outra vez aqui, esbarrava no
  // relógio de passividade, que mora no mesmo canto. Fica só o espaço, para o painel não saltar.
  if (phase === 'priority') return <View style={styles.headerSpacer} />;

  if (phase === 'rest') {
    return (
      <View style={styles.headerRow}>
        <Text style={[styles.tag, styles.tagRest]}>{t('bout.phase.rest')}</Text>
        <Text style={styles.headerName} numberOfLines={1}>
          {t('bout.phase.beforePeriod', { period: period + 1 })}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.dotsRow}>
      {onGoToPeriod ? (
        <PeriodStep
          label={t('bout.period.previous')}
          direction="previous"
          disabled={period <= 1}
          onPress={() => onGoToPeriod(period - 1)}
        />
      ) : null}

      <View
        accessible
        accessibilityLabel={t('bout.period.label', { current: period, total: timing.periods })}
        style={styles.dots}
      >
        {Array.from({ length: timing.periods }, (_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index + 1 < period ? styles.dotPast : null,
              index + 1 === period ? styles.dotCurrent : null,
            ]}
          />
        ))}
      </View>

      {onGoToPeriod ? (
        <PeriodStep
          label={t('bout.period.next')}
          direction="next"
          disabled={period >= timing.periods}
          onPress={() => onGoToPeriod(period + 1)}
        />
      ) : null}
    </View>
  );
}

interface PeriodStepProps {
  label: string;
  direction: 'previous' | 'next';
  disabled: boolean;
  onPress: () => void;
}

/**
 * Recuar e avançar de período, aos lados dos pontos que já diziam em qual se está.
 *
 * Fica **dentro** do painel, e é onde tem de ficar: os pontos são a leitura, e os galhos são a
 * escrita da mesma coisa. Um `Pressable` dentro do mostrador não faz o mostrador arrancar — o
 * sistema de resposta ao toque dá o toque ao filho, e é o filho que o consome.
 */
function PeriodStep({ label, direction, disabled, onPress }: PeriodStepProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
      style={({ pressed }) => [styles.periodStep, pressed && !disabled ? styles.dimmed : null]}
    >
      <View
        style={[
          styles.periodChevron,
          direction === 'next' ? styles.periodChevronNext : styles.periodChevronPrevious,
          disabled ? styles.dimmed : null,
        ]}
      />
    </Pressable>
  );
}

/** Triângulo e barras desenhados com Views — não há biblioteca de ícones instalada. */
function PlayGlyph() {
  return <View style={styles.playGlyph} />;
}

function PauseGlyph() {
  return (
    <View style={styles.pauseGlyph}>
      <View style={styles.pauseBar} />
      <View style={styles.pauseBar} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
  /**
   * O mostrador é um **painel**, não um cartão: fundo preto, e a cor toda vinda dos pontos acesos.
   * É o que faz os algarismos parecerem LEDs em vez de texto grande, e é a única zona escura da
   * app — o resto do ecrã continua claro, como o resto do design system.
   *
   * O fundo **não muda com a fase**, ao contrário do que fazia em claro: um painel que muda de cor
   * de fundo não existe em aparelho nenhum. Quem diz a fase é a borda, e são os algarismos.
   */
  card: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.r16,
    borderWidth: 2,
    borderColor: colors.darkBorder,
    backgroundColor: colors.black,
    ...shadow.card,
  },
  cardCompact: {
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  // Encostada por fora à borda do painel — daí os `-2`, que é a espessura dela. Por dentro ficava
  // a flutuar dentro do preto, com uma linha escura entre as duas.
  pulse: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: radius.r16,
    borderWidth: 2,
    borderColor: colors.green,
  },
  cardExpired: {
    borderColor: colors.danger,
  },
  cardRest: {
    borderColor: colors.grayDark,
  },
  cardSuddenDeath: {
    borderColor: colors.warning,
  },
  // Premido, o painel esmorece. Trocar o fundo por um cinzento claro era a resposta em cartão
  // branco; num painel preto seria uma lâmpada a acender-se por se lhe tocar.
  cardPressed: {
    opacity: 0.75,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '100%',
  },
  tag: {
    fontFamily: fonts.workSansBold,
    fontSize: type.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMutedOnDark,
  },
  tagRest: {
    fontFamily: fonts.montserrat,
    color: colors.light,
  },
  // A altura que o cabeçalho ocupa quando não tem nada a dizer — a mesma dos pontos e do texto do
  // descanso, para o mostrador ficar sempre à mesma altura do cartão.
  headerSpacer: {
    minHeight: type.base,
  },
  headerName: {
    flexShrink: 1,
    fontFamily: fonts.workSansBold,
    fontSize: type.xs,
    color: colors.light,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: type.base,
  },
  periodStep: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodChevron: {
    width: 9,
    height: 9,
    borderColor: colors.textMutedOnDark,
    transform: [{ rotate: '45deg' }],
  },
  periodChevronPrevious: {
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    marginLeft: 3,
  },
  periodChevronNext: {
    borderRightWidth: 2,
    borderTopWidth: 2,
    marginRight: 3,
  },
  dimmed: {
    opacity: 0.35,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // Mesma altura do cabeçalho de texto do descanso e da morte súbita, para o mostrador não
    // saltar ao mudar de fase.
    minHeight: type.base,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    // Todos os pontos levam contorno: o preenchimento distingue os estados, mas é o contorno que
    // garante os 3:1 da WCAG 1.4.11 — no painel preto, um ponto por disputar sem contorno não
    // existe de todo.
    borderWidth: 1.5,
    borderColor: colors.textMutedOnDark,
    backgroundColor: 'transparent',
  },
  dotPast: {
    backgroundColor: colors.textMutedOnDark,
  },
  dotCurrent: {
    backgroundColor: colors.green,
    borderColor: colors.green,
    transform: [{ scale: 1.5 }],
  },
  /**
   * Altura do mostrador. O `DotDisplay` tira daqui e da largura do painel o tamanho do ponto — os
   * algarismos de pontos ficam com **mais** altura real do que a fonte a 88 pt, que gastava um
   * terço da caixa em espaço acima e abaixo dos números.
   */
  display: {
    alignSelf: 'stretch',
    height: type.timer,
  },
  displayCompact: {
    alignSelf: 'stretch',
    height: type.display + 28,
  },
  stateGlyph: {
    position: 'absolute',
    top: spacing.sm + 2,
    right: spacing.sm + 4,
  },
  passivity: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.r4,
    borderWidth: 1,
    borderColor: colors.darkBorder,
  },
  passivityExpired: {
    borderColor: colors.warning,
  },
  passivityTag: {
    fontFamily: fonts.montserrat,
    fontSize: type.xs,
    color: colors.textMutedOnDark,
  },
  passivityTime: {
    fontFamily: fonts.workSansBold,
    fontSize: type.xs,
    color: colors.textMutedOnDark,
    fontVariant: ['tabular-nums'],
  },
  passivityTextExpired: {
    color: colors.warning,
  },
  nudgeRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
  },
  nudge: {
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
  // Cinzento claro e não branco: o símbolo confirma o estado, não compete com os algarismos. Passa
  // os 3:1 da WCAG 1.4.11 sobre o painel.
  playGlyph: {
    width: 0,
    height: 0,
    borderTopWidth: 9,
    borderBottomWidth: 9,
    borderLeftWidth: 15,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.textMutedOnDark,
  },
  pauseGlyph: {
    flexDirection: 'row',
    gap: 4,
  },
  pauseBar: {
    width: 5,
    height: 18,
    borderRadius: 1,
    backgroundColor: colors.textMutedOnDark,
  },
});
