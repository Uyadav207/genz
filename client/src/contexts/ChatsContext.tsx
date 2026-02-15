/**
 * ChatsContext — holds the user's chat list and refetch so Sidebar and ChatScreen stay in sync.
 */

import React, { createContext, useCallback, useContext, useState } from 'react';
import { api, type ChatListItem } from '@/services/api';

interface ChatsContextValue {
  chats: ChatListItem[];
  loading: boolean;
  refetch: (token: string) => Promise<void>;
}

const ChatsContext = createContext<ChatsContextValue | undefined>(undefined);

export function ChatsProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async (token: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const { chats: list } = await api.getChats(token);
      setChats(list ?? []);
    } catch {
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <ChatsContext.Provider value={{ chats, loading, refetch }}>
      {children}
    </ChatsContext.Provider>
  );
}

export function useChats() {
  const ctx = useContext(ChatsContext);
  if (ctx === undefined) throw new Error('useChats must be used within ChatsProvider');
  return ctx;
}
