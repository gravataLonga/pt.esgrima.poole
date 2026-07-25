import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './Text';
import { colors, fonts, radius, spacing, touch, type } from './theme';

export interface SheetProps {
  visible: boolean;
  title: string;
  /** Linha de contexto por baixo do título. */
  subtitle?: string;
  onClose: () => void;
  children?: ReactNode;
  /** Botões, já montados pelo chamador — a folha não decide o que são nem quantos. */
  actions: ReactNode;
}

/**
 * Folha inferior, no lugar do `Alert` do sistema.
 *
 * O `Alert.alert` nativo é uma caixa cinzenta a meio do ecrã, com a tipografia do sistema e nada do
 * design system: a confirmação mais importante da app — registar um resultado, que **não tem
 * desfazer** — parecia vir de outra aplicação. Uma folha inferior fica no idioma visual do resto,
 * e traz os botões para onde o polegar já está.
 *
 * O `Alert` continua a ser o certo para *sair sem gravar*: aí a ação é destrutiva e vinda do
 * sistema de navegação, e o corte de contexto do alerta nativo é a mensagem.
 */
export function Sheet({ visible, title, subtitle, onClose, children, actions }: SheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Android: o botão físico de voltar fecha a folha em vez de sair do ecrã.
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Tocar fora fecha. Sem rótulo próprio: o VoiceOver navega pelo conteúdo da folha, e um
            alvo que ocupa o ecrã inteiro só estorvaria essa navegação. */}
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.backdrop}
          onPress={onClose}
        />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.grabber} />

          <Text variant="title" style={styles.title}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="label" color={colors.textMuted} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}

          {children ? <View style={styles.body}>{children}</View> : null}

          <View style={styles.actions}>{actions}</View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(29, 55, 73, 0.55)',
  },
  sheet: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopLeftRadius: radius.r22,
    borderTopRightRadius: radius.r22,
    backgroundColor: colors.light,
    gap: spacing.xs,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: colors.grayMedium,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: type.xl,
  },
  subtitle: {
    lineHeight: type.lg + 2,
  },
  body: {
    marginTop: spacing.sm,
  },
  actions: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  /** Exportado por `sheetStyles` — botões lado a lado dentro de `actions`. */
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionItem: {
    flex: 1,
    minHeight: touch.min,
  },
  hint: {
    fontFamily: fonts.workSans,
    fontSize: type.sm,
    color: colors.textMuted,
  },
});

/** Estilos de composição para quem monta as `actions`. */
export const sheetStyles = {
  actionRow: styles.actionRow,
  actionItem: styles.actionItem,
  hint: styles.hint,
};
