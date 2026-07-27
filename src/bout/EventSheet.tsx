import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Sheet, Text, colors, fonts, radius, spacing, type } from '@/ui';

import type { BoutTiming } from './phase';
import type { Side } from './rules';
import type { BoutLogEntry } from './useBoutEngine';

export interface EventSheetProps {
  visible: boolean;
  log: BoutLogEntry[];
  timing: BoutTiming;
  /** Como se chama cada lado — o nome do atleta, ou a cor no modo cronómetro. */
  nameOf: (side: Side) => string;
  onClose: () => void;
}

/**
 * O que já aconteceu no assalto, do mais recente para o mais antigo.
 *
 * Existe porque o árbitro é interpelado: *"o segundo amarelo foi antes ou depois do meu toque?"*,
 * *"a que minuto foi o vermelho?"*. Até aqui a única resposta era a memória — a app registava tudo
 * e não mostrava nada. **A linha temporal é local** e vem do motor do assalto (`engine.log`), não
 * da API: o contrato só tem `POST .../events` (contrato §7), e não há endpoint que devolva o que já
 * subiu. Ver `docs/API-CONTRACT.md` §"Linha temporal por ler".
 *
 * O tempo de cada linha é o **decorrido dentro da fase**, que é como o árbitro o viu no mostrador a
 * contar para baixo — não uma hora do relógio, que ninguém olhou.
 */
export function EventSheet({ visible, log, timing, nameOf, onClose }: EventSheetProps) {
  const { t } = useTranslation();

  return (
    <Sheet
      visible={visible}
      title={t('bout.events.title')}
      subtitle={log.length > 0 ? t('bout.events.subtitle') : undefined}
      onClose={onClose}
      actions={<Button label={t('bout.events.close')} variant="secondary" onPress={onClose} />}
    >
      {log.length === 0 ? (
        <Text color={colors.textMuted}>{t('bout.events.empty')}</Text>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {[...log].reverse().map((entry) => (
            <Row key={entry.seq} entry={entry} timing={timing} nameOf={nameOf} />
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

interface RowProps {
  entry: BoutLogEntry;
  timing: BoutTiming;
  nameOf: (side: Side) => string;
}

function Row({ entry, timing, nameOf }: RowProps) {
  const { t } = useTranslation();

  // A morte súbita é `periods + 1` (contrato §7) e não tem número que se leia: mostra-se pelo nome.
  const period =
    entry.period > timing.periods
      ? t('bout.events.suddenDeath')
      : t('bout.events.period', { period: entry.period });

  return (
    <View style={styles.row}>
      <Text style={styles.period}>{period}</Text>
      <Text style={styles.at}>{elapsed(entry.at_ms)}</Text>

      <View style={styles.what}>
        <Text variant="label" style={styles.type}>
          {t(`bout.events.type.${entry.type}`)}
        </Text>
        {entry.side ? (
          <Text variant="caption" numberOfLines={1}>
            {nameOf(entry.side)}
          </Text>
        ) : null}
      </View>

      {/* O placar **depois** do acontecimento, no preto do painel: é o mesmo número, e lê-se como
          uma continuação dele em vez de mais uma coluna de texto.

          Só aparece em quem o traz: o placar pertence aos eventos que o mudam (ADR-035), e um
          `–—–` num painel preto lê-se como um resultado a zero em vez de "não se aplica". */}
      {entry.score_a === undefined || entry.score_b === undefined ? null : (
        <View style={styles.score}>
          <Text style={styles.scoreText}>
            {entry.score_a}–{entry.score_b}
          </Text>
        </View>
      )}
    </View>
  );
}

/** `M:SS` decorridos dentro da fase. */
function elapsed(atMs: number): string {
  const seconds = Math.floor(Math.max(0, atMs) / 1000);
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  // Teto e não altura fixa: um assalto com três acontecimentos não abre uma folha de meio ecrã.
  list: {
    maxHeight: 320,
  },
  listContent: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayMedium,
  },
  period: {
    width: 28,
    fontFamily: fonts.workSansBold,
    fontSize: type.xs,
    color: colors.textMuted,
  },
  at: {
    width: 38,
    fontFamily: fonts.workSans,
    fontSize: type.xs,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  what: {
    flex: 1,
    minWidth: 0,
  },
  type: {
    fontFamily: fonts.montserrat,
  },
  score: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.r4,
    backgroundColor: colors.black,
  },
  scoreText: {
    fontFamily: fonts.montserrat,
    fontSize: type.sm,
    color: colors.green,
    fontVariant: ['tabular-nums'],
  },
});
