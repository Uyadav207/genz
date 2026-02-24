/**
 * MainDrawer — left drawer (sidebar) navigator replacing the bottom tabs.
 * Sidebar shows: Chat, Agents, Settings, then divider, then Chat history.
 */

import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { HomeScreen } from '@/screens/HomeScreen';
import { ChatScreen } from '@/screens/ChatScreen';
import { VoiceScreen } from '@/screens/VoiceScreen';
import { AgentsStack } from '@/navigation/AgentsStack';
import { MarketplaceStack } from '@/navigation/MarketplaceStack';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { SidebarContent } from '@/components/SidebarContent';
import { ChatsProvider, useTheme } from '@/contexts';
import { SIDEBAR_WIDTH } from '@/constants';
import type { MainTabsParamList } from '@/types';

const Drawer = createDrawerNavigator<MainTabsParamList>();

export function MainDrawer() {
  const { colors } = useTheme();

  return (
    <ChatsProvider>
      <Drawer.Navigator
        initialRouteName="Home"
        drawerContent={(props) => <SidebarContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerPosition: 'left',
          drawerType: 'front',
          drawerStyle: { backgroundColor: colors.background, width: SIDEBAR_WIDTH },
          swipeEdgeWidth: 40,
        }}
      >
        <Drawer.Screen name="Home" component={HomeScreen} />
        <Drawer.Screen name="Chat" component={ChatScreen} />
        <Drawer.Screen name="Voice" component={VoiceScreen} />
        <Drawer.Screen name="Agents" component={AgentsStack} />
        <Drawer.Screen name="Marketplace" component={MarketplaceStack} />
        <Drawer.Screen name="Settings" component={SettingsScreen} />
      </Drawer.Navigator>
    </ChatsProvider>
  );
}
