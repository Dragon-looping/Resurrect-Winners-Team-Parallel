/**
 * SETUVYUHA Industrial Design System Tokens
 * Source of truth: stitch_setuvyuha_industrial_warehouse_mobile_system/setuvyuha_design_system.md
 */

export const Colors = {
  // Primary & Brand
  primary: '#123D32',
  onPrimary: '#FFFFFF',
  primaryContainer: '#1D5446',
  onPrimaryContainer: '#FFFFFF',
  antiqueGold: '#C8A25A',

  // Secondary
  secondary: '#535B55',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#DCE7DE',
  onSecondaryContainer: '#123D32',

  // Tertiary
  tertiary: '#5E3233',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#794949',
  onTertiaryContainer: '#FFFFFF',

  // Surfaces (Warm Ivory Ground)
  background: '#F6F5F0',
  onBackground: '#202824',
  surface: '#F6F5F0',
  surfaceDim: '#E5E6DF',
  surfaceBright: '#FFFFFF',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#EFEFE9',
  surfaceContainer: '#EAEAE3',
  surfaceContainerHigh: '#E5E6DF',
  surfaceContainerHighest: '#DCDDD6',
  onSurface: '#202824',
  surfaceVariant: '#DCE7DE',
  onSurfaceVariant: '#535B55',

  // Borders & Inverse
  outline: '#737B75',
  outlineVariant: '#E5E6DF',
  inverseSurface: '#202824',
  inverseOnSurface: '#F6F5F0',
  inversePrimary: '#A4D0B9',

  // Semantic Status
  success: '#123D32',
  onSuccess: '#FFFFFF',
  successContainer: '#DCE7DE',
  onSuccessContainer: '#123D32',

  warning: '#855200',
  onWarning: '#FFFFFF',
  warningContainer: '#F7E7C4',
  onWarningContainer: '#4A2D00',

  error: '#9E2A2B',
  onError: '#FFFFFF',
  errorContainer: '#F9E2E2',
  onErrorContainer: '#6E1617',
} as const;

export const FontFamily = {
  display: 'Archivo_700Bold',
  headline: 'Archivo_700Bold',
  headlineSemiBold: 'Archivo_600SemiBold',
  title: 'Archivo_600SemiBold',
  label: 'Archivo_600SemiBold',
  body: 'PTSans_400Regular',
  bodyBold: 'PTSans_700Bold',
  mono: 'SplineSansMono_500Medium',
  monoRegular: 'SplineSansMono_400Regular',
  monoSemiBold: 'SplineSansMono_600SemiBold',
} as const;

export const Typography = {
  displayMd: {
    fontFamily: FontFamily.display,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  displayMdMobile: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.25,
  },
  headlineLg: {
    fontFamily: FontFamily.headline,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.25,
  },
  headlineMd: {
    fontFamily: FontFamily.headlineSemiBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.15,
  },
  titleMd: {
    fontFamily: FontFamily.title,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0,
  },
  bodyLg: {
    fontFamily: FontFamily.body,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0,
  },
  bodyMd: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0,
  },
  labelLg: {
    fontFamily: FontFamily.label,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  labelMd: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
  },
  labelSm: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
  },
  monoLg: {
    fontFamily: FontFamily.mono,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0,
  },
  monoMd: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
  },
  monoSm: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
  },
} as const;

export const Spacing = {
  gutterXs: 4,
  gutterSm: 8,
  gutterMd: 12,
  gutterLg: 16,
  gutterXl: 24,
  section: 24,
  pageMargin: 16,
} as const;

export const Radii = {
  none: 0,
  sm: 6,
  default: 10,
  md: 12,
  lg: 14,
  full: 9999,
} as const;
