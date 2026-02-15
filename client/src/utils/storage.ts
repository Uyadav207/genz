/**
 * Async storage helpers.
 * Wraps AsyncStorage with typed get/set for convenience.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const storage = {
  async get<T = string>(key: string): Promise<T | null> {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`[storage.set] Failed for key "${key}":`, error);
    }
  },

  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`[storage.remove] Failed for key "${key}":`, error);
    }
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error('[storage.clear] Failed:', error);
    }
  },
};
