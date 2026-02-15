/**
 * ThemeContext — provides light/dark mode support across the app.
 * Defaults to system preference, with manual override.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { storage } from '@/utils/storage';

/* ------------------------------------------------------------------ */
/*  Color palettes                                                     */
/* ------------------------------------------------------------------ */

export type ThemeColors = {
  primary: string;
  primaryLight: string;
  secondary: string;
  background: string;
  surface: string;
  surfaceSecondary: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
  warning: string;
  white: string;
  black: string;
  card: string;
  inputBackground: string;
  codeBackground: string;
  codeText: string;
};

const LightColors: ThemeColors = {
  primary: '#6C63FF',
  primaryLight: '#A5A0FF',
  secondary: '#FF6584',
  background: '#FFFFFF',
  surface: '#F5F5F5',
  surfaceSecondary: '#F3F4F6',
  text: '#1A1A2E',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  error: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  white: '#FFFFFF',
  black: '#000000',
  card: '#FFFFFF',
  inputBackground: '#F3F4F6',
  codeBackground: '#1E1E1E',
  codeText: '#D4D4D4',
};

const DarkColors: ThemeColors = {
  primary: '#817BFF',
  primaryLight: '#A5A0FF',
  secondary: '#FF6584',
  background: '#0F0F0F',
  surface: '#1A1A1A',
  surfaceSecondary: '#222222',
  text: '#F1F1F1',
  textSecondary: '#9CA3AF',
  border: '#2A2A2A',
  error: '#F87171',
  success: '#4ADE80',
  warning: '#FBBF24',
  white: '#FFFFFF',
  black: '#000000',
  card: '#1A1A1A',
  inputBackground: '#1E1E1E',
  codeBackground: '#0A0A0A',
  codeText: '#D4D4D4',
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'app.theme_mode';

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [loaded, setLoaded] = useState(false);

  // Load saved preference
  useEffect(() => {
    storage.get<ThemeMode>(STORAGE_KEY).then((saved) => {
      if (saved) setModeState(saved);
      setLoaded(true);
    });
  }, []);

  const setMode = useCallback(async (newMode: ThemeMode) => {
    setModeState(newMode);
    await storage.set(STORAGE_KEY, newMode);
  }, []);

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const colors = isDark ? DarkColors : LightColors;

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, isDark, colors, setMode }),
    [mode, isDark, colors, setMode],
  );

  // Don't render until preference is loaded (avoids flash)
  if (!loaded) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider />');
  }
  return ctx;
}
