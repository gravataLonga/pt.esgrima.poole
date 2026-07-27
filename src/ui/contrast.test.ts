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
  // O painel preto do mostrador e do resultado. As variantes escurecidas (`warningText`,
  // `dangerText`) não entram aqui de propósito: existem para texto pequeno sobre fundo claro, e
  // sobre preto são o contrário do que é preciso.
  ['etiqueta sobre o painel', colors.textMutedOnDark, colors.black],
  ['tecla preta do assalto', colors.green, colors.black],
  ['nome sobre o painel', colors.light, colors.black],
  ['morte súbita sobre o painel', colors.warning, colors.black],
  ['cartão amarelo', colors.dark, colors.cardYellow],
  ['cartão vermelho', colors.light, colors.cardRed],
  ['cartão preto', colors.light, colors.cardBlack],
  // O marcador: nome, clube e contagens dos cartões, dentro do painel preto. A contagem do cartão
  // preto é **escura** por isto mesmo — clara sobre o cinzento do painel dava 3.42:1.
  ['nome do atleta no marcador', colors.light, colors.black],
  ['clube no marcador', colors.textMutedOnDark, colors.black],
  ['marca de prioridade no marcador', colors.warning, colors.black],
  ['contagem do cartão preto no marcador', colors.black, colors.cardOnPanel],
];

/**
 * Os algarismos de pontos do cronómetro e dos resultados. Não são texto para o sistema — são
 * `View`s —, mas são-no para quem olha, e é por isso que se medem pela régua do texto grande e não
 * pelos 3:1 do não textual.
 */
const largeText: Pair[] = [
  ['cronómetro a contar', colors.green, colors.black],
  ['cronómetro nos últimos 10 s', colors.warning, colors.black],
  ['cronómetro em tempo esgotado', colors.danger, colors.black],
  ['cronómetro em descanso', colors.textMutedOnDark, colors.black],
  ['resultado do lado verde', colors.green, colors.black],
  ['resultado do lado vermelho', colors.cardRed, colors.black],
  ['resultado sem lado, na poule', colors.light, colors.black],
  ['resultado de quem vai à frente, na poule', colors.green, colors.black],
];

/**
 * WCAG 1.4.11: elementos **não textuais** que transmitem informação também precisam de 3:1. São o
 * símbolo de play/pausa e os pontos dos períodos, contra os quatro fundos que o mostrador toma —
 * normal, esgotado, descanso e morte súbita. É por isto que os pontos levam contorno escuro: o
 * preenchimento verde sozinho sobre branco dá 1.4:1.
 */
const nonText: Pair[] = [
  ['símbolo play/pausa sobre o painel', colors.textMutedOnDark, colors.black],
  ['contorno dos pontos de período', colors.textMutedOnDark, colors.black],
  ['ponto do período a decorrer', colors.green, colors.black],
  ['borda do mostrador a correr', colors.green, colors.black],
  ['borda do mostrador em morte súbita', colors.warning, colors.black],
  ['borda do mostrador em tempo esgotado', colors.danger, colors.black],
  ['galhos de mudar de período', colors.textMutedOnDark, colors.black],
  ['lâmpada de limite de toques', colors.green, colors.black],
  ['contorno do botão de retirar toque', colors.textMuted, colors.light],
  // Os cartões do marcador, por dar (contorno) e dados (preenchimento), contra o painel preto.
  ['cartão amarelo no marcador', colors.cardYellow, colors.black],
  ['cartão vermelho no marcador', colors.cardRed, colors.black],
  ['cartão preto no marcador', colors.cardOnPanel, colors.black],
  ['traço de retirar toque no marcador', colors.textMutedOnDark, colors.black],
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
