/**
 * Citation pill — tappable [1], [2], … that opens the corresponding source link.
 * Used in research answers with inline citations.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { SourceItem } from '@/services/api';
import type { ThemeColors } from '@/contexts';

interface CitationPillProps {
  sourceIndex: number; // 1-based
  sources: SourceItem[];
  colors: ThemeColors;
  onLinkPress?: (url: string) => void;
}

export function CitationPill({ sourceIndex, sources, colors, onLinkPress }: CitationPillProps) {
  const idx = sourceIndex - 1;
  const source = sources[idx];
  const url = source?.link;

  const handlePress = () => {
    if (url && onLinkPress) {
      onLinkPress(url);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={[styles.pill, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
    >
      <Text style={[styles.text, { color: colors.primary }]}>[{sourceIndex}]</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginHorizontal: 2,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
});
