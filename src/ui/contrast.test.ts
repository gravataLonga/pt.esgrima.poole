/**
 * Contraste dos pares de cores realmente usados na app, contra a WCAG 2.1 AA.
 *
 * Existe porque o contraste é a única regra de design que se pode verificar sozinha, e porque já
 * falhou uma vez: `grayDark` (#BBC3C8) — que o design system reserva para *disabled text* — estava
 * a servir de texto secundário sobre fundo branco, a **1.77:1**. Num pavilhão iluminado a 2 m, isso
 * é texto invisível.
 *
 * Um par novo no código sem entrada nesta tabela não é apanhado por nada. Ao acrescentar uma
 * combinação de cor/fundo, acrescenta-a aqui.
 */

import { colors } from './theme';

/** Luminância relativa, WCAG 2.1 §relative-luminance. Só aceita hex de 6 dígitos. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const [r = 0, g = 0, b = 0] = linear;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/** AA: 4.5:1 para texto normal, 3:1 para texto grande (≥ 18.66 pt bold ou ≥ 24 pt). */
const AA_NORMAL = 4.5;
const AA_LARGE = 3;

type Pair = [name: string, foreground: string, background: string];

const normalText: Pair[] = [
  ['texto principal sobre fundo claro', colors.dark, colors.light],
  ['texto principal sobre cinzento claro', colors.dark, colors.grayLight],
  ['texto secundário sobre fundo claro', colors.textMuted, colors.light],
  ['texto secundário sobre cinzento claro', colors.textMuted, colors.grayLight],
  ['texto claro sobre fundo escuro', colors.light, colors.dark],
  ['texto claro sobre superfície escura', colors.light, colors.darkSurface],
  ['texto secundário sobre fundo escuro', colors.textMutedOnDark, colors.dark],
  ['acento verde sobre fundo escuro', colors.green, colors.dark],
  ['acento verde sobre superfície escura', colors.green, colors.darkSurface],
  ['texto escuro sobre botão verde', colors.dark, colors.green],
  ['erro sobre fundo de erro', colors.dangerText, colors.lightDanger],
  ['erro sobre fundo claro', colors.dangerText, colors.light],
  ['aviso sobre fundo de aviso', colors.warningText, colors.lightWarning],
  ['aviso sobre fundo claro', colors.warningText, colors.light],
  ['sucesso sobre fundo de sucesso', colors.successText, colors.lightSuccess],
  ['sucesso sobre fundo claro', colors.successText, colors.light],
  ['cartão amarelo', colors.dark, colors.cardYellow],
  ['cartão vermelho', colors.light, colors.cardRed],
  ['cartão preto', colors.light, colors.cardBlack],
];

/** Só o cronómetro (88 pt) e os resultados (48–68 pt). Nada de 12–16 pt entra nesta lista. */
const largeText: Pair[] = [
  ['cronómetro em tempo esgotado', colors.danger, colors.light],
  ['cronómetro nos últimos 10 s', colors.warning, colors.light],
  ['resultado no limite de toques', colors.success, colors.light],
];

/**
 * WCAG 1.4.11: elementos **não textuais** que transmitem informação também precisam de 3:1. São o
 * símbolo de play/pausa e os pontos dos períodos, contra os quatro fundos que o mostrador toma —
 * normal, esgotado, descanso e morte súbita. É por isto que os pontos levam contorno escuro: o
 * preenchimento verde sozinho sobre branco dá 1.4:1.
 */
const nonText: Pair[] = [
  ['símbolo play/pausa sobre o mostrador', colors.textMuted, colors.light],
  ['símbolo play/pausa em descanso', colors.textMuted, colors.grayLight],
  ['símbolo play/pausa em tempo esgotado', colors.textMuted, colors.lightDanger],
  ['símbolo play/pausa em morte súbita', colors.textMuted, colors.lightWarning],
  ['contorno dos pontos de período', colors.dark, colors.light],
  ['contorno dos pontos em morte súbita', colors.dark, colors.lightWarning],
  ['borda do mostrador a correr', colors.green, colors.dark],
];

describe('contraste WCAG AA', () => {
  it.each(normalText)('%s — texto normal ≥ 4.5:1', (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it.each(largeText)('%s — texto grande ≥ 3:1', (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it.each(nonText)('%s — elemento não textual ≥ 3:1', (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('trava a regressão que motivou este ficheiro', () => {
    // `grayDark` é *disabled text*. Se alguém o promover a texto secundário, isto explica porquê não.
    expect(contrastRatio(colors.grayDark, colors.light)).toBeLessThan(AA_LARGE);
  });
});
