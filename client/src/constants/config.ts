/**
 * App-wide configuration values.
 * Keep environment-specific or build-specific settings here.
 */

import { Platform } from 'react-native';

const DEV_API_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const Config = {
  APP_NAME: 'GenZ',
  API_BASE_URL: __DEV__
    ? `http://${DEV_API_HOST}:8080/api/v1`
    : 'https://api.example.com/api/v1',
  REQUEST_TIMEOUT: 15_000, // ms
  CHAT_TIMEOUT: 60_000, // ms — web search & research can take longer
} as const;
