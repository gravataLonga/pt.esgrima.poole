import { memo, useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { CHAR_GAP_COLUMNS, GLYPH_ROWS, columnsFor, glyphFor, type Dot } from './dotGlyphs';

/** Quanto de cada célula da grelha é ponto. O resto é o intervalo até ao ponto seguinte. */
const DOT_FILL = 0.72;

export interface DotDisplayProps {
  /** O que mostrar. Só `0`–`9`, `:` e `,` — ver `dotGlyphs`. */
  value: string;
  color: string;
  /**
   * O que o VoiceOver lê. Sem isto o mostrador é um monte de `View`s e não é nada: os pontos não
   * são texto, e nenhum leitor de ecrã os reconstrói.
   */
  label: string;
  /**
   * Colunas a reservar, mesmo que o valor atual ocupe menos. É o que impede os algarismos de mudar
   * de tamanho quando o cronómetro passa de `MM:SS` a décimos e a linha fica mais comprida — num
   * mostrador, dígitos que encolhem sozinhos leem-se como avaria.
   */
  reserveColumns?: number;
  /**
   * Centrar pelos pontos **acesos** em vez de pela grelha.
   *
   * O `1` são os segmentos `b` e `c`: acende só a coluna direita da sua célula de cinco. Centrada a
   * grelha, um resultado de `1` fica encostado à direita do painel e lê-se torto — e é por isso que
   * o marcador pede isto.
   *
   * **O cronómetro não pede.** Ali a linha muda dez vezes por segundo, e centrar pela tinta punha
   * a linha inteira a saltar de lado sempre que o primeiro algarismo passasse de `2` para `1`.
   * Num mostrador a contar, dígitos que dançam leem-se como avaria.
   */
  centerInk?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Um mostrador de pontos, à maneira do marcador da FIE.
 *
 * **Mede-se pela caixa que lhe derem** (`onLayout`) e escolhe o tamanho do ponto a partir daí, em
 * vez de aceitar um tamanho fixo: o mesmo componente serve o cronómetro a 88 pt em retrato, o
 * mesmo cronómetro apertado em landscape e o resultado dentro da coluna — e todos eles mudam de
 * largura com o telemóvel. Enquanto a caixa não estiver medida não se desenha nada; o rótulo de
 * acessibilidade, esse, está lá desde o primeiro render.
 *
 * Só se desenham os pontos **acesos**: no painel preto os apagados não se veem, e não desenhá-los
 * baixa o mostrador do cronómetro de umas 200 `View`s para menos de 70.
 */
export function DotDisplay({
  value,
  color,
  label,
  reserveColumns = 0,
  centerInk = false,
  style,
}: DotDisplayProps) {
  const [box, setBox] = useState({ width: 0, height: 0 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };

  const columns = columnsFor(value);
  const unit = Math.min(box.width / Math.max(columns, reserveColumns), box.height / GLYPH_ROWS);
  const dotSize = unit * DOT_FILL;

  // Posições acumuladas, para cada caractere saber onde começa.
  let offset = 0;
  const chars = [...value].map((char, index) => {
    const left = index === 0 ? 0 : offset + CHAR_GAP_COLUMNS;
    offset = left + glyphFor(char).columns;
    return { char, index, left };
  });

  const shift = centerInk ? inkShift(chars, offset, unit, dotSize) : null;

  return (
    <View accessible accessibilityLabel={label} style={[styles.frame, style]} onLayout={onLayout}>
      {unit > 0 ? (
        <View
          style={[
            { width: offset * unit, height: GLYPH_ROWS * unit },
            shift ? { transform: [{ translateX: shift.x }, { translateY: shift.y }] } : null,
          ]}
        >
          {chars.map(({ char, index, left }) => (
            <Char
              key={`${index}-${char}`}
              char={char}
              left={left * unit}
              unit={unit}
              dotSize={dotSize}
              color={color}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Quanto há a deslocar a linha para os pontos acesos ficarem ao centro da caixa — a diferença entre
 * o centro da grelha e o centro da tinta que ela contém.
 */
function inkShift(
  chars: { char: string; left: number }[],
  totalColumns: number,
  unit: number,
  dotSize: number,
): { x: number; y: number } {
  let minColumn = Infinity;
  let maxColumn = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;

  for (const { char, left } of chars) {
    for (const dot of glyphFor(char).dots) {
      const column = left + dot.column;
      if (column < minColumn) minColumn = column;
      if (column > maxColumn) maxColumn = column;
      if (dot.row < minRow) minRow = dot.row;
      if (dot.row > maxRow) maxRow = dot.row;
    }
  }

  // Linha sem um único ponto aceso: não há tinta para centrar.
  if (minColumn === Infinity) return { x: 0, y: 0 };

  return {
    x: (totalColumns * unit - (minColumn * unit + maxColumn * unit + dotSize)) / 2,
    y: (GLYPH_ROWS * unit - (minRow * unit + maxRow * unit + dotSize)) / 2,
  };
}

interface CharProps {
  char: string;
  left: number;
  unit: number;
  dotSize: number;
  color: string;
}

/**
 * Memorizado de propósito: o cronómetro re-renderiza a 20 Hz e, na maior parte desses ciclos, muda
 * **um** algarismo. Sem isto, os quatro voltavam a montar os seus pontos vinte vezes por segundo.
 */
const Char = memo(function Char({ char, left, unit, dotSize, color }: CharProps) {
  const { dots } = glyphFor(char);

  return (
    <View style={[styles.char, { left }]}>
      {dots.map((dot: Dot) => (
        <View
          key={`${dot.row}-${dot.column}`}
          style={{
            position: 'absolute',
            left: dot.column * unit,
            top: dot.row * unit,
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  char: {
    position: 'absolute',
    top: 0,
  },
});
