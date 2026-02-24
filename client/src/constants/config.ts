/**
 * App-wide configuration values.
 * Set EXPO_PUBLIC_DEV_IP (and optionally EXPO_PUBLIC_API_PORT) in .env for device testing.
 * Run: ipconfig getifaddr en0 for your machine IP.
 */
const DEV_IP = process.env.EXPO_PUBLIC_DEV_IP ?? 'localhost';
const API_PORT = process.env.EXPO_PUBLIC_API_PORT ?? '8080';

export const Config = {
  APP_NAME: 'GenZ',
  API_BASE_URL: __DEV__
    ? `http://${DEV_IP}:${API_PORT}/api/v1`
    : 'https://api.example.com/api/v1',
  REQUEST_TIMEOUT: 15_000, // ms
  CHAT_TIMEOUT: 60_000, // ms — web search & research can take longer
} as const;
