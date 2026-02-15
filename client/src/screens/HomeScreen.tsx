/**
 * Home screen — the welcome/landing page after authentication.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenWrapper } from '@/components/common';
import { Button } from '@/components/ui';
import { FontSize, Spacing } from '@/constants';
import { useAuth, useTheme } from '@/contexts';

export function HomeScreen() {
  const { user, signOut } = useAuth();
  const { colors } = useTheme();

  const displayName = user?.name || user?.username || 'there';

  return (
    <ScreenWrapper style={styles.wrapper}>
      <View style={styles.content}>
        <Text style={styles.wave}>{'👋'}</Text>
        <Text style={[styles.greeting, { color: colors.textSecondary }]}>Welcome,</Text>
        <Text style={[styles.name, { color: colors.primary }]}>{displayName}!</Text>
        {user?.username ? <Text style={[styles.handle, { color: colors.textSecondary }]}>@{user.username}</Text> : null}
        <View style={[styles.divider, { backgroundColor: colors.primary }]} />
        <Text style={[styles.tagline, { color: colors.textSecondary }]}>You&apos;re all set. Explore GenZ!</Text>
        <View style={styles.buttonGroup}>
          <Button title="Sign Out" variant="outline" onPress={signOut} />
        </View>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  wrapper: { justifyContent: 'center' },
  content: { alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl },
  wave: { fontSize: 56, marginBottom: Spacing.xs },
  greeting: { fontSize: FontSize['2xl'], fontWeight: '600' },
  name: { fontSize: FontSize['4xl'], fontWeight: '800', textAlign: 'center' },
  handle: { fontSize: FontSize.base, marginTop: -2 },
  divider: { width: 48, height: 3, borderRadius: 2, marginVertical: Spacing.md },
  tagline: { fontSize: FontSize.lg, textAlign: 'center' },
  buttonGroup: { marginTop: Spacing.xl, gap: Spacing.sm, width: '100%' },
});
