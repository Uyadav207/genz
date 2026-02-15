/**
 * Message banner — compact notice for low-confidence or partial research results.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AlertCircle, Clock } from 'lucide-react-native';
import type { ThemeColors } from '@/contexts';

interface MessageBannerProps {
  variant: 'low_confidence' | 'partial';
  colors: ThemeColors;
}

const COPY = {
  low_confidence: 'Limited sources found — consider rephrasing or double-checking important facts.',
  partial: 'Research was incomplete due to time limits; here\'s what we found so far.',
} as const;

export function MessageBanner({ variant, colors }: MessageBannerProps) {
  const message = COPY[variant];
  const Icon = variant === 'low_confidence' ? AlertCircle : Clock;

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <Icon size={14} color={colors.textSecondary} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
  },
  text: {
    fontSize: 12,
    flex: 1,
  },
});
