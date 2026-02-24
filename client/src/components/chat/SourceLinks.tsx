/**
 * Source links — clickable references from web search / research.
 */

import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import type { SourceItem } from '@/services/api';
import type { ThemeColors } from '@/contexts';

interface SourceLinksProps {
  sources: SourceItem[];
  colors: ThemeColors;
  onLinkPress?: (url: string) => void;
}

export function SourceLinks({ sources, colors, onLinkPress }: SourceLinksProps) {
  if (!sources?.length) return null;

  const handlePress = (url: string) => {
    if (onLinkPress) {
      onLinkPress(url);
    } else {
      Linking.openURL(url).catch(() => { });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.textSecondary }]}>Sources</Text>
      <View style={styles.list}>
        {sources.slice(0, 8).map((s, i) => (
          <TouchableOpacity
            key={`${s.url}-${i}`}
            style={[styles.linkRow, { borderColor: colors.border }]}
            activeOpacity={0.7}
            onPress={() => handlePress(s.url)}
          >
            <ExternalLink size={14} color={colors.primary} />
            <View style={styles.linkContent}>
              <Text style={[styles.linkText, { color: colors.primary }]} numberOfLines={1} ellipsizeMode="tail">
                {s.title || s.url}
              </Text>
              {s.snippet ? (
                <Text style={[styles.snippet, { color: colors.textSecondary }]} numberOfLines={2} ellipsizeMode="tail">
                  {s.snippet}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12, gap: 6 },
  title: { fontSize: 13, fontWeight: '600' },
  list: { gap: 6 },
  linkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
  linkContent: { flex: 1, gap: 2 },
  linkText: { fontSize: 13 },
  snippet: { fontSize: 12, lineHeight: 16 },
});
