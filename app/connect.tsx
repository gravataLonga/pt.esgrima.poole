import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSessionStore } from '@/session/store';
import { Button, Screen, Text, colors, fonts, radius, spacing, type } from '@/ui';

const PIN_LENGTH = 6;

/**
 * Ecrã 1 — Ligar (spec §6).
 *
 * O URL do servidor **não** aparece: é detalhe interno, o QR trá-lo no payload (contrato §9) e o
 * árbitro em pavilhão não tem nada a fazer com ele. O store guarda o valor por omissão.
 *
 * ESQUELETO: o botão de QR está inerte (a câmara chega na F1) e o PIN não é validado contra nada —
 * qualquer valor de 6 dígitos carrega a fixture.
 */
export default function ConnectScreen() {
  const { t } = useTranslation();
  const connect = useSessionStore((s) => s.connect);
  const [pin, setPin] = useState('');
  const [focused, setFocused] = useState(false);

  const complete = pin.length === PIN_LENGTH;

  const onSubmit = () => {
    connect(pin);
    router.replace('/poule');
  };

  return (
    <Screen tone="dark">
      {/* O teclado numérico tapa o terço de baixo do ecrã — sem isto, as casas do PIN ficam
          escondidas por baixo dele exatamente enquanto se escreve. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Com o teclado aberto sobra menos de metade do ecrã: num telemóvel pequeno o conteúdo
            passa a não caber, e sem scroll o que sobra é cortado em vez de se poder alcançar.
            `handled` fecha o teclado ao tocar fora — o teclado numérico não tem tecla de fecho —
            mas deixa o toque nos botões passar à primeira. */}
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.header}>
            <Text variant="label" color={colors.green} style={styles.eyebrow}>
              {t('connect.eyebrow')}
            </Text>
            <Text variant="display" color={colors.light}>
              {t('connect.title')}
            </Text>
            <Text color={colors.grayDark} style={styles.intro}>
              {t('connect.intro')}
            </Text>
          </View>

          <View style={styles.formArea}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              disabled
              style={styles.scanTile}
            >
              <QrMark />
              <View style={styles.scanText}>
                <Text variant="title" color={colors.light} style={styles.scanTitle}>
                  {t('connect.scan')}
                </Text>
                <Text variant="caption" color={colors.grayDark}>
                  {t('connect.scanUnavailable')}
                </Text>
              </View>
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text variant="caption" color={colors.grayDark}>
                {t('connect.or')}
              </Text>
              <View style={styles.dividerLine} />
            </View>

            <View>
              <Text variant="label" color={colors.light} style={styles.fieldLabel}>
                {t('connect.pinLabel')}
              </Text>

              {/* O input real está por cima das casas, transparente: o toque cai nele e abre o
                teclado, mas quem se vê são as seis casas. */}
              <View style={styles.pinField}>
                <View style={styles.pinRow} pointerEvents="none">
                  {Array.from({ length: PIN_LENGTH }, (_, index) => (
                    <PinBox
                      key={index}
                      digit={pin[index]}
                      active={index === pin.length}
                      focused={focused}
                    />
                  ))}
                </View>

                {/* `autoFocus`: escrever o PIN é a única coisa que se pode fazer aqui, por isso o
                  teclado sobe sozinho e ninguém fica à espera que um toque faça alguma coisa.
                  Rever na F1, quando a câmara passar a ser o caminho principal. */}
                <TextInput
                  autoFocus
                  value={pin}
                  onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
                  keyboardType="number-pad"
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  maxLength={PIN_LENGTH}
                  style={styles.hiddenInput}
                  accessibilityLabel={t('connect.pinLabel')}
                />
              </View>
            </View>

            <Button
              label={t('connect.submit')}
              onPress={onSubmit}
              disabled={!complete}
              hint={complete ? undefined : t('connect.pinIncomplete')}
            />
          </View>

          {/* Em paralelo com o QR e o PIN, não em vez deles: nem todo o assalto que se arbitra tem
              poule na plataforma — treinos e provas locais não têm. Este caminho não liga a nada e
              não toca no store da sessão (ADR-021). */}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/timer')}
            style={({ pressed }) => [styles.timerTile, pressed ? styles.timerTilePressed : null]}
          >
            <ClockMark />
            <View style={styles.scanText}>
              <Text variant="title" color={colors.light} style={styles.scanTitle}>
                {t('timer.entry')}
              </Text>
              <Text variant="caption" color={colors.grayDark}>
                {t('timer.entryHint')}
              </Text>
            </View>
          </Pressable>

          <Text variant="caption" color={colors.grayDark} style={styles.notice}>
            {t('common.skeletonNotice')}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

interface PinBoxProps {
  digit: string | undefined;
  /** A casa onde o próximo dígito entra. */
  active: boolean;
  /** O campo tem o foco do teclado. */
  focused: boolean;
}

function PinBox({ digit, active, focused }: PinBoxProps) {
  return (
    <View style={[styles.pinBox, active ? styles.pinBoxActive : null]}>
      {digit ? (
        <Text style={styles.pinDigit}>{digit}</Text>
      ) : active && focused ? (
        <Caret />
      ) : (
        <View style={styles.pinDot} />
      )}
    </View>
  );
}

/**
 * Um `TextInput` normal traz cursor; estas casas são desenhadas à mão e não trazem nada. Sem ele,
 * "à espera do que escreveres" e "morto" ficam iguais — e é exatamente assim que o ecrã parece
 * bloqueado sempre que o teclado do sistema não sobe (teclado físico ligado, simulador, iPad).
 */
function Caret() {
  // `useState` com inicializador em vez de `useRef`: as regras do React Compiler não deixam ler
  // `.current` durante o render (ver ADR-008).
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 120,
          delay: 500,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 120,
          delay: 400,
          useNativeDriver: true,
        }),
      ]),
    );

    blink.start();
    return () => blink.stop();
  }, [opacity]);

  return <Animated.View style={[styles.caret, { opacity }]} />;
}

/** Mostrador com dois ponteiros, desenhado com Views — não há biblioteca de ícones instalada. */
function ClockMark() {
  return (
    <View style={styles.clockMark}>
      <View style={styles.clockHandHour} />
      <View style={styles.clockHandMinute} />
    </View>
  );
}

/** Os três olhos de um código QR, desenhados com Views — não há biblioteca de ícones instalada. */
function QrMark() {
  return (
    <View style={styles.qrMark}>
      <View style={[styles.qrEye, styles.qrEyeTopLeft]} />
      <View style={[styles.qrEye, styles.qrEyeTopRight]} />
      <View style={[styles.qrEye, styles.qrEyeBottomLeft]} />
      <View style={styles.qrSpeck} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  /** `flexGrow` e não `flex`: é o conteúdo de um ScrollView, que cresce mas nunca encolhe. */
  container: {
    flexGrow: 1,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.sm,
    paddingTop: spacing.xl,
  },
  /** Centra o formulário no espaço que sobra — encostado ao fundo ficaria debaixo do teclado. */
  formArea: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  eyebrow: {
    fontFamily: fonts.montserrat,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  intro: {
    maxWidth: 320,
  },
  scanTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.r16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.darkBorder,
    backgroundColor: colors.darkSurface,
    opacity: 0.6,
  },
  scanText: {
    flex: 1,
    gap: 2,
  },
  scanTitle: {
    fontSize: type.lg,
  },
  /** Sem `opacity`, ao contrário do `scanTile`: este está vivo. */
  timerTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.r16,
    borderWidth: 1,
    borderColor: colors.darkBorder,
    backgroundColor: colors.darkSurface,
  },
  timerTilePressed: {
    borderColor: colors.green,
  },
  clockMark: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 4,
    borderColor: colors.green,
  },
  /** Ponteiros a marcar 3:00 — a duração de um assalto de poule. */
  clockHandHour: {
    position: 'absolute',
    width: 2,
    height: 12,
    borderRadius: 1,
    backgroundColor: colors.green,
    marginBottom: 12,
  },
  clockHandMinute: {
    position: 'absolute',
    width: 12,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.green,
    marginLeft: 12,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.darkBorder,
  },
  fieldLabel: {
    marginBottom: spacing.sm,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  pinField: {
    position: 'relative',
  },
  pinRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pinBox: {
    flex: 1,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.r10,
    borderWidth: 1,
    borderColor: colors.darkBorder,
    backgroundColor: colors.darkSurface,
  },
  pinBoxActive: {
    borderColor: colors.green,
    backgroundColor: 'rgba(0, 246, 185, 0.08)',
  },
  pinDigit: {
    fontFamily: fonts.montserrat,
    fontSize: type.xxxl,
    color: colors.light,
    fontVariant: ['tabular-nums'],
  },
  pinDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.darkBorder,
  },
  caret: {
    width: 3,
    height: 32,
    borderRadius: 2,
    backgroundColor: colors.green,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    color: colors.light,
    fontSize: type.xxxl,
    textAlign: 'center',
  },
  notice: {
    textAlign: 'center',
  },
  qrMark: {
    width: 48,
    height: 48,
    borderRadius: radius.r6,
  },
  qrEye: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderWidth: 4,
    borderColor: colors.green,
    borderRadius: radius.r4,
  },
  qrEyeTopLeft: {
    top: 0,
    left: 0,
  },
  qrEyeTopRight: {
    top: 0,
    right: 0,
  },
  qrEyeBottomLeft: {
    bottom: 0,
    left: 0,
  },
  qrSpeck: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: colors.grayDark,
  },
});
