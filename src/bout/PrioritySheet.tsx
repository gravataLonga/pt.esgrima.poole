import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { sheetName } from '@/fencer/name';
import {
  Button,
  Sheet,
  Text,
  colors,
  fonts,
  radius,
  sheetStyles,
  spacing,
  touch,
  type,
} from '@/ui';

import type { Side } from './rules';

/** Quem está em pista, do lado de lá da folha: o nome inteiro, e o clube se o atleta tiver um. */
export interface PriorityFencer {
  /** Nome como veio da API — inteiro, que é o que identifica. */
  name: string;
  /** `null` no modo cronómetro e nos atletas sem clube. */
  club: string | null;
}

export interface PrioritySheetProps {
  visible: boolean;
  /** Quem já tem a prioridade. `null` antes de ela existir. */
  current: Side | null;
  fencerOf: (side: Side) => PriorityFencer;
  /** Sorteio aleatório, com a piscadela. */
  onDraw: () => void;
  /** Prioridade marcada à mão, sem sorteio. */
  onSet: (side: Side) => void;
  onClose: () => void;
}

/**
 * Quem fica com a prioridade — sorteada aqui, ou marcada à mão.
 *
 * O sorteio da app é honesto e é o caminho normal, mas não é o único que existe na pista: muitos
 * aparelhos tiram a prioridade eles próprios, e nesse caso quem arbitra já sabe o resultado antes
 * de tocar no telemóvel. Sortear outra vez seria inventar uma segunda prioridade para o mesmo
 * assalto — e é a da pista que vale.
 *
 * Com a prioridade já atribuída a folha passa a ser de correção: o sorteio desaparece — sorteá-la
 * de novo não corrige nada — e sobra passá-la ao outro atleta.
 */
export function PrioritySheet({
  visible,
  current,
  fencerOf,
  onDraw,
  onSet,
  onClose,
}: PrioritySheetProps) {
  const { t } = useTranslation();

  return (
    <Sheet
      visible={visible}
      title={t('bout.priority.title')}
      subtitle={
        current
          ? t('bout.priority.held', { name: fencerOf(current).name })
          : t('bout.priority.subtitle')
      }
      onClose={onClose}
      actions={
        <>
          {current ? null : (
            <>
              <Button label={t('bout.priority.random')} onPress={onDraw} />
              {/* A alternativa precisa de ser dita: dois atletas por baixo de um botão de sortear
                  leem-se como "sorteia entre estes", e não como "foi este". */}
              <Text style={[sheetStyles.hint, styles.hint]}>
                {t('bout.priority.fromApparatus')}
              </Text>
            </>
          )}
          {/* Lado a lado e pela mesma ordem das colunas: quem está à esquerda da pista está à
              esquerda aqui, e a escolha faz-se por posição antes de se ler o nome. */}
          <View style={sheetStyles.actionRow}>
            {(['a', 'b'] as const).map((side) => (
              <View key={side} style={sheetStyles.actionItem}>
                <SideOption
                  fencer={fencerOf(side)}
                  // Quem já a tem não a pode receber outra vez: a tecla apagada é também a
                  // resposta a "de quem é ela agora?".
                  disabled={current === side}
                  onPress={() => onSet(side)}
                />
              </View>
            ))}
          </View>
          <Button label={t('common.cancel')} variant="secondary" onPress={onClose} />
        </>
      }
    />
  );
}

interface SideOptionProps {
  fencer: PriorityFencer;
  disabled: boolean;
  onPress: () => void;
}

/**
 * Um atleta como uma tecla — a variante `secondary` do `Button`, com o nome escrito à maneira das
 * tabelas: `Apelido, Nome`, e o clube por baixo em corpo pequeno.
 *
 * Não é um `Button` porque o rótulo dele é uma linha só. E duas linhas aqui não são enfeite: numa
 * poule com dois atletas do mesmo apelido, o clube é o que os separa — e é a pergunta que a folha
 * faz ("a qual deles?") que exige ler os dois sem hesitar. O nome inteiro fica no rótulo de
 * acessibilidade, que é onde ele identifica sem depender de ver o clube.
 */
function SideOption({ fencer, disabled, onPress }: SideOptionProps) {
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('bout.priority.assign', { name: fencer.name })}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        pressed && !disabled ? styles.optionPressed : null,
        disabled ? styles.optionDisabled : null,
      ]}
    >
      <Text numberOfLines={1} style={styles.name}>
        {sheetName(fencer.name)}
      </Text>
      {fencer.club ? (
        <Text variant="caption" color={colors.textMuted} numberOfLines={1} style={styles.club}>
          {fencer.club}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hint: {
    textAlign: 'center',
  },
  option: {
    minHeight: touch.min,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.r4,
    borderWidth: 1,
    borderColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  optionPressed: {
    backgroundColor: colors.grayLight,
  },
  optionDisabled: {
    opacity: 0.4,
  },
  name: {
    fontFamily: fonts.montserrat,
    fontSize: type.base,
    color: colors.dark,
    textAlign: 'center',
  },
  club: {
    textAlign: 'center',
  },
});
