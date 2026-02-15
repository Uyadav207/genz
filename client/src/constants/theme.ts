/**
 * App theme constants — colors, typography, spacing, border radii.
 * Import from here instead of hard-coding values in components.
 */

export const Colors = {
  primary: '#6C63FF',
  primaryLight: '#A5A0FF',
  secondary: '#FF6584',
  background: '#FFFFFF',
  surface: '#F5F5F5',
  text: '#1A1A2E',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  error: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const FontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const;

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;
