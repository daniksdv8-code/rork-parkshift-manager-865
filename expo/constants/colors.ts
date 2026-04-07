export type ThemeColors = typeof DarkColors;

export const DarkColors = {
  background: '#0F1117',
  surface: '#1A1D26',
  surfaceLight: '#232730',
  surfaceHighlight: '#2A2E38',
  border: '#2E323D',
  borderLight: '#383C47',

  primary: '#00BFA6',
  primaryDark: '#00997F',
  primaryLight: '#00E5CC',
  primarySurface: 'rgba(0, 191, 166, 0.08)',

  text: '#F0F0F5',
  textSecondary: '#8B8FA3',
  textTertiary: '#5C6070',

  success: '#34D399',
  successSurface: 'rgba(52, 211, 153, 0.1)',
  warning: '#FBBF24',
  warningSurface: 'rgba(251, 191, 36, 0.1)',
  danger: '#EF4444',
  dangerSurface: 'rgba(239, 68, 68, 0.1)',
  info: '#3B82F6',
  infoSurface: 'rgba(59, 130, 246, 0.1)',

  cash: '#34D399',
  card: '#3B82F6',
  adjustment: '#A78BFA',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
};

export const LightColors: ThemeColors = {
  background: '#F2F3F7',
  surface: '#FFFFFF',
  surfaceLight: '#EEF0F4',
  surfaceHighlight: '#E4E7ED',
  border: '#D8DCE4',
  borderLight: '#C8CDD6',

  primary: '#00997F',
  primaryDark: '#007A66',
  primaryLight: '#00BFA6',
  primarySurface: 'rgba(0, 153, 127, 0.08)',

  text: '#1A1D26',
  textSecondary: '#5C6070',
  textTertiary: '#8B8FA3',

  success: '#16A34A',
  successSurface: 'rgba(22, 163, 74, 0.08)',
  warning: '#D97706',
  warningSurface: 'rgba(217, 119, 6, 0.08)',
  danger: '#DC2626',
  dangerSurface: 'rgba(220, 38, 38, 0.08)',
  info: '#2563EB',
  infoSurface: 'rgba(37, 99, 235, 0.08)',

  cash: '#16A34A',
  card: '#2563EB',
  adjustment: '#7C3AED',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
};

export const Colors = DarkColors;

export const Radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 20,
} as const;

export const FontSize = {
  xs: 11,
  sm: 12,
  md: 13,
  base: 14,
  lg: 15,
  xl: 16,
  '2xl': 18,
  '3xl': 20,
  '4xl': 24,
  '5xl': 28,
} as const;

export const Spacing = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  '4xl': 32,
} as const;

export const IconSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
} as const;

export default Colors;
