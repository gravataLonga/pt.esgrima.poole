import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { Fencer } from '@/api/types';
import { Text, colors, fonts, radius, spacing, touch, type } from '@/ui';

import { BLACK_CARD_LIMIT, type CardKind } from './rules';

export interface ScoreColumnProps {
  fencer: Fencer;
  score: number;
  opponentScore: number;
  target: number;
  /** Cartões já atribuídos a este atleta, por tipo. */
  cards: Record<CardKind, number>;
  /** `true` quando este atleta detém a prioridade da morte súbita. */
  hasPriority: boolean;
  /** `true` enquanto a piscadela do sorteio está neste atleta. */
  flashingPriority?: boolean;
  onChange: (value: number) => void;
  onCard: (kind: CardKind) => void;
  /** Layout apertado, para landscape: nome numa linha e menos respiração vertical. */
  compact?: boolean;
}

const CARD_KINDS: CardKind[] = ['yellow', 'red', 'black'];

export function ScoreColumn({
  fencer,
  score,
  opponentScore,
  target,
  cards,
  hasPriority,
  flashingPriority = false,
  onChange,
  onCard,
  compact = false,
}: ScoreColumnProps) {
  const { t } = useTranslation();

  const atTarget = score >= target;
  const leading = score > opponentScore;

  return (
    <View style={[styles.column, leading ? styles.columnLeading : null]}>
      {/* Altura fixa: sem isto, um nome que quebra para duas linhas desalinha as duas colunas. */}
      <View style={[styles.nameBlock, compact ? styles.nameBlockCompact : null]}>
        <View style={styles.nameRow}>
          <View style={styles.numberChip}>
            <Text variant="caption" color={colors.light} style={styles.numberLabel}>
              {fencer.number}
            </Text>
          </View>
          {hasPriority || flashingPriority ? (
            <PriorityChip name={fencer.name} settled={hasPriority} />
          ) : null}
        </View>

        <Text
          variant="label"
          numberOfLines={compact ? 1 : 2}
          style={[styles.fencerName, compact ? styles.fencerNameCompact : null]}
        >
          {fencer.name}
        </Text>

        {compact ? null : (
          <Text variant="caption" numberOfLines={1}>
            {fencer.club ?? ''}
          </Text>
        )}
      </View>

      {/* O resultado é o que cede espaço quando a coluna aperta — um banner por cima chegava para
          empurrar os `+`/`−` para fora do cartão. Encolher o número é sempre melhor do que pôr os
          botões fora da caixa. */}
      <View style={styles.scoreSlot}>
        {/* Sozinho, o número grande é lido pelo VoiceOver como "5" — sem dizer de quem. */}
        <Text
          accessibilityLabel={t('bout.scoreLabel', { name: fencer.name, count: score })}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
          style={[
            styles.score,
            compact ? styles.scoreCompact : null,
            atTarget ? styles.scoreAtTarget : null,
          ]}
        >
          {score}
        </Text>
      </View>

      <CardStrip fencer={fencer} cards={cards} onCard={onCard} />

      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('bout.removeTouch', { name: fencer.name })}
          onPress={() => onChange(Math.max(0, score - 1))}
          disabled={score <= 0}
          style={({ pressed }) => [
            styles.stepperButton,
            compact ? styles.stepperButtonCompact : null,
            score <= 0 ? styles.stepperDisabled : null,
            pressed && score > 0 ? styles.stepperPressed : null,
          ]}
        >
          <View style={styles.minusBar} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('bout.addTouch', { name: fencer.name })}
          onPress={() => onChange(Math.min(target, score + 1))}
          disabled={score >= target}
          style={({ pressed }) => [
            styles.stepperButton,
            compact ? styles.stepperButtonCompact : null,
            styles.stepperPrimary,
            score >= target ? styles.stepperDisabled : null,
            pressed && score < target ? styles.stepperPressed : null,
          ]}
        >
          <View style={styles.plusVertical} />
          <View style={styles.plusHorizontal} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * A marca de prioridade. Fixa, pulsa devagar — é a lâmpada acesa do aparelho da FIE, e é o que
 * mantém visível, a meio da morte súbita, quem ganha se ninguém tocar.
 */
function PriorityChip({ name, settled }: { name: string; settled: boolean }) {
  const { t } = useTranslation();
  // `useState` e não `useRef`: as regras do React Compiler proíbem ler `.current` no render, e o
  // valor animado é lido no estilo. Mesma razão do ADR-008.
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!settled) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [pulse, settled]);

  return (
    <Animated.View
      accessibilityLabel={t('bout.priority.badgeLabel', { name })}
      style={[styles.priorityChip, settled ? { opacity: pulse } : null]}
    >
      <Text style={styles.priorityLabel}>{t('bout.priority.badge')}</Text>
    </Animated.View>
  );
}

interface CardStripProps {
  fencer: Fencer;
  cards: Record<CardKind, number>;
  onCard: (kind: CardKind) => void;
}

/**
 * Os três cartões FIE, sempre visíveis e sempre no mesmo sítio. Ficam **entre** o resultado e os
 * `+`/`−` de propósito: dar um cartão é raro, e escondê-lo atrás de um menu obrigaria a procurá-lo
 * no pior momento possível — mas pô-lo ao lado do `+` convidava ao toque errado.
 *
 * A contagem aparece no próprio cartão. Anular é uma ação do ecrã, não de cada cartão: o vermelho
 * mexe no resultado do adversário e um "−" por cartão dava dois sítios para desfazer a mesma coisa.
 */
function CardStrip({ fencer, cards, onCard }: CardStripProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.cardStrip}>
      {CARD_KINDS.map((kind) => {
        const count = cards[kind];
        // O preto é a exclusão: dá-se uma vez e acabou. Desativar o botão diz isso melhor do que
        // deixá-lo carregável e não fazer nada.
        const spent = kind === 'black' && count >= BLACK_CARD_LIMIT;

        return (
          <Pressable
            key={kind}
            accessibilityRole="button"
            accessibilityLabel={t(`bout.cards.give.${kind}`, { name: fencer.name })}
            accessibilityValue={{ text: t('bout.cards.count', { count }) }}
            accessibilityState={{ disabled: spent }}
            disabled={spent}
            onPress={() => onCard(kind)}
            // O desenho tem 26×34; o alvo passa a 44×44, o mínimo das HIG.
            hitSlop={{ top: 5, bottom: 5, left: 9, right: 9 }}
            style={({ pressed }) => [
              styles.card,
              cardStyles[kind],
              count === 0 ? styles.cardEmpty : null,
              pressed && !spent ? styles.cardPressed : null,
            ]}
          >
            {count > 0 ? (
              <Text style={[styles.cardCount, cardCountStyles[kind]]}>{count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    flex: 1,
    // Sem `minWidth: 0` o Yoga não deixa a coluna encolher abaixo da largura do nome, e as duas
    // colunas somadas transbordavam o ecrã.
    minWidth: 0,
    alignItems: 'center',
    padding: spacing.sm + 4,
    borderRadius: radius.r16,
    borderWidth: 1,
    borderColor: colors.grayMedium,
    backgroundColor: colors.light,
  },
  columnLeading: {
    borderColor: colors.dark,
    backgroundColor: colors.grayLight,
  },
  nameBlock: {
    alignSelf: 'stretch',
    minHeight: 88,
    // Nome e `+`/`−` mantêm o tamanho; é o resultado, no meio, que dá o espaço que faltar.
    flexShrink: 0,
    alignItems: 'center',
    gap: spacing.xs,
  },
  nameBlockCompact: {
    minHeight: 0,
  },
  scoreSlot: {
    flex: 1,
    minHeight: 0,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  numberChip: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.dark,
  },
  numberLabel: {
    fontFamily: fonts.montserrat,
    fontVariant: ['tabular-nums'],
  },
  priorityChip: {
    paddingHorizontal: spacing.sm,
    height: 24,
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.lightWarning,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  priorityLabel: {
    fontFamily: fonts.montserrat,
    fontSize: type.xs,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.warningText,
  },
  fencerName: {
    fontFamily: fonts.montserrat,
    fontSize: type.base,
    textAlign: 'center',
  },
  fencerNameCompact: {
    fontSize: type.sm,
  },
  score: {
    fontFamily: fonts.montserrat,
    fontSize: 68,
    lineHeight: 76,
    color: colors.dark,
    fontVariant: ['tabular-nums'],
    marginVertical: spacing.xs,
  },
  scoreCompact: {
    fontSize: 52,
    lineHeight: 58,
    marginVertical: 0,
  },
  scoreAtTarget: {
    color: colors.success,
  },
  cardStrip: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: spacing.xs + 2,
    marginBottom: spacing.sm,
  },
  card: {
    // Proporção de cartão de arbitragem. O alvo tocável real é maior — ver o `hitSlop`.
    width: 26,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.r4,
    borderWidth: 1,
  },
  cardEmpty: {
    // Por atribuir, o cartão fica esbatido — presente para se saber que existe, apagado para não
    // competir com o resultado. Abaixo de 0.4 o preto e o cinzento deixam de se distinguir.
    opacity: 0.4,
  },
  cardPressed: {
    opacity: 0.6,
  },
  cardCount: {
    fontFamily: fonts.montserrat,
    fontSize: type.sm,
    fontVariant: ['tabular-nums'],
  },
  stepper: {
    flexDirection: 'row',
    flexShrink: 0,
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  stepperButton: {
    // `flex` e não largura fixa: dois botões de 96 pt não cabem numa meia-coluna de telemóvel
    // e transbordavam por cima da coluna ao lado.
    flex: 1,
    height: touch.min + 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.r10,
    borderWidth: 1,
    borderColor: colors.dark,
  },
  stepperButtonCompact: {
    height: touch.min,
  },
  stepperPrimary: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  stepperPressed: {
    backgroundColor: colors.grayLight,
  },
  stepperDisabled: {
    opacity: 0.35,
  },
  minusBar: {
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.dark,
  },
  plusVertical: {
    position: 'absolute',
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: colors.dark,
  },
  plusHorizontal: {
    position: 'absolute',
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.dark,
  },
});

const cardStyles = StyleSheet.create({
  yellow: { backgroundColor: colors.cardYellow, borderColor: colors.cardYellow },
  red: { backgroundColor: colors.cardRed, borderColor: colors.cardRed },
  black: { backgroundColor: colors.cardBlack, borderColor: colors.cardBlack },
});

const cardCountStyles = StyleSheet.create({
  yellow: { color: colors.dark },
  red: { color: colors.light },
  black: { color: colors.light },
});
