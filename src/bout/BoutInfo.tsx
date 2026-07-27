import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Sheet, Text, colors, fonts, radius, spacing, type } from '@/ui';

import type { BoutTiming } from './phase';

export interface BoutInfoProps {
  timing: BoutTiming;
  /** Toques que terminam o assalto. */
  target: number;
}

/**
 * O "?" do cabeçalho, e a folha que ele abre: **as regras deste assalto**, e como se conduz.
 *
 * Ali esteve "Até 5 toques", e era pouco pelo espaço que ocupava: dizia o alvo e escondia tudo o
 * resto — quantos períodos, quanto dura o descanso, quanto tempo tem a morte súbita. Nada disso é
 * escolha do árbitro: vem da API a cada assalto (contrato §7), muda entre poule e quadro, e não
 * havia onde o consultar sem sair do ecrã.
 *
 * O "?" também não pede nada a quem já sabe — é a mesma marca do ecrã de ligar, e fica no mesmo
 * canto. Quem chega com a folha na mão nunca lhe toca.
 */
export function BoutInfo({ timing, target }: BoutInfoProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const length = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;

    if (minutes === 0) return t('bout.info.seconds', { count: rest });
    if (rest === 0) return t('bout.info.minutes', { count: minutes });
    return `${t('bout.info.minutes', { count: minutes })} ${t('bout.info.seconds', { count: rest })}`;
  };

  /**
   * Só o que este assalto tem. Um assalto de poule não tem descanso nem períodos para separar, e
   * uma linha a dizer "Descanso: 0 s" seria uma regra a mais para ler no meio de outras.
   */
  const rows: { key: string; label: string; value: string }[] = [
    {
      key: 'target',
      label: t('bout.info.rows.target'),
      value: t('bout.info.touches', { count: target }),
    },
    // Quantos períodos e quanto dura cada um são duas coisas, e vão em duas linhas. Num assalto de
    // um período só, a primeira não existe e a segunda passa a chamar-se apenas "Tempo": não há
    // período nenhum a que o tempo pertença em contraste com outro.
    ...(timing.periods > 1
      ? [
          {
            key: 'periods',
            label: t('bout.info.rows.periods'),
            value: String(timing.periods),
          },
        ]
      : []),
    {
      key: 'time',
      label: timing.periods > 1 ? t('bout.info.rows.periodTime') : t('bout.info.rows.time'),
      value: length(timing.durationSeconds),
    },
    ...(timing.restSeconds > 0
      ? [
          {
            key: 'rest',
            label: t('bout.info.rows.rest'),
            value: length(timing.restSeconds),
          },
        ]
      : []),
    ...(timing.suddenDeathSeconds > 0
      ? [
          {
            key: 'suddenDeath',
            label: t('bout.info.rows.suddenDeath'),
            value: length(timing.suddenDeathSeconds),
          },
        ]
      : []),
    ...(timing.passivitySeconds > 0
      ? [
          {
            key: 'passivity',
            label: t('bout.info.rows.passivity'),
            value: length(timing.passivitySeconds),
          },
        ]
      : []),
  ];

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('bout.info.title')}
        onPress={() => setOpen(true)}
        // O alvo desenhado tem 32 pt; o `hitSlop` leva-o aos 44 pt das HIG sem o engordar.
        hitSlop={6}
        style={({ pressed }) => [styles.mark, pressed ? styles.markPressed : null]}
      >
        <Text style={styles.glyph}>?</Text>
      </Pressable>

      <Sheet
        visible={open}
        title={t('bout.info.title')}
        onClose={() => setOpen(false)}
        actions={<Button label={t('bout.info.dismiss')} onPress={() => setOpen(false)} />}
      >
        <View style={styles.rows}>
          {rows.map((row, index) => (
            <View key={row.key} style={[styles.row, index > 0 ? styles.rowDivided : null]}>
              <Text variant="label" color={colors.textMuted}>
                {row.label}
              </Text>
              <Text style={styles.value}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* As três coisas que o ecrã não diz sozinho: o mostrador ser botão, o painel do resultado
            ser botão, e o cartão anular-se sem largar. As restantes descobrem-se a olhar. */}
        <Text variant="label" style={styles.howTitle}>
          {t('bout.info.howTitle')}
        </Text>
        <View style={styles.how}>
          <Text variant="caption" style={styles.line}>
            {t('bout.info.howClock')}
          </Text>
          <Text variant="caption" style={styles.line}>
            {t('bout.info.howTouch')}
          </Text>
          <Text variant="caption" style={styles.line}>
            {t('bout.info.howCards')}
          </Text>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  mark: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1.5,
    // `textMuted` e não `grayDark`: o contorno é o que identifica o botão, e a WCAG 1.4.11 pede-lhe
    // 3:1. O `grayDark` sobre branco dá 1.77 — o mesmo erro que motivou o `contrast.test.ts`.
    borderColor: colors.textMuted,
  },
  markPressed: {
    backgroundColor: colors.grayLight,
  },
  glyph: {
    fontFamily: fonts.montserrat,
    fontSize: type.base,
    color: colors.textMuted,
  },
  rows: {
    borderRadius: radius.r10,
    borderWidth: 1,
    borderColor: colors.grayMedium,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  rowDivided: {
    borderTopWidth: 1,
    borderTopColor: colors.grayMedium,
  },
  value: {
    fontFamily: fonts.montserrat,
    fontSize: type.base,
    color: colors.dark,
    fontVariant: ['tabular-nums'],
  },
  howTitle: {
    marginTop: spacing.md,
    fontFamily: fonts.montserrat,
  },
  how: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  line: {
    lineHeight: type.base + 2,
  },
});
