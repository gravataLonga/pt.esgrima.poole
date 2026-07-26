import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { useConnect } from '@/session/useConnect';
import { useSessionStore } from '@/session/store';
import { Banner, Button, Screen, Sheet, Text, colors, fonts, radius, spacing, type } from '@/ui';

const PIN_LENGTH = 6;

/**
 * Ecrã 1 — Ligar (spec §6).
 *
 * O URL do servidor **não** aparece: é detalhe interno, o QR pode trazê-lo no payload (contrato
 * §9) e o árbitro em pavilhão não tem nada a fazer com ele. O store guarda o valor por omissão.
 */
export default function ConnectScreen() {
  const { t } = useTranslation();
  const { connecting, error, blocked, blockedUntil, connect, clearError } = useConnect();
  const endReason = useSessionStore((s) => s.endReason);

  const [pin, setPin] = useState('');
  const [focused, setFocused] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  /**
   * O campo real é invisível e está por cima das casas. Contar com o toque a cair-lhe em cima
   * sozinho é frágil — basta uma camada pelo meio para o alvo desaparecer e o ecrã ficar com ar de
   * avariado, sem teclado e sem explicação. O `Pressable` à volta torna o alvo explícito e pede o
   * foco à mão.
   */
  const input = useRef<TextInput>(null);

  const complete = pin.length === PIN_LENGTH;
  const canSubmit = complete && !connecting && !blocked;

  const onSubmit = () => {
    if (!canSubmit) return;
    void connect(pin);
  };

  // O ecrã de ligar aparece por três razões diferentes — sessão expirada, outro dispositivo
  // assumiu a competição, ou fim de sessão pedido. Só a primeira e a segunda precisam de
  // explicação, e sem ela o árbitro só vê o formulário de novo e conclui que a app se enganou.
  const reason =
    endReason === 'token_expired' || endReason === 'token_revoked'
      ? t(`connect.ended.${endReason}`)
      : null;

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
            {/* A marca em imagem e não desenhada à mão: as barras diagonais do logo atravessam as
                letras por baixo de uma máscara, e isso não se reproduz com Views. É PNG e não SVG
                para não trazer o `react-native-svg` — uma dependência nativa por uma imagem
                (ADR-002). As densidades @2x/@3x estão ao lado; o Metro escolhe a certa. */}
            <View style={styles.brandRow}>
              <Image
                source={require('../assets/logo.png')}
                style={styles.logo}
                resizeMode="contain"
                accessibilityRole="image"
                accessibilityLabel={t('connect.logoLabel')}
              />

              {/* O ecrã pede seis dígitos e nunca diz de onde vêm. Quem chega com a folha na mão
                  não precisa disto, e por isso o "?" não pede nada: fica no canto, à altura do
                  wordmark, onde só é procurado por quem lhe falta a resposta. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('connect.help.title')}
                onPress={() => setHelpOpen(true)}
                // O alvo desenhado tem 32 pt; o `hitSlop` leva-o aos 44 pt das HIG sem o engordar.
                hitSlop={6}
                style={({ pressed }) => [styles.helpMark, pressed ? styles.helpMarkPressed : null]}
              >
                <Text style={styles.helpGlyph}>?</Text>
              </Pressable>
            </View>

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
              onPress={() => router.push('/scan')}
              style={({ pressed }) => [styles.scanTile, pressed ? styles.scanTilePressed : null]}
            >
              <QrMark />
              <View style={styles.scanText}>
                <Text variant="title" color={colors.light} style={styles.scanTitle}>
                  {t('connect.scan')}
                </Text>
                <Text variant="caption" color={colors.grayDark}>
                  {t('connect.scanHint')}
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

            {error ? <Banner tone="danger" message={error} /> : null}
            {!error && reason ? <Banner tone="warning" message={reason} /> : null}

            <View>
              <Text variant="label" color={colors.light} style={styles.fieldLabel}>
                {t('connect.pinLabel')}
              </Text>

              {/* O input real está por cima das casas, transparente: quem se vê são as seis
                casas, e é o `Pressable` que garante que o toque em qualquer uma delas dá foco ao
                campo — mesmo nas que ficam entre caixas. */}
              {/* `accessible={false}`: o controlo a sério é o campo lá dentro, e é ele que o
                VoiceOver deve anunciar. Isto é só o alvo do dedo. */}
              <Pressable
                accessible={false}
                onPress={() => input.current?.focus()}
                style={styles.pinField}
              >
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

                {/* Sem `autoFocus` desde que a câmara existe: o teclado numérico subia sozinho ao
                  entrar e tapava o botão de ler QR, que é o caminho principal. O PIN é agora a
                  alternativa, e quem a quer toca nas casas. */}
                <TextInput
                  ref={input}
                  value={pin}
                  onChangeText={(value) => {
                    clearError();
                    setPin(value.replace(/\D/g, '').slice(0, PIN_LENGTH));
                  }}
                  editable={!connecting}
                  keyboardType="number-pad"
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  maxLength={PIN_LENGTH}
                  style={styles.hiddenInput}
                  accessibilityLabel={t('connect.pinLabel')}
                />
              </Pressable>
            </View>

            <Button
              label={connecting ? t('connect.connecting') : t('connect.submit')}
              onPress={onSubmit}
              disabled={!canSubmit}
              hint={
                blocked
                  ? t('connect.blockedUntil', { time: formatTime(blockedUntil) })
                  : complete
                    ? undefined
                    : t('connect.pinIncomplete')
              }
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


        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fora do ScrollView: o `Modal` não desenha nada no sítio onde está, mas o
          `contentContainerStyle` tem `gap` e um filho de altura zero abriria na mesma um vão. */}
      <Sheet
        visible={helpOpen}
        title={t('connect.help.title')}
        onClose={() => setHelpOpen(false)}
        actions={<Button label={t('connect.help.dismiss')} onPress={() => setHelpOpen(false)} />}
      >
        <View style={styles.helpBody}>
          {[t('connect.help.step1'), t('connect.help.step2'), t('connect.help.step3')].map(
            (step, index) => (
              <View key={step} style={styles.helpStep}>
                <Text style={styles.helpStepNumber}>{index + 1}</Text>
                <Text color={colors.textMuted} style={styles.helpStepText}>
                  {step}
                </Text>
              </View>
            ),
          )}

          <Text variant="caption" color={colors.textMuted}>
            {t('connect.help.reuse')}
          </Text>
        </View>
      </Sheet>
    </Screen>
  );
}

/** Hora local a que o bloqueio levanta — "aguarde 47 s" obrigava a uma contagem que ninguém vê. */
function formatTime(at: number | null): string {
  if (at === null) return '';
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
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
  /** Tamanho nativo do @1x — o wordmark não é para dominar o ecrã, é para o assinar. */
  logo: {
    width: 150,
    height: 40,
    marginBottom: spacing.xs,
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
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  /** Contorno de hairline e não borda verde: é auxílio, não é um caminho do ecrã. */
  helpMark: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.darkBorder,
  },
  helpMarkPressed: {
    borderColor: colors.green,
  },
  helpGlyph: {
    fontFamily: fonts.montserrat,
    fontSize: type.base,
    color: colors.textMutedOnDark,
  },
  helpBody: {
    gap: spacing.sm,
  },
  helpStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  /** Largura fixa para os números alinharem o texto à esquerda uns dos outros. */
  helpStepNumber: {
    width: 16,
    fontFamily: fonts.montserrat,
    fontSize: type.base,
    color: colors.dark,
  },
  helpStepText: {
    flex: 1,
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
  },
  /** Borda a tracejado, como uma moldura de leitura — não como "desativado". */
  scanTilePressed: {
    borderColor: colors.green,
  },
  scanText: {
    flex: 1,
    gap: 2,
  },
  scanTitle: {
    fontSize: type.lg,
  },
  /** Igual ao `scanTile`, menos o tracejado: este não é um alvo de leitura. */
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
