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
  primary: '#B57EDC',
  primaryLight: '#D8B4FE',
  secondary: '#1E1E1E',
  background: '#FAFAFF',
  surface: '#F0EDF5',
  surfaceSecondary: '#EAE5F2',
  text: '#1B1528',
  textSecondary: '#7B6F8E',
  border: '#DDD6E8',
  error: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  white: '#FFFFFF',
  black: '#000000',
  card: '#FFFFFF',
  inputBackground: '#EAE5F2',
  codeBackground: '#1E1A28',
  codeText: '#FFFFFF',
};

const DarkColors: ThemeColors = {
  primary: '#CDA4F0',
  primaryLight: '#D8B4FE',
  secondary: '#FFFFFF',
  background: '#0D0D12',
  surface: '#1A1822',
  surfaceSecondary: '#24222E',
  text: '#F2F0F7',
  textSecondary: '#9D93B0',
  border: '#2E2A3A',
  error: '#F87171',
  success: '#4ADE80',
  warning: '#FBBF24',
  white: '#FFFFFF',
  black: '#000000',
  card: '#1A1822',
  inputBackground: '#1E1C28',
  codeBackground: '#0A0810',
  codeText: '#FFFFFF',
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
