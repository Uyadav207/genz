/**
 * MainDrawer — left drawer (sidebar) navigator replacing the bottom tabs.
 * Sidebar shows: Chat, Agents, Settings, then divider, then Chat history.
 */

import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { ChatScreen } from '@/screens/ChatScreen';
import { AgentsStack } from '@/navigation/AgentsStack';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { SidebarContent } from '@/components/SidebarContent';
import { ChatsProvider, useTheme } from '@/contexts';
import type { MainTabsParamList } from '@/types';

const Drawer = createDrawerNavigator<MainTabsParamList>();

export function MainDrawer() {
  const { colors } = useTheme();

  return (
    <ChatsProvider>
    <Drawer.Navigator
      drawerContent={(props) => <SidebarContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerPosition: 'left',
        drawerType: 'front',
        drawerStyle: { backgroundColor: colors.background },
        swipeEdgeWidth: 40,
      }}
    >
      <Drawer.Screen name="Chat" component={ChatScreen} />
      <Drawer.Screen name="Agents" component={AgentsStack} />
      <Drawer.Screen name="Settings" component={SettingsScreen} />
    </Drawer.Navigator>
    </ChatsProvider>
  );
}
