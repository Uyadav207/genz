/**
 * Sidebar (drawer) content — minimal nav + chat history from API, aligned to safe area (notch).
 */

import React, { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { MessageCircle, Bot, Settings } from 'lucide-react-native';
import { Spacing } from '@/constants';
import { useAuth, useChats, useTheme } from '@/contexts';
import type { MainTabsParamList } from '@/types';

type NavRoute = keyof MainTabsParamList;

const NAV_ITEMS: { route: NavRoute; label: string; icon: typeof MessageCircle }[] = [
  { route: 'Chat', label: 'New chat', icon: MessageCircle },
  { route: 'Agents', label: 'Agents', icon: Bot },
  { route: 'Settings', label: 'Settings', icon: Settings },
];

export function SidebarContent(props: DrawerContentComponentProps) {
  const { state, navigation } = props;
  const { colors } = useTheme();
  const { accessToken } = useAuth();
  const { chats, loading, refetch } = useChats();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sidebarWidth = Math.min(260, width * 0.78);

  const currentRoute = state.routeNames[state.index] as NavRoute;

  useEffect(() => {
    if (accessToken) refetch(accessToken);
  }, [accessToken, refetch]);

  // Refetch when drawer opens so sidebar chat titles stay in sync (e.g. after async title update)
  useEffect(() => {
    const nav = navigation as { addListener?: (e: string, cb: () => void) => () => void };
    const unsub = nav.addListener?.('drawerOpen', () => {
      if (accessToken) refetch(accessToken);
    });
    return () => unsub?.();
  }, [navigation, accessToken, refetch]);

  const openChat = useCallback(
    (chatId: string | undefined) => {
      navigation.closeDrawer();
      navigation.navigate('Chat', chatId ? { chatId } : undefined);
    },
    [navigation]
  );

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={[
        styles.container,
        {
          backgroundColor: colors.background,
          width: sidebarWidth,
          paddingTop: insets.top,
          paddingBottom: insets.bottom + Spacing.md,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Nav bar at top with title — chats sit under this */}
      <View style={[styles.sidebarHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sidebarTitle, { color: colors.text }]}>GenZ AI</Text>
      </View>

      <View style={styles.navSection}>
        {NAV_ITEMS.map(({ route, label, icon: Icon }) => {
          const isActive = currentRoute === route;
          return (
            <TouchableOpacity
              key={route}
              style={[
                styles.navRow,
                isActive && { backgroundColor: colors.surfaceSecondary },
              ]}
              onPress={() => {
                if (route === 'Chat') openChat(undefined);
                else navigation.navigate(route);
              }}
              activeOpacity={0.6}
            >
              <Icon size={20} color={isActive ? colors.text : colors.textSecondary} />
              <Text
                style={[styles.navLabel, { color: isActive ? colors.text : colors.textSecondary }]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.historySection}>
        <Text style={[styles.historyTitle, { color: colors.textSecondary }]}>
          Chat history
        </Text>
        <ScrollView
          style={styles.historyList}
          contentContainerStyle={styles.historyListContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.textSecondary} style={{ padding: Spacing.md }} />
          ) : chats.length === 0 ? (
            <Text style={[styles.emptyHistory, { color: colors.textSecondary }]}>
              No chats yet
            </Text>
          ) : (
            chats.map((chat) => (
              <TouchableOpacity
                key={chat.id}
                style={styles.historyItem}
                onPress={() => openChat(chat.id)}
                activeOpacity={0.6}
              >
                <Text style={[styles.historyItemTitle, { color: colors.text }]} numberOfLines={1}>
                  {chat.title}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sidebarHeader: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.sm,
  },
  sidebarTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  navSection: {
    paddingHorizontal: Spacing.sm,
    gap: 2,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  navLabel: {
    fontSize: 15,
    fontWeight: '400',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.md,
    marginHorizontal: Spacing.sm,
  },
  historySection: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
    minHeight: 80,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: Spacing.xs,
    paddingHorizontal: 12,
  },
  historyList: {
    flex: 1,
  },
  historyListContent: {
    paddingBottom: Spacing.md,
  },
  emptyHistory: {
    fontSize: 13,
    paddingHorizontal: 12,
  },
  historyItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 2,
  },
  historyItemTitle: {
    fontSize: 14,
    fontWeight: '400',
  },
});
