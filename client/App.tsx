import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GluestackUIProvider } from '@gluestack-ui/themed';
import { config } from '@gluestack-ui/config';
import { AppProvider, AuthProvider, ThemeProvider } from '@/contexts';
import { RootNavigator } from '@/navigation';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <GluestackUIProvider config={config}>
      <ThemeProvider>
        <AppProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </AppProvider>
      </ThemeProvider>
    </GluestackUIProvider>
    </GestureHandlerRootView>
  );
}
