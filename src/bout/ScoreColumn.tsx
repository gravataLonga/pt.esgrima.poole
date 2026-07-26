import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { DotDisplay, Text, colors, columnsFor, fonts, radius, spacing, type } from '@/ui';

import { BLACK_CARD_LIMIT, type CardKind } from './rules';

/**
 * O painel do resultado reserva sempre dois algarismos, mesmo com o resultado a 3. Sem isso, o
 * número mudava de tamanho ao passar de 9 para 10 — a meio de um assalto, e no elemento que o
 * árbitro olha mais vezes.
 */
const SCORE_COLUMNS = columnsFor('00');

export interface ScoreColumnProps {
  /**
   * Como este lado se chama: o nome do atleta com a poule ligada, "Verde"/"Vermelho" no modo
   * cronómetro. É sempre o que os rótulos de acessibilidade dizem — sem isto o VoiceOver leria
   * dois `+` indistinguíveis.
   */
  label: string;
  /** Número na folha de poule. `null` quando não há atletas: é isso que colapsa o bloco de nome. */
  number: number | null;
  /** `null` no modo cronómetro e nos atletas sem clube. */
  club: string | null;
  /**
   * Cor do lado, como nas lâmpadas do aparelho. `null` com a poule ligada — aí quem distingue as
   * colunas é o nome, e mais cor só competiria com ele.
   */
  tone: 'green' | 'red' | null;
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
  /** Anula um cartão deste atleta — premindo o próprio cartão sem largar. */
  onUndoCard: (kind: CardKind) => void;
  /** Layout apertado, para landscape: nome numa linha e menos respiração vertical. */
  compact?: boolean;
}

const CARD_KINDS: CardKind[] = ['yellow', 'red', 'black'];

export function ScoreColumn({
  label,
  number,
  club,
  tone,
  score,
  opponentScore,
  target,
  cards,
  hasPriority,
  flashingPriority = false,
  onChange,
  onCard,
  onUndoCard,
  compact = false,
}: ScoreColumnProps) {
  const { t } = useTranslation();

  const atTarget = score >= target;
  const leading = score > opponentScore;

  return (
    <View style={[styles.column, leading ? styles.columnLeading : null]}>
      {number === null ? (
        /* Sem atletas não há nada para escrever aqui — sobra a cor do lado, que é como o árbitro
           já os chama em voz alta. Ocupa a faixa do nome em vez de a deixar vazia. */
        <View style={[styles.toneBar, tone === 'red' ? styles.toneBarRed : styles.toneBarGreen]}>
          <Text style={[styles.toneLabel, tone === 'red' ? styles.toneLabelRed : null]}>
            {label}
          </Text>
          {hasPriority || flashingPriority ? (
            <PriorityChip name={label} settled={hasPriority} />
          ) : null}
        </View>
      ) : (
        /* Uma linha, e encostado ao painel. O nome é a etiqueta do resultado, não o título da
           coluna: em duas linhas a 16 pt ocupava mais altura do que os algarismos que identifica,
           e empurrava o painel para longe do polegar. */
        <View style={styles.nameBlock}>
          <View style={styles.nameRow}>
            <View style={styles.numberChip}>
              <Text variant="caption" color={colors.light} style={styles.numberLabel}>
                {number}
              </Text>
            </View>

            <Text variant="label" numberOfLines={1} style={styles.fencerName}>
              {label}
            </Text>
          </View>

          {/* A prioridade toma o lugar do clube quando aparece: é a informação mais urgente das
              duas, e a linha é a mesma para as colunas não desalinharem. */}
          {hasPriority || flashingPriority ? (
            <PriorityChip name={label} settled={hasPriority} />
          ) : compact ? null : (
            <Text variant="caption" numberOfLines={1}>
              {club ?? ''}
            </Text>
          )}
        </View>
      )}

      {/* **O painel é o botão de marcar**, como o mostrador é o botão de arrancar o cronómetro
          (spec §7). Dois botões `+`/`−` de igual peso por baixo diziam que tirar um toque é tão
          frequente como dar um, e não é: dão-se cinco a quinze por assalto e tira-se um de tempos
          a tempos, por engano. O alvo passou de 56 pt para a coluna quase toda. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('bout.addTouch', { name: label })}
        accessibilityState={{ disabled: score >= target }}
        onPress={() => onChange(Math.min(target, score + 1))}
        disabled={score >= target}
        style={({ pressed }) => [
          styles.scoreSlot,
          pressed && score < target ? styles.scoreSlotPressed : null,
        ]}
      >
        {/* Sozinho, o número grande é lido pelo VoiceOver como "5" — sem dizer de quem. */}
        <DotDisplay
          value={String(score)}
          label={t('bout.scoreLabel', { name: label, count: score })}
          color={scoreColor(tone)}
          reserveColumns={SCORE_COLUMNS}
          style={styles.scoreDisplay}
        />

        {/* A lâmpada de limite de toques, ao canto — a borda verde a toda a volta era um berro
            para dizer o que uma lâmpada acesa diz melhor, e é assim que o aparelho o diz. */}
        {atTarget ? <View style={styles.lamp} /> : null}
      </Pressable>

      <CardStrip label={label} cards={cards} onCard={onCard} onUndoCard={onUndoCard} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('bout.removeTouch', { name: label })}
        accessibilityState={{ disabled: score <= 0 }}
        onPress={() => onChange(Math.max(0, score - 1))}
        disabled={score <= 0}
        hitSlop={{ top: 6, bottom: 6 }}
        style={({ pressed }) => [
          styles.remove,
          compact ? styles.removeCompact : null,
          score <= 0 ? styles.removeDisabled : null,
          pressed && score > 0 ? styles.removePressed : null,
        ]}
      >
        <View style={styles.minusBar} />
      </Pressable>
    </View>
  );
}

/**
 * O algarismo acende com a cor do lado — verde e vermelho, como as lâmpadas do aparelho. Com a
 * poule ligada não há lado: quem distingue as colunas é o nome, e o painel acende a branco.
 */
function scoreColor(tone: ScoreColumnProps['tone']): string {
  if (tone === 'green') return colors.green;
  if (tone === 'red') return colors.cardRed;
  return colors.light;
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
  label: string;
  cards: Record<CardKind, number>;
  onCard: (kind: CardKind) => void;
  onUndoCard: (kind: CardKind) => void;
}

/**
 * Os três cartões FIE, sempre visíveis e sempre no mesmo sítio. Ficam **entre** o resultado e os
 * `+`/`−` de propósito: dar um cartão é raro, e escondê-lo atrás de um menu obrigaria a procurá-lo
 * no pior momento possível — mas pô-lo ao lado do `+` convidava ao toque errado.
 *
 * A contagem aparece no próprio cartão, e **anula-se premindo-o sem largar**. Era um botão à parte,
 * de largura inteira, que só existia depois do primeiro cartão e empurrava o resto do ecrã para
 * baixo ao aparecer — e que, com dois atletas, anulava o último cartão do assalto e não o daquela
 * coluna. Anular onde se deu é o sítio certo e não ocupa linha nenhuma; o preço é ser uma ação
 * escondida, e por isso está no `accessibilityHint`.
 */
function CardStrip({ label, cards, onCard, onUndoCard }: CardStripProps) {
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
            accessibilityLabel={t(`bout.cards.give.${kind}`, { name: label })}
            accessibilityValue={{ text: t('bout.cards.count', { count }) }}
            accessibilityHint={count > 0 ? t('bout.cards.undoHint') : undefined}
            accessibilityState={{ disabled: spent }}
            // Anunciado como esgotado, mas **não** desativado: `disabled` fecharia também a pressão
            // longa, e ela é a única saída de um preto dado por engano. Quem carrega não dá um
            // segundo preto — quem carrega sem largar anula o primeiro.
            onPress={spent ? undefined : () => onCard(kind)}
            onLongPress={count > 0 ? () => onUndoCard(kind) : undefined}
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
    // Duas linhas curtas, e nunca mais: nome e (clube ou prioridade). Altura fixa para as colunas
    // não desalinharem quando uma tem clube e a outra não.
    minHeight: 46,
    flexShrink: 0,
    alignItems: 'center',
    gap: 2,
  },
  /**
   * A faixa e os algarismos do painel são os dois únicos sítios onde a cor do lado aparece — e são
   * a mesma coisa dita duas vezes de propósito, como no aparelho: a lâmpada em cima, o resultado
   * daquela cor por baixo. O `+` continua verde por ser a ação principal, não por ser um lado.
   */
  toneBar: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.r10,
  },
  toneBarGreen: {
    backgroundColor: colors.green,
  },
  /**
   * `cardRed` e não `danger`, apesar de serem o mesmo hex: aqui o vermelho é cor de sinalização
   * FIE — a lâmpada do aparelho —, não um estado de erro.
   */
  toneBarRed: {
    backgroundColor: colors.cardRed,
  },
  toneLabel: {
    fontFamily: fonts.montserrat,
    fontSize: type.base,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.dark,
  },
  toneLabelRed: {
    color: colors.light,
  },
  /**
   * A janela do resultado, preta como a do marcador. É a segunda e última zona escura da app — a
   * outra é o mostrador do cronómetro —, e é escura pela mesma razão: sem fundo preto, pontos
   * acesos são só pontos.
   *
   * É também o botão de marcar um toque — daí ser ele a ceder espaço e não os cartões: um alvo de
   * meia coluna é o que se acerta sem olhar.
   */
  scoreSlot: {
    flex: 1,
    minHeight: 0,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.r10,
    backgroundColor: colors.black,
  },
  // Esmorece ao toque, como o mostrador do cronómetro. Aclarar o fundo era o instinto — é um gesto
  // de somar — mas punha os algarismos vermelhos a 1.95:1 contra o fundo novo: o número que se
  // está a mudar deixava de se ler no instante em que se lhe toca.
  scoreSlotPressed: {
    opacity: 0.75,
  },
  scoreDisplay: {
    flex: 1,
    alignSelf: 'stretch',
  },
  lamp: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.green,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    alignSelf: 'stretch',
    minWidth: 0,
  },
  numberChip: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
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
    flexShrink: 1,
    fontFamily: fonts.montserrat,
    fontSize: type.sm,
    textAlign: 'center',
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
  /**
   * Corrigir para baixo: uma tira baixa, sem preenchimento e sem palavra nenhuma. Fica com metade
   * da altura que o par `+`/`−` tinha, porque vale metade das vezes — e o `hitSlop` devolve-lhe os
   * 48 pt de alvo que o desenho não tem.
   */
  remove: {
    flexShrink: 0,
    alignSelf: 'stretch',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.r10,
    borderWidth: 1,
    // `textMuted` e não `grayDark`: o contorno é o que identifica o botão, e a WCAG 1.4.11 pede-lhe
    // 3:1. O `grayDark` sobre branco dá 1.77 — o mesmo erro que motivou o `contrast.test.ts`.
    borderColor: colors.textMuted,
  },
  removeCompact: {
    height: 32,
  },
  removePressed: {
    backgroundColor: colors.grayLight,
  },
  removeDisabled: {
    opacity: 0.35,
  },
  minusBar: {
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
