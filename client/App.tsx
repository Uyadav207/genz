import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GluestackUIProvider } from '@gluestack-ui/themed';
import { config } from '@gluestack-ui/config';
import { AppProvider, AuthProvider, ThemeProvider } from '@/contexts';
import { RootNavigator } from '@/navigation';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
    <GluestackUIProvider config={config}>
      <ThemeProvider>
        <AppProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </AppProvider>
      </ThemeProvider>
    </GluestackUIProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
