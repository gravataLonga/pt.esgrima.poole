import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TENTHS_THRESHOLD_MS, formatClock, formatCountdown } from '@/timer/format';
import type { Timer } from '@/timer/useTimer';
import { Button, ProgressBar, Text, colors, fonts, radius, shadow, spacing, type } from '@/ui';

import type { BoutPhase, BoutTiming, ClockAction } from './phase';

/** Quanto os botões de acerto somam ou tiram de cada vez. */
export const NUDGE_MS = 10_000;

export interface ClockProps {
  timer: Timer;
  durationSeconds: number;
  phase: BoutPhase;
  /** Período atual, 1..periods. */
  period: number;
  timing: BoutTiming;
  /** Nome de quem tem prioridade. `null` fora da morte súbita. */
  priorityName: string | null;
  /** Relógio de passividade. `null` nas fases em que não se conta (descanso). */
  passivityMs: number | null;
  /** O passo seguinte do assalto, ou `null` se não houver. */
  action: ClockAction | null;
  onAction: () => void;
  onNudge: (deltaMs: number) => void;
  onEditTime: () => void;
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
  priorityName,
  passivityMs,
  action,
  onAction,
  onNudge,
  onEditTime,
  compact = false,
}: ClockProps) {
  const { t } = useTranslation();

  const durationMs = durationSeconds * 1000;
  const running = timer.state === 'running';
  const expired = timer.state === 'expired';
  const critical = !expired && timer.remainingMs < TENTHS_THRESHOLD_MS;
  const elapsed = durationMs > 0 ? 1 - timer.remainingMs / durationMs : 1;

  const clockColor = expired ? colors.danger : critical ? colors.warning : colors.dark;
  const barColor = expired ? colors.danger : critical ? colors.warning : colors.green;

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
          running ? styles.cardRunning : null,
          expired ? styles.cardExpired : null,
          phase === 'rest' ? styles.cardRest : null,
          phase === 'priority' ? styles.cardSuddenDeath : null,
          pressed && !expired ? styles.cardPressed : null,
        ]}
      >
        {passivityMs === null ? null : <Passivity remainingMs={passivityMs} />}

        <PhaseHeader phase={phase} period={period} timing={timing} priorityName={priorityName} />

        <Text style={[styles.clock, compact ? styles.clockCompact : null, { color: clockColor }]}>
          {formatClock(timer.remainingMs)}
        </Text>

        <ProgressBar value={elapsed} color={barColor} />

        {/* Só o símbolo, a canto. "Em pausa — tocar para continuar" por baixo de um mostrador que
            já é o botão era explicar o óbvio a ocupar uma linha; e a borda verde já diz, de longe,
            que o tempo corre. O texto continua a existir como `accessibilityHint`, que é onde ele
            serve para alguma coisa. Nada quando esgota: aí não há nada para premir. */}
        {expired ? null : (
          <View style={styles.stateGlyph}>{running ? <PauseGlyph /> : <PlayGlyph />}</View>
        )}
      </Pressable>

      <View style={styles.nudgeRow}>
        <View style={styles.nudge}>
          <Button
            label={t('bout.time.minus', { seconds: NUDGE_MS / 1000 })}
            variant="secondary"
            size="compact"
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
            size="compact"
            onPress={onEditTime}
            disabled={running}
          />
        </View>
        <View style={styles.nudge}>
          <Button
            label={t('bout.time.plus', { seconds: NUDGE_MS / 1000 })}
            variant="secondary"
            size="compact"
            onPress={() => onNudge(NUDGE_MS)}
          />
        </View>
      </View>

      {action ? <Button label={actionLabel(action, t)} size="compact" onPress={onAction} /> : null}
    </View>
  );
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
  priorityName: string | null;
}

/**
 * Em que ponto do assalto se está — **sempre** visível.
 *
 * Num período são só os pontos, sem texto: disputado, a decorrer e por disputar distinguem-se pela
 * cor e pelo tamanho, e a palavra "tempo" repetida por cima de um cronómetro não acrescentava
 * nada. O rótulo continua a existir para o VoiceOver, que não vê cores. Descanso e morte súbita
 * mantêm texto porque aí a diferença **não** é de contagem, é de natureza.
 */
function PhaseHeader({ phase, period, timing, priorityName }: PhaseHeaderProps) {
  const { t } = useTranslation();

  if (phase === 'priority' && priorityName) {
    return (
      <View style={styles.headerRow}>
        <Text style={[styles.tag, styles.tagSuddenDeath]}>{t('bout.priority.suddenDeath')}</Text>
        <Text style={styles.headerName} numberOfLines={1}>
          {t('bout.priority.holder', { name: priorityName })}
        </Text>
      </View>
    );
  }

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
  card: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.r16,
    borderWidth: 2,
    borderColor: colors.grayMedium,
    backgroundColor: colors.light,
    ...shadow.card,
  },
  cardCompact: {
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  cardRunning: {
    borderColor: colors.green,
  },
  cardExpired: {
    borderColor: colors.danger,
    backgroundColor: colors.lightDanger,
  },
  cardRest: {
    borderColor: colors.grayDark,
    backgroundColor: colors.grayLight,
  },
  cardSuddenDeath: {
    borderColor: colors.warning,
    backgroundColor: colors.lightWarning,
  },
  cardPressed: {
    backgroundColor: colors.grayLight,
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
    color: colors.textMuted,
  },
  tagRest: {
    fontFamily: fonts.montserrat,
    color: colors.dark,
  },
  tagSuddenDeath: {
    fontFamily: fonts.montserrat,
    color: colors.warningText,
  },
  headerName: {
    flexShrink: 1,
    fontFamily: fonts.workSansBold,
    fontSize: type.xs,
    color: colors.dark,
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
    // Todos os pontos levam contorno escuro: o preenchimento distingue os estados, mas é o
    // contorno que garante os 3:1 da WCAG 1.4.11 — o verde sozinho sobre branco dá 1.4.
    borderWidth: 1.5,
    borderColor: colors.dark,
    backgroundColor: 'transparent',
  },
  dotPast: {
    backgroundColor: colors.dark,
  },
  dotCurrent: {
    backgroundColor: colors.green,
    transform: [{ scale: 1.5 }],
  },
  clock: {
    fontFamily: fonts.montserrat,
    fontSize: type.timer,
    lineHeight: type.timer * 1.08,
    fontVariant: ['tabular-nums'],
  },
  clockCompact: {
    fontSize: type.display + 16,
    lineHeight: (type.display + 16) * 1.08,
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
    borderColor: colors.grayMedium,
  },
  passivityExpired: {
    borderColor: colors.warning,
    backgroundColor: colors.lightWarning,
  },
  passivityTag: {
    fontFamily: fonts.montserrat,
    fontSize: type.xs,
    color: colors.textMuted,
  },
  passivityTime: {
    fontFamily: fonts.workSansBold,
    fontSize: type.xs,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  passivityTextExpired: {
    color: colors.warningText,
  },
  nudgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  nudge: {
    flex: 1,
  },
  // `textMuted` e não `dark`: o símbolo confirma o estado, não compete com os dígitos. Passa os
  // 3:1 da WCAG 1.4.11 sobre os quatro fundos do mostrador.
  playGlyph: {
    width: 0,
    height: 0,
    borderTopWidth: 9,
    borderBottomWidth: 9,
    borderLeftWidth: 15,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.textMuted,
  },
  pauseGlyph: {
    flexDirection: 'row',
    gap: 4,
  },
  pauseBar: {
    width: 5,
    height: 18,
    borderRadius: 1,
    backgroundColor: colors.textMuted,
  },
});
