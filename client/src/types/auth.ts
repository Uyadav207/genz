/**
 * Auth + user-related types shared across client services/screens.
 * Mirrors JSON shapes returned by the Go backend.
 */

export type UserResponse = {
  id: string;
  email?: string;
  username?: string;
  name?: string;
  bio?: string;
  avatar_url?: string;
};

export type SignUpPayload = {
  email: string;
  username: string;
  password: string;
  name: string;
};

export type SignInPayload = {
  username: string;
  password: string;
};

export type AuthResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: UserResponse;
};

export type SuccessResponse<T> = {
  message: string;
  data?: T;
};

export type ErrorResponse = {
  error: string;
  message?: string;
};

