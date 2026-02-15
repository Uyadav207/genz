/**
 * Hook that tracks the app's foreground / background state.
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

export function useAppState(): AppStateStatus {
  const appState = useRef(AppState.currentState);
  const [currentState, setCurrentState] = useState(appState.current);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appState.current = nextState;
      setCurrentState(nextState);
    });

    return () => subscription.remove();
  }, []);

  return currentState;
}
