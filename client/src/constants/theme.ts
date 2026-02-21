/**
 * App theme constants — colors, typography, spacing, border radii.
 * Import from here instead of hard-coding values in components.
 */

export const Colors = {
  primary: '#B57EDC',
  primaryLight: '#D8B4FE',
  secondary: '#1E1E1E',
  background: '#FAFAFF',
  surface: '#F0EDF5',
  text: '#1B1528',
  textSecondary: '#7B6F8E',
  border: '#DDD6E8',
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

/** Sidebar (drawer) width — sized to fit nav labels + chat list. */
export const SIDEBAR_WIDTH = 220;
