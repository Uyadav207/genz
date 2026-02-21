/**
 * ChatsContext — holds the user's chat list and refetch so Sidebar and ChatScreen stay in sync.
 * When agentId is set, chats are filtered to that agent.
 */

import React, { createContext, useCallback, useContext, useState } from 'react';
import { api, type ChatListItem } from '@/services/api';

interface ChatsContextValue {
  chats: ChatListItem[];
  loading: boolean;
  agentId: string | null;
  setAgentId: (id: string | null) => void;
  refetch: (token: string, agentId?: string | null) => Promise<void>;
}

const ChatsContext = createContext<ChatsContextValue | undefined>(undefined);

export function ChatsProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);

  const refetch = useCallback(async (token: string, filterAgentId?: string | null) => {
    if (!token) return;
    setLoading(true);
    try {
      const { chats: list } = await api.getChats(token, filterAgentId ?? agentId);
      setChats(list ?? []);
    } catch {
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  return (
    <ChatsContext.Provider value={{ chats, loading, agentId, setAgentId, refetch }}>
      {children}
    </ChatsContext.Provider>
  );
}

export function useChats() {
  const ctx = useContext(ChatsContext);
  if (ctx === undefined) throw new Error('useChats must be used within ChatsProvider');
  return ctx;
}
