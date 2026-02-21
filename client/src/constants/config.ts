/**
 * App-wide configuration values.
 * Keep environment-specific or build-specific settings here.
 */

// Replace with your Mac's local IP when testing on physical devices.
// Run: ipconfig getifaddr en0
const DEV_IP = '192.168.0.100';

export const Config = {
  APP_NAME: 'GenZ',
  API_BASE_URL: __DEV__
    ? `http://${DEV_IP}:8080/api/v1`
    : 'https://api.example.com/api/v1',
  REQUEST_TIMEOUT: 15_000, // ms
  CHAT_TIMEOUT: 60_000, // ms — web search & research can take longer
} as const;
