/**
 * Root navigator — the top-level navigation container.
 * Authenticated users see the MainDrawer (left sidebar);
 * unauthenticated users see the sign-in / sign-up stack.
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SignInScreen } from '@/screens/SignInScreen';
import { SignUpScreen } from '@/screens/SignUpScreen';
import { MainDrawer } from './MainDrawer';
import { InAppBrowserScreen } from '@/screens/InAppBrowserScreen';
import { Colors } from '@/constants';
import { useAuth } from '@/contexts';
import type { NavigationParamList } from '@/types';

const Stack = createNativeStackNavigator<NavigationParamList>();

export function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Home" component={MainDrawer} />
            <Stack.Screen
              name="InAppBrowser"
              component={InAppBrowserScreen}
              options={{ headerShown: false }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="SignIn" component={SignInScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
});
