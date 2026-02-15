/**
 * ScreenWrapper — provides SafeArea + consistent padding for every screen.
 */

import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Spacing } from '@/constants';
import { useTheme } from '@/contexts';

interface ScreenWrapperProps extends ViewProps {
  children: React.ReactNode;
  padded?: boolean;
}

export function ScreenWrapper({ children, padded = true, style, ...rest }: ScreenWrapperProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }, padded && styles.padded, style]} {...rest}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: Spacing.md,
  },
});
