/**
 * Agents stack — list screen + create agent screen with back/forth navigation.
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AgentsScreen } from '@/screens/AgentsScreen';
import { CreateAgentScreen } from '@/screens/CreateAgentScreen';
import { EditAgentScreen } from '@/screens/EditAgentScreen';
import type { AgentsStackParamList } from '@/types';

const Stack = createNativeStackNavigator<AgentsStackParamList>();

export function AgentsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="AgentsList" component={AgentsScreen} />
      <Stack.Screen name="CustomAgents" component={AgentsScreen} />
      <Stack.Screen name="DefaultAgents" component={AgentsScreen} />
      <Stack.Screen name="CreateAgent" component={CreateAgentScreen} />
      <Stack.Screen name="EditAgent" component={EditAgentScreen} />
    </Stack.Navigator>
  );
}
