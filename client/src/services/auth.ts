import { api } from '@/services/api';
import { storage } from '@/utils/storage';
import type { AuthResponse, SignInPayload, SignUpPayload, SuccessResponse, UserResponse } from '@/types';

const STORAGE_KEYS = {
  accessToken: 'auth.access_token',
  refreshToken: 'auth.refresh_token',
  user: 'auth.user',
} as const;

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  user: UserResponse;
};

function authHeader(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function signUp(payload: SignUpPayload): Promise<AuthResponse> {
  return api.post<AuthResponse>('/auth/signup', payload);
}

export async function signIn(payload: SignInPayload): Promise<AuthResponse> {
  return api.post<AuthResponse>('/auth/signin', payload);
}

export async function signOut(accessToken: string): Promise<SuccessResponse<unknown>> {
  return api.post<SuccessResponse<unknown>>('/auth/signout', {}, authHeader(accessToken));
}

export async function getMe(accessToken: string): Promise<SuccessResponse<UserResponse>> {
  return api.get<SuccessResponse<UserResponse>>('/auth/me', authHeader(accessToken));
}

export async function loadSession(): Promise<StoredSession | null> {
  const [accessToken, refreshToken, user] = await Promise.all([
    storage.get<string>(STORAGE_KEYS.accessToken),
    storage.get<string>(STORAGE_KEYS.refreshToken),
    storage.get<UserResponse>(STORAGE_KEYS.user),
  ]);

  if (!accessToken || !refreshToken || !user) return null;
  return { accessToken, refreshToken, user };
}

export async function saveSession(session: StoredSession): Promise<void> {
  await Promise.all([
    storage.set(STORAGE_KEYS.accessToken, session.accessToken),
    storage.set(STORAGE_KEYS.refreshToken, session.refreshToken),
    storage.set(STORAGE_KEYS.user, session.user),
  ]);
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    storage.remove(STORAGE_KEYS.accessToken),
    storage.remove(STORAGE_KEYS.refreshToken),
    storage.remove(STORAGE_KEYS.user),
  ]);
}

