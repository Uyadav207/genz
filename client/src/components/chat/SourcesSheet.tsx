/**
 * Sources sheet — bottom slider listing all sources. Opens when user taps "Sources" on a message.
 */

import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ExternalLink, X } from 'lucide-react-native';
import type { SourceItem } from '@/services/api';
import type { ThemeColors } from '@/contexts';

interface SourcesSheetProps {
  visible: boolean;
  sources: SourceItem[];
  colors: ThemeColors;
  onClose: () => void;
  onLinkPress?: (url: string) => void;
}

export function SourcesSheet({
  visible,
  sources,
  colors,
  onClose,
  onLinkPress,
}: SourcesSheetProps) {
  const handlePress = (url: string) => {
    if (onLinkPress) {
      onLinkPress(url);
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.4)' }]} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.background }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Sources</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            {sources.map((s, i) => (
              <TouchableOpacity
                key={`${s.url}-${i}`}
                style={[styles.row, { borderColor: colors.border }]}
                activeOpacity={0.7}
                onPress={() => handlePress(s.url)}
              >
                <ExternalLink size={16} color={colors.primary} />
                <View style={styles.rowContent}>
                  <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={2}>
                    {s.title || s.url}
                  </Text>
                  {s.snippet ? (
                    <Text style={[styles.snippet, { color: colors.textSecondary }]} numberOfLines={2}>
                      {s.snippet}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    minHeight: 200,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  scroll: {
    maxHeight: 400,
  },
  scrollContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  rowContent: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  snippet: { fontSize: 12, lineHeight: 18 },
});
