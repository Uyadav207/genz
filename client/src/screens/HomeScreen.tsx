/**
 * Home screen — greeting + choose Talk or Chat. Centered layout.
 */

import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageCircle, Mic } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import { ScreenWrapper } from '@/components/common';
import { FontSize, Spacing, BorderRadius } from '@/constants';
import { useAuth, useTheme } from '@/contexts';
import type { MainTabsParamList } from '@/types';

type Nav = DrawerNavigationProp<MainTabsParamList, 'Home'>;

/** Greeting from local time (device timezone). */
function getTimeGreeting(): { greeting: string; emoji: string } {
  const h = new Date().getHours();
  if (h < 12) return { greeting: 'Good morning', emoji: '☀️' };
  if (h < 17) return { greeting: 'Good afternoon', emoji: '✨' };
  return { greeting: 'Good evening', emoji: '🌙' };
}

export function HomeScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();

  const { greeting, emoji } = useMemo(getTimeGreeting, []);
  const displayName = user?.name || user?.username || 'you';
  const first = displayName.split(/\s+/)[0] || displayName;

  const openChat = () => navigation.navigate('Chat');
  const openVoice = () => navigation.navigate('Voice');

  return (
    <ScreenWrapper style={[styles.wrapper, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + Spacing['2xl'], flexGrow: 1, justifyContent: 'center' },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.timeEmoji}>{emoji}</Text>
          <Text style={[styles.greetingLine, { color: colors.text }]}>
            {greeting}, <Text style={[styles.name, { color: colors.primary }]}>{first}</Text>
          </Text>
          <Text style={[styles.pickLine, { color: colors.textSecondary }]}>
            Talk or type — whatever works for you
          </Text>
        </View>

        <View style={styles.twoOptionsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.optionCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && styles.optionCardPressed,
            ]}
            onPress={openVoice}
          >
            <View style={[styles.optionIconWrap, { backgroundColor: colors.primary + '22' }]}>
              <Mic size={28} color={colors.primary} strokeWidth={2} />
            </View>
            <Text style={[styles.optionLabel, { color: colors.text }]}>Talk</Text>
            <Text style={[styles.optionSub, { color: colors.textSecondary }]}>I'm all ears</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.optionCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && styles.optionCardPressed,
            ]}
            onPress={openChat}
          >
            <View style={[styles.optionIconWrap, { backgroundColor: colors.primary + '22' }]}>
              <MessageCircle size={28} color={colors.primary} strokeWidth={2} />
            </View>
            <Text style={[styles.optionLabel, { color: colors.text }]}>Chat</Text>
            <Text style={[styles.optionSub, { color: colors.textSecondary }]}>I'm here when you are</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.md },
  hero: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  timeEmoji: { fontSize: 52, marginBottom: Spacing.sm },
  greetingLine: { fontSize: FontSize['2xl'], fontWeight: '700', textAlign: 'center' },
  name: { fontWeight: '800' },
  pickLine: { fontSize: FontSize.sm, marginTop: Spacing.md, textAlign: 'center', paddingHorizontal: Spacing.sm },
  twoOptionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  optionCard: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 132,
    justifyContent: 'center',
  },
  optionCardPressed: { opacity: 0.92 },
  optionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: { fontSize: FontSize.lg, fontWeight: '700', textAlign: 'center' },
  optionSub: { fontSize: FontSize.xs, textAlign: 'center', lineHeight: 18 },
});
