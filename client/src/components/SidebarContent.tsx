/**
 * Sidebar (drawer) content — minimal nav + chat history from API, aligned to safe area (notch).
 */

import React, { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { Home, MessageCircle, User, Settings, MoreVertical, Compass } from 'lucide-react-native';
import { api } from '@/services/api';
import { DEFAULT_AGENT_ID, Spacing, SIDEBAR_WIDTH } from '@/constants';
import { useAuth, useChats, useTheme } from '@/contexts';
import type { MainTabsParamList } from '@/types';

type NavRoute = keyof MainTabsParamList;

const NAV_ITEMS: { route: NavRoute; label: string; icon: typeof MessageCircle }[] = [
  { route: 'Home', label: 'Home', icon: Home },
  { route: 'Chat', label: 'New chat', icon: MessageCircle },
  { route: 'Agents', label: 'Agents', icon: User },
  { route: 'Marketplace', label: 'Marketplace', icon: Compass as any },
  { route: 'Settings', label: 'Settings', icon: Settings },
];

export function SidebarContent(props: DrawerContentComponentProps) {
  const { state, navigation } = props;
  const { colors } = useTheme();
  const { accessToken } = useAuth();
  const { chats, loading, refetch } = useChats();
  const insets = useSafeAreaInsets();
  const sidebarWidth = SIDEBAR_WIDTH;

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
    (chatId: string | undefined, agentId?: string) => {
      navigation.closeDrawer();
      if (chatId != null) {
        navigation.navigate('Chat', { chatId, agentId: agentId ?? DEFAULT_AGENT_ID });
      } else {
        navigation.navigate('Chat', { agentId: DEFAULT_AGENT_ID });
      }
    },
    [navigation]
  );

  const confirmDeleteChat = useCallback(
    (chatId: string, chatTitle: string) => {
      Alert.alert(
        'Delete chat',
        `Are you sure you want to delete "${chatTitle}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              if (!accessToken) return;
              try {
                await api.deleteChat(chatId, accessToken);
                refetch(accessToken);
                navigation.closeDrawer();
                navigation.navigate('Chat', { agentId: DEFAULT_AGENT_ID });
              } catch {
                Alert.alert('Error', 'Failed to delete chat. Please try again.');
              }
            },
          },
        ]
      );
    },
    [accessToken, refetch, navigation]
  );

  const showChatOptions = useCallback(
    (chatId: string, chatTitle: string) => {
      Alert.alert('Options', 'Choose an action', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete chat',
          style: 'destructive',
          onPress: () => confirmDeleteChat(chatId, chatTitle),
        },
      ]);
    },
    [confirmDeleteChat]
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
        <Text style={[styles.sidebarTitle, { color: colors.text }]}>GenZ</Text>
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
              <View key={chat.id} style={styles.historyItem}>
                <TouchableOpacity
                  style={styles.historyItemContent}
                  onPress={() => openChat(chat.id, chat.agent_id)}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.historyItemTitle, { color: colors.text }]} numberOfLines={1}>
                    {chat.title}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => showChatOptions(chat.id, chat.title)}
                  style={styles.moreBtn}
                  activeOpacity={0.7}
                >
                  <MoreVertical size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 2,
    gap: 8,
  },
  historyItemContent: {
    flex: 1,
  },
  historyItemTitle: {
    fontSize: 14,
    fontWeight: '400',
  },
  moreBtn: {
    padding: 4,
  },
});
