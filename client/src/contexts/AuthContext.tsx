import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthResponse, SignInPayload, SignUpPayload, UserResponse } from '@/types';
import {
  clearSession,
  getMe,
  loadSession,
  saveSession,
  signIn as signInRequest,
  signOut as signOutRequest,
  signUp as signUpRequest,
} from '@/services';

interface AuthContextValue {
  user: UserResponse | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signUp: (payload: SignUpPayload) => Promise<AuthResponse>;
  signIn: (payload: SignInPayload) => Promise<AuthResponse>;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<UserResponse>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = Boolean(accessToken);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      setIsLoading(true);
      const session = await loadSession();

      if (cancelled) return;

      if (!session) {
        setIsLoading(false);
        return;
      }

      try {
        const me = await getMe(session.accessToken);
        const nextUser = me.data ?? session.user;

        setAccessToken(session.accessToken);
        setRefreshToken(session.refreshToken);
        setUser(nextUser);

        // Keep stored user fresh (useful if metadata changed).
        await saveSession({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          user: nextUser,
        });
      } catch {
        await clearSession();
        setAccessToken(null);
        setRefreshToken(null);
        setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  async function signUp(payload: SignUpPayload) {
    const auth = await signUpRequest(payload);

    // Backend returns JWT tokens after creating the account.
    if (auth.access_token) {
      setAccessToken(auth.access_token);
      setRefreshToken(auth.refresh_token);
      setUser(auth.user);

      await saveSession({
        accessToken: auth.access_token,
        refreshToken: auth.refresh_token,
        user: auth.user,
      });
    }

    return auth;
  }

  async function signIn(payload: SignInPayload) {
    const auth = await signInRequest(payload);

    setAccessToken(auth.access_token);
    setRefreshToken(auth.refresh_token);
    setUser(auth.user);

    await saveSession({
      accessToken: auth.access_token,
      refreshToken: auth.refresh_token,
      user: auth.user,
    });

    return auth;
  }

  async function updateUser(updates: Partial<UserResponse>) {
    if (!user) return;
    const updated = { ...user, ...updates };
    setUser(updated);
    if (accessToken && refreshToken) {
      await saveSession({ accessToken, refreshToken, user: updated });
    }
  }

  async function signOut() {
    const token = accessToken;

    // Always clear local state first (avoids leaving the user "stuck" if network fails).
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    await clearSession();

    if (!token) return;

    try {
      await signOutRequest(token);
    } catch {
      // ignore: local session already cleared
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      refreshToken,
      isLoading,
      isAuthenticated,
      signUp,
      signIn,
      signOut,
      updateUser,
    }),
    [user, accessToken, refreshToken, isLoading, isAuthenticated],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider />');
  }
  return ctx;
}

