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

/** Drawer (main) screens inside the authenticated shell */
export type MainTabsParamList = {
  Home: undefined;
  Chat: { chatId?: string; agentId?: string; agentName?: string; agentIconName?: string } | undefined;
  Voice: { agentId?: string; chatId?: string } | undefined;
  Agents: undefined;
  Marketplace: undefined;
  Settings: undefined;
};

/** Stack inside the Agents drawer tab (list + create + edit flow) */
export type AgentsStackParamList = {
  AgentsList: undefined;
  CustomAgents: undefined;
  DefaultAgents: undefined;
  CreateAgent: undefined;
  EditAgent: { agentId: string };
};

export type MarketplaceStackParamList = {
  MarketplaceList: undefined;
  MarketplaceDetail: { listingId: string };
  PublishListing: { agentId: string };
  EditListing: { listingId: string };
  MyListings: undefined;
};
