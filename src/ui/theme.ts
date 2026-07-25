/**
 * Design System Esgrima.pt, portado para React Native.
 *
 * Origem: `.claude/skills/reference/DESIGN_SYSTEM.md` e `tokens/theme.css` (Tailwind v4, web).
 * Cores, raios, escala tipográfica e fontes passam iguais. O que é específico de web
 * (hover, focus rings, breakpoints, `prose`) não tem equivalente em RN e fica de fora.
 *
 * Adaptações deliberadas para o contexto de arbitragem em pavilhão:
 * - `touch.min` (48) e `touch.large` (96) — o cronómetro exige alvo tocável generoso (spec §7).
 * - `type.timer` — fora da escala web; o cronómetro tem de ler-se a 2 m (spec §7).
 */

export const colors = {
  light: '#FEFEFE',
  dark: '#1D3749',
  black: '#000000',

  /** Superfície elevada sobre `dark`. Não existe na web (lá o contraste vem do scroll). */
  darkSurface: '#26485F',
  /** Hairline sobre fundo escuro — `grayMedium` a esta luminosidade fica berrante. */
  darkBorder: 'rgba(254, 254, 254, 0.14)',

  grayDark: '#BBC3C8',
  grayMedium: '#E8EBED',
  grayLight: '#EFF1F2',

  /**
   * Texto secundário sobre fundo claro. **Não usar `grayDark`** para isto: o design system dá-lhe
   * o papel de *disabled text* e a 1.77:1 sobre `light` falha a WCAG AA por larga margem.
   * Coberto por `contrast.test.ts`.
   */
  textMuted: '#5A6C7A',
  /** Texto secundário sobre `dark`/`darkSurface`. `grayDark` já passa AA nesses fundos. */
  textMutedOnDark: '#BBC3C8',

  green: '#00F6B9',
  mediumGreen: '#00E0A9',
  lightGreen: '#63FFDF',
  /** Fundo do estado premido dos botões fantasma verdes. */
  green4: 'rgba(0, 246, 185, 0.04)',

  danger: '#DE161A',
  lightDanger: '#FEF3F3',
  warning: '#E56B00',
  lightWarning: '#FEF5EB',
  success: '#008F61',
  lightSuccess: '#E7F5F2',

  /**
   * Variantes escurecidas das cores de estado, **só para texto pequeno**. As originais são cores de
   * sinalização (preenchimentos, bordas, dígitos grandes) e nenhuma delas chega a 4.5:1 a 12–14 pt
   * sobre o respetivo fundo claro. Coberto por `contrast.test.ts`.
   */
  dangerText: '#C41417',
  warningText: '#B35200',
  successText: '#00754F',

  /** Cartões FIE. O amarelo pede texto escuro; o vermelho e o preto pedem texto claro. */
  cardYellow: '#FFD43B',
  cardRed: '#DE161A',
  cardBlack: '#1D1D1D',
} as const;

export const radius = {
  none: 0,
  r4: 4,
  r6: 6,
  r10: 10,
  r16: 16,
  r22: 22,
  full: 9999,
} as const;

/** Escala de espaçamento do Tailwind (4px por unidade), nas medidas realmente usadas. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const fonts = {
  montserrat: 'Montserrat_700Bold',
  montserratRegular: 'Montserrat_400Regular',
  workSans: 'WorkSans_400Regular',
  workSansBold: 'WorkSans_700Bold',
} as const;

/** Escala tipográfica da §2 do design system, em pontos. */
export const type = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  subtitle: 24,
  xxxl: 30,
  display: 36,
  /** Só para o cronómetro — legível a 2 m. */
  timer: 88,
} as const;

/** Alvos tocáveis mínimos. `large` é o do cronómetro (spec §7: ≥ 96 pt). */
export const touch = {
  min: 48,
  large: 96,
} as const;

export const shadow = {
  card: {
    shadowColor: colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  /** Só para o que tem de flutuar sobre o resto: cartão do próximo assalto e do cronómetro. */
  raised: {
    shadowColor: colors.dark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;
