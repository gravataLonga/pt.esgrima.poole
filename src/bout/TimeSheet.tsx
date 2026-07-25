import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formatCountdown } from '@/timer/format';
import { Button, Sheet, Text, colors, fonts, radius, sheetStyles, spacing, type } from '@/ui';

export interface TimeSheetProps {
  visible: boolean;
  /** Tempo que falta agora, em ms — é o valor com que os campos abrem. */
  remainingMs: number;
  /** Duração cheia da fase atual, para o "repor". */
  durationSeconds: number;
  onApply: (ms: number) => void;
  onReset: () => void;
  onClose: () => void;
}

const clampDigits = (value: string, max: number): string => {
  const digits = value.replace(/\D/g, '').slice(0, 2);
  if (digits === '') return '';
  return Math.min(max, Number(digits)).toString();
};

/**
 * Acertar o cronómetro à mão. Existe porque um assalto real tem paragens que o cronómetro não vê —
 * material partido, uma discussão, um toque que se percebeu tarde — e a alternativa a acertar era
 * repor e voltar a contar de cabeça.
 *
 * Também é onde o **repor** vive: é a mesma pergunta ("que tempo devia estar no relógio?"), e
 * juntá-los tirou um botão permanente do ecrã.
 */
export function TimeSheet({
  visible,
  remainingMs,
  durationSeconds,
  onApply,
  onReset,
  onClose,
}: TimeSheetProps) {
  const { t } = useTranslation();

  const totalSeconds = Math.floor(Math.max(0, remainingMs) / 1000);
  // `key` remonta os campos sempre que a folha abre, para virem com o tempo atual em vez do que lá
  // ficou da última vez.
  return (
    <TimeSheetFields
      key={visible ? `${totalSeconds}` : 'closed'}
      visible={visible}
      initialMinutes={Math.floor(totalSeconds / 60)}
      initialSeconds={totalSeconds % 60}
      durationSeconds={durationSeconds}
      onApply={onApply}
      onReset={onReset}
      onClose={onClose}
      t={t}
    />
  );
}

interface FieldsProps {
  visible: boolean;
  initialMinutes: number;
  initialSeconds: number;
  durationSeconds: number;
  onApply: (ms: number) => void;
  onReset: () => void;
  onClose: () => void;
  t: ReturnType<typeof useTranslation>['t'];
}

function TimeSheetFields({
  visible,
  initialMinutes,
  initialSeconds,
  durationSeconds,
  onApply,
  onReset,
  onClose,
  t,
}: FieldsProps) {
  const [minutes, setMinutes] = useState(initialMinutes.toString());
  const [seconds, setSeconds] = useState(initialSeconds.toString().padStart(2, '0'));

  const totalMs = (Number(minutes || 0) * 60 + Number(seconds || 0)) * 1000;

  return (
    <Sheet
      visible={visible}
      title={t('bout.time.title')}
      subtitle={t('bout.time.subtitle')}
      onClose={onClose}
      actions={
        <>
          <Button label={t('bout.time.apply')} onPress={() => onApply(totalMs)} />
          <View style={sheetStyles.actionRow}>
            <View style={sheetStyles.actionItem}>
              <Button
                label={t('bout.time.reset', { time: formatCountdown(durationSeconds * 1000) })}
                variant="secondary"
                onPress={onReset}
              />
            </View>
            <View style={sheetStyles.actionItem}>
              <Button label={t('common.cancel')} variant="secondary" onPress={onClose} />
            </View>
          </View>
        </>
      }
    >
      <View style={styles.fields}>
        <Field
          label={t('bout.time.minutes')}
          value={minutes}
          onChangeText={(value) => setMinutes(clampDigits(value, 59))}
        />
        <Text style={styles.colon}>:</Text>
        <Field
          label={t('bout.time.seconds')}
          value={seconds}
          onChangeText={(value) => setSeconds(clampDigits(value, 59))}
        />
      </View>
    </Sheet>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}

function Field({ label, value, onChangeText }: FieldProps) {
  return (
    <View style={styles.field}>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
        style={styles.input}
      />
      <Text variant="caption" color={colors.textMuted} style={styles.fieldLabel}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fields: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  field: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  input: {
    width: 96,
    height: 72,
    textAlign: 'center',
    fontFamily: fonts.montserrat,
    fontSize: type.display,
    color: colors.dark,
    borderWidth: 1,
    borderColor: colors.grayMedium,
    borderRadius: radius.r10,
    backgroundColor: colors.grayLight,
  },
  fieldLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  colon: {
    fontFamily: fonts.montserrat,
    fontSize: type.xxxl,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
});
