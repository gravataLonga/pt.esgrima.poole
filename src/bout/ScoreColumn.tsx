import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { splitName } from '@/fencer/name';
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
   * cronómetro. É sempre o **nome inteiro** e é sempre o que os rótulos de acessibilidade dizem —
   * sem isto o VoiceOver leria dois `+` indistinguíveis. O que o painel escreve é outra coisa (ver
   * `splitName`).
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
  /**
   * Para que aresta do painel o nome encosta. É a informação de que lado esta coluna está, e só o
   * ecrã a sabe — `'start'` à esquerda, `'end'` à direita, espelhados como num marcador.
   */
  align?: 'start' | 'end';
  /** Layout apertado, para landscape: nome numa linha e menos respiração vertical. */
  compact?: boolean;
}

const CARD_KINDS: CardKind[] = ['yellow', 'red', 'black'];

/**
 * Metade do marcador: quem está em pista, e o resultado dele.
 *
 * **A zona dos algarismos é o botão de marcar**, como o mostrador é o botão de arrancar o cronómetro
 * (spec §7). Um `+` de 56 pt ao lado de um `−` igual dizia que tirar um toque é tão frequente como
 * dar um, e não é: dão-se cinco a quinze por assalto e tira-se um de tempos a tempos, por engano.
 *
 * Os cartões e o `−` **não vivem aqui** — vivem no `ScoreTray`, na faixa por baixo do painel. Duas
 * razões, e as duas contam: no React Native um `Pressable` é *um* elemento de acessibilidade e
 * engole os descendentes, e dentro do alvo de marcar eles deixavam de existir para o VoiceOver; e
 * dentro do painel não havia largura para lhes dar os 44 pt de alvo das HIG.
 */
export function ScoreHalf({
  label,
  number,
  club,
  tone,
  score,
  opponentScore,
  target,
  hasPriority,
  flashingPriority = false,
  onChange,
  align = 'start',
  compact = false,
}: ScoreColumnProps) {
  const { t } = useTranslation();

  const atTarget = score >= target;
  const leading = score > opponentScore;
  const toEnd = align === 'end';

  return (
    <View style={[styles.half, compact ? styles.halfCompact : null]}>
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
        <NameBlock
          label={label}
          number={number}
          club={club}
          hasPriority={hasPriority || flashingPriority}
          settledPriority={hasPriority}
          toEnd={toEnd}
          compact={compact}
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('bout.addTouch', { name: label })}
        // O resultado tem de vir por aqui: um `Pressable` é um elemento só de acessibilidade, e o
        // rótulo do `DotDisplay` lá dentro nunca chega ao VoiceOver — quem arbitra com ele ouvia
        // "mais um toque para X" e não ficava a saber quantos já eram.
        accessibilityValue={{ text: t('bout.scoreLabel', { name: label, count: score }) }}
        accessibilityState={{ disabled: atTarget }}
        onPress={() => onChange(Math.min(target, score + 1))}
        disabled={atTarget}
        style={({ pressed }) => [
          styles.scoreSlot,
          pressed && !atTarget ? styles.scoreSlotPressed : null,
        ]}
      >
        {/* Sozinho, o número grande é lido pelo VoiceOver como "5" — sem dizer de quem. */}
        <DotDisplay
          value={String(score)}
          label={t('bout.scoreLabel', { name: label, count: score })}
          color={scoreColor(tone, leading)}
          reserveColumns={SCORE_COLUMNS}
          // O `1` acende só a coluna direita da sua célula: sem isto, um resultado de 1, 11 ou 12
          // ficava encostado à direita do painel.
          centerInk
          style={styles.scoreDisplay}
        />

        {/* A lâmpada de limite de toques — a borda verde a toda a volta era um berro para dizer o
            que uma lâmpada acesa diz melhor, e é assim que o aparelho o diz. Fica ao canto de fora,
            do lado em que o nome está: o canto de dentro é do fio que divide o painel. */}
        {atTarget ? (
          <View style={[styles.lamp, toEnd ? styles.lampEnd : styles.lampStart]} />
        ) : null}
      </Pressable>
    </View>
  );
}

interface NameBlockProps {
  label: string;
  number: number;
  club: string | null;
  hasPriority: boolean;
  settledPriority: boolean;
  toEnd: boolean;
  compact: boolean;
}

/**
 * Quem está em pista, à maneira do marcador: **apelido em cima, nome próprio por baixo**, e o clube
 * numa terceira linha quando o há. A pirâmide é deliberada — o apelido é o que se lê da outra ponta
 * da pista e o que o árbitro diz em voz alta; o resto é desempate para quando há dois Silvas.
 *
 * Numa linha só, "Álvaro Branco da Silva" saía sempre truncado a meio a 14 pt, e o que ficava
 * visível era o nome próprio — a pior metade para identificar alguém numa folha de poule.
 *
 * Encostado à aresta de fora, e não ao centro: ao centro, os dois nomes ficavam a olhar um para o
 * outro por cima do fio que os separa, e o painel lia-se como uma coluna larga em vez de duas. Nas
 * arestas, cada nome fica por cima do seu resultado e o número de poule vai para fora, que é onde as
 * folhas o põem.
 */
function NameBlock({
  label,
  number,
  club,
  hasPriority,
  settledPriority,
  toEnd,
  compact,
}: NameBlockProps) {
  const { family, given } = splitName(label);
  const side = toEnd ? styles.toEnd : styles.toStart;

  return (
    <View style={[styles.nameBlock, side, compact ? styles.nameBlockCompact : null]}>
      {/* A pastilha do número fica **ao lado** das três linhas, e não dentro da primeira: dentro,
          empurrava o apelido para a direita e o nome próprio ficava à esquerda dele, com as duas
          linhas do mesmo nome a começar em sítios diferentes. */}
      <View style={[styles.nameRow, toEnd ? styles.nameRowEnd : null]}>
        <View style={styles.numberChip}>
          <Text variant="caption" color={colors.light} style={styles.numberLabel}>
            {number}
          </Text>
        </View>

        <View style={[styles.nameStack, side]}>
          <Text numberOfLines={1} style={styles.family}>
            {family}
          </Text>

          {given ? (
            <Text numberOfLines={1} style={styles.given}>
              {given}
            </Text>
          ) : null}

          {/* A prioridade toma o lugar do clube quando aparece: é a informação mais urgente das
              duas, e a linha é a mesma para as colunas não desalinharem. Deitado não há clube — a
              altura que ele ocupava é a que os algarismos precisam. */}
          {hasPriority ? (
            <PriorityChip name={label} settled={settledPriority} />
          ) : compact || !club ? null : (
            <Text variant="caption" color={colors.textMutedOnDark} numberOfLines={1}>
              {club}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * A faixa dos controlos: os três cartões FIE e o `−`, no andar de baixo do painel.
 *
 * **Cada cartão é uma casa inteira da faixa, de aresta a aresta** — e não um cartãozinho desenhado
 * dentro dela. Desenhado, era a fotografia de um cartão a ocupar um terço do espaço que tinha; casa
 * inteira, é uma tecla do aparelho: acende toda quando o cartão é dado, e o alvo tocável passa dos
 * 26 pt de largura do desenho para os ~44 da casa, sem `hitSlop` nenhum a fingir.
 *
 * Por dar, a casa fica escura com a cor numa barra ao pé — presente para se saber que existe, apagada
 * para não competir com o resultado. É o mesmo princípio dos pontos de período no cronómetro.
 *
 * A contagem aparece na casa acesa e **anula-se premindo-a sem largar**. Era um botão à parte, de
 * largura inteira, que só existia depois do primeiro cartão e empurrava o resto do ecrã para baixo ao
 * aparecer — e que, com dois atletas, anulava o último cartão do assalto e não o daquela coluna.
 * Anular onde se deu não ocupa linha nenhuma; o preço é ser uma ação escondida, e por isso está no
 * `accessibilityHint`.
 */
export function ScoreTray({ label, score, cards, onChange, onCard, onUndoCard }: ScoreColumnProps) {
  const { t } = useTranslation();

  /**
   * Acabou de se anular um cartão neste gesto?
   *
   * O `Pressable` cancela o `onPress` do largar quando houve pressão longa — mas decide-o lendo o
   * `onLongPress` da configuração **atual**, não da que existia quando o dedo pousou
   * (`Pressability.js`, `RESPONDER_RELEASE`). E a nossa muda a meio do gesto: anular o último cartão
   * põe a contagem a zero e o `onLongPress` a `undefined`, o cancelamento deixa de se aplicar, e o
   * cartão anulado era dado outra vez no instante em que se largava o dedo.
   *
   * Marcar aqui e ignorar o `onPress` seguinte resolve-o sem tirar nada: um toque normal continua a
   * dar o cartão, e uma pressão demorada num cartão apagado — onde não há nada para anular —
   * continua a dá-lo também.
   */
  const undone = useRef(false);

  return (
    <View style={styles.tray}>
      {CARD_KINDS.map((kind, index) => {
        const count = cards[kind];
        // O preto é a exclusão: dá-se uma vez e acabou.
        const spent = kind === 'black' && count >= BLACK_CARD_LIMIT;

        return (
          <Pressable
            key={kind}
            accessibilityRole="button"
            accessibilityLabel={t(`bout.cards.give.${kind}`, { name: label })}
            accessibilityValue={{ text: t('bout.cards.count', { count }) }}
            accessibilityHint={count > 0 ? t('bout.cards.undoHint') : undefined}
            accessibilityState={{ disabled: spent }}
            // Cada gesto começa limpo: sem isto, uma pressão longa que acabasse fora do botão
            // deixava a marca ligada e engolia o toque seguinte.
            onPressIn={() => {
              undone.current = false;
            }}
            // Anunciado como esgotado, mas **não** desativado: `disabled` fecharia também a pressão
            // longa, e ela é a única saída de um preto dado por engano. Quem carrega não dá um
            // segundo preto — quem carrega sem largar anula o primeiro.
            onPress={() => {
              if (undone.current || spent) return;
              onCard(kind);
            }}
            onLongPress={
              count > 0
                ? () => {
                    undone.current = true;
                    onUndoCard(kind);
                  }
                : undefined
            }
            style={({ pressed }) => [
              styles.cell,
              index > 0 ? styles.cellDivided : null,
              count > 0 ? cardFillStyles[kind] : null,
              pressed && !spent ? styles.cellPressed : null,
            ]}
          >
            {count > 0 ? (
              <Text style={[styles.cardCount, cardCountStyles[kind]]}>{count}</Text>
            ) : (
              <View style={[styles.cardEdge, cardEdgeStyles[kind]]} />
            )}
          </Pressable>
        );
      })}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('bout.removeTouch', { name: label })}
        accessibilityState={{ disabled: score <= 0 }}
        onPress={() => onChange(Math.max(0, score - 1))}
        disabled={score <= 0}
        style={({ pressed }) => [
          styles.cell,
          styles.cellDivided,
          styles.remove,
          score <= 0 ? styles.removeDisabled : null,
          pressed && score > 0 ? styles.cellPressed : null,
        ]}
      >
        <View style={styles.minusBar} />
      </Pressable>
    </View>
  );
}

/**
 * O algarismo acende com a cor do lado — verde e vermelho, como as lâmpadas do aparelho. Com a
 * poule ligada não há lado: aí acende a branco, e é **quem vai à frente** que fica verde. A cor
 * nunca é a única coisa a dizê-lo — os dois números estão lá, um ao lado do outro.
 */
function scoreColor(tone: ScoreColumnProps['tone'], leading: boolean): string {
  if (tone === 'green') return colors.green;
  if (tone === 'red') return colors.cardRed;
  return leading ? colors.green : colors.light;
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

const styles = StyleSheet.create({
  half: {
    flex: 1,
    // Sem `minWidth: 0` o Yoga não deixa a coluna encolher abaixo da largura do nome, e as duas
    // colunas somadas transbordavam o ecrã.
    minWidth: 0,
    alignItems: 'center',
    // A respiração do painel. Encostado às arestas, o nome parecia colado ao vidro — e a pastilha
    // do número, que é o que fica mais para fora, era a primeira coisa a tocar-lhes.
    padding: spacing.md,
  },
  halfCompact: {
    padding: spacing.sm,
  },
  nameBlock: {
    alignSelf: 'stretch',
    // `minHeight` e não `height`: nos tamanhos de texto de acessibilidade o nome cresce em vez de
    // ficar cortado. As duas colunas escrevem as mesmas linhas, por isso crescem juntas.
    minHeight: 62,
    flexShrink: 0,
    justifyContent: 'center',
  },
  toStart: {
    alignItems: 'flex-start',
  },
  toEnd: {
    alignItems: 'flex-end',
  },
  nameBlockCompact: {
    minHeight: 40,
  },
  /**
   * A faixa e os algarismos do painel são os dois únicos sítios onde a cor do lado aparece — e são
   * a mesma coisa dita duas vezes de propósito, como no aparelho: a lâmpada em cima, o resultado
   * daquela cor por baixo.
   */
  toneBar: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 34,
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
   * O alvo de marcar um toque: a altura que sobra da coluna, de margem a margem. Não tem fundo
   * próprio — o preto é o do painel, e um retângulo preto dentro de outro só acrescentaria uma
   * aresta.
   */
  scoreSlot: {
    flex: 1,
    minHeight: 0,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
    borderRadius: radius.r10,
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
    top: 0,
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.green,
  },
  lampStart: {
    left: 0,
  },
  lampEnd: {
    right: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '100%',
    minWidth: 0,
  },
  /** As três linhas do nome, todas a começar no mesmo sítio. */
  nameStack: {
    flexShrink: 1,
    minWidth: 0,
    gap: 2,
  },
  // O número de poule vai para o lado de fora nas duas colunas: à esquerda do apelido na coluna da
  // esquerda, à direita dele na da direita.
  nameRowEnd: {
    flexDirection: 'row-reverse',
  },
  numberChip: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.darkSurface,
  },
  numberLabel: {
    fontFamily: fonts.montserrat,
    fontVariant: ['tabular-nums'],
  },
  /** O apelido é o nome do marcador: Montserrat, claro, e o maior dos três. */
  family: {
    flexShrink: 1,
    fontFamily: fonts.montserrat,
    fontSize: type.base,
    color: colors.light,
  },
  given: {
    fontFamily: fonts.workSans,
    fontSize: type.sm,
    color: colors.light,
  },
  priorityChip: {
    paddingHorizontal: spacing.sm,
    minHeight: 22,
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.warning,
  },
  priorityLabel: {
    fontFamily: fonts.montserrat,
    fontSize: type.xs,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    // Sobre o painel preto é o `warning` que se lê (6.43:1); o `warningText` existe para o
    // contrário — texto pequeno sobre fundo claro.
    color: colors.warning,
  },
  tray: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
  },
  /**
   * A casa: um quarto da faixa daquele atleta, de aresta a aresta e sem margem nenhuma. Quatro casas
   * numa meia-largura de telemóvel dão ~44 pt cada — o mínimo das HIG, ganho pelo desenho e não por
   * um `hitSlop` a fingir que o botão é maior do que parece.
   */
  cell: {
    flex: 1,
    minWidth: 0,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    // Preto próprio, e não o preto do painel a passar por baixo: por apagar, a casa é uma casa
    // escura — é ela que ali está, e é dela o canto arredondado quando calha à ponta do painel.
    backgroundColor: colors.black,
  },
  // Os fios entre as casas são os mesmos que dividem o painel ao meio: uma linha, e não uma moldura.
  cellDivided: {
    borderLeftWidth: 1,
    borderLeftColor: colors.darkBorder,
  },
  cellPressed: {
    opacity: 0.6,
  },
  /** Por dar, o cartão é a sua cor numa barra ao pé da casa. */
  cardEdge: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.sm,
    height: 4,
    borderRadius: 2,
  },
  cardCount: {
    fontFamily: fonts.montserrat,
    fontSize: type.base,
    fontVariant: ['tabular-nums'],
  },
  /**
   * Corrigir para baixo: a última casa da faixa, com um traço e mais nada. Levantada do preto para
   * se ler como tecla e não como espaço vazio — e vale metade das vezes que o `+` vale, que é a
   * coluna inteira, por isso não leva palavra nenhuma.
   */
  remove: {
    backgroundColor: colors.darkSurface,
  },
  removeDisabled: {
    opacity: 0.35,
  },
  minusBar: {
    width: 16,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: colors.textMutedOnDark,
  },
});

/** Por dar, a barra ao pé da casa — o suficiente para se saber que aquele cartão mora ali. */
const cardEdgeStyles = StyleSheet.create({
  yellow: { backgroundColor: colors.cardYellow },
  red: { backgroundColor: colors.cardRed },
  black: { backgroundColor: colors.cardOnPanel },
});

/** Dado, acende. */
const cardFillStyles = StyleSheet.create({
  yellow: { backgroundColor: colors.cardYellow },
  red: { backgroundColor: colors.cardRed },
  black: { backgroundColor: colors.cardOnPanel },
});

const cardCountStyles = StyleSheet.create({
  yellow: { color: colors.dark },
  red: { color: colors.light },
  // Preto, e não `dark`, sobre o cinzento do cartão preto: claro dava 3.42:1 e o azul-escuro do
  // design system 3.59:1 — os dois abaixo dos 4.5 da WCAG AA. Preto puro dá 6.08:1.
  black: { color: colors.black },
});
