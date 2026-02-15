/**
 * Global app context — use for lightweight cross-cutting state.
 * For heavier state management, consider Zustand or Redux Toolkit.
 */

import React, { createContext, useContext, useMemo, useState } from 'react';

interface AppContextValue {
  isOnboarded: boolean;
  setIsOnboarded: (value: boolean) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isOnboarded, setIsOnboarded] = useState(false);

  const value = useMemo(() => ({ isOnboarded, setIsOnboarded }), [isOnboarded]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used within an <AppProvider />');
  }
  return ctx;
}
