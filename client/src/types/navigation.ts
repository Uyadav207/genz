/**
 * Navigation type definitions
 * Add your screen params here as the app grows.
 */

/** Root stack — auth screens + the main tab shell + in-app browser */
export type NavigationParamList = {
  Home: undefined;
  SignIn: undefined;
  SignUp: undefined;
  InAppBrowser: { url: string };
};

/** Bottom tab screens inside the authenticated shell */
export type MainTabsParamList = {
  Chat: { chatId?: string; agentId?: string; agentName?: string; agentIconName?: string } | undefined;
  Voice: { agentId?: string; chatId?: string } | undefined;
  Agents: undefined;
  Settings: undefined;
};

/** Stack inside the Agents drawer tab (list + create + edit flow) */
export type AgentsStackParamList = {
  AgentsList: undefined;
  CreateAgent: undefined;
  EditAgent: { agentId: string };
};
